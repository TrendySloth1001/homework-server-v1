/**
 * Signup Types
 * Types for teacher and student registration
 */

import { Visibility } from '@prisma/client';

// Teacher signup input
export interface TeacherSignupInput {
  firstName: string;
  lastName: string;
  bio?: string;
  specialization?: string;
  qualification?: string;
  experience?: number;
  profileVisibility?: Visibility;
  defaultContentMode?: Visibility;
  allowFollowers?: boolean;
}

// Student signup input
export interface StudentSignupInput {
  firstName: string;
  lastName: string;
  grade?: string;
  institution?: string;
  interests?: string;
}
