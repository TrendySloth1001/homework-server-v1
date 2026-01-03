/**
 * Question Service Layer
 * Business logic for question management and generation
 */

import { prisma } from '../../shared/lib/prisma';
import { ollamaService } from '../../shared/lib/ollama';
import { cacheService, CacheKeys } from '../../shared/lib/cache';
import { addAIJob, getJobStatus } from '../../shared/queues/ai.queue';
import { NotFoundError, ValidationError } from '../../shared/lib/errors';
import { config } from '../../shared/config';
import { embeddingService } from '../../shared/lib/embeddings';
import { qdrantService } from '../../shared/lib/qdrant';
import { contextBuilderService } from '../ai/context.service';
import type {
  CreateQuestionInput,
  UpdateQuestionInput,
  GenerateQuestionsInput,
  QuestionQueryOptions,
} from './questions.types';
import { createNotificationService } from '../notifications/notifications.service';

/**
 * Create a question manually
 */
export async function createQuestionService(input: CreateQuestionInput) {
  // Verify topic exists
  const topic = await prisma.topic.findUnique({
    where: { id: input.topicId },
  });

  if (!topic) {
    throw new NotFoundError('Topic', input.topicId);
  }

  // Check for duplicate using embedding similarity
  try {
    const duplicateCheck = await contextBuilderService.isDuplicate(
      input.questionText,
      input.topicId,
      0.85 // 85% similarity threshold
    );

    if (duplicateCheck.isDuplicate && duplicateCheck.similarQuestion) {
      console.warn(`⚠️  Question is ${(duplicateCheck.similarQuestion.similarity * 100).toFixed(1)}% similar to existing question ${duplicateCheck.similarQuestion.id}`);
      // Note: Not throwing error, just warning. You can uncomment below to block duplicates
      // throw new ValidationError(`Question is too similar to an existing question (${(duplicateCheck.similarQuestion.similarity * 100).toFixed(1)}% match)`);
    }
  } catch (error) {
    console.error('Error checking for duplicates:', error);
    // Continue with creation even if duplicate check fails
  }

  // Generate embedding for the question
  let embedding: string | null = null;
  try {
    const embeddingVector = await embeddingService.generateEmbedding(input.questionText);
    embedding = JSON.stringify(embeddingVector);
  } catch (error) {
    console.error('Error generating embedding:', error);
    // Continue without embedding if generation fails
  }

  const question = await prisma.question.create({
    data: {
      topicId: input.topicId,
      teacherId: input.teacherId,
      questionText: input.questionText,
      questionType: input.questionType,
      difficulty: input.difficulty,
      points: input.points || 1,
      options: input.options ? JSON.stringify(input.options) : null,
      correctAnswer: input.correctAnswer || null,
      explanation: input.explanation || null,
      generatedBy: 'manual',
      ...(embedding ? { embedding } : {}),
    },
    include: {
      topic: {
        include: {
          unit: {
            include: {
              syllabus: true,
            },
          },
        },
      },
    },
  });

  // Store in Qdrant for fast vector search
  if (embedding) {
    try {
      const embeddingVector = JSON.parse(embedding);
      await qdrantService.upsertPoint(
        qdrantService.COLLECTIONS.QUESTIONS,
        question.id,
        embeddingVector,
        {
          topicId: question.topicId,
          questionText: question.questionText,
          difficulty: question.difficulty,
          questionType: question.questionType,
        }
      );
    } catch (error) {
      console.error('Error storing in Qdrant:', error);
      // Non-critical, continue
    }
  }

  // Invalidate cache
  await cacheService.deletePattern(`questions:topic:${input.topicId}*`);

  return question;
}

/**
 * Generate questions using AI
 */
