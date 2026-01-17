/**
 * Profile Routes
 * Routes for profile operations
 */

import { Router } from 'express';
import { authenticateToken } from '../auth/middleware/auth.middleware';
import {
  updateTeacherProfile,
  updateStudentProfile,
  getCurrentUserProfile,
} from './profile.controller';

const router = Router();

// Get current user's profile
router.get('/me', authenticateToken, getCurrentUserProfile);

// Update teacher profile
router.put('/teacher/:teacherId', authenticateToken, updateTeacherProfile);

// Update student profile
router.put('/student/:studentId', authenticateToken, updateStudentProfile);

export default router;
