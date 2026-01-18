/**
 * Auth Controller
 * HTTP handlers for authentication endpoints
 */

import { Request, Response } from 'express';
import passport from 'passport';
import { config } from '../../shared/config';
import {
  findOrCreateUserFromGoogleService,
  getUserProfileService,
  deactivateUserService,
} from './auth.service';
import { AuthenticatedRequest, GoogleProfile, JWTPayload } from './auth.types';
import { asyncHandler } from '../../shared/lib/errors';

/**
 * Initiate Google OAuth login
 * GET /api/auth/google
 */
export const googleAuthHandler = passport.authenticate('google', {
  scope: ['profile', 'email'],
  session: false,
});

/**
 * Google OAuth callback handler
 * GET /api/auth/google/callback
 */
export const googleCallbackHandler = [
  passport.authenticate('google', {
    session: false,
    failureRedirect: '/auth/login/failed',
  }),
  asyncHandler(async (req: Request, res: Response) => {
    const profile = req.user as GoogleProfile;

    // Find or create user
    const result = await findOrCreateUserFromGoogleService(profile);

    const frontendUrl = config.frontendUrl;

    // Check if it's a temp token (needs signup) or full auth
    if ('tempToken' in result) {
      // Redirect to frontend auth callback with temp token
      const redirectUrl = `${frontendUrl}/auth/callback?tempToken=${result.tempToken}&email=${encodeURIComponent(result.email)}&name=${encodeURIComponent(result.displayName)}`;

      return res.redirect(redirectUrl);
    }

    // Full authentication - redirect to frontend auth callback with token
    const redirectUrl = `${frontendUrl}/auth/callback?token=${result.token}`;

    res.redirect(redirectUrl);
  }),
];

/**
 * Get current user profile
 * GET /api/auth/me
 * Protected route
 */
export const getMeHandler = asyncHandler(async (req: Request, res: Response) => {
  const userId = (req.user as JWTPayload)?.userId;

  if (!userId) {
    return res.status(401).json({
      success: false,
      message: 'User not authenticated',
    });
  }

  const profile = await getUserProfileService(userId);

  res.json({
    success: true,
    message: 'User profile retrieved',
    data: profile,
  });
});

/**
 * Logout handler (client-side token deletion)
 * DELETE /api/auth/logout
 * Protected route
 */
export const logoutHandler = asyncHandler(async (req: Request, res: Response) => {
  // With JWT, logout is handled client-side by deleting the token
  // This endpoint is for consistency and potential future server-side token blacklist

  res.json({
    success: true,
    message: 'Logged out successfully. Please delete your token.',
  });
});

/**
 * Deactivate user account
 * PATCH /api/auth/deactivate
 * Protected route
 */
export const deactivateAccountHandler = asyncHandler(async (req: Request, res: Response) => {
  const userId = (req.user as JWTPayload)?.userId;

  if (!userId) {
    return res.status(401).json({
      success: false,
      message: 'User not authenticated',
    });
  }

  await deactivateUserService(userId);

  res.json({
    success: true,
    message: 'Account deactivated successfully',
  });
});

/**
 * Login failure redirect
 * GET /auth/login/failed
 */
export const loginFailedHandler = (req: Request, res: Response) => {
  res.status(401).json({
    success: false,
    message: 'Google authentication failed',
  });
};
