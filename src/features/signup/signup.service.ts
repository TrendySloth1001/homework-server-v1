/**
 * Signup Service Layer
 * Business logic for completing user registration
 */

import { UserRole, Visibility } from '@prisma/client';
import { prisma } from '../../shared/lib/prisma';
import { ValidationError, NotFoundError, ConflictError } from '../../shared/lib/errors';
import { TeacherSignupInput, StudentSignupInput } from './signup.types';
import { generateTokenService } from '../auth/auth.service';
import { AuthResponse } from '../auth/auth.types';

/**
 * Complete teacher signup after Google OAuth
 */
export async function completeTeacherSignupService(
  userId: string,
  input: TeacherSignupInput
): Promise<AuthResponse> {
  // Validate input
  if (!input.firstName || !input.lastName) {
    throw new ValidationError('First name and last name are required');
  }

  // Get user
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { teacher: true, student: true },
  });

  if (!user) {
    throw new NotFoundError('User not found');
  }

  // Check if profile already exists
  if (user.teacher || user.student) {
    throw new ConflictError('User profile already exists');
  }

  // Update user role to TEACHER and activate
  const updatedUser = await prisma.user.update({
    where: { id: userId },
    data: {
      role: UserRole.TEACHER,
      isActive: true,
      lastLoginAt: new Date(),
    },
  });

  // Create teacher profile
  const teacher = await prisma.teacher.create({
    data: {
      userId,
      firstName: input.firstName,
      lastName: input.lastName,
      bio: input.bio || null,
      specialization: input.specialization || null,
      qualification: input.qualification || null,
      experience: input.experience || null,
      profileVisibility: input.profileVisibility || Visibility.PUBLIC,
      defaultContentMode: input.defaultContentMode || Visibility.PUBLIC,
      allowFollowers: input.allowFollowers !== false, // Default true
    },
  });

  // Generate full JWT token
  const token = await generateTokenService(
    updatedUser.id,
    updatedUser.email,
    updatedUser.role
  );

  return {
    user: {
      id: updatedUser.id,
      email: updatedUser.email,
      displayName: updatedUser.displayName,
      role: updatedUser.role,
      avatarUrl: updatedUser.avatarUrl,
    },
    token,
    expiresIn: '7d',
  };
}

/**
 * Complete student signup after Google OAuth
 */
export async function completeStudentSignupService(
  userId: string,
  input: StudentSignupInput
): Promise<AuthResponse> {
  // Validate input
  if (!input.firstName || !input.lastName) {
    throw new ValidationError('First name and last name are required');
  }

  // Get user
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { teacher: true, student: true },
  });

  if (!user) {
    throw new NotFoundError('User not found');
  }

  // Check if profile already exists
  if (user.teacher || user.student) {
    throw new ConflictError('User profile already exists');
  }

  // Update user role to STUDENT and activate
  const updatedUser = await prisma.user.update({
    where: { id: userId },
    data: {
      role: UserRole.STUDENT,
      isActive: true,
      lastLoginAt: new Date(),
    },
  });

  // Create student profile
  await prisma.student.create({
    data: {
      userId,
      firstName: input.firstName,
      lastName: input.lastName,
      grade: input.grade || null,
      institution: input.institution || null,
      interests: input.interests || null,
    },
  });

  // Generate full JWT token
  const token = await generateTokenService(
    updatedUser.id,
    updatedUser.email,
    updatedUser.role
  );

  return {
    user: {
      id: updatedUser.id,
      email: updatedUser.email,
      displayName: updatedUser.displayName,
      role: updatedUser.role,
      avatarUrl: updatedUser.avatarUrl,
    },
    token,
    expiresIn: '7d',
  };
}