export async function generateQuestionsService(input: GenerateQuestionsInput) {
  const { topicId, teacherId, count, questionType = 'mcq', difficulty = 'medium', useQueue = true } = input;

  // Verify topic exists
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

  // For large batches or if requested, use background queue
  if (useQueue && count > 3) {
    const jobId = await addAIJob(
      {
        type: 'questions-batch',
        teacherId,
        topicId,
        questionCount: count,
        questionType,
        difficulty,
      },
      5 // normal priority
    );

    // Create AIGeneration record to track this job
    await prisma.aIGeneration.create({
      data: {
        type: 'questions-batch',
        input: JSON.stringify({ topicId, questionCount: count, questionType, difficulty }),
        output: '{}', // Will be updated when job completes
        prompt: `Batch generate ${count} ${questionType} questions with ${difficulty} difficulty`,
        model: config.ai.ollama.model,
        provider: config.ai.provider,
        status: 'success', // Job queued successfully
        teacherId,
        topicId,
        jobId,
        jobStatus: 'pending',
        jobNotified: false,
      },
    });

    return {
      status: 'queued',
      message: `Generating ${count} questions in background`,
      jobId,
      estimatedTime: count * 15, // ~15 seconds per question
    };
  }

  // For small batches, generate synchronously
  const questions = [];
  const errors = [];
  const sessionQuestions: Array<{ text: string; embedding: number[] }> = []; // Track questions in current session
  
  let successCount = 0;
  let attemptCount = 0;
  const maxAttempts = count * 5; // Allow up to 5x attempts to handle duplicates

  while (successCount < count && attemptCount < maxAttempts) {
    attemptCount++;
    
    try {
      // Add attempt number to prompt for variation (prevents cache hits)
      const prompt = await buildQuestionPrompt(topic, questionType, difficulty, attemptCount);
      
      // IMPORTANT: Don't cache question generation to ensure unique questions
      // Each generation should be fresh to avoid duplicates
      const response = await ollamaService.generate(prompt, {
        temperature: 0.9, // Higher temperature for maximum variation
        num_predict: 500,
      });

      // Parse and save question
      const parsed = parseQuestionResponse(response, questionType);
      
      // Check for duplicate ONLY against current session (not historical questions)
      console.log(`[Attempt ${attemptCount}/${maxAttempts}, Success ${successCount}/${count}] Checking: "${parsed.question.substring(0, 60)}..."`);
      // Generate embedding for this question
      let questionEmbedding: number[] | null = null;
      try {
        questionEmbedding = await embeddingService.generateEmbedding(parsed.question);
      } catch (error) {
        console.error('Error generating embedding:', error);
      }
      
      // DUPLICATE CHECK 1: Within current session (85% threshold)
      let isDuplicate = false;
      if (questionEmbedding) {
        for (const sessionQ of sessionQuestions) {
          const similarity = embeddingService.cosineSimilarity(questionEmbedding, sessionQ.embedding);
          if (similarity >= 0.85) {
            console.warn(`Duplicate in current session (${(similarity * 100).toFixed(1)}% similar) - regenerating...`);
            console.warn(`   Similar to: "${sessionQ.text.substring(0, 60)}..."`);
            isDuplicate = true;
            break;
          }
        }
        
        if (!isDuplicate) {
          console.log(`Unique within current session!`);
          
          // DUPLICATE CHECK 2: Against database (65% threshold)
          console.log(`Checking against existing questions in database...`);
          try {
            const dbDuplicateCheck = await contextBuilderService.isDuplicate(
              parsed.question,
              topicId,
              0.65 // 65% threshold for database check
            );
            
            if (dbDuplicateCheck.isDuplicate) {
              console.warn(`Similar to existing question in database (${(dbDuplicateCheck.similarQuestion!.similarity * 100).toFixed(1)}% similar) - regenerating...`);
              console.warn(`   Similar to: "${dbDuplicateCheck.similarQuestion!.questionText.substring(0, 60)}..."`);
              isDuplicate = true;
            } else {
              console.log(`Unique in database too!`);
            }
          } catch (error) {
            console.error('Error checking database duplicates:', error);
          }
        }
      } else {
        console.warn(` No embedding generated, skipping duplicate check`);
      }

      if (isDuplicate) {
        continue; // Retry without incrementing successCount
      }

      // Use the embedding we already generated (or generate if missing)
      let embedding: string | null = null;
      if (questionEmbedding) {
        embedding = JSON.stringify(questionEmbedding);
        console.log(`Using generated embedding (${questionEmbedding.length}D vector)`);
        // Add to session tracking
        sessionQuestions.push({
          text: parsed.question,
          embedding: questionEmbedding
        });
      } else {
        console.log(`Generating embedding for question...`);
        try {
          const embeddingVector = await embeddingService.generateEmbedding(parsed.question);
          embedding = JSON.stringify(embeddingVector);
          console.log(`Embedding generated (${embeddingVector.length}D vector)`);
          sessionQuestions.push({
            text: parsed.question,
            embedding: embeddingVector
          });
        } catch (error) {
          console.error('Error generating embedding:', error);
        }
      }
      
      const question = await prisma.question.create({
        data: {
          topicId,
          teacherId,
          questionText: parsed.question,
          questionType,
          difficulty,
          options: parsed.options ? JSON.stringify(parsed.options) : null,
          correctAnswer: parsed.answer,
          explanation: parsed.explanation,
          generatedBy: 'ai',
          aiModel: config.ai.ollama.model,
          aiPrompt: prompt,
          ...(embedding ? { embedding } : {}),
        },
      });

      // Store in Qdrant
      if (embedding) {
        console.log(`📦 Storing embedding in Qdrant...`);
        try {
          const embeddingVector = JSON.parse(embedding);
          await qdrantService.upsertPoint(
            qdrantService.COLLECTIONS.QUESTIONS,
            question.id,
            embeddingVector,
            {
              topicId: question.topicId,
              questionText: question.questionText,
              difficulty: question.difficulty,
              questionType: question.questionType,
            }
          );
          console.log(`Stored in Qdrant collection`);
        } catch (error) {
          console.error('Error storing in Qdrant:', error);
        }
      } else {
        console.warn(`No embedding to store in Qdrant`);
      }

      console.log(`Question ${successCount + 1}/${count} saved successfully (attempt ${attemptCount})\n`);
      questions.push(question);
      successCount++;

      // Log generation
      await prisma.aIGeneration.create({
        data: {
          type: 'question',
          input: JSON.stringify({ topicId, questionType, difficulty }),
          output: JSON.stringify(parsed),
          prompt,
          model: config.ai.ollama.model,
          provider: config.ai.provider,
          status: 'success',
          teacherId,
          topicId,
        },
      });
    } catch (error) {
      errors.push({ attempt: attemptCount, error: error instanceof Error ? error.message : 'Unknown error' });
      console.error(`Error in attempt ${attemptCount}:`, error);
    }
  }
  
  // Log summary
  if (successCount < count) {
    console.warn(` Only generated ${successCount}/${count} questions after ${attemptCount} attempts`);
  } else {
    console.log(` Successfully generated ${successCount} questions in ${attemptCount} attempts`);
  }

  // Invalidate cache
  await cacheService.deletePattern(`questions:topic:${topicId}*`);

  return {
    status: 'completed',
    questions,
    count: questions.length,
    errors: errors.length > 0 ? errors : undefined,
  };
}

