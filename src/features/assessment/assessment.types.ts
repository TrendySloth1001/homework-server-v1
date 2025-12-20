/**
 * Assessment Types
 * Types for mathematical grading system
 */

export interface GradeAnswerInput {
  questionId: string;
  studentAnswer: string;
  selectedOption?: string; // For MCQ: "A", "B", "C", "D"
  studentId: string;
  teacherId: string;
}

export interface GradingResult {
  score: number; // 0-1 normalized
  maxScore: number; // From question.points
  percentage: number; // 0-100
  isCorrect: boolean; // true if score >= 0.7
  correctnessLevel: string; // "excellent" | "good" | "partial" | "incorrect"
  feedback: string; // Brief explanation
  confidence: number; // 0-1 confidence in grading
  gradingMethod: string; // Which grader was used
  breakdown?: MetricBreakdown; // Detailed metric scores
}

export interface MetricBreakdown {
  cosine?: number;
  jaccard?: number;
  levenshtein?: number;
  keyword?: number;
  ngram?: number;
  [key: string]: number | undefined;
}

export interface Grader {
  grade(studentAnswer: string, question: any): Promise<GradingResult>;
}

export interface GetAnswersQuery {
  questionId?: string;
  studentId?: string;
  teacherId?: string;
  page?: number;
  limit?: number;
  sortBy?: 'submittedAt' | 'score' | 'confidence';
  sortOrder?: 'asc' | 'desc';
  minScore?: number;
  maxScore?: number;
  correctnessLevel?: string;
  questionType?: string;
}

export interface AnswerHistory {
  answers: EnrichedAnswer[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
}

export interface EnrichedAnswer {
  id: string;
  questionId: string;
  studentId: string;
  teacherId: string;
  studentAnswer: string;
  selectedOption: string | null;
  score: number;
  maxScore: number;
  percentage: number;
  isCorrect: boolean;
  correctnessLevel: string | null;
  gradingMethod: string;
  confidence: number | null;
  feedback: string | null;
  submittedAt: Date;
  question: {
    questionText: string;
    questionType: string;
    difficulty: string;
    points: number;
    topicName?: string;
    correctAnswer?: string;
    explanation?: string;
  };
}

export interface PerformanceStats {
  studentId: string;
  teacherId?: string;
  totalAttempts: number;
  averageScore: number;
  averagePercentage: number;
  averageConfidence: number;
  correctCount: number;
  partialCorrectCount: number;
  incorrectCount: number;
  byQuestionType: Record<string, TypeStats>;
  byDifficulty: Record<string, TypeStats>;
  byCorrectness: Record<string, number>;
  byTopic?: Record<string, TypeStats>;
  recentAnswers: EnrichedAnswer[];
  improvementTrend?: TrendData[];
}

export interface TypeStats {
  count: number;
  averageScore: number;
  averagePercentage: number;
  correctCount: number;
}

export interface TrendData {
  date: string;
  averageScore: number;
  count: number;
}

// Text processing types
export interface TokenStats {
  tokens: string[];
  uniqueTokens: Set<string>;
  tokenCount: number;
  uniqueCount: number;
}

export interface EssayMetrics {
  wordCount: number;
  sentenceCount: number;
  avgWordsPerSentence: number;
  uniqueWords: number;
  vocabularyRichness: number;
  avgWordLength: number;
  complexWords: number; // words > 3 syllables
  fleschKincaid: number;
  paragraphCount: number;
}
