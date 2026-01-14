import { prisma } from "../../../shared/lib/prisma";

const DELETE_FOR_EVERYONE_TIME_LIMIT_MINUTES = 60; // Allow delete for everyone within 1 hour

/**
 * Delete message for current user only (soft delete)
 */
export const deleteMessageForMe = async (
  messageId: string,
  userId: string
) => {
  const message = await prisma.message.findUnique({
    where: { id: messageId },
    select: {
      id: true,
      conversationId: true,
      deletedFor: true,
      deletedForEveryone: true,
    },
  });

  if (!message) {
    throw new Error("Message not found");
  }

  if (message.deletedForEveryone) {
    return { success: true, message: "Message already deleted" };
  }

  // Check if user is member
  const member = await prisma.chatConversationMember.findUnique({
    where: {
      conversationId_userId: {
        conversationId: message.conversationId,
        userId,
      },
    },
  });

  if (!member) {
    throw new Error("User is not a member of this conversation");
  }

  // Add user to deletedFor list
  const deletedFor = (message.deletedFor as string[]) || [];
  if (!deletedFor.includes(userId)) {
    deletedFor.push(userId);
  }

  await prisma.message.update({
    where: { id: messageId },
    data: { deletedFor },
  });

  return { success: true };
};

/**
 * Delete message for everyone (only message owner can do this)
 */
export const deleteMessageForEveryone = async (
  messageId: string,
  userId: string
) => {
  const message = await prisma.message.findUnique({
    where: { id: messageId },
    select: {
      id: true,
      userId: true,
      createdAt: true,
      deletedForEveryone: true,
    },
  });

  if (!message) {
    throw new Error("Message not found");
  }

  if (message.deletedForEveryone) {
    return { success: true, message: "Message already deleted" };
  }

  if (message.userId !== userId) {
    throw new Error("You can only delete your own messages for everyone");
  }

  // Check time limit
  const now = new Date();
  const messageAge = now.getTime() - message.createdAt.getTime();
  const timeLimitMs = DELETE_FOR_EVERYONE_TIME_LIMIT_MINUTES * 60 * 1000;

  if (messageAge > timeLimitMs) {
    throw new Error(
      `Messages can only be deleted for everyone within ${DELETE_FOR_EVERYONE_TIME_LIMIT_MINUTES} minutes`
    );
  }

  await prisma.message.update({
    where: { id: messageId },
    data: {
      deletedForEveryone: true,
      content: "This message was deleted",
    },
  });

  return { success: true };
};
