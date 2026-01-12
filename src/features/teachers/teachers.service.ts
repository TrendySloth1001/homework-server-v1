/**
 * Teachers Service
 * Business logic for teacher discovery and follow system
 */

import { prisma } from '../../shared/lib/prisma';
import { AppError } from '../../shared/lib/errors';
import { createNotificationService } from '../notifications/notifications.service';

/**
 * Get all teachers with optional search/filter
 */
export async function getAllTeachersService(
  searchQuery?: string,
  specialization?: string,
  limit: number = 50,
  offset: number = 0,
  requestingUserId?: string
) {
  const where: any = {
    user: {
      isActive: true,
    },
    allowFollowers: true, // Only show teachers who allow followers
  };

  // Add search filter
  if (searchQuery) {
    where.OR = [
      { user: { displayName: { contains: searchQuery, mode: 'insensitive' } } },
      { specialization: { contains: searchQuery, mode: 'insensitive' } },
      { bio: { contains: searchQuery, mode: 'insensitive' } },
    ];
  }

  // Add specialization filter
  if (specialization) {
    where.specialization = { contains: specialization, mode: 'insensitive' };
  }

  const [teachers, total] = await Promise.all([
    prisma.teacher.findMany({
      where,
      take: limit,
      skip: offset,
      orderBy: [
        { followersCount: 'desc' }, // Popular teachers first
        { createdAt: 'desc' },
      ],
      select: {
        id: true,
        userId: true,
        specialization: true,
        qualification: true,
        experience: true,
        bio: true,
        followersCount: true,
        followingCount: true,
        allowFollowers: true,
        createdAt: true,
        user: {
          select: {
            id: true,
            email: true,
            displayName: true,
            avatarUrl: true,
            isActive: true,
          },
        },
      },
    }),
    prisma.teacher.count({ where }),
  ]);

  // Check follow status for each teacher if requesting user is provided
  let teachersWithFollowStatus = teachers;
  if (requestingUserId) {
    // Check if requesting user is a student
    const student = await prisma.student.findUnique({
      where: { userId: requestingUserId },
      select: { id: true },
    });

    // Check if requesting user is a teacher
    const requestingTeacher = !student ? await prisma.teacher.findUnique({
      where: { userId: requestingUserId },
      select: { id: true },
    }) : null;

    if (student) {
      // Get all follows for this student
      const follows = await prisma.teacherFollower.findMany({
        where: { studentId: student.id },
        select: { teacherId: true },
      });
      const followedTeacherIds = new Set(follows.map(f => f.teacherId));

      teachersWithFollowStatus = teachers.map(teacher => ({
        ...teacher,
        isFollowing: followedTeacherIds.has(teacher.id),
      }));
    } else if (requestingTeacher) {
      // Get all follows for this teacher
      const follows = await prisma.teacherToTeacher.findMany({
        where: { followerId: requestingTeacher.id },
        select: { followedId: true },
      });
      const followedTeacherIds = new Set(follows.map(f => f.followedId));

      teachersWithFollowStatus = teachers.map(teacher => ({
        ...teacher,
        isFollowing: followedTeacherIds.has(teacher.id),
      }));
    }
  }

  return {
    teachers: teachersWithFollowStatus,
    total,
    hasMore: offset + limit < total,
  };
}

/**
 * Get single teacher profile by ID
 */
export async function getTeacherByIdService(teacherId: string, requestingUserId?: string | undefined) {
  const teacher = await prisma.teacher.findUnique({
    where: { id: teacherId },
    select: {
      id: true,
      userId: true,
      specialization: true,
      qualification: true,
      experience: true,
      bio: true,
      followersCount: true,
      followingCount: true,
      allowFollowers: true,
      createdAt: true,
      user: {
        select: {
          id: true,
          email: true,
          displayName: true,
          avatarUrl: true,
          isActive: true,
        },
      },
    },
  });

  if (!teacher) {
    throw new AppError('Teacher not found', 404);
  }

  if (!teacher.user.isActive) {
    throw new AppError('Teacher account is not active', 403);
  }

  // Check if requesting user follows this teacher
  let isFollowing = false;
  if (requestingUserId) {
    // Check if requesting user is a student
    const student = await prisma.student.findUnique({
      where: { userId: requestingUserId },
      select: { id: true },
    });

    if (student) {
      const follow = await prisma.teacherFollower.findUnique({
        where: {
          teacherId_studentId: {
            teacherId: teacher.id,
            studentId: student.id,
          },
        },
      });
      isFollowing = !!follow;
    } else {
      // Check if requesting user is a teacher
      const requestingTeacher = await prisma.teacher.findUnique({
        where: { userId: requestingUserId },
        select: { id: true },
      });

      if (requestingTeacher) {
        const follow = await prisma.teacherToTeacher.findUnique({
          where: {
            followerId_followedId: {
              followerId: requestingTeacher.id,
              followedId: teacher.id,
            },
          },
        });
        isFollowing = !!follow;
      }
    }
  }

  return {
    ...teacher,
    isFollowing,
  };
}

