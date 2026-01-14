import { prisma } from "../../../shared/lib/prisma";
import { isUserInConversation } from "./utility_service";

/**
 * Forward a message to one or more conversations
 */
export const forwardMessage = async (
  messageId: string,
  userId: string,
  targetConversationIds: string[]
) => {
  // Get the original message
  const originalMessage = await prisma.message.findUnique({
    where: { id: messageId },
    select: {
      conversationId: true,
      content: true,
      mediaUrl: true,
      mediaType: true,
      mediaUrls: true,
      mediaTypes: true,
      deletedForEveryone: true,
    },
  });

  if (!originalMessage) {
    throw new Error("Message not found");
  }

  if (originalMessage.deletedForEveryone) {
    throw new Error("Cannot forward deleted message");
  }

  // Verify user has access to original message
  const hasAccess = await isUserInConversation(
    originalMessage.conversationId,
    userId
  );
  if (!hasAccess) {
    throw new Error("User does not have access to this message");
  }

  // Verify user is member of all target conversations
  const targetMembers = await prisma.chatConversationMember.findMany({
    where: {
      conversationId: { in: targetConversationIds },
      userId,
    },
  });

  if (targetMembers.length !== targetConversationIds.length) {
    throw new Error(
      "User is not a member of one or more target conversations"
    );
  }

  // Create forwarded messages
  const forwardedMessages = await Promise.all(
    targetConversationIds.map(async (conversationId) => {
      const message = await prisma.message.create({
        data: {
          conversationId,
          userId,
          content: originalMessage.content,
          mediaUrl: originalMessage.mediaUrl,
          mediaType: originalMessage.mediaType,
          mediaUrls: originalMessage.mediaUrls as any,
          mediaTypes: originalMessage.mediaTypes as any,
          messageType: "user",
        },
        include: {
          user: true,
          conversation: {
            select: {
              id: true,
              name: true,
              isGroup: true,
            },
          },
        },
      });

      // Update conversation timestamp
      await prisma.chatConversation.update({
        where: { id: conversationId },
        data: { updatedAt: new Date() },
      });

      return message;
    })
  );

  return {
    success: true,
    forwardedCount: forwardedMessages.length,
    messages: forwardedMessages,
  };
};

/**
 * Search messages in a conversation
 */
export const searchMessages = async (
  conversationId: string,
  userId: string,
  query: string,
  limit: number = 50,
  offset: number = 0
) => {
  const isMember = await isUserInConversation(conversationId, userId);
  if (!isMember) {
    throw new Error("User is not a member of this conversation");
  }

  if (!query || query.trim().length === 0) {
    return { messages: [], total: 0 };
  }

  const searchQuery = query.trim().toLowerCase();

  // Get user's deletedFor list
  const userDeletedFor = (await prisma.message.findMany({
    where: {
      conversationId,
      deletedFor: { array_contains: userId },
    },
    select: { id: true },
  })).map(m => m.id);

  // Search messages
  const messages = await prisma.message.findMany({
    where: {
      conversationId,
      deletedForEveryone: false,
      id: { notIn: userDeletedFor },
      content: {
        contains: searchQuery,
        mode: "insensitive",
      },
    },
    include: {
      user: true,
      replyToMessage: {
        include: { user: true },
      },
    },
    orderBy: { createdAt: "desc" },
    take: limit,
    skip: offset,
  });

  // Get total count
  const total = await prisma.message.count({
    where: {
      conversationId,
      deletedForEveryone: false,
      id: { notIn: userDeletedFor },
      content: {
        contains: searchQuery,
        mode: "insensitive",
      },
    },
  });

  return {
    messages: messages.map((msg) => ({
      id: msg.id,
      conversationId: msg.conversationId,
      userId: msg.userId,
      user: {
        id: msg.user.id,
        displayName: msg.user.displayName,
        avatarUrl: msg.user.avatarUrl,
      },
      content: msg.content,
      mediaUrl: msg.mediaUrl,
      mediaType: msg.mediaType,
      mediaUrls: msg.mediaUrls as string[] | undefined,
      mediaTypes: msg.mediaTypes as string[] | undefined,
      createdAt: msg.createdAt.toISOString(),
      replyToId: msg.replyToId,
      replyToMessage: msg.replyToMessage
        ? {
            id: msg.replyToMessage.id,
            content: msg.replyToMessage.content,
            userId: msg.replyToMessage.userId,
            user: {
              id: msg.replyToMessage.user.id,
              displayName: msg.replyToMessage.user.displayName,
            },
          }
        : null,
    })),
    total,
    limit,
    offset,
  };
};
