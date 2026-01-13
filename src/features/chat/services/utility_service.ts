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

export const getMutualFollowers = async (userId: string) => {
  console.log('[getMutualFollowers] Starting for userId:', userId);
  
  // Check if user is a teacher or student
  const teacher = await prisma.teacher.findUnique({
    where: { userId },
    select: { id: true },
  });

  const student = !teacher ? await prisma.student.findUnique({
    where: { userId },
    select: { id: true },
  }) : null;

  console.log('[getMutualFollowers] User is teacher:', !!teacher, 'student:', !!student);

  if (!teacher && !student) {
    console.log('[getMutualFollowers] User is neither teacher nor student, returning empty array');
    return []; // User is neither teacher nor student
  }

  const mutualUsers: any[] = [];

  if (student) {
    console.log('[getMutualFollowers] Processing as student, studentId:', student.id);
    
    // Student: Get all teachers they follow
    const followedTeachers = await prisma.teacherFollower.findMany({
      where: { studentId: student.id },
      include: {
        teacher: {
          include: {
            user: {
              select: {
                id: true,
                email: true,
                displayName: true,
                avatarUrl: true,
                username: true,
                isOnline: true,
                lastActiveAt: true,
              },
            },
          },
        },
      },
    });

    console.log('[getMutualFollowers] Student follows', followedTeachers.length, 'teachers');
    mutualUsers.push(...followedTeachers.map(f => ({ ...f.teacher.user, role: 'teacher' })));

    // Also get other students (for simplicity, allow all students to create groups together)
    const allStudents = await prisma.student.findMany({
      where: {
        userId: { not: userId },
      },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            displayName: true,
            avatarUrl: true,
            username: true,
            isOnline: true,
            lastActiveAt: true,
          },
        },
      },
    });

    console.log('[getMutualFollowers] Found', allStudents.length, 'other students');
    mutualUsers.push(...allStudents.map(s => ({ ...s.user, role: 'student' })));
  }

  if (teacher) {
    console.log('[getMutualFollowers] Processing as teacher, teacherId:', teacher.id);
    
    // Teacher: Get all students who follow them
    const followers = await prisma.teacherFollower.findMany({
      where: { teacherId: teacher.id },
      include: {
        student: {
          include: {
            user: {
              select: {
                id: true,
                email: true,
                displayName: true,
                avatarUrl: true,
                username: true,
                isOnline: true,
                lastActiveAt: true,
              },
            },
          },
        },
      },
    });

    console.log('[getMutualFollowers] Teacher has', followers.length, 'student followers');
    mutualUsers.push(...followers.map(f => ({ ...f.student.user, role: 'student' })));

    // Get teachers that this teacher follows (teacher-to-teacher following)
    const followedTeachers = await prisma.teacherToTeacher.findMany({
      where: { followerId: teacher.id },
      include: {
        followed: {
          include: {
            user: {
              select: {
                id: true,
                email: true,
                displayName: true,
                avatarUrl: true,
                username: true,
                isOnline: true,
                lastActiveAt: true,
              },
            },
          },
        },
      },
    });

    console.log('[getMutualFollowers] Teacher follows', followedTeachers.length, 'other teachers');
    mutualUsers.push(...followedTeachers.map(f => ({ ...f.followed.user, role: 'teacher' })));

    // Get teachers who follow this teacher (mutual following)
    const followerTeachers = await prisma.teacherToTeacher.findMany({
      where: { followedId: teacher.id },
      include: {
        follower: {
          include: {
            user: {
              select: {
                id: true,
                email: true,
                displayName: true,
                avatarUrl: true,
                username: true,
                isOnline: true,
                lastActiveAt: true,
              },
            },
          },
        },
      },
    });

    console.log('[getMutualFollowers] Teacher is followed by', followerTeachers.length, 'other teachers');
    mutualUsers.push(...followerTeachers.map(f => ({ ...f.follower.user, role: 'teacher' })));
  }

  // Remove duplicates based on user ID
  const uniqueUsers = Array.from(
    new Map(mutualUsers.map(user => [user.id, user])).values()
  );

  console.log('[getMutualFollowers] Returning', uniqueUsers.length, 'unique users');
  console.log('[getMutualFollowers] Sample user:', uniqueUsers[0]);

  return uniqueUsers;
};
