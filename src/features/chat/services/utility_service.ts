import { prisma } from "../../../shared/lib/prisma";
import crypto from "crypto";

export const isUserInConversation = async (conversationId: string, userId: string): Promise<boolean> => {
  const member = await prisma.chatConversationMember.findUnique({
    where: {
      conversationId_userId: {
        conversationId,
        userId,
      },
    },
  });

  return member !== null;
};

export const generateConversationId = (userId1: string, userId2: string): string => {
  const sorted = [userId1, userId2].sort();
  return crypto
    .createHash("sha256")
    .update(sorted.join(":"))
    .digest("hex")
    .substring(0, 16);
};

export const createUser = async (username: string) => {
  return prisma.user.create({
    data: { username },
  });
};

export const updateUserWithChatInfo = async (userId: string, username: string) => {
  return prisma.user.update({
    where: { id: userId },
    data: { 
      username,
      isOnline: true,
      lastActiveAt: new Date()
    },
    select: {
      id: true,
      email: true,
      displayName: true,
      avatarUrl: true,
      username: true,
      isOnline: true,
      lastActiveAt: true,
    }
  });
};

export const getUserById = async (userId: string) => {
  return prisma.user.findUnique({
    where: { id: userId },
  });
};

export const getUserByUsername = async (username: string) => {
  return prisma.user.findUnique({
    where: { username },
  });
};

export const getAllUsers = async () => {
  return prisma.user.findMany({
    select: {
      id: true,
      username: true,
      isOnline: true,
      lastActiveAt: true,
      createdAt: true,
    },
    orderBy: [
      { isOnline: 'desc' },
      { lastActiveAt: 'desc' },
      { username: 'asc' },
    ],
  });
};
