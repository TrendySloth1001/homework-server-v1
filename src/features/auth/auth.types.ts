/**
 * Authentication Types
 * Types for Google OAuth, JWT, and user management
 */

import { UserRole } from '@prisma/client';

// JWT Payload
export interface JWTPayload {
  userId: string;
  email: string;
  role: UserRole;
  isTemp?: boolean; // For temporary tokens during OAuth -> signup flow
}

// Google OAuth Profile (from passport)
export interface GoogleProfile {
  id: string; // Google ID
  displayName: string;
  emails?: Array<{ value: string; verified: boolean }> | undefined;
  photos?: Array<{ value: string }> | undefined;
}

// Auth response after login/signup
export interface AuthResponse {
  user: {
    id: string;
    email: string;
    displayName: string;
    role: UserRole;
    avatarUrl?: string | null;
  };
  token: string;
  expiresIn: string;
}

// Temporary token response (OAuth -> signup redirect)
export interface TempTokenResponse {
  tempToken: string;
  email: string;
  displayName: string;
  avatarUrl?: string | null;
  message: string;
}

// User profile response (GET /auth/me)
export interface UserProfileResponse {
  user: {
    id: string;
    email: string;
    displayName: string;
    role: UserRole;
    avatarUrl?: string | null;
    isActive: boolean;
    lastLoginAt: Date | null;
    createdAt: Date;
    username?: string | null; // For chat system
  };
  profile: TeacherProfile | StudentProfile;
}

export interface TeacherProfile {
  id: string;
  firstName: string;
  lastName: string;
  bio?: string | null;
  specialization?: string | null;
  qualification?: string | null;
  experience?: number | null;
  profileVisibility: string;
  defaultContentMode: string;
  allowFollowers: boolean;
  followersCount: number;
  contentCount: number;
}

export interface StudentProfile {
  id: string;
  firstName: string;
  lastName: string;
  grade?: string | null;
  institution?: string | null;
  interests?: string | null;
  followingCount: number;
}

// Request types for Express
export interface AuthenticatedRequest extends Express.Request {
  user: JWTPayload; // Non-optional for routes that require auth
}
