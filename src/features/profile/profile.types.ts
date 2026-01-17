/**
 * Profile Types
 * Types for profile update operations
 */

export interface UpdateTeacherProfileInput {
  firstName?: string;
  lastName?: string;
  bio?: string;
  specialization?: string;
  qualification?: string;
  experience?: number;
}

export interface UpdateStudentProfileInput {
  firstName?: string;
  lastName?: string;
  grade?: string;
  institution?: string;
  interests?: string;
}

export interface ProfileUpdateResponse {
  success: boolean;
  message: string;
  profile: any;
}
