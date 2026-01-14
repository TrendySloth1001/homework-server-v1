import { prisma } from "../../../shared/lib/prisma";
import { generateConversationId, isUserInConversation } from "./utility_service";

// Simple hash function for generating advisory lock keys
function hashCode(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return hash;
}

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

  // Get the current user's membership info and calculate unread count for each conversation
  const conversationsWithUnread = await Promise.all(
    conversations.map(async (conv) => {
      const currentUserMember = conv.members.find(m => m.userId === userId);
      
      // Calculate unread count for this conversation
      const unreadCount = await getUnreadCount(userId, conv.id);
      console.log('[getUserConversations] Conversation:', conv.id, 'Unread:', unreadCount);
      
      return {
        id: conv.id,
        name: conv.name,
        isGroup: conv.isGroup,
        createdBy: conv.createdBy,
        creator: conv.creator,
        members: conv.members,
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

  // Sort user IDs to ensure consistent lock order (prevent deadlocks)
  const [userA, userB] = [userId1, userId2].sort();
  
  // Use advisory lock to prevent race conditions
  // Lock key is a hash of the two user IDs
  const lockKey = Math.abs(hashCode(`${userA}-${userB}`));
  
  return await prisma.$transaction(async (tx) => {
    // Acquire advisory lock (PostgreSQL specific)
    await tx.$executeRawUnsafe(`SELECT pg_advisory_xact_lock(${lockKey})`);
    
    // Check for existing conversation inside transaction
    const existingConversation = await tx.chatConversation.findFirst({
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

    // Create conversation inside transaction
    const conversation = await tx.chatConversation.create({
      data: {
        name: null,
        isGroup: false,
        createdBy: userId1,
      },
    });

    // Add both users as members
    const uniqueMemberIds = Array.from(new Set([userId1, userId2]));
    await tx.chatConversationMember.createMany({
      data: uniqueMemberIds.map((userId) => ({
        conversationId: conversation.id,
        userId,
      })),
    });

    // Return the created conversation with full data
    return tx.chatConversation.findUniqueOrThrow({
      where: { id: conversation.id },
      include: {
        members: {
          include: { user: true },
        },
        creator: true,
      },
    });
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

  // Only the creator can add members
  if (requesterId !== conversation.createdBy) {
    throw new Error("Only the group creator can add members");
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

  // Only the creator can remove members
  if (requesterId !== conversation.createdBy) {
    throw new Error("Only the group creator can remove members");
  }

  // Cannot remove the creator
  if (userId === conversation.createdBy) {
    throw new Error("Cannot remove the group creator");
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

  // Only the creator can update group name
  if (requesterId !== conversation.createdBy) {
    throw new Error("Only the group creator can update the group name");
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
  console.log('[getUnreadCount] Called with:', { userId, conversationId });
  
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

  console.log('[getUnreadCount] Member data:', memberData);

  let totalUnread = 0;

  for (const member of memberData) {
    const unreadCount = await prisma.message.count({
      where: {
        conversationId: member.conversationId,
        userId: { not: userId },
        ...(member.lastRead ? { createdAt: { gt: member.lastRead } } : {}),
      },
    });
    console.log('[getUnreadCount] Conversation', member.conversationId, 'unread:', unreadCount);
    totalUnread += unreadCount;
  }

  console.log('[getUnreadCount] Total unread:', totalUnread);
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

export const deleteConversation = async (conversationId: string, userId: string) => {
  const conversation = await prisma.chatConversation.findUnique({
    where: { id: conversationId },
    include: {
      members: true,
    },
  });

  if (!conversation) {
    throw new Error("Conversation not found");
  }

  const isMember = conversation.members.some(m => m.userId === userId);
  if (!isMember) {
    throw new Error("User is not a member of this conversation");
  }

  // For one-to-one chats, only the creator or allow anyone to delete
  // For groups, only creator can delete the entire conversation
  if (conversation.isGroup && conversation.createdBy !== userId) {
    throw new Error("Only the group creator can delete the conversation");
  }

  // Delete the entire conversation and all related data
  await prisma.chatConversation.delete({
    where: { id: conversationId },
  });

  return { success: true, message: "Conversation deleted successfully" };
};

export const createGroupConversation = async ({
  name,
  creatorId,
  memberIds,
}: {
  name: string;
  creatorId: string;
  memberIds: string[];
}) => {
  // Verify creator exists
  const creator = await prisma.user.findUnique({ where: { id: creatorId } });
  if (!creator) {
    throw new Error("Creator not found");
  }

  // Verify all members exist
  const members = await prisma.user.findMany({
    where: { id: { in: memberIds } },
  });
  if (members.length !== memberIds.length) {
    throw new Error("One or more members not found");
  }

  // Check if creator is a teacher or student
  const creatorTeacher = await prisma.teacher.findUnique({
    where: { userId: creatorId },
    select: { id: true },
  });

  const creatorStudent = !creatorTeacher ? await prisma.student.findUnique({
    where: { userId: creatorId },
    select: { id: true },
  }) : null;

  if (!creatorTeacher && !creatorStudent) {
    throw new Error("Creator must be a teacher or student");
  }

  // Verify mutual following relationships
  for (const memberId of memberIds) {
    if (memberId === creatorId) continue; // Skip creator

    const memberTeacher = await prisma.teacher.findUnique({
      where: { userId: memberId },
      select: { id: true },
    });

    const memberStudent = !memberTeacher ? await prisma.student.findUnique({
      where: { userId: memberId },
      select: { id: true },
    }) : null;

    if (!memberTeacher && !memberStudent) {
      throw new Error(`User ${memberId} must be a teacher or student`);
    }

    // Check mutual following
    let areMutualFollowers = false;

    if (creatorStudent && memberTeacher) {
      // Student creator and teacher member
      const follow = await prisma.teacherFollower.findUnique({
        where: {
          teacherId_studentId: {
            teacherId: memberTeacher.id,
            studentId: creatorStudent.id,
          },
        },
      });
      areMutualFollowers = !!follow;
    } else if (creatorTeacher && memberStudent) {
      // Teacher creator and student member
      const follow = await prisma.teacherFollower.findUnique({
        where: {
          teacherId_studentId: {
            teacherId: creatorTeacher.id,
            studentId: memberStudent.id,
          },
        },
      });
      areMutualFollowers = !!follow;
    } else if (creatorTeacher && memberTeacher) {
      // Both are teachers - check TeacherToTeacher table for mutual following
      const creatorFollowsMember = await prisma.teacherToTeacher.findFirst({
        where: {
          followerId: creatorTeacher.id,
          followedId: memberTeacher.id,
        },
      });
      const memberFollowsCreator = await prisma.teacherToTeacher.findFirst({
        where: {
          followerId: memberTeacher.id,
          followedId: creatorTeacher.id,
        },
      });
      areMutualFollowers = !!creatorFollowsMember || !!memberFollowsCreator; // Allow if either follows the other
    } else if (creatorStudent && memberStudent) {
      // Both are students - need to check if they follow common teachers
      // For simplicity, we'll allow any students to create groups together
      // You can add more complex logic here if needed
      areMutualFollowers = true;
    }

    if (!areMutualFollowers) {
      throw new Error(`You must be following each other to add ${memberId} to the group`);
    }
  }

  // Create the group conversation
  const conversation = await prisma.chatConversation.create({
    data: {
      name: name.trim(),
      isGroup: true,
      createdBy: creatorId,
    },
  });

  // Add all members including creator
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
