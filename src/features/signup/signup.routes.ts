/**
 * Signup Routes
 * Routes for completing teacher and student registration
 */

import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { signupTeacherHandler, signupStudentHandler } from './signup.controller';

const router = Router();

// Rate limiter for signup endpoints
const signupLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5, // 5 signup attempts per hour
  message: 'Too many signup attempts, please try again later',
  standardHeaders: true,
  legacyHeaders: false,
});

// Signup routes
router.post('/teacher', signupLimiter, signupTeacherHandler);
router.post('/student', signupLimiter, signupStudentHandler);

export default router;
