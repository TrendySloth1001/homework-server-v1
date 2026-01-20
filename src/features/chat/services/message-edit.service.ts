import { prisma } from "../../../shared/lib/prisma";

const EDIT_TIME_LIMIT_MINUTES = 15; // Allow edits within 15 minutes

/**
 * Edit a message
 */
export const editMessage = async (
  messageId: string,
  userId: string,
  newContent: string
) => {
  const message = await prisma.message.findUnique({
    where: { id: messageId },
    select: {
      id: true,
      userId: true,
      content: true,
      createdAt: true,
      deletedForEveryone: true,
    },
  });

  if (!message) {
    throw new Error("Message not found");
  }

  if (message.userId !== userId) {
    throw new Error("You can only edit your own messages");
  }

  if (message.deletedForEveryone) {
    throw new Error("Cannot edit deleted message");
  }

  // Check time limit
  const now = new Date();
  const messageAge = now.getTime() - message.createdAt.getTime();
  const timeLimitMs = EDIT_TIME_LIMIT_MINUTES * 60 * 1000;

  if (messageAge > timeLimitMs) {
    throw new Error(`Messages can only be edited within ${EDIT_TIME_LIMIT_MINUTES} minutes`);
  }

  // Trim and validate new content
  const trimmedContent = newContent.trim();
  if (!trimmedContent) {
    throw new Error("Message content cannot be empty");
  }

  if (trimmedContent === message.content) {
    throw new Error("New content is the same as current content");
  }

  // Store edit history
  await prisma.messageEdit.create({
    data: {
      messageId,
      previousContent: message.content,
    },
  });

  // Update message
  const updatedMessage = await prisma.message.update({
    where: { id: messageId },
    data: {
      content: trimmedContent,
      isEdited: true,
      editedAt: now,
    },
    include: {
      user: true,
      replyToMessage: {
        include: { user: true },
      },
    },
  });

  return updatedMessage;
};

/**
 * Get edit history for a message
 */
export const getMessageEditHistory = async (
  messageId: string,
  userId: string
) => {
  // Verify user has access to the message
  const message = await prisma.message.findUnique({
    where: { id: messageId },
    select: {
      conversationId: true,
      content: true,
    },
  });

  if (!message) {
    throw new Error("Message not found");
  }

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

  const edits = await prisma.messageEdit.findMany({
    where: { messageId },
    orderBy: { editedAt: "asc" },
  });

  return {
    current: message.content,
    history: edits.map((edit) => ({
      content: edit.previousContent,
      editedAt: edit.editedAt.toISOString(),
    })),
  };
};
