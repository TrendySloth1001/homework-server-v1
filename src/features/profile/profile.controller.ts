/**
 * Profile Controller
 * HTTP handlers for profile operations
 */

import { Request, Response } from 'express';
import {
  updateTeacherProfileService,
  updateStudentProfileService,
  getTeacherProfileByUserId,
  getStudentProfileByUserId,
} from './profile.service';
import { UserRole } from '@prisma/client';

/**
 * Update teacher profile
 * PUT /api/profile/teacher/:teacherId
 */
export async function updateTeacherProfile(req: Request, res: Response) {
  try {
    const { teacherId } = req.params;
    const userId = (req as any).user?.userId;

    if (!userId || !teacherId) {
      return res.status(400).json({
        success: false,
        message: 'Missing required parameters',
      });
    }

    const updatedTeacher = await updateTeacherProfileService(teacherId, userId, req.body);

    res.json({
      success: true,
      message: 'Teacher profile updated successfully',
      profile: updatedTeacher,
    });
  } catch (error: any) {
    console.error('Error updating teacher profile:', error);
    res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'Failed to update teacher profile',
    });
  }
}

/**
 * Update student profile
 * PUT /api/profile/student/:studentId
 */
export async function updateStudentProfile(req: Request, res: Response) {
  try {
    const { studentId } = req.params;
    const userId = (req as any).user?.userId;

    if (!userId || !studentId) {
      return res.status(400).json({
        success: false,
        message: 'Missing required parameters',
      });
    }

    const updatedStudent = await updateStudentProfileService(studentId, userId, req.body);

    res.json({
      success: true,
      message: 'Student profile updated successfully',
      profile: updatedStudent,
    });
  } catch (error: any) {
    console.error('Error updating student profile:', error);
    res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'Failed to update student profile',
    });
  }
}

/**
 * Get current user's profile
 * GET /api/profile/me
 */
export async function getCurrentUserProfile(req: Request, res: Response) {
  try {
    const userId = (req as any).user.userId;
    const userRole = (req as any).user.role;

    let profile;
    if (userRole === UserRole.TEACHER) {
      profile = await getTeacherProfileByUserId(userId);
    } else if (userRole === UserRole.STUDENT) {
      profile = await getStudentProfileByUserId(userId);
    } else {
      return res.status(400).json({
        success: false,
        message: 'Invalid user role',
      });
    }

    res.json({
      success: true,
      profile,
    });
  } catch (error: any) {
    console.error('Error getting profile:', error);
    res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'Failed to get profile',
    });
  }
}
