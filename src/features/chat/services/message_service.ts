import { prisma } from "../../../shared/lib/prisma";
import { isUserInConversation } from "./utility_service";
import { sendChatNotification } from '../../notifications/notifications.service';
import { s3Service } from "../../../shared/lib/s3";

export const sendMessage = async ({
  conversationId,
  userId,
  content,
  replyToId,
}: {
  conversationId: string;
  userId: string;
  content: string;
  replyToId?: string;
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
      replyToId: replyToId || null,
    },
    include: {
      user: true,
      replyToMessage: {
        include: {
          user: true,
        },
      },
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
    isEdited: message.isEdited,
    editedAt: message.editedAt?.toISOString(),
    deletedForEveryone: message.deletedForEveryone,
    isStarred: false,
    reactions: [],
    createdAt: message.createdAt.toISOString(),
    replyToId: message.replyToId,
    replyToMessage: message.replyToMessage ? {
      id: message.replyToMessage.id,
      content: message.replyToMessage.content,
      userId: message.replyToMessage.userId,
      user: {
        id: message.replyToMessage.user.id,
        displayName: message.replyToMessage.user.displayName,
      },
    } : null,
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
      replyToMessage: {
        include: {
          user: true,
        },
      },
      reactions: {
        include: {
          user: {
            select: {
              id: true,
              displayName: true,
              avatarUrl: true,
            },
          },
        },
      },
      starredBy: {
        where: {
          userId: userId,
        },
      },
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
    mediaUrls: message.mediaUrls as string[] | undefined,
    mediaTypes: message.mediaTypes as string[] | undefined,
    isEdited: message.isEdited,
    editedAt: message.editedAt?.toISOString(),
    deletedForEveryone: message.deletedForEveryone,
    isStarred: message.starredBy.length > 0,
    reactions: Object.values(
      message.reactions.reduce((acc: any, reaction: any) => {
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
      }, {})
    ),
    seenBy: seenByMap.get(message.id) || [],
    createdAt: message.createdAt.toISOString(),
    replyToId: message.replyToId,
    replyToMessage: message.replyToMessage ? {
      id: message.replyToMessage.id,
      content: message.replyToMessage.content,
      userId: message.replyToMessage.userId,
      user: {
        id: message.replyToMessage.user.id,
        displayName: message.replyToMessage.user.displayName,
      },
    } : null,
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
  size: number;
}, conversationId?: string, messageId?: string) => {
  try {
    // Upload to S3/MinIO with organized structure
    const result = await s3Service.uploadFile(file, 'media', conversationId, messageId);
    
    return {
      url: result.url,
      filename: file.originalname,
      mimetype: file.mimetype,
      size: file.size,
    };
  } catch (error) {
    console.error('[MessageService] Media upload failed:', error);
    throw new Error('Failed to upload media file');
  }
};

export const sendMediaMessage = async ({
  conversationId,
  userId,
  content,
  mediaUrl,
  mediaType,
  mediaUrls,
  mediaTypes,
  replyToId,
}: {
  conversationId: string;
  userId: string;
  content?: string;
  mediaUrl?: string;
  mediaType?: string;
  mediaUrls?: string[];
  mediaTypes?: string[];
  replyToId?: string;
}) => {
  
  const isMember = await isUserInConversation(conversationId, userId);
  if (!isMember) {
    throw new Error("User is not a member of this conversation");
  }

  // Support both single media (backward compatibility) and multiple media
  const hasMultipleMedia = mediaUrls && mediaUrls.length > 0;
  const hasSingleMedia = mediaUrl && mediaType;

  // Build data object properly to avoid type issues
  const createData: any = {
    conversationId,
    userId,
    content: content?.trim() || "",
    mediaUrl: hasSingleMedia ? mediaUrl : (hasMultipleMedia ? mediaUrls[0] : null),
    mediaType: hasSingleMedia ? mediaType : (hasMultipleMedia ? (mediaTypes?.[0] ?? null) : null),
    replyToId: replyToId || null,
  };

  // Only add these fields if we have multiple media
  if (hasMultipleMedia) {
    createData.mediaUrls = mediaUrls;
    createData.mediaTypes = mediaTypes;
  }

  const message = await prisma.message.create({
    data: createData,
    include: {
      user: true,
      replyToMessage: {
        include: {
          user: true,
        },
      },
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
    mediaUrls: message.mediaUrls as string[] | undefined,
    mediaTypes: message.mediaTypes as string[] | undefined,
    isEdited: message.isEdited,
    editedAt: message.editedAt?.toISOString(),
    deletedForEveryone: message.deletedForEveryone,
    isStarred: false,
    reactions: [],
    createdAt: message.createdAt.toISOString(),
    replyToId: message.replyToId,
    replyToMessage: message.replyToMessage ? {
      id: message.replyToMessage.id,
      content: message.replyToMessage.content,
      userId: message.replyToMessage.userId,
      user: {
        id: message.replyToMessage.user.id,
        displayName: message.replyToMessage.user.displayName,
      },
    } : null,
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
