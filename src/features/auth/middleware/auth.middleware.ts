/**
 * Authentication Middleware
 * JWT verification and role-based access control
 */

import { Request, Response, NextFunction } from 'express';
import { UserRole } from '@prisma/client';
import { verifyTokenService } from '../auth.service';
import { UnauthorizedError } from '../../../shared/lib/errors';
import { AuthenticatedRequest, JWTPayload } from '../auth.types';

/**
 * Middleware to authenticate JWT token
 * Attaches user payload to req.user
 */
export async function authenticateToken(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader) {
      throw new UnauthorizedError('No authorization header provided');
    }

    if (!authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedError('Invalid authorization header format');
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix

    if (!token) {
      throw new UnauthorizedError('No token provided');
    }

    // Verify token
    const payload = await verifyTokenService(token);

    // Check if it's a temporary token (should not be used for protected routes)
    if (payload.isTemp) {
      throw new UnauthorizedError('Temporary token cannot be used for this endpoint');
    }

    // Attach user to request
    req.user = payload;

    next();
  } catch (error) {
    next(error);
  }
}

/**
 * Middleware to require specific role(s)
 * Must be used after authenticateToken middleware
 */
export function requireRole(allowedRoles: UserRole | UserRole[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      const user = req.user;

      if (!user) {
        throw new UnauthorizedError('Authentication required');
      }

      const roles = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles];

      if (!roles.includes((user as JWTPayload).role)) {
        throw new UnauthorizedError(
          `Access denied. Required role: ${roles.join(' or ')}`
        );
      }

      next();
    } catch (error) {
      next(error);
    }
  };
}

/**
 * Optional authentication - doesn't fail if no token
 * Attaches user if token is valid, otherwise continues without user
 */
export async function optionalAuth(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return next(); // Continue without authentication
    }

    const token = authHeader.substring(7);

    if (!token) {
      return next();
    }

    try {
      const payload = await verifyTokenService(token);
      
      if (!payload.isTemp) {
        req.user = payload;
      }
    } catch {
      // Invalid token - continue without authentication
      // Don't throw error for optional auth
    }

    next();
  } catch (error) {
    next(error);
  }
}