/**
 * Follow a teacher (student or teacher)
 */
export async function followTeacherService(teacherId: string, userId: string) {
  // Get student profile
  const student = await prisma.student.findUnique({
    where: { userId },
    select: { id: true },
  });

  // Get requesting teacher profile (if not a student)
  const requestingTeacher = !student ? await prisma.teacher.findUnique({
    where: { userId },
    select: { id: true },
  }) : null;

  if (!student && !requestingTeacher) {
    throw new AppError('User profile not found', 404);
  }

  // Get target teacher
  const teacher = await prisma.teacher.findUnique({
    where: { id: teacherId },
    select: { id: true, userId: true, allowFollowers: true },
  });

  if (!teacher) {
    throw new AppError('Teacher not found', 404);
  }

  if (!teacher.allowFollowers) {
    throw new AppError('This teacher does not allow followers', 403);
  }

  // Prevent following yourself
  if (teacher.userId === userId) {
    throw new AppError('You cannot follow yourself', 400);
  }

  let followedAt: Date;

  if (student) {
    // Student following teacher
    const existingFollow = await prisma.teacherFollower.findUnique({
      where: {
        teacherId_studentId: {
          teacherId: teacher.id,
          studentId: student.id,
        },
      },
    });

    if (existingFollow) {
      throw new AppError('Already following this teacher', 400);
    }

    const result = await prisma.$transaction([
      prisma.teacherFollower.create({
        data: {
          teacherId: teacher.id,
          studentId: student.id,
        },
      }),
      prisma.teacher.update({
        where: { id: teacher.id },
        data: { followersCount: { increment: 1 } },
      }),
      prisma.student.update({
        where: { id: student.id },
        data: { followingCount: { increment: 1 } },
      }),
    ]);

    followedAt = result[0].followedAt;
  } else if (requestingTeacher) {
    // Teacher following teacher
    const existingFollow = await prisma.teacherToTeacher.findUnique({
      where: {
        followerId_followedId: {
          followerId: requestingTeacher.id,
          followedId: teacher.id,
        },
      },
    });

    if (existingFollow) {
      throw new AppError('Already following this teacher', 400);
    }

    const result = await prisma.$transaction([
      prisma.teacherToTeacher.create({
        data: {
          followerId: requestingTeacher.id,
          followedId: teacher.id,
        },
      }),
      prisma.teacher.update({
        where: { id: teacher.id },
        data: { followersCount: { increment: 1 } },
      }),
      prisma.teacher.update({
        where: { id: requestingTeacher.id },
        data: { followingCount: { increment: 1 } },
      }),
    ]);

    followedAt = result[0].followedAt;
  } else {
    throw new AppError('Invalid user type', 400);
  }

  // Get user name for notification
  const followerUser = await prisma.user.findUnique({
    where: { id: userId },
    select: { displayName: true },
  });

  // Create notification for teacher
  try {
    await createNotificationService({
      userId: teacher.userId,
      title: 'New Follower',
      message: `${followerUser?.displayName || 'Someone'} started following you`,
    });
  } catch (error) {
    console.error('Failed to create follow notification:', error);
  }

  return {
    success: true,
    followedAt,
  };
}

/**
 * Unfollow a teacher (student or teacher)
 */
