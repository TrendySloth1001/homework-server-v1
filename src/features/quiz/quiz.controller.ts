/**
 * Quiz Controller
 * HTTP handlers for quiz generation and submission
 */

import { Request, Response } from 'express';
import { quizService } from './quiz.service';
import { JWTPayload } from '../auth/auth.types';

class QuizController {
  /**
   * POST /api/conversations/:conversationId/generate-quiz
   * Generate quiz from conversation
   */
  async generateQuiz(req: Request, res: Response): Promise<void> {
    try {
      const { conversationId } = req.params;
      const { questionCount, questionTypes, difficulty } = req.body;
      const user = req.user as JWTPayload;

      if (!user?.userId) {
        res.status(401).json({ success: false, error: { message: 'Unauthorized' } });
        return;
      }

      if (!conversationId) {
        res.status(400).json({ success: false, error: { message: 'Conversation ID required' } });
        return;
      }

      const quiz = await quizService.generateQuizFromConversation(
        conversationId,
        user.userId,
        { questionCount, questionTypes, difficulty }
      );

      res.json({ success: true, data: quiz });
    } catch (error: any) {
      console.error('[QuizController] Error generating quiz:', error);
      res.status(500).json({ 
        success: false, 
        error: { message: error.message || 'Failed to generate quiz' } 
      });
    }
  }

  /**
   * POST /api/quizzes/:quizSessionId/submit
   * Submit quiz answers
   */
  async submitQuiz(req: Request, res: Response): Promise<void> {
    try {
      const { quizSessionId } = req.params;
      const { answers } = req.body;
      const user = req.user as JWTPayload;

      if (!user?.userId) {
        res.status(401).json({ success: false, error: { message: 'Unauthorized' } });
        return;
      }

      if (!quizSessionId) {
        res.status(400).json({ success: false, error: { message: 'Quiz session ID required' } });
        return;
      }

      if (!answers || typeof answers !== 'object') {
        res.status(400).json({ 
          success: false, 
          error: { message: 'Answers must be provided as an object' } 
        });
        return;
      }

      const results = await quizService.submitQuizAnswers(
        quizSessionId,
        user.userId,
        answers
      );

      res.json({ success: true, data: results });
    } catch (error: any) {
      console.error('[QuizController] Error submitting quiz:', error);
      const statusCode = error.message.includes('Unauthorized') ? 403 : 
                        error.message.includes('not found') ? 404 : 500;
      res.status(statusCode).json({ 
        success: false, 
        error: { message: error.message || 'Failed to submit quiz' } 
      });
    }
  }

  /**
   * GET /api/quizzes/:quizSessionId
   * Get quiz results
   */
  async getQuizResults(req: Request, res: Response): Promise<void> {
    try {
      const { quizSessionId } = req.params;
      const user = req.user as JWTPayload;

      if (!user?.userId) {
        res.status(401).json({ success: false, error: { message: 'Unauthorized' } });
        return;
      }

      if (!quizSessionId) {
        res.status(400).json({ success: false, error: { message: 'Quiz session ID required' } });
        return;
      }

      const results = await quizService.getQuizResults(quizSessionId, user.userId);

      res.json({ success: true, data: results });
    } catch (error: any) {
      console.error('[QuizController] Error getting quiz results:', error);
      const statusCode = error.message.includes('Unauthorized') ? 403 : 
                        error.message.includes('not found') ? 404 : 500;
      res.status(statusCode).json({ 
        success: false, 
        error: { message: error.message || 'Failed to get quiz results' } 
      });
    }
  }

  /**
   * GET /api/conversations/:conversationId/quizzes
   * Get all quizzes for a conversation
   */
  async getConversationQuizzes(req: Request, res: Response): Promise<void> {
    try {
      const { conversationId } = req.params;
      const user = req.user as JWTPayload;

      if (!user?.userId) {
        res.status(401).json({ success: false, error: { message: 'Unauthorized' } });
        return;
      }

      if (!conversationId) {
        res.status(400).json({ success: false, error: { message: 'Conversation ID required' } });
        return;
      }

      const quizzes = await quizService.getConversationQuizzes(conversationId, user.userId);

      res.json({ success: true, data: quizzes });
    } catch (error: any) {
      console.error('[QuizController] Error getting quizzes:', error);
      res.status(500).json({ 
        success: false, 
        error: { message: error.message || 'Failed to get quizzes' } 
      });
    }
  }
}

export const quizController = new QuizController();
