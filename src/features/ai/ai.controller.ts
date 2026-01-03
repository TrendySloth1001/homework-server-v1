/**
 * AI Controller Layer
 * Handles HTTP requests for AI features
 */

import { Request, Response } from 'express';
import { asyncHandler } from '../../shared/middleware/errorHandler';
import { ValidationError } from '../../shared/lib/errors';
import {
  generateTextService,
  chatService,
  enhanceSyllabusService,
  generateSummaryService,
  checkAIHealthService,
  getUnifiedJobStatusService,
} from './ai.service';

export const generateTextHandler = asyncHandler(async (req: Request, res: Response) => {
  const {
    prompt,
    temperature,
    maxTokens,
    conversationId,
    userId,
    teacherId,
    studentId,
    useRAG,
    ragTopK,
    contextFilters,
    sessionType,
    topic,
    webSearch,
    webSearchDepth,
    stream,
  } = req.body;
  console.log(webSearch);
  
  if (!(prompt && teacherId)) {
  throw new ValidationError('Prompt is required');
  }

  // Handle streaming response
  if (stream) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    try {
      // Send initial metadata
      res.write(`data: ${JSON.stringify({ type: 'start', webSearch })}\n\n`);

      const result = await generateTextService({
        prompt,
        temperature,
        maxTokens,
        conversationId,
        userId,
        teacherId,
        studentId,
        useRAG,
        ragTopK,
        contextFilters,
        sessionType,
        topic,
        webSearch,
        webSearchDepth,
        stream: true,
      });

      // Send response in chunks
      const chunkSize = 10; // Characters per chunk
      for (let i = 0; i < result.response.length; i += chunkSize) {
        const chunk = result.response.slice(i, Math.min(i + chunkSize, result.response.length));
        res.write(`data: ${JSON.stringify({ 
          type: 'chunk', 
          content: chunk,
          progress: ((i + chunkSize) / result.response.length * 100).toFixed(1)
        })}\n\n`);
        // Small delay for smooth streaming
        await new Promise(resolve => setTimeout(resolve, 50));
      }

      // Send completion with metadata
      res.write(`data: ${JSON.stringify({ 
        type: 'done',
        conversationId: result.conversationId,
        messageId: result.messageId,
        ...(result.formatted ? { formatted: result.formatted } : {}),
        ...(result.webSearchResults ? { webSearchResults: result.webSearchResults } : {}),
        ...(result.sourceDocuments ? { sourceDocuments: result.sourceDocuments } : {}),
      })}\n\n`);
      res.end();
    } catch (error) {
      res.write(`data: ${JSON.stringify({ 
        type: 'error', 
        message: error instanceof Error ? error.message : 'Unknown error'
      })}\n\n`);
      res.end();
    }
    return;
  }

  // Regular non-streaming response
  const result = await generateTextService({
    prompt,
    temperature,
    maxTokens,
    conversationId,
    userId,
    teacherId,
    studentId,
    useRAG,
    ragTopK,
    contextFilters,
    sessionType,
    topic,
    webSearch,
    webSearchDepth,
  });

  res.status(200).json({
    success: true,
    message: 'Text generated successfully with RAG',
    data: result,
  });
});

export const chatHandler = asyncHandler(async (req: Request, res: Response) => {
  const { messages, temperature } = req.body;

  if (!messages || !Array.isArray(messages)) {
    throw new ValidationError('Messages array is required');
  }

  const response = await chatService({ messages, temperature });

  res.status(200).json({
    success: true,
    message: 'Chat response generated successfully',
    data: {
      response,
    },
  });
});

export const enhanceSyllabusHandler = asyncHandler(async (req: Request, res: Response) => {
  const { syllabusId } = req.params;
  const { syllabusId: bodySyllabusId, topicId, teacherId, focusAreas } = req.body;
  
  // Support both old endpoint (syllabusId in URL) and new endpoint (syllabusId/topicId in body)
  const targetSyllabusId = syllabusId || bodySyllabusId;
  const enhancementType = req.body.enhancementType || 'content';

  if (!targetSyllabusId && !topicId) {
    throw new ValidationError('Syllabus ID or Topic ID is required');
  }

  if (!teacherId) {
    throw new ValidationError('Teacher ID is required');
  }

  const result = await enhanceSyllabusService({ 
    syllabusId: targetSyllabusId, 
    topicId,
    enhancementType,
    teacherId,
    focusAreas 
  });

  res.status(200).json({
    success: true,
    message: result.message || 'Content enhanced successfully',
    data: result,
  });
});

export const generateSummaryHandler = asyncHandler(async (req: Request, res: Response) => {
  const { unitId } = req.params;
  const { topicId, unitId: bodyUnitId, teacherId, format } = req.body || {};
  
  // Support both old endpoint (unitId in URL) and new endpoint (unitId/topicId in body)
  const targetUnitId = unitId || bodyUnitId;
  const targetTopicId = topicId;

  if (!targetUnitId && !targetTopicId) {
    throw new ValidationError('Unit ID or Topic ID is required');
  }

  if (!teacherId && (targetTopicId || bodyUnitId)) {
    throw new ValidationError('Teacher ID is required');
  }

  const summary = await generateSummaryService(targetUnitId || targetTopicId, { format, teacherId });

  res.status(200).json({
    success: true,
    message: 'Summary generated successfully',
    data: {
      id: targetUnitId || targetTopicId,
      summary,
    },
  });
});

export const aiHealthHandler = asyncHandler(async (req: Request, res: Response) => {
  const health = await checkAIHealthService();

  res.status(health.status === 'healthy' ? 200 : 503).json({
    success: health.status === 'healthy',
    message: health.message,
    data: health,
  });
});

