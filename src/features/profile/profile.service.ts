/**
 * Profile Service Layer
 * Business logic for profile updates
 */

import { prisma } from '../../shared/lib/prisma';
import { ValidationError, NotFoundError, ForbiddenError } from '../../shared/lib/errors';
import { UpdateTeacherProfileInput, UpdateStudentProfileInput } from './profile.types';

/**
 * Update teacher profile
 */
export async function updateTeacherProfileService(
  teacherId: string,
  userId: string,
  input: UpdateTeacherProfileInput
) {
  // Verify teacher exists and belongs to user
  const teacher = await prisma.teacher.findUnique({
    where: { id: teacherId },
    include: { user: true },
  });

  if (!teacher) {
    throw new NotFoundError('Teacher profile not found');
  }

  if (teacher.userId !== userId) {
    throw new ForbiddenError('You can only update your own profile');
  }

  // Validate input
  if (input.firstName !== undefined && !input.firstName.trim()) {
    throw new ValidationError('First name cannot be empty');
  }
  if (input.lastName !== undefined && !input.lastName.trim()) {
    throw new ValidationError('Last name cannot be empty');
  }
  if (input.experience !== undefined && input.experience < 0) {
    throw new ValidationError('Experience cannot be negative');
  }

  // Update teacher profile
  const updatedTeacher = await prisma.teacher.update({
    where: { id: teacherId },
    data: {
      ...(input.firstName !== undefined && { firstName: input.firstName.trim() }),
      ...(input.lastName !== undefined && { lastName: input.lastName.trim() }),
      ...(input.bio !== undefined && { bio: input.bio }),
      ...(input.specialization !== undefined && { specialization: input.specialization }),
      ...(input.qualification !== undefined && { qualification: input.qualification }),
      ...(input.experience !== undefined && { experience: input.experience }),
    },
    include: {
      user: {
        select: {
          id: true,
          email: true,
          displayName: true,
          role: true,
          avatarUrl: true,
        },
      },
    },
  });

  return updatedTeacher;
}

/**
 * Update student profile
 */
export async function updateStudentProfileService(
  studentId: string,
  userId: string,
  input: UpdateStudentProfileInput
) {
  // Verify student exists and belongs to user
  const student = await prisma.student.findUnique({
    where: { id: studentId },
    include: { user: true },
  });

  if (!student) {
    throw new NotFoundError('Student profile not found');
  }

  if (student.userId !== userId) {
    throw new ForbiddenError('You can only update your own profile');
  }

  // Validate input
  if (input.firstName !== undefined && !input.firstName.trim()) {
    throw new ValidationError('First name cannot be empty');
  }
  if (input.lastName !== undefined && !input.lastName.trim()) {
    throw new ValidationError('Last name cannot be empty');
  }

  // Update student profile
  const updatedStudent = await prisma.student.update({
    where: { id: studentId },
    data: {
      ...(input.firstName !== undefined && { firstName: input.firstName.trim() }),
      ...(input.lastName !== undefined && { lastName: input.lastName.trim() }),
      ...(input.grade !== undefined && { grade: input.grade }),
      ...(input.institution !== undefined && { institution: input.institution }),
      ...(input.interests !== undefined && { interests: input.interests }),
    },
    include: {
      user: {
        select: {
          id: true,
          email: true,
          displayName: true,
          role: true,
          avatarUrl: true,
        },
      },
    },
  });

  return updatedStudent;
}

/**
 * Get teacher profile by userId
 */
export async function getTeacherProfileByUserId(userId: string) {
  const teacher = await prisma.teacher.findUnique({
    where: { userId },
    include: {
      user: {
        select: {
          id: true,
          email: true,
          displayName: true,
          role: true,
          avatarUrl: true,
        },
      },
    },
  });

  if (!teacher) {
    throw new NotFoundError('Teacher profile not found');
  }

  return teacher;
}

/**
 * Get student profile by userId
 */
export async function getStudentProfileByUserId(userId: string) {
  const student = await prisma.student.findUnique({
    where: { userId },
    include: {
      user: {
        select: {
          id: true,
          email: true,
          displayName: true,
          role: true,
          avatarUrl: true,
        },
      },
    },
  });

  if (!student) {
    throw new NotFoundError('Student profile not found');
  }

  return student;
}
