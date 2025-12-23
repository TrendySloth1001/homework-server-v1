/**
 * AI Service Layer
 * Business logic for AI-powered features
 */

import { ollamaService } from '../../shared/lib/ollama';
import { prisma } from '../../shared/lib/prisma';
import { NotFoundError, ValidationError } from '../../shared/lib/errors';
import type { GenerateTextRequest, GenerateTextResponse, ChatRequest, EnhanceSyllabusRequest } from './ai.types';
import { config } from '../../shared/config';
import { ragService } from '../../shared/lib/rag';
import { conversationService } from './conversation.service';
import { responseFormatter } from '../../shared/lib/responseFormatter';

/**
 * Enhanced text generation with RAG and conversation history
 * Now supports context retrieval and sliding window conversation management
 */
export async function generateTextService(input: GenerateTextRequest): Promise<GenerateTextResponse> {
  const {
    prompt,
    temperature = 0.7,
    maxTokens = 5000,
    conversationId,
    userId,
    teacherId,
    studentId,
    useRAG = true,
    ragTopK = 5,
    contextFilters,
    sessionType = 'chat',
    topic,
    formatResponse = true,
  } = input;

  if (!prompt || prompt.trim().length === 0) {
    throw new ValidationError('Prompt cannot be empty');
  }

  // Step 1: Get or create conversation
  let conversation;
  if (conversationId) {
    // Load existing conversation
    const userIdForAuth = userId || teacherId || studentId;
    conversation = await conversationService.getConversation(conversationId, userIdForAuth);
  } else {
    // Create new conversation
    conversation = await conversationService.createConversation({
      ...(userId ? { userId } : {}),
      ...(teacherId ? { teacherId } : {}),
      ...(studentId ? { studentId } : {}),
      ...(topic ? { topic } : {}),
      title: prompt.substring(0, 100), // First 100 chars as title
      sessionType,
    });
  }

  // Step 2: Load conversation history (sliding window - last 100)
  const history = await conversationService.getConversationHistory(conversation.id, 100);

  // Step 3: Use RAG service if enabled
  let response: string;
  let sourceDocuments: Array<{ text: string; score: number; metadata: Record<string, any> }> | undefined;

  try {
    if (useRAG) {
      // Query with RAG - includes context retrieval + generation
      const ragResponse = await ragService.query({
        query: prompt,
        topK: ragTopK,
        conversationHistory: history.map((msg) => ({
          role: msg.role,
          content: msg.content,
        })),
        ...(contextFilters ? { filters: contextFilters } : {}),
        temperature,
        maxTokens,
      });

      response = ragResponse.answer;
      sourceDocuments = ragResponse.sourceNodes;
    } else {
      // Simple generation without RAG
      response = await ollamaService.generate(prompt, {
        temperature,
        num_predict: maxTokens,
      });
    }

    // Validate response quality
    if (!response || typeof response !== 'string') {
      throw new Error('Invalid response from AI service: response is empty or not a string');
    }

    const trimmedResponse = response.trim();
    if (trimmedResponse.length === 0) {
      throw new Error('Invalid response from AI service: response is empty after trimming');
    }

    // Check for corruption patterns
    const lineCount = trimmedResponse.split('\n').length;
    const nonEmptyLines = trimmedResponse.split('\n').filter(line => line.trim().length > 0).length;
    const emptyLineRatio = lineCount > 0 ? (lineCount - nonEmptyLines) / lineCount : 0;

    if (emptyLineRatio > 0.7 && lineCount > 10) {
      console.warn('[AIService] Response has excessive empty lines, cleaning up...');
      response = trimmedResponse.split('\n').filter(line => line.trim().length > 0).join('\n');
    }

    // Clean up any JSON wrapper if present
    try {
      const jsonMatch = response.match(/^\{\s*"response"\s*:\s*"(.*)"\s*\}$/s);
      if (jsonMatch && jsonMatch[1]) {
        response = jsonMatch[1];
      }
    } catch {
      // Not a JSON wrapper, continue with original response
    }

  } catch (error) {
    console.error('[AIService] Error generating response:', error);
    throw new Error(`Failed to generate AI response: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }

  // Step 4: Store user message
  const userMessage = await conversationService.addMessage(conversation.id, {
    role: 'user',
    content: prompt,
  });

  // Step 5: Store assistant message
  const assistantMessage = await conversationService.addMessage(conversation.id, {
    role: 'assistant',
    content: response,
    ...(sourceDocuments ? {
      retrievedDocs: sourceDocuments.map((d) => ({ id: d.metadata.id, score: d.score }))
    } : {}),
    model: process.env.OLLAMA_MODEL || 'qwen2.5:14b',
    temperature,
    // Note: tokensUsed would need to be calculated from response
  });

  // Step 6: Format response if requested
  const formatted = formatResponse ? responseFormatter.formatResponse(response) : undefined;

  const result: GenerateTextResponse = {
    response,
    ...(formatted ? { formatted } : {}),
    conversationId: conversation.id,
    messageId: assistantMessage.id,
  };
  
  if (useRAG && sourceDocuments) {
    result.sourceDocuments = sourceDocuments;
  }
  
  return result;
}

/**
 * Legacy simple text generation (backward compatibility)
 * Use generateTextService with useRAG: false for same behavior
 */
export async function generateTextSimple(prompt: string, options?: {
  temperature?: number;
  maxTokens?: number;
}): Promise<string> {
  const result = await generateTextService({
    prompt,
    ...(options?.temperature !== undefined ? { temperature: options.temperature } : {}),
    ...(options?.maxTokens !== undefined ? { maxTokens: options.maxTokens } : {}),
    useRAG: false,
  });
  return result.response;
}

/**
 * Chat completion
 */
export async function chatService(input: ChatRequest): Promise<string> {
  const { messages, temperature = 0.7 } = input;

  if (!messages || messages.length === 0) {
    throw new ValidationError('Messages array cannot be empty');
  }

  const response = await ollamaService.chat(messages, {
    temperature,
  });

  return response;
}

/**
 * Enhance syllabus with AI-generated content
 */
export async function enhanceSyllabusService(input: EnhanceSyllabusRequest) {
  const { syllabusId, topicId, enhancementType } = input;

  // If topicId is provided, enhance topic instead
  if (topicId) {
    return enhanceTopicContent(topicId, input);
  }

  if (!syllabusId) {
    throw new ValidationError('Syllabus ID is required when not using topic-based enhancement');
  }

  // Get syllabus with units and topics
  const syllabus = await prisma.syllabus.findUnique({
    where: { id: syllabusId },
    include: {
      units: {
        include: {
          topics: true,
        },
      },
    },
  });

  if (!syllabus) {
    throw new NotFoundError('Syllabus', syllabusId);
  }

  let prompt = '';
  let updateField: 'objectives' | 'overview' = 'objectives';

  switch (enhancementType) {
    case 'objectives':
      updateField = 'objectives';
      prompt = `Generate comprehensive learning objectives for a ${syllabus.subjectName} course for ${syllabus.className} students.
      
Board: ${syllabus.board}
Term: ${syllabus.term}
Academic Year: ${syllabus.academicYear}

Units covered:
${syllabus.units.map((u, i) => `${i + 1}. ${u.title}`).join('\n')}

Provide 5-7 clear, measurable learning objectives that students should achieve by the end of this course.`;
      break;

    case 'overview':
      updateField = 'overview';
      prompt = `Write a comprehensive course overview for ${syllabus.subjectName} for ${syllabus.className} students.
      
Board: ${syllabus.board}
Term: ${syllabus.term}

Units covered:
${syllabus.units.map((u, i) => `${i + 1}. ${u.title}${u.description ? ': ' + u.description : ''}`).join('\n')}

Provide an engaging 2-3 paragraph overview that explains what students will learn and why it matters.`;
      break;

    case 'teaching-strategies':
      prompt = `Suggest effective teaching strategies for a ${syllabus.subjectName} course for ${syllabus.className} students.
      
Units covered:
${syllabus.units.map((u, i) => `${i + 1}. ${u.title}`).join('\n')}

Provide 4-5 practical teaching strategies that would work well for this course.`;
      
      // For teaching strategies, we'll return the text without updating the database
      const strategies = await ollamaService.generate(prompt, {
        temperature: 0.7,
        num_predict: 600,
      });

      return {
        syllabusId,
        enhancementType,
        content: strategies,
        message: 'Teaching strategies generated successfully',
      };

    case 'content':
      // Generic content enhancement
      const focusAreasText = input.focusAreas && input.focusAreas.length > 0 
        ? `Focus on: ${input.focusAreas.join(', ')}` 
        : '';
      
      prompt = `Enhance the educational content for ${syllabus.subjectName} for ${syllabus.className} students.
      
${focusAreasText}

Units covered:
${syllabus.units.map((u, i) => `${i + 1}. ${u.title}${u.description ? ': ' + u.description : ''}`).join('\n')}

Provide enhanced, detailed content that would help students better understand these topics.`;
      
      const enhancedContent = await ollamaService.generate(prompt, {
        temperature: 0.7,
        num_predict: 700,
      });

      return {
        syllabusId,
        enhancementType,
        content: enhancedContent,
        message: 'Content enhanced successfully',
      };

    default:
      throw new ValidationError(`Invalid enhancement type: ${enhancementType}`);
  }

  // Generate the content
  const generatedContent = await ollamaService.generate(prompt, {
    temperature: 0.7,
    num_predict: 500,
  });

  // Update the syllabus
  const updated = await prisma.syllabus.update({
    where: { id: syllabusId },
    data: {
      [updateField]: generatedContent,
    },
  });

  return {
    syllabusId: updated.id,
    enhancementType,
    content: generatedContent,
    message: `${enhancementType} generated and saved successfully`,
  };
}

/**
 * Generate summary of a unit or topic
 */
export async function generateSummaryService(
  unitId: string, 
  options?: { format?: string; teacherId?: string }
): Promise<string> {
  const unit = await prisma.unit.findUnique({
    where: { id: unitId },
    include: {
      topics: true,
      syllabus: true,
    },
  });

  if (!unit) {
    throw new NotFoundError('Unit', unitId);
  }

  const prompt = `Summarize this educational unit for ${unit.syllabus.className} students studying ${unit.syllabus.subjectName}:

Unit Title: ${unit.title}
${unit.description ? `Description: ${unit.description}` : ''}
${unit.teachingHours ? `Teaching Hours: ${unit.teachingHours}` : ''}

Topics covered:
${unit.topics.map((t, i) => `${i + 1}. ${t.topicName}`).join('\n')}

Provide a clear, student-friendly summary in 2-3 paragraphs that helps students understand what they'll learn in this unit.`;

  const summary = await ollamaService.generate(prompt, {
    temperature: 0.7,
    num_predict: 400,
  });

  return summary;
}

/**
 * Enhance topic content with AI
 */
async function enhanceTopicContent(topicId: string, input: EnhanceSyllabusRequest) {
  const topic = await prisma.topic.findUnique({
    where: { id: topicId },
    include: {
      unit: {
        include: {
          syllabus: true,
        },
      },
    },
  });

  if (!topic) {
    throw new NotFoundError('Topic', topicId);
  }

  const focusAreasText = input.focusAreas && input.focusAreas.length > 0 
    ? `Focus on: ${input.focusAreas.join(', ')}` 
    : 'Focus on: key concepts, examples, real-world applications';

  const prompt = `Enhance the educational content for this topic:

Subject: ${topic.unit.syllabus.subjectName}
Class: ${topic.unit.syllabus.className}
Board: ${topic.unit.syllabus.board}
Unit: ${topic.unit.title}
Topic: ${topic.topicName}

${focusAreasText}

Provide detailed, student-friendly content that includes:
- Key concepts and principles
- Clear explanations
- Relevant examples
- Real-world applications
- Common misconceptions to avoid

Write in a clear, engaging style suitable for ${topic.unit.syllabus.className} students.`;

  const enhancedContent = await ollamaService.generate(prompt, {
    temperature: 0.7,
    num_predict: 700,
  });

  return {
    topicId,
    enhancementType: input.enhancementType || 'content',
    content: enhancedContent,
    message: 'Topic content enhanced successfully',
  };
}

/**
 * Check Ollama health
 */
export async function checkAIHealthService() {
  const isHealthy = await ollamaService.healthCheck();
  const modelInfo = ollamaService.getModelInfo();

  return {
    status: isHealthy ? 'healthy' : 'unavailable',
    ...modelInfo,
    message: isHealthy
      ? 'Ollama is running and model is available'
      : `Ollama is not available. Please ensure Ollama is running and the model ${config.ai.ollama.model} is installed.`,
  };
}


/**
 * Unified job status check - works for all AI job types
 * Checks both BullMQ queue and database JobQueue model
 */
export async function getUnifiedJobStatusService(jobId: string) {
  // First, check if job exists in database
  const dbJob = await prisma.jobQueue.findUnique({
    where: { jobId },
  });

  if (!dbJob) {
    throw new NotFoundError('Job', jobId);
  }

  // Return unified response
  return {
    jobId: dbJob.jobId,
    jobType: dbJob.jobType,
    status: dbJob.status,
    progress: dbJob.progress,
    attempts: dbJob.attempts,
    result: dbJob.result ? JSON.parse(dbJob.result) : null,
    error: dbJob.error,
    teacherId: dbJob.teacherId,
    createdAt: dbJob.createdAt,
    updatedAt: dbJob.updatedAt,
  };
}