/**
 * Unified job status endpoint - works for all AI job types
 * GET /api/ai/job/:jobId/status
 */
export const getUnifiedJobStatusHandler = asyncHandler(async (req: Request, res: Response) => {
  const { jobId } = req.params;

  if (!jobId) {
    throw new ValidationError('Job ID is required');
  }

  const jobStatus = await getUnifiedJobStatusService(jobId);

  res.status(200).json({
    success: true,
    message: 'Job status retrieved successfully',
    data: jobStatus,
  });
});

/**
 * RAG & Conversation Management Handlers
 */

import { conversationService } from './conversation.service';
import { ragService } from '../../shared/lib/rag';

/**
 * Get conversation history
 * GET /api/v1/ai/conversations/:id
 */
export const getConversationHandler = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const { userId } = req.query;

  if (!id) {
    throw new ValidationError('Conversation ID is required');
  }

  const conversation = await conversationService.getConversation(
    id,
    userId ? (userId as string) : undefined
  );
  const messages = await conversationService.getConversationHistory(id, 100);

  res.status(200).json({
    success: true,
    message: 'Conversation retrieved successfully',
    data: {
      conversation,
      messages,
    },
  });
});

/**
 * Get user's conversations
 * GET /api/v1/ai/conversations
 */
export const getUserConversationsHandler = asyncHandler(async (req: Request, res: Response) => {
  const { teacherId, sessionType, limit, offset } = req.query;

  if (!teacherId) {
    throw new ValidationError('teacherId is required');
  }

  const options: any = {};
  if (sessionType) options.sessionType = sessionType as string;
  if (limit) options.limit = parseInt(limit as string, 10);
  if (offset) options.offset = parseInt(offset as string, 10);

  const conversations = await conversationService.getUserConversations(
    teacherId as string,
    options
  );

  res.status(200).json({
    success: true,
    message: 'Conversations retrieved successfully',
    data: conversations,
    count: conversations.length,
  });
});

/**
 * Get teacher's conversations
 * GET /api/v1/ai/conversations/teacher/:teacherId
 */
export const getTeacherConversationsHandler = asyncHandler(async (req: Request, res: Response) => {
  const { teacherId } = req.params;
  const { sessionType, limit, offset } = req.query;

  if (!teacherId) {
    throw new ValidationError('teacherId is required');
  }

  const options: any = {};
  if (sessionType) options.sessionType = sessionType as string;
  if (limit) options.limit = parseInt(limit as string, 10);
  if (offset) options.offset = parseInt(offset as string, 10);

  const conversations = await conversationService.getTeacherConversations(
    teacherId,
    options
  );

  res.status(200).json({
    success: true,
    message: 'Teacher conversations retrieved successfully',
    data: conversations,
    count: conversations.length,
  });
});

/**
 * Delete conversation
 * DELETE /api/v1/ai/conversations/:id
 */
export const deleteConversationHandler = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const { userId } = req.query;

  if (!id) {
    throw new ValidationError('Conversation ID is required');
  }

  await conversationService.deleteConversation(
    id,
    userId ? (userId as string) : undefined
  );

  res.status(200).json({
    success: true,
    message: 'Conversation deleted successfully',
  });
});

/**
 * Get conversation statistics
 * GET /api/v1/ai/conversations/:id/stats
 */
export const getConversationStatsHandler = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;

  if (!id) {
    throw new ValidationError('Conversation ID is required');
  }

  const stats = await conversationService.getConversationStats(id);

  res.status(200).json({
    success: true,
    message: 'Conversation statistics retrieved',
    data: stats,
  });
});

/**
 * Index content for RAG
 * POST /api/v1/ai/index
 */
export const indexContentHandler = asyncHandler(async (req: Request, res: Response) => {
  const { type, id } = req.body;

  if (!type) {
    throw new ValidationError('Type is required (syllabus, question, all)');
  }

  if (type === 'syllabus' && id) {
    await ragService.indexSyllabus(id);
  } else if (type === 'question') {
    await ragService.indexQuestions(id);
  } else if (type === 'all') {
    await ragService.reindexAll();
  } else {
    throw new ValidationError('Invalid type or missing id');
  }

  res.status(200).json({
    success: true,
    message: `Content indexed successfully for ${type}`,
  });
});

/**
 * Search conversations
 * GET /api/v1/ai/conversations/search
 */
export const searchConversationsHandler = asyncHandler(async (req: Request, res: Response) => {
  const { userId, query, limit } = req.query;

  if (!userId || !query) {
    throw new ValidationError('userId and query are required');
  }

  const conversations = await conversationService.searchConversations(
    userId as string,
    query as string,
    limit ? parseInt(limit as string, 10) : 20 // Default to 20 if not provided
  );

  res.status(200).json({
    success: true,
    message: 'Search results retrieved',
    data: conversations,
    count: conversations.length,
  });
});


/**
 * Get all messages from a conversation by ID
 * GET /api/v1/ai/conversations/:conversationId/messages
 */
export const getConversationMessagesHandler = asyncHandler(async (req: Request, res: Response) => {
  const { conversationId } = req.params;
  const { teacherId } = req.query;
  
  if (!conversationId) {
    throw new ValidationError('Conversation ID is required');
  }

  const messages = await conversationService.allMessages(
    conversationId,
    teacherId as string | undefined
  );

  res.status(200).json({
    success: true,
    message: 'All messages retrieved successfully',
    data: messages,
    count: messages.length,
  });
});