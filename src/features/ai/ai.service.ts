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
import { searchWeb, type SearchResult } from '../../shared/lib/webSearch';
import { memoryManager } from '../../shared/lib/memoryManager';
import { aiSettingsService } from '../ai-settings/ai-settings.service';
import { promptBuilder } from '../../shared/lib/promptBuilder';
import { responseEnhancer } from '../../shared/lib/responseEnhancer';
import { urlValidator } from '../../shared/lib/urlValidator';
import { mem0Service } from '../../shared/lib/mem0Client';
import { langchainService } from '../../shared/lib/langchainService';

/**
 * Check if query is asking about personal information
 */
function checkIfPersonalQuery(query: string): boolean {
  const personalKeywords = [
    'my', 'me', 'i am', "i'm", 'my name', 'who am i',
    'my goal', 'my interest', 'about me', 'tell me about myself',
    'what do i', 'what did i', 'remember about me'
  ];
  
  const lowerQuery = query.toLowerCase();
  return personalKeywords.some(keyword => lowerQuery.includes(keyword));
}

/**
 * Check if query needs memory/past context
 */
function checkIfNeedsMemory(query: string): boolean {
  const memoryKeywords = [
    'remember', 'recall', 'we discussed', 'we talked',
    'last time', 'before', 'previous', 'earlier',
    'you said', 'you told me', 'you mentioned',
    'what did', 'when did', 'history', 'past'
  ];
  
  const lowerQuery = query.toLowerCase();
  
  // Also check if query is too short - simple questions don't need memory
  if (query.split(' ').length <= 3) {
    return false;
  }
  
  return memoryKeywords.some(keyword => lowerQuery.includes(keyword));
}

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
    webSearch = false,
    webSearchDepth = 'advanced',
    stream = false,
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

  // Step 2.1: Load AI settings and memory (Phase 3 Integration)
  const currentUserId = userId || teacherId || studentId;
  let aiSettings;
  let userContext;
  let relevantFacts;
  let relevantConversations;
  let userName: string | undefined;

  try {
    if (currentUserId) {
      // Load user's display name for personalization
      const user = await prisma.user.findUnique({
        where: { id: currentUserId },
        select: { displayName: true }
      });
      userName = user?.displayName;

      // Load AI customization settings (always needed for personality)
      aiSettings = await aiSettingsService.getSettings(currentUserId);
      
      // Smart context loading - only load when relevant to the query
      const shouldLoadPersonalContext = checkIfPersonalQuery(prompt);
      const shouldLoadMemory = checkIfNeedsMemory(prompt);
      
      // Load user context only if query seems personal and profile is enabled
      if (shouldLoadPersonalContext && aiSettings.profileEnabled) {
        userContext = await aiSettingsService.getUserContext(currentUserId);
        console.log('[AIService] Loading user context - query appears personal');
      }

      // Load memory only if enabled and query suggests need for past context
      if (shouldLoadMemory) {
        // Load relevant memory facts
        relevantFacts = await memoryManager.loadRelevantFacts(currentUserId, prompt, 5);
        
        // Only search conversations if facts were found or query is about past discussions
        if (relevantFacts && relevantFacts.length > 0) {
          relevantConversations = await memoryManager.searchConversations(currentUserId, prompt, 2);
          console.log(`[AIService] Loaded ${relevantFacts.length} relevant facts and ${relevantConversations?.length || 0} past conversations`);
        }
        
        // Mark used facts
        if (relevantFacts && relevantFacts.length > 0) {
          relevantFacts.forEach(fact => {
            memoryManager.markFactAsUsed(fact.id).catch(err => 
              console.error('[AIService] Failed to mark fact as used:', err)
            );
          });
        }
      } else {
        console.log('[AIService] Skipping memory/context retrieval - not needed for this query');
      }
    }
  } catch (error) {
    console.error('[AIService] Error loading memory/settings:', error);
    // Continue without memory if it fails
  }

  // Step 2.5: Perform web search if enabled
  let webSearchResults: SearchResult[] | undefined;
  let webSearchContext = '';
  
  if (webSearch) {
    try {
      console.log('[AIService] Web search enabled - searching for:', prompt);
      webSearchResults = await searchWeb(prompt, {
        maxResults: 5,
        searchDepth: webSearchDepth,
        useCache: true,
        cacheDays: 7,
      });
      
      if (webSearchResults && webSearchResults.length > 0) {
        console.log(`[AIService] Found ${webSearchResults.length} web search results, validating URLs...`);
        
        // Validate URLs to filter out 404s (Phase 3 Integration)
        const validatedResults = await urlValidator.validateBatch(
          webSearchResults.map(r => r.url)
        );
        
        // Filter to only valid URLs
        webSearchResults = webSearchResults.filter((result) => {
          const validation = validatedResults.get(result.url);
          return validation?.isValid;
        });
        
        console.log(`[AIService] ${webSearchResults.length} valid URLs after validation`);
        
        if (webSearchResults.length > 0) {
          // Format search results as context
          webSearchContext = '\n\n=== RECENT WEB SEARCH RESULTS ===\n' +
            webSearchResults.map((result, idx) => 
              `${idx + 1}. ${result.title}\n   ${result.snippet || ''}\n   Source: ${result.url}`
            ).join('\n\n') +
            '\n\n=== END WEB SEARCH RESULTS ===\n\n' +
            'Based on the above web search results, please provide an accurate and up-to-date response.\n\n';
        }
      }
    } catch (error) {
      console.warn('[AIService] Web search failed:', error);
      // Continue without web search results
    }
  }

  // Step 3: Use RAG service if enabled
  let response: string;
  let tokensUsed = 0;
  let sourceDocuments: Array<{ text: string; score: number; metadata: Record<string, any> }> | undefined;

  try {
    // Build enhanced prompt with memory and settings (Phase 3 Integration)
    let enhancedPrompt = prompt;
    let systemPrompt = 'You are Kai, a helpful AI assistant.';
    
    if (aiSettings) {
      const promptContext: any = {
        userMessage: prompt,
        conversationHistory: history.slice(-10).map(msg => ({ // Last 10 messages
          role: msg.role,
          content: msg.content,
        })),
        aiSettings,
        userName, // Add user's display name for personalization
      };
      
      if (userContext) promptContext.userContext = userContext;
      if (relevantFacts) promptContext.relevantFacts = relevantFacts;
      if (relevantConversations) promptContext.relevantConversations = relevantConversations;
      
      const fullPrompt = promptBuilder.buildFullPrompt(promptContext);
      // Extract system prompt from built prompt (first part before conversation)
      const parts = fullPrompt.split('\n\nConversation history:');
      systemPrompt = parts[0] || systemPrompt;
      enhancedPrompt = parts[1] || prompt;
    }

    // Add web search context if available
    if (webSearchContext) {
      systemPrompt = systemPrompt + '\n\n' + webSearchContext;
    }

    if (useRAG) {
      // Query with RAG - includes context retrieval + generation
      const ragResponse = await ragService.query({
        query: enhancedPrompt,
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
      tokensUsed = ragResponse.tokensUsed || 0;
    } else if (currentUserId) {
      // Use LangChain + Mem0 for memory-enhanced conversations
      await langchainService.initialize();
      
      response = await langchainService.chat(
        currentUserId,
        enhancedPrompt,
        history.slice(-10).map(msg => ({
          role: msg.role as 'user' | 'assistant',
          content: msg.content,
        })),
        systemPrompt
      );
      
      // Estimate tokens (rough approximation)
      tokensUsed = Math.ceil((enhancedPrompt.length + response.length) / 4);
    } else {
      // Simple generation without RAG or memory
      const ollamaResponse = await ollamaService.generate(enhancedPrompt, {
        temperature,
        num_predict: maxTokens,
      });
      response = ollamaResponse.response;
      tokensUsed = ollamaResponse.totalTokens;
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

    // Apply response enhancer for better personality (Phase 3 Integration)
    if (aiSettings) {
      try {
        response = responseEnhancer.enhance(response, {
          emojiLevel: aiSettings.emojiUsage === 'frequent' ? 'high' : 
                     aiSettings.emojiUsage === 'occasional' ? 'moderate' : 'none',
          warmth: aiSettings.warmth >= 7 ? 'high' : aiSettings.warmth <= 3 ? 'low' : 'medium',
        });
      } catch (error) {
        console.warn('[AIService] Response enhancement failed:', error);
        // Continue with original response
      }
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

  // Step 4.1: Store conversation in Mem0 for future memory retrieval
  if (currentUserId && !useRAG) {
    // Store in Mem0 (background - don't block response)
    langchainService.storeConversation(
      currentUserId,
      conversation.id,
      prompt,
      response
    ).catch(err => console.error('[AIService] Mem0 storage failed:', err));
  }
  
  // Step 4.2: Extract facts from conversation (Phase 3 Integration)
  if (currentUserId && aiSettings?.profileEnabled) {
    // Extract facts in background (don't block response)
    memoryManager.extractFactsFromConversation(
      currentUserId,
      prompt,
      response,
      conversation.id
    ).catch(err => console.error('[AIService] Fact extraction failed:', err));
  }

  // Step 4.5: Generate thought tags for assistant response (2-4 context tags)
  const thoughtTags = await generateThoughtTags(prompt, response);

  // Log token usage before storing
  if (config.isDevelopment) {
    console.log('[AIService] Storing message with tokens:', tokensUsed);
  }

  // Step 5: Store assistant message with thought tags
  const assistantMessage = await conversationService.addMessage(conversation.id, {
    role: 'assistant',
    content: response,
    ...(sourceDocuments ? {
      retrievedDocs: sourceDocuments.map((d) => ({ id: d.metadata.id, score: d.score }))
    } : {}),
    tokensUsed,
    model: process.env.OLLAMA_MODEL || 'qwen2.5:14b',
    temperature,
    thoughtTags, // Add thought tags
  });

  // Step 6: Format response if requested
  const formatted = formatResponse ? responseFormatter.formatResponse(response) : undefined;

  // Step 7: Summarize conversation periodically (Phase 3 Integration)
  // Summarize every 10 messages to keep conversation references updated
  if (currentUserId && history.length % 10 === 0 && history.length >= 10) {
    memoryManager.summarizeConversation(conversation.id, currentUserId)
      .catch(err => console.error('[AIService] Conversation summarization failed:', err));
  }

  const result: GenerateTextResponse = {
    response,
    ...(formatted ? { formatted } : {}),
    conversationId: conversation.id,
    messageId: assistantMessage.id,
    tokensUsed,
    ...(stream ? { isStreaming: true } : {}),
  };
  
  if (useRAG && sourceDocuments) {
    result.sourceDocuments = sourceDocuments;
  }

  if (webSearch && webSearchResults) {
    result.webSearchResults = webSearchResults;
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

  const ollamaResponse = await ollamaService.chat(messages, {
    temperature,
  });

  return ollamaResponse.response;
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
      const strategiesResponse = await ollamaService.generate(prompt, {
        temperature: 0.7,
        num_predict: 600,
      });

      return {
        syllabusId,
        enhancementType,
        content: strategiesResponse.response,
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
      
      const enhancedContentResponse = await ollamaService.generate(prompt, {
        temperature: 0.7,
        num_predict: 700,
      });

      return {
        syllabusId,
        enhancementType,
        content: enhancedContentResponse.response,
        message: 'Content enhanced successfully',
      };

    default:
      throw new ValidationError(`Invalid enhancement type: ${enhancementType}`);
  }

  // Generate the content
  const generatedContentResponse = await ollamaService.generate(prompt, {
    temperature: 0.7,
    num_predict: 500,
  });

  // Update the syllabus
  const updated = await prisma.syllabus.update({
    where: { id: syllabusId },
    data: {
      [updateField]: generatedContentResponse.response,
    },
  });

  return {
    syllabusId: updated.id,
    enhancementType,
    content: generatedContentResponse.response,
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

  const summaryResponse = await ollamaService.generate(prompt, {
    temperature: 0.7,
    num_predict: 400,
  });

  return summaryResponse.response;
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

  const enhancedContentResponse = await ollamaService.generate(prompt, {
    temperature: 0.7,
    num_predict: 700,
  });

  return {
    topicId,
    enhancementType: input.enhancementType || 'content',
    content: enhancedContentResponse.response,
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

/**
 * Generate thought tags for AI response
 * Extracts 2-4 contextual tags representing what the AI was "thinking about"
 * Tags represent: topics, themes, domains, or concepts in the response
 */
async function generateThoughtTags(userPrompt: string, aiResponse: string): Promise<string> {
  try {
    // Quick extraction using keyword analysis (fast, no extra AI call)
    const combined = `${userPrompt} ${aiResponse}`.toLowerCase();
    
    // Define domain keywords for categorization
    const domainKeywords = {
      mathematics: ['math', 'equation', 'calculus', 'algebra', 'geometry', 'theorem', 'formula', 'proof'],
      science: ['physics', 'chemistry', 'biology', 'experiment', 'hypothesis', 'molecule', 'atom', 'cell'],
      programming: ['code', 'function', 'algorithm', 'javascript', 'python', 'programming', 'debug', 'api'],
      education: ['learn', 'teach', 'student', 'course', 'lesson', 'study', 'education', 'curriculum'],
      history: ['history', 'war', 'ancient', 'civilization', 'historical', 'century', 'period', 'event'],
      literature: ['book', 'novel', 'poem', 'author', 'literature', 'story', 'character', 'plot'],
      art: ['art', 'painting', 'music', 'design', 'creative', 'artist', 'aesthetic', 'visual'],
      business: ['business', 'market', 'company', 'finance', 'economy', 'profit', 'management', 'strategy'],
      technology: ['technology', 'software', 'hardware', 'digital', 'internet', 'computer', 'tech', 'innovation'],
      philosophy: ['philosophy', 'ethics', 'moral', 'logic', 'metaphysics', 'epistemology', 'thought', 'reason'],
    };

    // Count matches for each domain
    const domainScores: Record<string, number> = {};
    for (const [domain, keywords] of Object.entries(domainKeywords)) {
      domainScores[domain] = keywords.filter(keyword => combined.includes(keyword)).length;
    }

    // Get top 2-4 domains
    const topDomains = Object.entries(domainScores)
      .filter(([_, score]) => score > 0)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
      .map(([domain]) => domain);

    // If no domains matched, use generic tags based on response length and complexity
    if (topDomains.length === 0) {
      const responseLength = aiResponse.length;
      const hasCode = /```/.test(aiResponse);
      const hasList = /\d\.|•|-\s/.test(aiResponse);
      
      const genericTags = ['general'];
      if (hasCode) genericTags.push('technical');
      if (hasList) genericTags.push('structured');
      if (responseLength > 500) genericTags.push('detailed');
      else genericTags.push('concise');
      
      return genericTags.slice(0, 4).join(',');
    }

    // Ensure 2-4 tags
    const finalTags = topDomains.slice(0, 4);
    if (finalTags.length < 2) {
      // Add generic tags if we have less than 2
      finalTags.push('general');
    }

    return finalTags.join(',');
  } catch (error) {
    console.warn('[AIService] Failed to generate thought tags:', error);
    return 'general,conversation'; // Fallback
  }
}
