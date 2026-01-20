import { prisma } from "../../../shared/lib/prisma";
import { isUserInConversation } from "./utility.service";
import { CreateConversationDTO, CreateGroupConversationDTO } from "../types";

// Simple hash function for generating advisory lock keys
function hashCode(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // Convert to 32bit integer
    }
    return hash;
}



/**
 * Creates a new conversation (one-to-one or group).
 * @param params - Creation parameters
 * @returns The created conversation with members and creator populated.
 */
export const createConversation = async ({
    name,
    creatorId,
    memberIds,
    isGroup = false,
}: CreateConversationDTO) => {

    const creator = await prisma.user.findUnique({ where: { id: creatorId } });
    if (!creator) {
        throw new Error("Creator not found");
    }

    const members = await prisma.user.findMany({
        where: { id: { in: memberIds } },
    });
    if (members.length !== memberIds.length) {
        throw new Error("One or more members not found");
    }

    const conversation = await prisma.chatConversation.create({
        data: {
            name: isGroup && name ? name : null,
            isGroup,
            createdBy: creatorId,
        },
    });

    const uniqueMemberIds = Array.from(new Set([creatorId, ...memberIds]));
    await prisma.chatConversationMember.createMany({
        data: uniqueMemberIds.map((userId) => ({
            conversationId: conversation.id,
            userId,
            role: isGroup && userId === creatorId ? 'admin' : 'member',
        })),
    });

    return prisma.chatConversation.findUniqueOrThrow({
        where: { id: conversation.id },
        include: {
            members: {
                include: { user: true },
            },
            creator: true,
        },
    });
};

/**
 * Checks for an existing one-to-one conversation between two users, or creates a new one safely.
 * Uses advisory locks to prevent race conditions.
 */
export const checkOrCreateOneToOne = async (userId1: string, userId2: string) => {

    const users = await prisma.user.findMany({
        where: { id: { in: [userId1, userId2] } },
    });
    if (users.length !== 2) {
        throw new Error("One or both users not found");
    }

    // Sort user IDs to ensure consistent lock order (prevent deadlocks)
    const [userA, userB] = [userId1, userId2].sort();

    // Use advisory lock to prevent race conditions
    // Lock key is a hash of the two user IDs
    const lockKey = Math.abs(hashCode(`${userA}-${userB}`));

    return await prisma.$transaction(async (tx) => {
        // Acquire advisory lock (PostgreSQL specific)
        await tx.$executeRawUnsafe(`SELECT pg_advisory_xact_lock(${lockKey})`);

        // Check for existing conversation inside transaction
        const existingConversation = await tx.chatConversation.findFirst({
            where: {
                isGroup: false,
                AND: [
                    { members: { some: { userId: userId1 } } },
                    { members: { some: { userId: userId2 } } },
                ],
            },
            include: {
                members: {
                    include: { user: true },
                },
                creator: true,
            },
        });

        if (existingConversation) {
            return existingConversation;
        }

        // Create conversation inside transaction
        const conversation = await tx.chatConversation.create({
            data: {
                name: null,
                isGroup: false,
                createdBy: userId1,
            },
        });

        // Add both users as members
        const uniqueMemberIds = Array.from(new Set([userId1, userId2]));
        await tx.chatConversationMember.createMany({
            data: uniqueMemberIds.map((userId) => ({
                conversationId: conversation.id,
                userId,
            })),
        });

        // Return the created conversation with full data
        return tx.chatConversation.findUniqueOrThrow({
            where: { id: conversation.id },
            include: {
                members: {
                    include: { user: true },
                },
                creator: true,
            },
        });
    });
};

/**
 * Creates a new group conversation with mutual following checks.
 */
