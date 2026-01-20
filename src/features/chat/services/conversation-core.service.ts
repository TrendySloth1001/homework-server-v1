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

    // Check if creator is a teacher or student
    const creatorTeacher = await prisma.teacher.findUnique({
        where: { userId: creatorId },
        select: { id: true },
    });

    const creatorStudent = !creatorTeacher ? await prisma.student.findUnique({
        where: { userId: creatorId },
        select: { id: true },
    }) : null;

    if (!creatorTeacher && !creatorStudent) {
        throw new Error("Creator must be a teacher or student");
    }

    // Verify mutual following relationships
    for (const memberId of memberIds) {
        if (memberId === creatorId) continue; // Skip creator

        const memberTeacher = await prisma.teacher.findUnique({
            where: { userId: memberId },
            select: { id: true },
        });

        const memberStudent = !memberTeacher ? await prisma.student.findUnique({
            where: { userId: memberId },
            select: { id: true },
        }) : null;

        if (!memberTeacher && !memberStudent) {
            throw new Error(`User ${memberId} must be a teacher or student`);
        }

        // Check mutual following
        let areMutualFollowers = false;

        if (creatorStudent && memberTeacher) {
            // Student creator and teacher member
            const follow = await prisma.teacherFollower.findUnique({
                where: {
                    teacherId_studentId: {
                        teacherId: memberTeacher.id,
                        studentId: creatorStudent.id,
                    },
                },
            });
            areMutualFollowers = !!follow;
        } else if (creatorTeacher && memberStudent) {
            // Teacher creator and student member
            const follow = await prisma.teacherFollower.findUnique({
                where: {
                    teacherId_studentId: {
                        teacherId: creatorTeacher.id,
                        studentId: memberStudent.id,
                    },
                },
            });
            areMutualFollowers = !!follow;
        } else if (creatorTeacher && memberTeacher) {
            // Both are teachers - check TeacherToTeacher table for mutual following
            const creatorFollowsMember = await prisma.teacherToTeacher.findFirst({
                where: {
                    followerId: creatorTeacher.id,
                    followedId: memberTeacher.id,
                },
            });
            const memberFollowsCreator = await prisma.teacherToTeacher.findFirst({
                where: {
                    followerId: memberTeacher.id,
                    followedId: creatorTeacher.id,
                },
            });
            areMutualFollowers = !!creatorFollowsMember || !!memberFollowsCreator; // Allow if either follows the other
        } else if (creatorStudent && memberStudent) {
            // Both are students - need to check if they follow common teachers
            // For simplicity, we'll allow any students to create groups together
            // You can add more complex logic here if needed
            areMutualFollowers = true;
        }

        if (!areMutualFollowers) {
            throw new Error(`You must be following each other to add ${memberId} to the group`);
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
