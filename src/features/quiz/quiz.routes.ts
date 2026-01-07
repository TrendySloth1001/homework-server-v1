/**
 * Quiz Routes
 * API endpoints for quiz generation and submission
 */

import { Router } from 'express';
import { quizController } from './quiz.controller';
import { authenticateToken } from '../auth/middleware/auth.middleware';

const router = Router();

// All routes require authentication
router.use(authenticateToken);

// Quiz generation
router.post('/conversations/:conversationId/generate-quiz', quizController.generateQuiz.bind(quizController));

// Quiz submission and results
router.post('/quizzes/:quizSessionId/submit', quizController.submitQuiz.bind(quizController));
router.get('/quizzes/:quizSessionId', quizController.getQuizResults.bind(quizController));

// Get all quizzes for a conversation
router.get('/conversations/:conversationId/quizzes', quizController.getConversationQuizzes.bind(quizController));

export default router;
