import { prisma } from "../../../shared/lib/prisma";

// ==================== MEMBER LIST ====================

/**
 * Retrieves a list of members in a group conversation.
 * @param search - Optional query to filter members by name or username.
 */
export const getGroupMembers = async (
    conversationId: string,
    userId: string,
    search?: string
) => {
    const member = await prisma.chatConversationMember.findUnique({
        where: { conversationId_userId: { conversationId, userId } },
    });

    if (!member) {
        throw new Error("You are not a member of this conversation");
    }

    const whereClause: any = {
        conversationId,
        isBanned: false,
    };

    if (search) {
        whereClause.user = {
            OR: [
                { displayName: { contains: search, mode: "insensitive" } },
                { username: { contains: search, mode: "insensitive" } },
            ],
        };
    }

    const members = await prisma.chatConversationMember.findMany({
        where: whereClause,
        include: {
            user: {
                select: {
                    id: true,
                    displayName: true,
                    avatarUrl: true,
                    username: true,
                    isOnline: true,
                    lastActiveAt: true,
                },
            },
        },
        orderBy: [{ role: "asc" }, { joinedAt: "asc" }],
    });

    return members;
};

/**
 * Retrieves a list of banned members from a group.
 * Only accessible by admins.
 */
export const getBannedMembers = async (conversationId: string, userId: string) => {
    const member = await prisma.chatConversationMember.findUnique({
        where: { conversationId_userId: { conversationId, userId } },
    });

    if (!member || member.role !== "admin") {
        throw new Error("Only admins can view banned members");
    }

    const bannedMembers = await prisma.chatConversationMember.findMany({
        where: { conversationId, isBanned: true },
        include: {
            user: {
                select: { id: true, displayName: true, avatarUrl: true, username: true },
            },
            banner: {
                select: { id: true, displayName: true },
            },
        },
        orderBy: { bannedAt: "desc" },
    });

    return bannedMembers;
};

// ==================== MEMBER MANAGEMENT ====================

/**
 * Adds new members to a group conversation.
 * Currently restricted to the group creator.
 */
export const addMembers = async (conversationId: string, userIds: string[], requesterId: string) => {

    const conversation = await prisma.chatConversation.findUnique({
        where: { id: conversationId },
    });

    if (!conversation) {
        throw new Error("Conversation not found");
    }

    if (!conversation.isGroup) {
        throw new Error("Cannot add members to one-to-one conversation");
    }

    // Only the creator can add members (Legacy logic - consider allowing admins too)
    if (requesterId !== conversation.createdBy) {
        throw new Error("Only the group creator can add members");
    }

    const users = await prisma.user.findMany({
        where: { id: { in: userIds } },
    });
    if (users.length !== userIds.length) {
        throw new Error("One or more users not found");
    }

    const existingMembers = await prisma.chatConversationMember.findMany({
        where: {
            conversationId,
            userId: { in: userIds },
        },
    });

    const existingUserIds = new Set(existingMembers.map((m) => m.userId));
    const newUserIds = userIds.filter((id) => !existingUserIds.has(id));

    if (newUserIds.length === 0) {
        return [];
    }

    const added = await prisma.chatConversationMember.createMany({
        data: newUserIds.map((userId) => ({
            conversationId,
            userId,
        })),
    });

    const newMembers = await prisma.chatConversationMember.findMany({
        where: {
            conversationId,
            userId: { in: newUserIds },
        },
        include: {
            user: true,
        },
    });

    // Create system messages for each added member
    for (const member of newMembers) {
        await prisma.message.create({
            data: {
                conversationId,
                userId: member.userId,
                content: `${member.user.displayName} joined the group`,
                messageType: 'system_user_joined',
            },
        });
    }

    return newMembers;
};

/**
 * Removes a member from a group conversation.
 * Currently restricted to the group creator.
 */
export const removeMember = async (conversationId: string, userId: string, requesterId: string) => {

    const conversation = await prisma.chatConversation.findUnique({
        where: { id: conversationId },
    });

    if (!conversation) {
        throw new Error("Conversation not found");
    }

    // Only the creator can remove members
    if (requesterId !== conversation.createdBy) {
        throw new Error("Only the group creator can remove members");
    }

    // Cannot remove the creator
    if (userId === conversation.createdBy) {
        throw new Error("Cannot remove the group creator");
    }

    // Get user details before deleting for the system message
    const memberToRemove = await prisma.user.findUnique({
        where: { id: userId },
        select: { displayName: true },
    });

    const deleted = await prisma.chatConversationMember.deleteMany({
        where: {
            conversationId,
            userId,
        },
    });

    if (deleted.count === 0) {
        throw new Error("Member not found in conversation");
    }

    // Create system message for member removal
    if (memberToRemove) {
        await prisma.message.create({
            data: {
                conversationId,
                userId: userId, // The user who left
                content: `${memberToRemove.displayName} left the group`,
                messageType: 'system_user_left',
            },
        });
    }

    return { success: true, userId };
};
