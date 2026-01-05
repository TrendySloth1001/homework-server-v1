/**
 * Signup Controller
 * HTTP handlers for completing user registration
 */

import { Request, Response } from 'express';
import { asyncHandler, ValidationError } from '../../shared/lib/errors';
import { completeTeacherSignupService, completeStudentSignupService } from './signup.service';
import { verifyTokenService } from '../auth/auth.service';
import { TeacherSignupInput, StudentSignupInput } from './signup.types';

/**
 * Complete teacher signup
 * POST /api/v1/signup/teacher
 * Requires temp token from OAuth
 */
export const signupTeacherHandler = asyncHandler(async (req: Request, res: Response) => {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new ValidationError('Temporary token required');
  }

  const tempToken = authHeader.substring(7);
  
  // Verify temporary token
  const payload = await verifyTokenService(tempToken);
  
  if (!payload.isTemp) {
    throw new ValidationError('Invalid temporary token');
  }

  const input: TeacherSignupInput = {
    firstName: req.body.firstName,
    lastName: req.body.lastName,
    ...(req.body.bio && { bio: req.body.bio }),
    ...(req.body.specialization && { specialization: req.body.specialization }),
    ...(req.body.qualification && { qualification: req.body.qualification }),
    ...(req.body.experience && { experience: parseInt(req.body.experience) }),
    ...(req.body.profileVisibility && { profileVisibility: req.body.profileVisibility }),
    ...(req.body.defaultContentMode && { defaultContentMode: req.body.defaultContentMode }),
    ...(req.body.allowFollowers !== undefined && { allowFollowers: req.body.allowFollowers }),
  };

  const result = await completeTeacherSignupService(payload.userId, input);

  res.status(201).json({
    success: true,
    message: 'Teacher account created successfully',
    data: result,
  });
});

/**
 * Complete student signup
 * POST /api/v1/signup/student
 * Requires temp token from OAuth
 */
export const signupStudentHandler = asyncHandler(async (req: Request, res: Response) => {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new ValidationError('Temporary token required');
  }

  const tempToken = authHeader.substring(7);
  
  // Verify temporary token
  const payload = await verifyTokenService(tempToken);
  
  if (!payload.isTemp) {
    throw new ValidationError('Invalid temporary token');
  }

  const input: StudentSignupInput = {
    firstName: req.body.firstName,
    lastName: req.body.lastName,
    grade: req.body.grade,
    institution: req.body.institution,
    interests: req.body.interests,
  };

  const result = await completeStudentSignupService(payload.userId, input);

  res.status(201).json({
    success: true,
    message: 'Student account created successfully',
    data: result,
  });
});
