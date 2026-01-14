import { prisma } from "../../../shared/lib/prisma";
import { isUserInConversation } from "./utility_service";
import { sendChatNotification } from '../../notifications/notifications.service';

export const sendMessage = async ({
  conversationId,
  userId,
  content,
}: {
  conversationId: string;
  userId: string;
  content: string;
}) => {
  
  const isMember = await isUserInConversation(conversationId, userId);
  if (!isMember) {
    throw new Error("User is not a member of this conversation");
  }

  const message = await prisma.message.create({
    data: {
      conversationId,
      userId,
      content: content.trim(),
    },
    include: {
      user: true,
    },
  });

  await prisma.chatConversation.update({
    where: { id: conversationId },
    data: { updatedAt: new Date() },
  });

  // Get all conversation members except the sender to send notifications
  const conversation = await prisma.chatConversation.findUnique({
    where: { id: conversationId },
    include: {
      members: {
        where: {
          userId: { not: userId }
        },
        select: { userId: true }
      }
    }
  });

  // Send smart notifications to all other members (only one if offline)
  if (conversation?.members && conversation.members.length > 0) {
    const messagePreview = content.trim().length > 50 
      ? content.trim().substring(0, 50) + '...' 
      : content.trim();
    const senderName = message.user.displayName;
    
    // Send notification to each member using smart helper
    for (const member of conversation.members) {
      sendChatNotification(
        member.userId,
        senderName,
        messagePreview,
        conversationId
      ).catch(error => {
        console.error('Failed to send notification:', error);
      });
    }
  }

  return {
    id: message.id,
    conversationId: message.conversationId,
    userId: message.userId,
    user: {
      id: message.user.id,
      username: message.user.username || '',
      displayName: message.user.displayName,
      avatarUrl: message.user.avatarUrl,
      isOnline: message.user.isOnline,
      lastActiveAt: message.user.lastActiveAt?.toISOString(),
    },
    content: message.content,
    mediaUrl: message.mediaUrl,
    mediaType: message.mediaType,
    createdAt: message.createdAt.toISOString(),
  };
};

export const getMessages = async ({
  conversationId,
  userId,
  limit = 50,
  before,
}: {
  conversationId: string;
  userId: string;
  limit?: number;
  before?: string; 
}) => {
  
  const isMember = await isUserInConversation(conversationId, userId);
  if (!isMember) {
    throw new Error("User is not a member of this conversation");
  }

  let whereClause: any = {
    conversationId,
  };

  if (before) {
    const beforeMsg = await prisma.message.findUnique({
      where: { id: before },
      select: { createdAt: true },
    });
    if (beforeMsg) {
      whereClause.createdAt = { lt: beforeMsg.createdAt };
    }
  }

  const messages = await prisma.message.findMany({
    where: whereClause,
    include: {
      user: true,
      seenBy: true,
    },
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  const messageIds = messages.map(m => m.id);
  const seenData = await prisma.messageSeen.findMany({
    where: { messageId: { in: messageIds } },
    include: { user: true },
  });

  const seenByMap = new Map<string, any[]>();
  seenData.forEach(seen => {
    if (!seenByMap.has(seen.messageId)) {
      seenByMap.set(seen.messageId, []);
    }
    seenByMap.get(seen.messageId)!.push({
      userId: seen.userId,
      username: seen.user.username,
      seenAt: seen.seenAt.toISOString(),
    });
  });

  return messages.map((message) => ({
    id: message.id,
    conversationId: message.conversationId,
    userId: message.userId,
    user: {
      id: message.user.id,
      username: message.user.username || '',
      displayName: message.user.displayName,
      avatarUrl: message.user.avatarUrl,
      isOnline: message.user.isOnline,
      lastActiveAt: message.user.lastActiveAt?.toISOString(),
    },
    content: message.content,
    mediaUrl: message.mediaUrl,
    mediaType: message.mediaType,
    seenBy: seenByMap.get(message.id) || [],
    createdAt: message.createdAt.toISOString(),
  }));
};

export const markMessageSeen = async (messageId: string, userId: string) => {
  
  const message = await prisma.message.findUnique({
    where: { id: messageId },
    include: {
      conversation: {
        include: {
          members: {
            where: { userId },
          },
        },
      },
    },
  });

  if (!message) {
    throw new Error("Message not found");
  }

  if (message.conversation.members.length === 0) {
    throw new Error("User is not a member of this conversation");
  }

  if (message.userId === userId) {
    return { success: true, alreadySeen: true };
  }

  const existing = await prisma.messageSeen.findUnique({
    where: {
      messageId_userId: {
        messageId,
        userId,
      },
    },
  });

  if (existing) {
    return { success: true, alreadySeen: true };
  }

  await prisma.messageSeen.create({
    data: {
      messageId,
      userId,
    },
  });

  await prisma.chatConversationMember.update({
    where: {
      conversationId_userId: {
        conversationId: message.conversationId,
        userId,
      },
    },
    data: {
      lastRead: new Date(),
    },
  });

  // Get user info for the broadcast
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { username: true, displayName: true }
  });

  return {
    success: true,
    alreadySeen: false,
    messageId,
    userId,
    username: user?.displayName || user?.username || 'Unknown',
    conversationId: message.conversationId,
    seenAt: new Date().toISOString(),
  };
};

