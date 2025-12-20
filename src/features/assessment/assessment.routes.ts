/**
 * Assessment Routes
 * RESTful endpoints for mathematical answer grading
 */

import { Router } from 'express';
import {
  gradeAnswerHandler,
  getAnswerHistoryHandler,
  getAnswerHandler,
  getStudentPerformanceHandler,
  regradeAnswerHandler,
  getQuestionAnswersHandler,
  getAssessmentStatsHandler
} from './assessment.controller';

const router = Router();

// Grade a student answer
router.post('/grade', gradeAnswerHandler);

// Get answer history (with advanced filters and sorting)
router.get('/answers', getAnswerHistoryHandler);

// Get single answer details (by question and student)
router.get('/question/:questionId/student/:studentId', getAnswerHandler);

// Regrade an answer (by question and student)
router.post('/question/:questionId/student/:studentId/regrade', regradeAnswerHandler);

// Get answers for a specific question (with statistics)
router.get('/question/:questionId/answers', getQuestionAnswersHandler);

// Get student performance summary (with trends)
router.get('/student/:studentId/performance', getStudentPerformanceHandler);

// Get assessment statistics for teacher dashboard
router.get('/stats/:teacherId', getAssessmentStatsHandler);

export default router;
