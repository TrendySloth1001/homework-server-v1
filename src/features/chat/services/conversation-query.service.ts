import { prisma } from "../../../shared/lib/prisma";
import { isUserInConversation } from "./utility.service";

/**
 * Calculates the total unread message count for a user across all conversations or a specific one.
 * @param userId - The ID of the user
 * @param conversationId - Optional conversation ID to filter by
 */
export const getUnreadCount = async (userId: string, conversationId?: string) => {
    // console.log('[getUnreadCount] Called with:', { userId, conversationId });

    const where: any = {
        conversation: {
            members: {
                some: { userId },
            },
        },
        userId: { not: userId },
    };

    if (conversationId) {
        where.conversationId = conversationId;
    }

    const memberData = await prisma.chatConversationMember.findMany({
        where: {
            userId,
            ...(conversationId ? { conversationId } : {}),
        },
        select: {
            conversationId: true,
            lastRead: true,
        },
    });

    // console.log('[getUnreadCount] Member data:', memberData);

    let totalUnread = 0;

    for (const member of memberData) {
        const unreadCount = await prisma.message.count({
            where: {
                conversationId: member.conversationId,
                userId: { not: userId },
                ...(member.lastRead ? { createdAt: { gt: member.lastRead } } : {}),
            },
        });
        // console.log('[getUnreadCount] Conversation', member.conversationId, 'unread:', unreadCount);
        totalUnread += unreadCount;
    }

    // console.log('[getUnreadCount] Total unread:', totalUnread);
    return totalUnread;
};

/**
 * Retrieves all conversations for a user, including the last message and unread count.
 */
export const getUserConversations = async (userId: string) => {
    const conversations = await prisma.chatConversation.findMany({
        where: {
            members: {
                some: { userId },
            },
        },
        include: {
            members: {
                include: { user: true },
            },
            messages: {
                orderBy: { createdAt: "desc" },
                take: 1,
                include: {
                    user: true,
                },
            },
            creator: true,
        },
        orderBy: { updatedAt: "desc" },
    });

    // Get the current user's membership info and calculate unread count for each conversation
    const conversationsWithUnread = await Promise.all(
        conversations.map(async (conv) => {
            const currentUserMember = conv.members.find(m => m.userId === userId);

            // Calculate unread count for this conversation
            const unreadCount = await getUnreadCount(userId, conv.id);
            // console.log('[getUserConversations] Conversation:', conv.id, 'Unread:', unreadCount);

            return {
                id: conv.id,
                name: conv.name,
                avatarUrl: conv.avatarUrl, // Include group avatar
                isGroup: conv.isGroup,
                createdBy: conv.createdBy,
                creator: conv.creator,
                members: conv.members.map(m => ({
                    id: m.id,
                    conversationId: m.conversationId,
                    userId: m.userId,
                    user: m.user,
                    role: m.role,
                    isBanned: m.isBanned,
                    bannedAt: m.bannedAt,
                    bannedBy: m.bannedBy,
                    banReason: m.banReason,
                    joinedAt: m.joinedAt,
                    isPinned: m.isPinned,
                    lastRead: m.lastRead,
                    draft: m.userId === userId ? m.draft : null, // Only include draft for current user
                })),
                lastMessage: conv.messages[0] || null,
                isPinned: currentUserMember?.isPinned || false,
                unreadCount, // Include unread count
                createdAt: conv.createdAt,
                updatedAt: conv.updatedAt,
            };
        })
    );

    return conversationsWithUnread;
};

/**
 * Retrieves a single conversation by ID with detailed member information.
 * Verifies that the requesting user is a member of the conversation.
 */
export const getConversationById = async (conversationId: string, userId: string) => {

    const isMember = await isUserInConversation(conversationId, userId);
    if (!isMember) {
        throw new Error("User is not a member of this conversation");
    }

    const conversation = await prisma.chatConversation.findUnique({
        where: { id: conversationId },
        include: {
            members: {
                include: { user: true },
            },
            creator: true,
        },
    });

    if (!conversation) {
        throw new Error("Conversation not found");
    }

    return {
        ...conversation,
        members: conversation.members.map(m => ({
            id: m.id,
            conversationId: m.conversationId,
            userId: m.userId,
            user: m.user,
            role: m.role,
            isBanned: m.isBanned,
            bannedAt: m.bannedAt,
            bannedBy: m.bannedBy,
            banReason: m.banReason,
            joinedAt: m.joinedAt,
            isPinned: m.isPinned,
            lastRead: m.lastRead,
            draft: m.userId === userId ? m.draft : null, // Only include draft for current user
        })),
    };
};

/**
 * Retrieves public information about a group conversation (for share previews).
 * Does not require the user to be a member.
 */
export const getPublicGroupInfo = async (conversationId: string) => {
    // console.log('[getPublicGroupInfo] Called with conversationId:', conversationId);
    const conversation = await prisma.chatConversation.findUnique({
        where: { id: conversationId },
        include: {
            members: {
                select: {
                    userId: true,
                },
            },
            creator: {
                select: {
                    id: true,
                    displayName: true,
                    avatarUrl: true,
                },
            },
        },
    });

    if (!conversation) {
        throw new Error("Conversation not found");
    }

    if (!conversation.isGroup) {
        throw new Error("This endpoint is only for group conversations");
    }

    // Return basic group info without sensitive data
    return {
        id: conversation.id,
        name: conversation.name,
        isGroup: conversation.isGroup,
        groupAvatar: conversation.avatarUrl,
        memberCount: conversation.members.length,
        createdBy: conversation.createdBy,
        creator: conversation.creator,
        createdAt: conversation.createdAt,
    };
};

/**
 * Retrieves the list of members in a conversation.
 */
export const getConversationMembers = async (conversationId: string, requesterId: string) => {

    const isMember = await isUserInConversation(conversationId, requesterId);
    if (!isMember) {
        throw new Error("User is not a member of this conversation");
    }

    const members = await prisma.chatConversationMember.findMany({
        where: {
            conversationId,
            isBanned: false  // Don't show banned members in mentions
        },
        include: {
            user: true,
        },
        orderBy: { joinedAt: "asc" },
    });

    return members.map((member) => ({
        id: member.id,
        userId: member.userId,
        username: member.user.username,
        displayName: member.user.displayName,
        avatarUrl: member.user.avatarUrl,
        role: member.role,
        joinedAt: member.joinedAt.toISOString(),
    }));
};