export const uploadMedia = async (file: {
  buffer: Buffer;
  mimetype: string;
  originalname: string;
}) => {

  const mediaType = file.mimetype.split("/")[0]; 
  const mockUrl = `/uploads/${Date.now()}-${file.originalname}`;

  return {
    url: mockUrl,
    type: mediaType,
  };
};

export const sendMediaMessage = async ({
  conversationId,
  userId,
  content,
  mediaUrl,
  mediaType,
}: {
  conversationId: string;
  userId: string;
  content?: string;
  mediaUrl: string;
  mediaType: string;
}) => {
  
  const isMember = await isUserInConversation(conversationId, userId);
  if (!isMember) {
    throw new Error("User is not a member of this conversation");
  }

  const message = await prisma.message.create({
    data: {
      conversationId,
      userId,
      content: content?.trim() || "",
      mediaUrl,
      mediaType,
    },
    include: {
      user: true,
    },
  });

  await prisma.chatConversation.update({
    where: { id: conversationId },
    data: { updatedAt: new Date() },
  });

  return {
    id: message.id,
    conversationId: message.conversationId,
    userId: message.userId,
    user: {
      id: message.user.id,
      username: message.user.username || '',
      displayName: message.user.displayName,
      avatarUrl: message.user.avatarUrl,
      isOnline: message.user.isOnline,
      lastActiveAt: message.user.lastActiveAt?.toISOString(),
    },
    content: message.content,
    mediaUrl: message.mediaUrl,
    mediaType: message.mediaType,
    createdAt: message.createdAt.toISOString(),
  };
};

export const searchMessages = async ({
  conversationId,
  userId,
  query,
  limit = 20,
}: {
  conversationId: string;
  userId: string;
  query: string;
  limit?: number;
}) => {
  
  const isMember = await isUserInConversation(conversationId, userId);
  if (!isMember) {
    throw new Error("User is not a member of this conversation");
  }

  const messages = await prisma.message.findMany({
    where: {
      conversationId, 
      content: {
        contains: query,
      },
    },
    include: {
      user: true,
    },
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  return messages.map((message) => ({
    id: message.id,
    conversationId: message.conversationId,
    userId: message.userId,
    user: {
      id: message.user.id,
      username: message.user.username || '',
      displayName: message.user.displayName,
      avatarUrl: message.user.avatarUrl,
      isOnline: message.user.isOnline,
      lastActiveAt: message.user.lastActiveAt?.toISOString(),
    },
    content: message.content,
    mediaUrl: message.mediaUrl,
    mediaType: message.mediaType,
    createdAt: message.createdAt.toISOString(),
  }));
};