/**
 * Get all questions with filters
 */
export async function getQuestionsService(options: QuestionQueryOptions = {}) {
  const { page = 1, limit = 20, filters = {} } = options;
  const skip = (page - 1) * limit;

  const where: any = {};
  if (filters.topicId) where.topicId = filters.topicId;
  if (filters.teacherId) where.teacherId = filters.teacherId;
  if (filters.questionType) where.questionType = filters.questionType;
  if (filters.difficulty) where.difficulty = filters.difficulty;
  if (filters.generatedBy) where.generatedBy = filters.generatedBy;

  // Try cache for topic-specific queries
  if (filters.topicId && !filters.teacherId) {
    const cacheKey = CacheKeys.questionsByTopic(
      filters.topicId,
      JSON.stringify({ page, limit, ...filters })
    );
    const cached = await cacheService.get<any>(cacheKey);
    if (cached) return cached;
  }

  const [questions, total] = await Promise.all([
    prisma.question.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        topic: {
          include: {
            unit: {
              include: {
                syllabus: true,
              },
            },
          },
        },
      },
    }),
    prisma.question.count({ where }),
  ]);

  // Parse options back to array
  const questionsWithParsedOptions = questions.map((q: any) => ({
    ...q,
    options: q.options ? JSON.parse(q.options) : null,
  }));

  const result = {
    questions: questionsWithParsedOptions,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  };

  // Cache if topic-specific
  if (filters.topicId && !filters.teacherId) {
    const cacheKey = CacheKeys.questionsByTopic(
      filters.topicId,
      JSON.stringify({ page, limit, ...filters })
    );
    await cacheService.set(cacheKey, result, 3600); // 1 hour
  }

  return result;
}

/**
 * Get single question
 */
