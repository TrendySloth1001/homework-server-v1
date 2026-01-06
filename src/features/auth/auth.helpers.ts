/**
 * Auth Helper Functions
 * Utility functions for authentication and authorization
 */

import { prisma } from '../../shared/lib/prisma';
import { NotFoundError, UnauthorizedError } from '../../shared/lib/errors';
import { UserRole } from '@prisma/client';

/**
 * Get teacherId from userId
 * @throws NotFoundError if user is not a teacher
 */
export async function getTeacherIdFromUserId(userId: string): Promise<string> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { teacher: true },
  });

  if (!user) {
    throw new NotFoundError('User not found');
  }

  if (user.role !== UserRole.TEACHER) {
    throw new UnauthorizedError('User is not a teacher');
  }

  if (!user.teacher) {
    throw new NotFoundError('Teacher profile not found');
  }

  return user.teacher.id;
}

/**
 * Get studentId from userId
 * @throws NotFoundError if user is not a student
 */
export async function getStudentIdFromUserId(userId: string): Promise<string> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { student: true },
  });

  if (!user) {
    throw new NotFoundError('User not found');
  }

  if (user.role !== UserRole.STUDENT) {
    throw new UnauthorizedError('User is not a student');
  }

  if (!user.student) {
    throw new NotFoundError('Student profile not found');
  }

  return user.student.id;
}

/**
 * Verify user is a teacher
 * @throws UnauthorizedError if user is not a teacher
 */
export async function requireTeacher(userId: string): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true },
  });

  if (!user || user.role !== UserRole.TEACHER) {
    throw new UnauthorizedError('Only teachers can perform this action');
  }
}

/**
 * Verify user is a student
 * @throws UnauthorizedError if user is not a student
 */
export async function requireStudent(userId: string): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true },
  });

  if (!user || user.role !== UserRole.STUDENT) {
    throw new UnauthorizedError('Only students can perform this action');
  }
}
