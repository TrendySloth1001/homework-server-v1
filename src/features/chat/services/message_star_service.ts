import { prisma } from "../../../shared/lib/prisma";
import { isUserInConversation } from "./utility_service";

/**
 * Star a message
 */
export const starMessage = async (messageId: string, userId: string) => {
  // Verify message exists and user has access
  const message = await prisma.message.findUnique({
    where: { id: messageId },
    select: { conversationId: true, deletedForEveryone: true },
  });

  if (!message) {
    throw new Error("Message not found");
  }

  if (message.deletedForEveryone) {
    throw new Error("Cannot star deleted message");
  }

  const isMember = await isUserInConversation(message.conversationId, userId);
  if (!isMember) {
    throw new Error("User is not a member of this conversation");
  }

  // Check if already starred
  const existing = await prisma.starredMessage.findUnique({
    where: {
      messageId_userId: {
        messageId,
        userId,
      },
    },
  });

  if (existing) {
    return { success: true, message: "Message already starred" };
  }

  await prisma.starredMessage.create({
    data: {
      messageId,
      userId,
    },
  });

  return { success: true };
};

/**
 * Unstar a message
 */
export const unstarMessage = async (messageId: string, userId: string) => {
  const starred = await prisma.starredMessage.findUnique({
    where: {
      messageId_userId: {
        messageId,
        userId,
      },
    },
  });

  if (!starred) {
    return { success: true, message: "Message not starred" };
  }

  await prisma.starredMessage.delete({
    where: { id: starred.id },
  });

  return { success: true };
};

/**
 * Get all starred messages for a user in a conversation
 */
export const getStarredMessages = async (
  conversationId: string,
  userId: string
) => {
  const isMember = await isUserInConversation(conversationId, userId);
  if (!isMember) {
    throw new Error("User is not a member of this conversation");
  }

  const starredMessages = await prisma.starredMessage.findMany({
    where: {
      userId,
      message: {
        conversationId,
        deletedForEveryone: false,
      },
    },
    include: {
      message: {
        include: {
          user: true,
          replyToMessage: {
            include: { user: true },
          },
        },
      },
    },
    orderBy: { starredAt: "desc" },
  });

  return starredMessages.map((starred) => ({
    ...starred.message,
    starredAt: starred.starredAt.toISOString(),
  }));
};

/**
 * Get all starred messages for a user across all conversations
 */
export const getAllStarredMessages = async (userId: string) => {
  const starredMessages = await prisma.starredMessage.findMany({
    where: {
      userId,
      message: {
        deletedForEveryone: false,
      },
    },
    include: {
      message: {
        include: {
          user: true,
          conversation: {
            select: {
              id: true,
              name: true,
              isGroup: true,
            },
          },
          replyToMessage: {
            include: { user: true },
          },
        },
      },
    },
    orderBy: { starredAt: "desc" },
  });

  return starredMessages.map((starred) => ({
    ...starred.message,
    starredAt: starred.starredAt.toISOString(),
  }));
};
