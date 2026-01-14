import { prisma } from "../../../shared/lib/prisma";
import { isUserInConversation } from "./utility_service";

/**
 * Add a reaction to a message
 */
export const addReaction = async (
  messageId: string,
  userId: string,
  emoji: string
) => {
  // Verify message exists and user has access
  const message = await prisma.message.findUnique({
    where: { id: messageId },
    select: { conversationId: true, deletedForEveryone: true },
  });

  if (!message) {
    throw new Error("Message not found");
  }

  if (message.deletedForEveryone) {
    throw new Error("Cannot react to deleted message");
  }

  const isMember = await isUserInConversation(message.conversationId, userId);
  if (!isMember) {
    throw new Error("User is not a member of this conversation");
  }

  // Add or update reaction (upsert handles if user already reacted with same emoji)
  const reaction = await prisma.messageReaction.upsert({
    where: {
      messageId_userId_emoji: {
        messageId,
        userId,
        emoji,
      },
    },
    create: {
      messageId,
      userId,
      emoji,
    },
    update: {},
    include: {
      user: {
        select: {
          id: true,
          displayName: true,
          avatarUrl: true,
        },
      },
    },
  });

  return reaction;
};

/**
 * Remove a reaction from a message
 */
export const removeReaction = async (
  messageId: string,
  userId: string,
  emoji: string
) => {
  const reaction = await prisma.messageReaction.findUnique({
    where: {
      messageId_userId_emoji: {
        messageId,
        userId,
        emoji,
      },
    },
  });

  if (!reaction) {
    throw new Error("Reaction not found");
  }

  await prisma.messageReaction.delete({
    where: {
      id: reaction.id,
    },
  });

  return { success: true };
};

/**
 * Get all reactions for a message
 */
export const getMessageReactions = async (messageId: string, userId: string) => {
  // Verify user has access to the message
  const message = await prisma.message.findUnique({
    where: { id: messageId },
    select: { conversationId: true },
  });

  if (!message) {
    throw new Error("Message not found");
  }

  const isMember = await isUserInConversation(message.conversationId, userId);
  if (!isMember) {
    throw new Error("User is not a member of this conversation");
  }

  const reactions = await prisma.messageReaction.findMany({
    where: { messageId },
    include: {
      user: {
        select: {
          id: true,
          displayName: true,
          avatarUrl: true,
        },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  // Group reactions by emoji
  const grouped = reactions.reduce((acc, reaction) => {
    if (!acc[reaction.emoji]) {
      acc[reaction.emoji] = {
        emoji: reaction.emoji,
        count: 0,
        users: [],
        userReacted: false,
      };
    }
    acc[reaction.emoji].count++;
    acc[reaction.emoji].users.push({
      id: reaction.user.id,
      displayName: reaction.user.displayName,
      avatarUrl: reaction.user.avatarUrl,
    });
    if (reaction.userId === userId) {
      acc[reaction.emoji].userReacted = true;
    }
    return acc;
  }, {} as Record<string, any>);

  return Object.values(grouped);
};
