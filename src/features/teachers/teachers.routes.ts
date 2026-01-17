/**
 * Teachers Routes
 * Routes for teacher discovery and follow system
 */

import { Router } from 'express';
import {
  getAllTeachersHandler,
  getTeacherByIdHandler,
  getTeacherByUserIdHandler,
  getStudentByUserIdHandler,
  followTeacherHandler,
  unfollowTeacherHandler,
  getTeacherFollowersHandler,
} from './teachers.controller';
import { authenticateToken } from '../auth/middleware/auth.middleware';

const router = Router();

// Public routes (anyone can view teachers, auth optional for isFollowing status)
router.get('/', getAllTeachersHandler);              // GET /api/teachers?search=&specialization=&limit=&offset=
router.get('/user/:userId', getTeacherByUserIdHandler);  // GET /api/teachers/user/:userId
router.get('/:id', getTeacherByIdHandler);           // GET /api/teachers/:id
router.get('/:id/followers', getTeacherFollowersHandler);  // GET /api/teachers/:id/followers

// Protected routes (authentication required)
router.post('/:id/follow', authenticateToken, followTeacherHandler);        // POST /api/teachers/:id/follow
router.delete('/:id/follow', authenticateToken, unfollowTeacherHandler);    // DELETE /api/teachers/:id/follow

export default router;
