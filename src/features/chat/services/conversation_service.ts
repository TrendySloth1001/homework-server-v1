import { prisma } from "../../../shared/lib/prisma";
import { generateConversationId, isUserInConversation } from "./utility_service";

export const createConversation = async ({
  name,
  creatorId,
  memberIds,
  isGroup = false,
}: {
  name?: string;
  creatorId: string;
  memberIds: string[];
  isGroup?: boolean;
}) => {
  
  const creator = await prisma.user.findUnique({ where: { id: creatorId } });
  if (!creator) {
    throw new Error("Creator not found");
  }

  const members = await prisma.user.findMany({
    where: { id: { in: memberIds } },
  });
  if (members.length !== memberIds.length) {
    throw new Error("One or more members not found");
  }

  const conversation = await prisma.chatConversation.create({
    data: {
      name: isGroup && name ? name : null,
      isGroup,
      createdBy: creatorId,
    },
  });

  const uniqueMemberIds = Array.from(new Set([creatorId, ...memberIds]));
  await prisma.chatConversationMember.createMany({
    data: uniqueMemberIds.map((userId) => ({
      conversationId: conversation.id,
      userId,
    })),
  });

  return prisma.chatConversation.findUniqueOrThrow({
    where: { id: conversation.id },
    include: {
      members: {
        include: { user: true },
      },
      creator: true,
    },
  });
};

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

  // Get the current user's membership info for isPinned status
  return conversations.map((conv) => {
    const currentUserMember = conv.members.find(m => m.userId === userId);
    
    return {
      id: conv.id,
      name: conv.name,
      isGroup: conv.isGroup,
      createdBy: conv.createdBy,
      creator: conv.creator,
      members: conv.members,
      lastMessage: conv.messages[0] || null,
      isPinned: currentUserMember?.isPinned || false,
      createdAt: conv.createdAt,
      updatedAt: conv.updatedAt,
    };
  });
};

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

  return conversation;
};

export const checkOrCreateOneToOne = async (userId1: string, userId2: string) => {
  
  const users = await prisma.user.findMany({
    where: { id: { in: [userId1, userId2] } },
  });
  if (users.length !== 2) {
    throw new Error("One or both users not found");
  }

  const existingConversation = await prisma.chatConversation.findFirst({
    where: {
      isGroup: false,
      AND: [
        { members: { some: { userId: userId1 } } },
        { members: { some: { userId: userId2 } } },
      ],
    },
    include: {
      members: {
        include: { user: true },
      },
      creator: true,
    },
  });

  if (existingConversation) {
    return existingConversation;
  }

  return createConversation({
    creatorId: userId1,
    memberIds: [userId2],
    isGroup: false,
  });
};

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

  const isMember = await isUserInConversation(conversationId, requesterId);
  if (!isMember) {
    throw new Error("Only members can add other members");
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

  return newMembers;
};

export const removeMember = async (conversationId: string, userId: string, requesterId: string) => {
  
  const conversation = await prisma.chatConversation.findUnique({
    where: { id: conversationId },
  });

  if (!conversation) {
    throw new Error("Conversation not found");
  }

  const isMember = await isUserInConversation(conversationId, requesterId);
  if (!isMember && requesterId !== conversation.createdBy) {
    throw new Error("Unauthorized to remove members");
  }

  const deleted = await prisma.chatConversationMember.deleteMany({
    where: {
      conversationId,
      userId,
    },
  });

  if (deleted.count === 0) {
    throw new Error("Member not found in conversation");
  }

  return { success: true, userId };
};

export const updateGroupName = async (conversationId: string, newName: string, requesterId: string) => {
  
  const conversation = await prisma.chatConversation.findUnique({
    where: { id: conversationId },
  });

  if (!conversation) {
    throw new Error("Conversation not found");
  }

  if (!conversation.isGroup) {
    throw new Error("Cannot update name of one-to-one conversation");
  }

  const isMember = await isUserInConversation(conversationId, requesterId);
  if (!isMember) {
    throw new Error("Only members can update group name");
  }

  return prisma.chatConversation.update({
    where: { id: conversationId },
    data: { name: newName },
    include: {
      members: {
        include: { user: true },
      },
      creator: true,
    },
  });
};

export const getConversationMembers = async (conversationId: string, requesterId: string) => {
  
  const isMember = await isUserInConversation(conversationId, requesterId);
  if (!isMember) {
    throw new Error("User is not a member of this conversation");
  }

  const members = await prisma.chatConversationMember.findMany({
    where: { conversationId },
    include: {
      user: true,
    },
    orderBy: { joinedAt: "asc" },
  });

  return members.map((member) => ({
    id: member.id,
    userId: member.userId,
    username: member.user.username,
    joinedAt: member.joinedAt.toISOString(),
  }));
};

export const getUnreadCount = async (userId: string, conversationId?: string) => {
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

  let totalUnread = 0;

  for (const member of memberData) {
    const unreadCount = await prisma.message.count({
      where: {
        conversationId: member.conversationId,
        userId: { not: userId },
        ...(member.lastRead ? { createdAt: { gt: member.lastRead } } : {}),
      },
    });
    totalUnread += unreadCount;
  }

  return totalUnread;
};

export const clearConversation = async (conversationId: string, userId: string) => {
  
  const isMember = await isUserInConversation(conversationId, userId);
  if (!isMember) {
    throw new Error("User is not a member of this conversation");
  }

  await prisma.chatConversationMember.update({
    where: {
      conversationId_userId: {
        conversationId,
        userId,
      },
    },
    data: {
      lastRead: new Date(),
    },
  });

  return { success: true };
};

  export const leaveGroup = async (conversationId: string, userId: string) => {
    
    const conversation = await prisma.chatConversation.findUnique({
      where: { id: conversationId },
      include: {
        members: true,
      },
    });
  
    if (!conversation) {
      throw new Error("Conversation not found");
    }
  
    if (!conversation.isGroup) {
      throw new Error("Cannot leave one-to-one conversation");
    }

    await prisma.chatConversationMember.delete({
      where: {
        conversationId_userId: {
          conversationId,
          userId,
        },
      },
    });

    const remainingMembers = await prisma.chatConversationMember.count({
      where: { conversationId },
    });
  
    if (remainingMembers === 0) {
      await prisma.chatConversation.delete({
        where: { id: conversationId },
      });
    }
  
    return { success: true };
  };

export const pinConversation = async (conversationId: string, userId: string, isPinned: boolean) => {
  
  const isMember = await isUserInConversation(conversationId, userId);
  if (!isMember) {
    throw new Error("User is not a member of this conversation");
  }

  return prisma.chatConversationMember.update({
    where: {
      conversationId_userId: {
        conversationId,
        userId,
      },
    },
    data: {
      isPinned,
    },
  });
};