export const createGroupConversation = async ({
    name,
    creatorId,
    memberIds,
}: CreateGroupConversationDTO) => {
    // Verify creator exists
    const creator = await prisma.user.findUnique({ where: { id: creatorId } });
    if (!creator) {
        throw new Error("Creator not found");
    }

    // Verify all members exist
    const members = await prisma.user.findMany({
        where: { id: { in: memberIds } },
    });
    if (members.length !== memberIds.length) {
        throw new Error("One or more members not found");
    }

    // OPTIMIZATION: Batch fetch all profiles to avoid N+1 queries
    const allUserIds = [creatorId, ...memberIds];

    const [teachers, students] = await Promise.all([
        prisma.teacher.findMany({
            where: { userId: { in: allUserIds } },
            select: { id: true, userId: true },
        }),
        prisma.student.findMany({
            where: { userId: { in: allUserIds } },
            select: { id: true, userId: true },
        })
    ]);

    const teacherMap = new Map(teachers.map(t => [t.userId, t.id]));
    const studentMap = new Map(students.map(s => [s.userId, s.id]));

    // Validate all users have a role
    for (const uid of allUserIds) {
        if (!teacherMap.has(uid) && !studentMap.has(uid)) {
            throw new Error(`User ${uid} must be a teacher or student`);
        }
    }

    const creatorIsTeacher = teacherMap.has(creatorId);
    const creatorIsStudent = studentMap.has(creatorId);
    const creatorRoleId = creatorIsTeacher ? teacherMap.get(creatorId)! : studentMap.get(creatorId)!;

    // Batch fetch relationships
    // We need to check relationships between Creator and ALL members
    // 1. If Creator is Student -> Check if they follow Teacher members
    // 2. If Creator is Teacher -> Check if Student members follow them OR if Teacher members mirror-follow

    const memberTeacherIds = memberIds.filter(id => teacherMap.has(id)).map(id => teacherMap.get(id)!);
    const memberStudentIds = memberIds.filter(id => studentMap.has(id)).map(id => studentMap.get(id)!);

    const validMemberIds = new Set<string>();

    if (creatorIsStudent) {
        // Creator (Student) can add Teachers they follow
        if (memberTeacherIds.length > 0) {
            const follows = await prisma.teacherFollower.findMany({
                where: {
                    studentId: creatorRoleId,
                    teacherId: { in: memberTeacherIds }
                },
                select: { teacherId: true }
            });
            const followedTeacherIds = new Set(follows.map(f => f.teacherId));

            // Map back to userIds
            teachers.forEach(t => {
                if (followedTeacherIds.has(t.id)) validMemberIds.add(t.userId);
            });
        }

        // Students can always add other Students (per business logic)
        memberIds.forEach(id => {
            if (studentMap.has(id)) validMemberIds.add(id);
        });

    } else if (creatorIsTeacher) {
        // Creator (Teacher) can add Students who follow them
        if (memberStudentIds.length > 0) {
            const followers = await prisma.teacherFollower.findMany({
                where: {
                    teacherId: creatorRoleId,
                    studentId: { in: memberStudentIds }
                },
                select: { studentId: true }
            });
            const followerStudentIds = new Set(followers.map(f => f.studentId));

            // Map back to userIds
            students.forEach(s => {
                if (followerStudentIds.has(s.id)) validMemberIds.add(s.userId);
            });
        }

        // Creator (Teacher) can add Teachers who follow each other
        if (memberTeacherIds.length > 0) {
            const [myFollows, followsMe] = await Promise.all([
                prisma.teacherToTeacher.findMany({
                    where: {
                        followerId: creatorRoleId,
                        followedId: { in: memberTeacherIds }
                    },
                    select: { followedId: true }
                }),
                prisma.teacherToTeacher.findMany({
                    where: {
                        followerId: { in: memberTeacherIds },
                        followedId: creatorRoleId
                    },
                    select: { followerId: true }
                })
            ]);

            const connectedTeacherIds = new Set([
                ...myFollows.map(f => f.followedId),
                ...followsMe.map(f => f.followerId)
            ]);

            // Map back to userIds
            teachers.forEach(t => {
                if (connectedTeacherIds.has(t.id)) validMemberIds.add(t.userId);
            });
        }
    }

    // Verify all requested members are valid
    for (const memberId of memberIds) {
        if (!validMemberIds.has(memberId)) {
            throw new Error(`You must be following each other to add user ${memberId} to the group`);
        }
    }

    // Create the group conversation
    const conversation = await prisma.chatConversation.create({
        data: {
            name: name.trim(),
            isGroup: true,
            createdBy: creatorId,
        },
    });

    // Add all members including creator (creator gets admin role)
    const uniqueMemberIds = Array.from(new Set([creatorId, ...memberIds]));
    await prisma.chatConversationMember.createMany({
        data: uniqueMemberIds.map((userId) => ({
            conversationId: conversation.id,
            userId,
            role: userId === creatorId ? "admin" : "member",
        })),
    });

    return prisma.chatConversation.findUniqueOrThrow({
        where: { id: conversation.id },
        include: {
            members: {
                include: { user: true },
            },
            creator: true,
        },
    });
};

