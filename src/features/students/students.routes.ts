/**
 * Students Routes
 * Routes for student profiles
 */

import { Router } from 'express';
import { getStudentByUserIdHandler } from '../teachers/teachers.controller';

const router = Router();

// Public routes (anyone can view student profiles)
router.get('/user/:userId', getStudentByUserIdHandler);  // GET /api/students/user/:userId

export default router;