export async function unfollowTeacherService(teacherId: string, userId: string) {
  // Get student profile
  const student = await prisma.student.findUnique({
    where: { userId },
    select: { id: true },
  });

  // Get requesting teacher profile (if not a student)
  const requestingTeacher = !student ? await prisma.teacher.findUnique({
    where: { userId },
    select: { id: true },
  }) : null;

  if (!student && !requestingTeacher) {
    throw new AppError('User profile not found', 404);
  }

  // Get target teacher
  const teacher = await prisma.teacher.findUnique({
    where: { id: teacherId },
    select: { id: true },
  });

  if (!teacher) {
    throw new AppError('Teacher not found', 404);
  }

  if (student) {
    // Student unfollowing teacher
    const existingFollow = await prisma.teacherFollower.findUnique({
      where: {
        teacherId_studentId: {
          teacherId: teacher.id,
          studentId: student.id,
        },
      },
    });

    if (!existingFollow) {
      throw new AppError('Not following this teacher', 400);
    }

    await prisma.$transaction([
      prisma.teacherFollower.delete({
        where: {
          teacherId_studentId: {
            teacherId: teacher.id,
            studentId: student.id,
          },
        },
      }),
      prisma.teacher.update({
        where: { id: teacher.id },
        data: { followersCount: { decrement: 1 } },
      }),
      prisma.student.update({
        where: { id: student.id },
        data: { followingCount: { decrement: 1 } },
      }),
    ]);
  } else if (requestingTeacher) {
    // Teacher unfollowing teacher
    const existingFollow = await prisma.teacherToTeacher.findUnique({
      where: {
        followerId_followedId: {
          followerId: requestingTeacher.id,
          followedId: teacher.id,
        },
      },
    });

    if (!existingFollow) {
      throw new AppError('Not following this teacher', 400);
    }

    await prisma.$transaction([
      prisma.teacherToTeacher.delete({
        where: {
          followerId_followedId: {
            followerId: requestingTeacher.id,
            followedId: teacher.id,
          },
        },
      }),
      prisma.teacher.update({
        where: { id: teacher.id },
        data: { followersCount: { decrement: 1 } },
      }),
      prisma.teacher.update({
        where: { id: requestingTeacher.id },
        data: { followingCount: { decrement: 1 } },
      }),
    ]);
  } else {
    throw new AppError('Invalid user type', 400);
  }

  return { success: true };
}

/**
 * Get followers of a teacher (both students and teachers)
 */
export async function getTeacherFollowersService(teacherId: string) {
  // Verify teacher exists
  const teacher = await prisma.teacher.findUnique({
    where: { id: teacherId },
    select: { id: true },
  });

  if (!teacher) {
    throw new AppError('Teacher not found', 404);
  }

  // Get student followers
  const studentFollowers = await prisma.teacherFollower.findMany({
    where: { teacherId },
    select: {
      id: true,
      followedAt: true,
      student: {
        select: {
          id: true,
          userId: true,
          user: {
            select: {
              displayName: true,
              avatarUrl: true,
            },
          },
        },
      },
    },
  });

  // Get teacher followers
  const teacherFollowers = await prisma.teacherToTeacher.findMany({
    where: { followedId: teacherId },
    select: {
      id: true,
      followedAt: true,
      follower: {
        select: {
          id: true,
          userId: true,
          experience: true,
          user: {
            select: {
              displayName: true,
              avatarUrl: true,
            },
          },
        },
      },
    },
  });

  // Format student followers
  const students = studentFollowers.map(sf => ({
    id: sf.id,
    followerId: sf.student.userId,
    followerName: sf.student.user.displayName,
    followerAvatar: sf.student.user.avatarUrl,
    followerType: 'STUDENT' as const,
    followedAt: sf.followedAt,
  }));

  // Format teacher followers
  const teachers = teacherFollowers.map(tf => ({
    id: tf.id,
    followerId: tf.follower.userId,
    teacherId: tf.follower.id, // Teacher profile ID for API calls
    followerName: tf.follower.user.displayName,
    followerAvatar: tf.follower.user.avatarUrl,
    followerType: 'TEACHER' as const,
    experience: tf.follower.experience,
    followedAt: tf.followedAt,
  }));

  // Combine and sort by followedAt (most recent first)
  const allFollowers = [...students, ...teachers].sort(
    (a, b) => b.followedAt.getTime() - a.followedAt.getTime()
  );

  return allFollowers;
}
