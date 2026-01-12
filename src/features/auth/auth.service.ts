/**
 * Auth Service Layer
 * Business logic for authentication and user management
 */

import jwt from 'jsonwebtoken';
import { UserRole } from '@prisma/client';
import { prisma } from '../../shared/lib/prisma';
import { config } from '../../shared/config';
import { BadRequestError, NotFoundError, UnauthorizedError, ValidationError } from '../../shared/lib/errors';
import { JWTPayload, GoogleProfile, AuthResponse, TempTokenResponse, UserProfileResponse } from './auth.types';

/**
 * Generate JWT token
 */
export async function generateTokenService(
  userId: string,
  email: string,
  role: UserRole,
  isTemp = false
): Promise<string> {
  const payload: JWTPayload = {
    userId,
    email,
    role,
    ...(isTemp && { isTemp: true }),
  };

  const expiresIn = isTemp ? config.auth.jwt.tempTokenExpiresIn : config.auth.jwt.expiresIn;

  const token = jwt.sign(payload, config.auth.jwt.secret, { expiresIn } as jwt.SignOptions);

  return token;
}

/**
 * Verify JWT token and return payload
 */
export async function verifyTokenService(token: string): Promise<JWTPayload> {
  try {
    const decoded = jwt.verify(token, config.auth.jwt.secret) as JWTPayload;
    return decoded;
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      throw new UnauthorizedError('Token has expired');
    }
    if (error instanceof jwt.JsonWebTokenError) {
      throw new UnauthorizedError('Invalid token');
    }
    throw new UnauthorizedError('Token verification failed');
  }
}

/**
 * Find or create user from Google OAuth profile
 * Returns temp token if user needs to complete signup
 */
export async function findOrCreateUserFromGoogleService(
  profile: GoogleProfile
): Promise<AuthResponse | TempTokenResponse> {
  const email = profile.emails?.[0]?.value;
  if (!email) {
    throw new ValidationError('Email not provided by Google');
  }

  const avatarUrl = profile.photos?.[0]?.value || null;

  // Check if user exists by googleId
  let user = await prisma.user.findUnique({
    where: { googleId: profile.id },
    include: {
      teacher: true,
      student: true,
    },
  });

  // If not found by googleId, check by email
  if (!user) {
    user = await prisma.user.findUnique({
      where: { email },
      include: {
        teacher: true,
        student: true,
      },
    });

    // If found by email, link the googleId and update avatar if not set
    if (user) {
      user = await prisma.user.update({
        where: { id: user.id },
        data: { 
          googleId: profile.id,
          ...(avatarUrl && !user.avatarUrl ? { avatarUrl } : {}),
        },
        include: {
          teacher: true,
          student: true,
        },
      });
    }
  }

  // If user exists and has profile, update lastLoginAt and avatarUrl, then return full token
  if (user && (user.teacher || user.student)) {
    await prisma.user.update({
      where: { id: user.id },
      data: { 
        lastLoginAt: new Date(),
        ...(avatarUrl && !user.avatarUrl ? { avatarUrl } : {}),
      },
    });

    const token = await generateTokenService(user.id, user.email, user.role);

    return {
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        role: user.role,
        avatarUrl: user.avatarUrl || avatarUrl,
      },
      token,
      expiresIn: config.auth.jwt.expiresIn,
    };
  }

  // User doesn't exist or doesn't have profile - create temp user and return temp token
  if (!user) {
    user = await prisma.user.create({
      data: {
        email,
        googleId: profile.id,
        displayName: profile.displayName,
        avatarUrl,
        role: UserRole.STUDENT, // Default role, will be updated during signup
        isActive: false, // Not active until profile completed
      },
      include: {
        teacher: true,
        student: true,
      },
    });
  }

  // Generate temporary token for signup flow
  const tempToken = await generateTokenService(user.id, user.email, user.role, true);

  return {
    tempToken,
    email: user.email,
    displayName: user.displayName,
    avatarUrl: user.avatarUrl,
    message: 'Please complete your profile',
  };
}

/**
 * Get user profile with Teacher/Student details
 */
export async function getUserProfileService(userId: string): Promise<UserProfileResponse> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      teacher: true,
      student: true,
    },
  });

  if (!user) {
    throw new NotFoundError('User not found');
  }

  if (!user.isActive) {
    throw new UnauthorizedError('Account is deactivated');
  }

  const profile = user.teacher || user.student;
  if (!profile) {
    throw new ValidationError('User profile not completed');
  }

  // Build full profile response with all relevant information
  const profileData: any = {
    id: profile.id,
    userId: user.id,
    firstName: (profile as any).firstName,
    lastName: (profile as any).lastName,
  };

  // Add teacher-specific fields
  if (user.role === 'TEACHER' && user.teacher) {
    profileData.bio = user.teacher.bio;
    profileData.specialization = user.teacher.specialization;
    profileData.qualification = user.teacher.qualification;
    profileData.experience = user.teacher.experience;
    profileData.profileVisibility = user.teacher.profileVisibility;
    profileData.defaultContentMode = user.teacher.defaultContentMode;
    profileData.allowFollowers = user.teacher.allowFollowers;
    profileData.followersCount = user.teacher.followersCount;
    profileData.contentCount = user.teacher.contentCount;
  }

  // Add student-specific fields
  if (user.role === 'STUDENT' && user.student) {
    profileData.grade = user.student.grade;
    profileData.institution = user.student.institution;
    profileData.interests = user.student.interests;
    profileData.followingCount = user.student.followingCount;
  }

  return {
    user: {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      role: user.role,
      avatarUrl: user.avatarUrl,
      isActive: user.isActive,
      lastLoginAt: user.lastLoginAt,
      createdAt: user.createdAt,
      username: user.username, // For chat system
    },
    profile: profileData,
  };
}

/**
 * Deactivate user account (soft delete)
 */
export async function deactivateUserService(userId: string): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
  });

  if (!user) {
    throw new NotFoundError('User not found');
  }

  await prisma.user.update({
    where: { id: userId },
    data: { isActive: false },
  });
}

/**
 * Reactivate user account
 */
export async function reactivateUserService(userId: string): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
  });

  if (!user) {
    throw new NotFoundError('User not found');
  }

  await prisma.user.update({
    where: { id: userId },
    data: { isActive: true },
  });
}

/**
 * Check if user exists by email
 */
export async function checkUserExistsService(email: string): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { email },
  });

  return !!user;
}
