import { prisma } from "../../../shared/lib/prisma";

// ==================== PINNED MESSAGES ====================

/**
 * Pins a message in a conversation.
 * Only accessible by creator, admins, or moderators.
 */
export const pinMessage = async (
  conversationId: string,
  messageId: string,
  pinnedBy: string
) => {
  // Check if user is creator
  const conversation = await prisma.chatConversation.findUnique({
    where: { id: conversationId },
    select: { createdBy: true },
  });

  const isCreator = conversation?.createdBy === pinnedBy;

  if (!isCreator) {
    const member = await prisma.chatConversationMember.findUnique({
      where: { conversationId_userId: { conversationId, userId: pinnedBy } },
    });

    if (!member || (member.role !== "admin" && member.role !== "moderator")) {
      throw new Error("Only the creator, admins and moderators can pin messages");
    }
  }

  const message = await prisma.message.findUnique({
    where: { id: messageId },
  });

  if (!message || message.conversationId !== conversationId) {
    throw new Error("Message not found in this conversation");
  }

  const existingPin = await prisma.pinnedMessage.findUnique({
    where: { conversationId_messageId: { conversationId, messageId } },
  });

  if (existingPin) {
    throw new Error("Message is already pinned");
  }

  const pinnedMessage = await prisma.pinnedMessage.create({
    data: {
      conversationId,
      messageId,
      pinnedBy,
    },
    include: {
      message: {
        include: {
          user: {
            select: { id: true, displayName: true, avatarUrl: true },
          },
        },
      },
    },
  });

  return pinnedMessage;
};

export const unpinMessage = async (
  conversationId: string,
  messageId: string,
  userId: string
) => {
  // Check if user is creator
  const conversation = await prisma.chatConversation.findUnique({
    where: { id: conversationId },
    select: { createdBy: true },
  });

  const isCreator = conversation?.createdBy === userId;

  if (!isCreator) {
    const member = await prisma.chatConversationMember.findUnique({
      where: { conversationId_userId: { conversationId, userId } },
    });

    if (!member || (member.role !== "admin" && member.role !== "moderator")) {
      throw new Error("Only the creator, admins and moderators can unpin messages");
    }
  }

  const pinnedMessage = await prisma.pinnedMessage.findUnique({
    where: { conversationId_messageId: { conversationId, messageId } },
  });

  if (!pinnedMessage) {
    throw new Error("Message is not pinned");
  }

  await prisma.pinnedMessage.delete({
    where: { conversationId_messageId: { conversationId, messageId } },
  });

  return { success: true, message: "Message unpinned successfully" };
};

export const getPinnedMessages = async (conversationId: string, userId: string) => {
  const member = await prisma.chatConversationMember.findUnique({
    where: { conversationId_userId: { conversationId, userId } },
  });

  if (!member) {
    throw new Error("You are not a member of this conversation");
  }

  const pinnedMessages = await prisma.pinnedMessage.findMany({
    where: { conversationId },
    include: {
      message: {
        include: {
          user: {
            select: { id: true, displayName: true, avatarUrl: true },
          },
        },
      },
      user: {
        select: { id: true, displayName: true },
      },
    },
    orderBy: { pinnedAt: "desc" },
  });

  return pinnedMessages;
};

// ==================== ANNOUNCEMENTS ====================

/**
 * Sends an announcement message to a conversation.
 * Only accessible by creator, admins, or moderators.
 */
export const sendAnnouncement = async (
  conversationId: string,
  userId: string,
  content: string
) => {
  const conversation = await prisma.chatConversation.findUnique({
    where: { id: conversationId },
    select: { createdBy: true },
  });

  const isCreator = conversation?.createdBy === userId;

  const member = await prisma.chatConversationMember.findUnique({
    where: { conversationId_userId: { conversationId, userId } },
  });

  if (!isCreator && (!member || (member.role !== "admin" && member.role !== "moderator"))) {
    throw new Error("Only the creator, admins and moderators can send announcements");
  }

  const announcement = await prisma.message.create({
    data: {
      conversationId,
      userId,
      content,
      messageType: "announcement",
      isAnnouncement: true,
    },
    include: {
      user: {
        select: { id: true, displayName: true, avatarUrl: true },
      },
    },
  });

  return announcement;
};

export const getAnnouncements = async (conversationId: string, userId: string) => {
  const member = await prisma.chatConversationMember.findUnique({
    where: { conversationId_userId: { conversationId, userId } },
  });

  if (!member) {
    throw new Error("You are not a member of this conversation");
  }

  const announcements = await prisma.message.findMany({
    where: { conversationId, isAnnouncement: true },
    include: {
      user: {
        select: { id: true, displayName: true, avatarUrl: true },
      },
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return announcements;
};