export const updateGroupName = async (conversationId: string, newName: string, requesterId: string) => {

    const conversation = await prisma.chatConversation.findUnique({
        where: { id: conversationId },
    });

    if (!conversation) {
        throw new Error("Conversation not found");
    }

    if (!conversation.isGroup) {
        throw new Error("Cannot update name of one-to-one conversation");
    }

    // Only the creator can update group name
    if (requesterId !== conversation.createdBy) {
        throw new Error("Only the group creator can update the group name");
    }

    return prisma.chatConversation.update({
        where: { id: conversationId },
        data: { name: newName },
        include: {
            members: {
                include: { user: true },
            },
            creator: true,
        },
    });
};

export const updateGroupAvatar = async (conversationId: string, avatarUrl: string, requesterId: string) => {

    const conversation = await prisma.chatConversation.findUnique({
        where: { id: conversationId },
    });

    if (!conversation) {
        throw new Error("Conversation not found");
    }

    if (!conversation.isGroup) {
        throw new Error("Cannot update avatar of one-to-one conversation");
    }

    // Only the creator can update group avatar
    if (requesterId !== conversation.createdBy) {
        throw new Error("Only the group creator can update the group avatar");
    }

    return prisma.chatConversation.update({
        where: { id: conversationId },
        data: { avatarUrl },
        include: {
            members: {
                include: { user: true },
            },
            creator: true,
        },
    });
};

export const clearConversation = async (conversationId: string, userId: string) => {

    const isMember = await isUserInConversation(conversationId, userId);
    if (!isMember) {
        throw new Error("User is not a member of this conversation");
    }

    await prisma.chatConversationMember.update({
        where: {
            conversationId_userId: {
                conversationId,
                userId,
            },
        },
        data: {
            lastRead: new Date(),
        },
    });

    return { success: true };
};

export const leaveGroup = async (conversationId: string, userId: string) => {

    const conversation = await prisma.chatConversation.findUnique({
        where: { id: conversationId },
        include: {
            members: true,
        },
    });

    if (!conversation) {
        throw new Error("Conversation not found");
    }

    if (!conversation.isGroup) {
        throw new Error("Cannot leave one-to-one conversation");
    }

    await prisma.chatConversationMember.delete({
        where: {
            conversationId_userId: {
                conversationId,
                userId,
            },
        },
    });

    const remainingMembers = await prisma.chatConversationMember.count({
        where: { conversationId },
    });

    if (remainingMembers === 0) {
        await prisma.chatConversation.delete({
            where: { id: conversationId },
        });
    }

    return { success: true };
};

export const pinConversation = async (conversationId: string, userId: string, isPinned: boolean) => {

    const isMember = await isUserInConversation(conversationId, userId);
    if (!isMember) {
        throw new Error("User is not a member of this conversation");
    }

    return prisma.chatConversationMember.update({
        where: {
            conversationId_userId: {
                conversationId,
                userId,
            },
        },
        data: {
            isPinned,
        },
    });
};

export const deleteConversation = async (conversationId: string, userId: string) => {
    const conversation = await prisma.chatConversation.findUnique({
        where: { id: conversationId },
        include: {
            members: true,
        },
    });

    if (!conversation) {
        throw new Error("Conversation not found");
    }

    const isMember = conversation.members.some(m => m.userId === userId);
    if (!isMember) {
        throw new Error("User is not a member of this conversation");
    }

    // For one-to-one chats, only the creator or allow anyone to delete
    // For groups, only creator can delete the entire conversation
    if (conversation.isGroup && conversation.createdBy !== userId) {
        throw new Error("Only the group creator can delete the conversation");
    }

    // Delete the entire conversation and all related data
    await prisma.chatConversation.delete({
        where: { id: conversationId },
    });

    return { success: true, message: "Conversation deleted successfully" };
};

export const saveDraft = async (conversationId: string, userId: string, draft: string) => {
    const isMember = await isUserInConversation(conversationId, userId);
    if (!isMember) {
        throw new Error("User is not a member of this conversation");
    }

    return prisma.chatConversationMember.update({
        where: {
            conversationId_userId: {
                conversationId,
                userId,
            },
        },
        data: {
            draft,
        },
    });
};
