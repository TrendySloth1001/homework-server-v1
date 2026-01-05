/**
 * Auth Routes
 * Authentication endpoints
 */

import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import {
  googleAuthHandler,
  googleCallbackHandler,
  getMeHandler,
  logoutHandler,
  deactivateAccountHandler,
  loginFailedHandler,
} from './auth.controller';
import { authenticateToken } from './middleware/auth.middleware';

const router = Router();

// Rate limiter for auth endpoints (prevent brute force)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // 10 requests per window
  message: 'Too many authentication attempts, please try again later',
  standardHeaders: true,
  legacyHeaders: false,
});

// Google OAuth routes
router.get('/google', authLimiter, googleAuthHandler);
router.get('/google/callback', googleCallbackHandler);

// Auth failure route
router.get('/login/failed', loginFailedHandler);

// Protected routes
router.get('/me', authenticateToken, getMeHandler);
router.delete('/logout', authenticateToken, logoutHandler);
router.patch('/deactivate', authenticateToken, deactivateAccountHandler);

export default router;
