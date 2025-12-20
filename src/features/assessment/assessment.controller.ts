/**
 * Assessment Controller Layer
 * HTTP handlers for assessment endpoints (frontend-optimized)
 */

import { Request, Response } from 'express';
import { asyncHandler } from '../../shared/middleware/errorHandler';
import { ValidationError } from '../../shared/lib/errors';
import {
  gradeAnswerService,
  getAnswerHistoryService,
  getAnswerService,
  getStudentPerformanceService,
  regradeAnswerService,
  getQuestionAnswersService,
  getAssessmentStatsService
} from './assessment.service';

/**
 * Grade a student's answer
 * POST /api/v1/assessment/grade
 */
export const gradeAnswerHandler = asyncHandler(async (req: Request, res: Response) => {
  const { questionId, studentAnswer, selectedOption, studentId, teacherId } = req.body;
  
  if (!questionId || !studentId || !teacherId) {
    throw new ValidationError('Missing required fields: questionId, studentId, teacherId');
  }
  
  if (!studentAnswer && !selectedOption) {
    throw new ValidationError('Either studentAnswer or selectedOption must be provided');
  }
  
  const result = await gradeAnswerService({
    questionId,
    studentAnswer: studentAnswer || '',
    selectedOption,
    studentId,
    teacherId
  });
  
  res.status(200).json({
    success: true,
    message: 'Answer graded successfully',
    data: result
  });
});

/**
 * Get answer history with filters
 * GET /api/v1/assessment/answers
 * Query params: questionId, studentId, teacherId, page, limit, sortBy, sortOrder, minScore, maxScore, correctnessLevel, questionType
 */
export const getAnswerHistoryHandler = asyncHandler(async (req: Request, res: Response) => {
  const { 
    questionId, 
    studentId, 
    teacherId, 
    page, 
    limit,
    sortBy,
    sortOrder,
    minScore,
    maxScore,
    correctnessLevel,
    questionType
  } = req.query;
  
  const result = await getAnswerHistoryService({
    ...(questionId ? { questionId: questionId as string } : {}),
    ...(studentId ? { studentId: studentId as string } : {}),
    ...(teacherId ? { teacherId: teacherId as string } : {}),
    page: page ? parseInt(page as string) : 1,
    limit: limit ? parseInt(limit as string) : 20,
    ...(sortBy ? { sortBy: sortBy as any } : {}),
    ...(sortOrder ? { sortOrder: sortOrder as any } : {}),
    ...(minScore ? { minScore: parseFloat(minScore as string) } : {}),
    ...(maxScore ? { maxScore: parseFloat(maxScore as string) } : {}),
    ...(correctnessLevel ? { correctnessLevel: correctnessLevel as string } : {}),
    ...(questionType ? { questionType: questionType as string } : {})
  });
  
  res.status(200).json({
    success: true,
    message: 'Answer history retrieved successfully',
    data: result.answers,
    pagination: {
      total: result.total,
      page: result.page,
      limit: result.limit,
      totalPages: result.totalPages,
      hasNextPage: result.hasNextPage,
      hasPrevPage: result.hasPrevPage
    }
  });
});

/**
 * Get single answer details (with full context)
 * GET /api/v1/assessment/question/:questionId/student/:studentId/answer
 */
export const getAnswerHandler = asyncHandler(async (req: Request, res: Response) => {
  const { questionId, studentId } = req.params;
  
  if (!questionId || !studentId) {
    throw new ValidationError('Question ID and Student ID are required');
  }
  
  const answer = await getAnswerService(questionId, studentId);
  
  res.status(200).json({
    success: true,
    message: 'Answer retrieved successfully',
    data: answer
  });
});

/**
 * Get student performance summary (with trends and topic breakdown)
 * GET /api/v1/assessment/student/:studentId/performance
 */
export const getStudentPerformanceHandler = asyncHandler(async (req: Request, res: Response) => {
  const { studentId } = req.params;
  const { teacherId } = req.query;
  
  if (!studentId) {
    throw new ValidationError('Student ID is required');
  }
  
  const performance = await getStudentPerformanceService(
    studentId,
    teacherId as string | undefined
  );
  
  res.status(200).json({
    success: true,
    message: 'Student performance retrieved successfully',
    data: performance
  });
});

/**
 * Regrade an answer
 * POST /api/v1/assessment/question/:questionId/student/:studentId/regrade
 */
export const regradeAnswerHandler = asyncHandler(async (req: Request, res: Response) => {
  const { questionId, studentId } = req.params;
  
  if (!questionId || !studentId) {
    throw new ValidationError('Question ID and Student ID are required');
  }
  
  const result = await regradeAnswerService(questionId, studentId);
  
  res.status(200).json({
    success: true,
    message: 'Answer regraded successfully',
    data: result
  });
});

/**
 * Get answers for a specific question (with statistics)
 * GET /api/v1/assessment/question/:questionId/answers
 */
export const getQuestionAnswersHandler = asyncHandler(async (req: Request, res: Response) => {
  const { questionId } = req.params;
  const { teacherId } = req.query;
  
  if (!questionId) {
    throw new ValidationError('Question ID is required');
  }
  
  const result = await getQuestionAnswersService(
    questionId,
    teacherId as string | undefined
  );
  
  res.status(200).json({
    success: true,
    message: 'Question answers retrieved successfully',
    data: result
  });
});

/**
 * Get assessment statistics for teacher dashboard
 * GET /api/v1/assessment/stats/:teacherId
 */
export const getAssessmentStatsHandler = asyncHandler(async (req: Request, res: Response) => {
  const { teacherId } = req.params;
  
  if (!teacherId) {
    throw new ValidationError('Teacher ID is required');
  }
  
  const stats = await getAssessmentStatsService(teacherId);
  
  res.status(200).json({
    success: true,
    message: 'Assessment statistics retrieved successfully',
    data: stats
  });
});
