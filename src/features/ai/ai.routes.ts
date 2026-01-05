/**
 * AI Routes
 * Define AI-powered endpoints
 */

import { Router } from 'express';
import { authenticateToken } from '../auth/middleware/auth.middleware';
import {
  generateTextHandler,
  chatHandler,
  enhanceSyllabusHandler,
  generateSummaryHandler,
  aiHealthHandler,
  getUnifiedJobStatusHandler,
  // RAG & Conversation handlers
  getConversationHandler,
  getUserConversationsHandler,
  getTeacherConversationsHandler,
  deleteConversationHandler,
  getConversationStatsHandler,
  indexContentHandler,
  searchConversationsHandler,
  getConversationMessagesHandler,
} from './ai.controller';

const router = Router();

/**
 * AI Routes - /api/ai
 * AI-powered features including text generation, chat, RAG, and conversations
 */

// Health check for AI service (public)
router.get('/health', aiHealthHandler);                                     // GET /api/ai/health

// Protected routes - require authentication
router.use(authenticateToken);

// Unified job status endpoint (for all AI job types)
//router.get('/jobs/:jobId/status', getUnifiedJobStatusHandler);              // GET /api/ai/jobs/:jobId/status

// General AI endpoints
router.post('/generate', generateTextHandler);                              // POST /api/ai/generate (RAG-enabled)
//router.post('/chat', chatHandler);                                          // POST /api/ai/chat

// Syllabus enhancement
// router.post('/enhance', enhanceSyllabusHandler);                            // POST /api/ai/enhance
// router.post('/enhance/:syllabusId', enhanceSyllabusHandler);                // POST /api/ai/enhance/:syllabusId

// Generate summary
// router.post('/summary', generateSummaryHandler);                            // POST /api/ai/summary
// router.get('/summary/units/:unitId', generateSummaryHandler);               // GET /api/ai/summary/units/:unitId

/**
 * RAG & Conversation Management Routes
 */

// Conversation CRUD
router.get('/conversations', getUserConversationsHandler);                  // GET /api/ai/conversations?userId=xxx
router.get('/conversations/teacher/:teacherId', getTeacherConversationsHandler); // GET /api/ai/conversations/teacher/:teacherId
router.get('/conversations/search', searchConversationsHandler);            // GET /api/ai/conversations/search?userId=xxx&query=yyy
router.get('/conversations/:id', getConversationHandler);                   // GET /api/ai/conversations/:id
router.get('/conversations/:conversationId/messages', getConversationMessagesHandler); // GET /api/ai/conversations/:conversationId/messages
router.get('/conversations/:id/stats', getConversationStatsHandler);        // GET /api/ai/conversations/:id/stats
router.delete('/conversations/:id', deleteConversationHandler);             // DELETE /api/ai/conversations/:id

// RAG indexing
//router.post('/index', indexContentHandler);                                 // POST /api/ai/index

export default router;
