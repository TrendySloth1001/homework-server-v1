/**
 * Teachers Controller
 * HTTP handlers for teacher discovery and follow endpoints
 */

import { Request, Response } from 'express';
import { AuthenticatedRequest } from '../auth/auth.types';
import { asyncHandler } from '../../shared/lib/errors';
import {
  getAllTeachersService,
  getTeacherByIdService,
  getTeacherByUserIdService,
  getStudentByUserIdService,
  followTeacherService,
  unfollowTeacherService,
  getTeacherFollowersService,
} from './teachers.service';

/**
 * Get all teachers with optional search/filter
 * GET /api/teachers?search=math&specialization=Physics&limit=20&offset=0
 */
export const getAllTeachersHandler = asyncHandler(
  async (req: Request, res: Response) => {
    const search = req.query.search as string | undefined;
    const specialization = req.query.specialization as string | undefined;
    const limit = parseInt(req.query.limit as string) || 50;
    const offset = parseInt(req.query.offset as string) || 0;
    const userId = (req as any).user?.userId || undefined; // Optional - to check following status

    const result = await getAllTeachersService(search, specialization, limit, offset, userId);

    res.json({
      success: true,
      data: result,
    });
  }
);

/**
 * Get single teacher profile by ID
 * GET /api/teachers/:id
 */
export const getTeacherByIdHandler = asyncHandler(
  async (req: Request, res: Response) => {
    const teacherId = req.params.id!;
    const userId = (req as any).user?.userId || undefined; // Optional - to check if following

    const teacher = await getTeacherByIdService(teacherId, userId);

    res.json({
      success: true,
      data: teacher,
    });
  }
);

/**
 * Follow a teacher
 * POST /api/teachers/:id/follow
 */
export const followTeacherHandler = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const teacherId = (req as any).params.id;
    const userId = req.user!.userId;

    const result = await followTeacherService(teacherId, userId);

    res.json({
      success: true,
      message: 'Successfully followed teacher',
      data: result,
    });
  }
);

/**
 * Unfollow a teacher
 * DELETE /api/teachers/:id/follow
 */
export const unfollowTeacherHandler = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const teacherId = (req as any).params.id;
    const userId = req.user!.userId;

    const result = await unfollowTeacherService(teacherId, userId);

    res.json({
      success: true,
      message: 'Successfully unfollowed teacher',
      data: result,
    });
  }
);

/**
 * Get followers of a teacher
 * GET /api/teachers/:id/followers
 */
export const getTeacherFollowersHandler = asyncHandler(
  async (req: Request, res: Response) => {
    const teacherId = req.params.id!;

    const followers = await getTeacherFollowersService(teacherId);

    res.json({
      success: true,
      data: followers,
    });
  }
);

/**
 * Get teacher profile by user ID
 * GET /api/teachers/user/:userId
 */
export const getTeacherByUserIdHandler = asyncHandler(
  async (req: Request, res: Response) => {
    const userId = req.params.userId!;
    const requestingUserId = (req as any).user?.userId || undefined;

    const teacher = await getTeacherByUserIdService(userId, requestingUserId);

    res.json({
      success: true,
      data: teacher,
    });
  }
);

/**
 * Get student profile by user ID
 * GET /api/students/user/:userId
 */
export const getStudentByUserIdHandler = asyncHandler(
  async (req: Request, res: Response) => {
    const userId = req.params.userId!;
    const requestingUserId = (req as any).user?.userId || undefined;

    const student = await getStudentByUserIdService(userId, requestingUserId);

    res.json({
      success: true,
      data: student,
    });
  }
);
