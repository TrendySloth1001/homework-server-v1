/**
 * AI Feature Types
 */

export interface GenerateTextRequest {
  prompt: string;
  temperature?: number;
  maxTokens?: number;
  // RAG Enhancement
  conversationId?: string; // If part of ongoing conversation
  userId?: string; // User context
  teacherId?: string; // Teacher context
  studentId?: string; // Student context
  useRAG?: boolean; // Enable RAG retrieval (default: true)
  ragTopK?: number; // Number of documents to retrieve (default: 5)
  contextFilters?: {
    // Filter RAG context
    subject?: string;
    class?: string;
    board?: string;
    topicIds?: string[];
  };
  sessionType?: 'chat' | 'tutoring' | 'question-gen' | 'syllabus';
  topic?: string; // Conversation topic
}

export interface GenerateTextResponse {
  response: string;
  conversationId: string;
  messageId: string;
  sourceDocuments?: Array<{
    text: string;
    score: number;
    metadata: Record<string, any>;
  }>;
}

export interface ChatRequest {
  messages: Array<{
    role: 'system' | 'user' | 'assistant';
    content: string;
  }>;
  temperature?: number;
}

export interface EnhanceSyllabusRequest {
  syllabusId?: string;
  topicId?: string;
  enhancementType: 'objectives' | 'overview' | 'teaching-strategies' | 'content';
  teacherId?: string;
  focusAreas?: string[];
}

export interface GenerateQuestionsRequest {
  topicId: string;
  questionType: 'mcq' | 'short-answer' | 'essay';
  difficulty: 'easy' | 'medium' | 'hard';
  count: number;
}