export async function getQuestionService(questionId: string) {
  const question = await prisma.question.findUnique({
    where: { id: questionId },
    include: {
      topic: {
        include: {
          unit: {
            include: {
              syllabus: true,
            },
          },
        },
      },
    },
  });

  if (!question) {
    throw new NotFoundError('Question', questionId);
  }

  return {
    ...question,
    options: question.options ? JSON.parse(question.options) : null,
  };
}

/**
 * Update question
 */
export async function updateQuestionService(questionId: string, updateData: UpdateQuestionInput) {
  if (Object.keys(updateData).length === 0) {
    throw new ValidationError('No data provided for update');
  }

  const existing = await prisma.question.findUnique({
    where: { id: questionId },
  });

  if (!existing) {
    throw new NotFoundError('Question', questionId);
  }

  const { options, ...restUpdateData } = updateData;
  
  const question = await prisma.question.update({
    where: { id: questionId },
    data: {
      ...restUpdateData,
      ...(options ? { options: JSON.stringify(options) } : {}),
    },
    include: {
      topic: true,
    },
  });

  // Invalidate cache
  await cacheService.deletePattern(`questions:topic:${question.topicId}*`);

  return {
    ...question,
    options: question.options ? JSON.parse(question.options) : null,
  };
}

/**
 * Delete question
 */
export async function deleteQuestionService(questionId: string) {
  const existing = await prisma.question.findUnique({
    where: { id: questionId },
    select: { id: true, topicId: true },
  });

  if (!existing) {
    throw new NotFoundError('Question', questionId);
  }

  await prisma.question.delete({
    where: { id: questionId },
  });

  // Invalidate cache
  await cacheService.deletePattern(`questions:topic:${existing.topicId}*`);

  return { message: 'Question deleted successfully' };
}

/**
 * Get job status for background generation
 */
export async function getGenerationJobStatusService(jobId: string, teacherId: string) {
  const status = await getJobStatus(jobId);

  if (!status) {
    throw new NotFoundError('Job', jobId);
  }

  // Check if notification already sent for this job
  const aiGeneration = await prisma.aIGeneration.findFirst({
    where: {
      jobId,
      teacherId,
    },
  });

  // Send notification only once when job completes
  if (status.state === 'completed' && status.result && aiGeneration && !aiGeneration.jobNotified ) {
    // Create notification
    await createNotificationService({
      teacherId: teacherId,
      title: `AI Question Generation Complete`,
      message: `Your request to generate ${status.result.questionCount} questions has completed successfully.`,
    });
    // Mark as notified to prevent duplicate notifications
    await prisma.aIGeneration.update({
      where: { id: aiGeneration.id },
      data: {
        jobNotified: true,
        jobStatus: 'completed',
      },
    });
  }else if (status.state === 'failed' && status.failedReason && aiGeneration && !aiGeneration.jobNotified) {
    // Create failure notification
    await createNotificationService({
      teacherId: teacherId,
      title: `AI Question Generation Failed`,
      message: `Your request to generate questions has failed. Please try again.`,
    });

    // Mark as notified to prevent duplicate notifications
    await prisma.aIGeneration.update({
      where: { id: aiGeneration.id },
      data: {
        jobNotified: true,
        jobStatus: 'failed',  
        status: 'failed',
        jobError: status.failedReason || 'Job failed',
      },
    });
  }

  return status;
}

// Helper functions
async function buildQuestionPrompt(topic: any, questionType: string, difficulty: string, attemptNumber: number = 1): Promise<string> {
  try {
    // Build enhanced context using RAG
    const context = await contextBuilderService.buildEnhancedContext(topic.id);
    
    // Add variation instruction based on attempt number to ensure unique questions
    const variationHint = attemptNumber > 1 
      ? `\n\nIMPORTANT: This is attempt #${attemptNumber}. Generate a DIFFERENT question than previous attempts. Use different concepts, wording, and approach.` 
      : '';
    
    // Build enhanced prompt with context
    const basePrompt = `Generate ONE unique ${difficulty} difficulty ${questionType} question.${variationHint}

${questionType === 'mcq' ? 'Requirements:\n- Provide exactly 4 options (A, B, C, D)\n- Only ONE option should be correct\n- Options should be plausible and educationally valuable\n- Avoid obvious trick answers' : ''}
${questionType === 'short-answer' ? 'Requirements:\n- Question should be answerable in 2-3 sentences\n- Should test understanding, not just memorization\n- Provide model answer' : ''}
${questionType === 'essay' ? 'Requirements:\n- Question should require detailed analysis and explanation\n- Should test higher-order thinking skills\n- Provide key points for a comprehensive answer' : ''}
${questionType === 'true-false' ? 'Requirements:\n- Provide a clear, unambiguous statement\n- Should test conceptual understanding\n- Explain why the answer is true or false' : ''}

Format your response as valid JSON (no markdown, no code blocks):
{
  "question": "your question text here",
  ${questionType === 'mcq' ? '"options": ["A) option1", "B) option2", "C) option3", "D) option4"],' : ''}
  "answer": "correct answer here",
  "explanation": "brief explanation here"
}`;

    return contextBuilderService.buildEnhancedPrompt(basePrompt, context, {
      difficulty,
      questionType,
      count: 1,
    });
  } catch (error) {
    console.error('Error building enhanced prompt, falling back to simple prompt:', error);
    
    // Fallback to simple prompt if context building fails
    const variationHint = attemptNumber > 1 
      ? `\n\nIMPORTANT: Attempt #${attemptNumber} - Generate a DIFFERENT question than before.` 
      : '';
    
    return `Generate a ${difficulty} difficulty ${questionType} question for the following topic:${variationHint}

Subject: ${topic.unit.syllabus.subjectName}
Class: ${topic.unit.syllabus.className}
Board: ${topic.unit.syllabus.board}
Unit: ${topic.unit.title}
Topic: ${topic.topicName}

${questionType === 'mcq' ? 'Provide 4 options (A, B, C, D) with one correct answer.' : ''}
${questionType === 'short-answer' ? 'Provide a question that can be answered in 2-3 sentences.' : ''}
${questionType === 'essay' ? 'Provide a question that requires a detailed essay response.' : ''}
${questionType === 'true-false' ? 'Provide a true/false statement.' : ''}

Also provide the correct answer and a brief explanation.

Format your response as JSON:
{
  "question": "...",
  ${questionType === 'mcq' ? '"options": ["A) ...", "B) ...", "C) ...", "D) ..."],' : ''}
  "answer": "...",
  "explanation": "..."
}`;
  }
}

function parseQuestionResponse(response: string, questionType: string): any {
  try {
    // Try to extract JSON from response
    let jsonText = response.match(/\{[\s\S]*\}/)?.[0] || response;
    
    // Fix common AI JSON mistakes
    // 1. Fix unquoted single letters for answer (e.g., "answer": C -> "answer": "C")
    jsonText = jsonText.replace(/"answer":\s*([A-D])\s*,/g, '"answer": "$1",');
    jsonText = jsonText.replace(/"answer":\s*([A-D])\s*\}/g, '"answer": "$1"}');
    
    // 2. Fix trailing commas
    jsonText = jsonText.replace(/,(\s*[}\]])/g, '$1');
    
    // 3. Try parsing
    const parsed = JSON.parse(jsonText);
    
    // Validate required fields
    if (!parsed.question || typeof parsed.question !== 'string') {
      throw new Error('Missing or invalid question field');
    }
    
    return parsed;
  } catch (error) {
    console.error('JSON parsing failed:', error);
    console.log('Raw response:', response.substring(0, 200));
    
    // Try manual extraction as fallback
    try {
      const questionMatch = response.match(/"question":\s*"([^"]+)"/);
      const answerMatch = response.match(/"answer":\s*"?([^",}]+)"?/);
      const explanationMatch = response.match(/"explanation":\s*"([^"]+)"/);
      const optionsMatch = response.match(/"options":\s*\[(.*?)\]/s);
      
      const result: any = {
        question: questionMatch?.[1] || response.substring(0, 200),
        answer: answerMatch?.[1]?.trim() || '',
        explanation: explanationMatch?.[1] || 'Unable to parse explanation',
      };
      
      if (questionType === 'mcq' && optionsMatch && optionsMatch[1]) {
        const optionsText = optionsMatch[1];
        result.options = optionsText
          .split(',')
          .map((opt: string) => opt.trim().replace(/^"|"$/g, ''))
          .filter((opt: string) => opt.length > 0);
      }
      
      return result;
    } catch (fallbackError) {
      // Final fallback
      return {
        question: response.substring(0, 200),
        options: questionType === 'mcq' ? ['A) ', 'B) ', 'C) ', 'D) '] : undefined,
        answer: '',
        explanation: 'Unable to parse AI response',
      };
    }
  }
}
