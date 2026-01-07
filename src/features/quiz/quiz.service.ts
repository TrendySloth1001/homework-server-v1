/**
 * Quiz Service
 * Generates and manages in-chat quizzes based on conversation context
 */

import { prisma } from '../../shared/lib/prisma';
import { ollamaService } from '../../shared/lib/ollama';
import { conversationService } from '../ai/conversation.service';

export interface QuizGenerationOptions {
  questionCount?: number;
  questionTypes?: ('mcq' | 'true-false' | 'short-answer')[];
  difficulty?: 'easy' | 'medium' | 'hard' | 'auto';
}

export interface QuizQuestion {
  questionText: string;
  questionType: string;
  difficulty: string;
  options?: string[];
  correctAnswer?: string;
  explanation?: string;
  points: number;
}

export interface QuizSubmission {
  [questionId: string]: string; // User's answers
}

class QuizService {
  /**
   * Generate quiz from conversation context
   */
  async generateQuizFromConversation(
    conversationId: string,
    userId: string,
    options: QuizGenerationOptions = {}
  ) {
    try {
      const {
        questionCount = 5,
        questionTypes = ['mcq', 'true-false'],
        difficulty = 'auto'
      } = options;

      console.log(`[QuizService] Generating quiz for conversation ${conversationId}`);

      // Get conversation messages (last 20 for context)
      const allMessages = await conversationService.allMessages(conversationId);
      const messages = allMessages.slice(-20);
      
      if (messages.length < 3) {
        throw new Error('Not enough conversation context to generate quiz');
      }

      // Extract topic from conversation
      const topic = await this.extractTopic(messages);
      console.log(`[QuizService] Extracted topic: ${topic}`);

      // Build context for AI
      const conversationContext = messages
        .map((m: any) => `${m.role === 'user' ? 'User' : 'AI'}: ${m.content}`)
        .join('\n\n');

      // Generate questions using AI
      const { questions, tokensUsed } = await this.generateQuestionsWithAI(
        conversationContext,
        topic,
        questionCount,
        questionTypes,
        difficulty
      );

      // Create quiz session
      const quizSession = await prisma.quizSession.create({
        data: {
          conversationId,
          userId,
          topic,
          totalQuestions: questions.length,
        }
      });

      // Save questions to database
      const savedQuestions = await Promise.all(
        questions.map(q => 
          prisma.question.create({
            data: {
              questionText: q.questionText,
              questionType: q.questionType,
              difficulty: q.difficulty,
              points: q.points,
              options: q.options ? JSON.stringify(q.options) : null,
              correctAnswer: q.correctAnswer || null,
              explanation: q.explanation || null,
              generatedBy: 'ai',
              aiModel: 'qwen2.5:7b',
              inChat: true,
              conversationId,
              quizSessionId: quizSession.id,
            }
          })
        )
      );

      console.log(`[QuizService] ✅ Generated ${savedQuestions.length} questions`);

      // Create a message in the conversation to display the quiz
      const messageCount = await prisma.conversationMessage.count({
        where: { conversationId }
      });

      await prisma.conversationMessage.create({
        data: {
          conversationId,
          role: 'assistant',
          content: `Quiz Generated: ${topic}\n\nI've created a ${savedQuestions.length}-question quiz based on our conversation. Answer the questions below!`,
          messageType: 'quiz',
          quizSessionId: quizSession.id,
          sequenceNumber: messageCount + 1,
          model: 'qwen2.5:7b',
          tokensUsed: tokensUsed || 0,
        }
      });

      console.log(`[QuizService] ✅ Created quiz message in conversation`);

      // Return quiz without correct answers (for display)
      return {
        quizSessionId: quizSession.id,
        topic,
        totalQuestions: savedQuestions.length,
        questions: savedQuestions.map(q => ({
          id: q.id,
          questionText: q.questionText,
          questionType: q.questionType,
          difficulty: q.difficulty,
          options: q.options ? JSON.parse(q.options) : null,
          points: q.points,
        }))
      };
    } catch (error) {
      console.error('[QuizService] Error generating quiz:', error);
      throw error;
    }
  }

  /**
   * Submit quiz answers and calculate score
   */
  async submitQuizAnswers(
    quizSessionId: string,
    userId: string,
    answers: QuizSubmission
  ) {
    try {
      console.log(`[QuizService] Submitting answers for quiz ${quizSessionId}`);

      // Get quiz session and questions
      const quizSession = await prisma.quizSession.findUnique({
        where: { id: quizSessionId },
        include: { questions: true }
      });

      if (!quizSession) {
        throw new Error('Quiz session not found');
      }

      if (quizSession.userId !== userId) {
        throw new Error('Unauthorized: Quiz belongs to different user');
      }

      if (quizSession.completedAt) {
        throw new Error('Quiz already completed');
      }

      // Evaluate answers
      const results = await Promise.all(
        quizSession.questions.map(async (question: any) => {
          const userAnswer = answers[question.id] || '';
          const isCorrect = this.evaluateAnswer(
            question.questionType,
            userAnswer as string,
            question.correctAnswer || ''
          );

          // Save answer
          await prisma.conversationQuizAnswer.create({
            data: {
              questionId: question.id,
              quizSessionId,
              userId,
              userAnswer,
              isCorrect,
            }
          });

          return {
            questionId: question.id,
            userAnswer,
            correctAnswer: question.correctAnswer,
            isCorrect,
            explanation: question.explanation,
          };
        })
      );

      // Calculate score
      const correctCount = results.filter((r: any) => r.isCorrect).length;
      const score = Math.round((correctCount / results.length) * 100);

      // Update quiz session
      await prisma.quizSession.update({
        where: { id: quizSessionId },
        data: {
          score,
          completedAt: new Date(),
        }
      });

      console.log(`[QuizService] ✅ Quiz completed: ${score}% (${correctCount}/${results.length})`);

      return {
        quizSessionId,
        score,
        correctCount,
        totalQuestions: results.length,
        results,
      };
    } catch (error) {
      console.error('[QuizService] Error submitting quiz:', error);
      throw error;
    }
  }

  /**
   * Get quiz results
   */
  async getQuizResults(quizSessionId: string, userId: string) {
    try {
      const quizSession = await prisma.quizSession.findUnique({
        where: { id: quizSessionId },
        include: {
          questions: true,
          answers: true,
        }
      });

      if (!quizSession) {
        throw new Error('Quiz session not found');
      }

      if (quizSession.userId !== userId) {
        throw new Error('Unauthorized: Quiz belongs to different user');
      }

      // If quiz is not completed, return questions for taking the quiz
      if (!quizSession.completedAt) {
        return {
          quizSessionId: quizSession.id,
          topic: quizSession.topic,
          totalQuestions: quizSession.totalQuestions,
          questions: quizSession.questions.map((q: any) => ({
            id: q.id,
            questionText: q.questionText,
            questionType: q.questionType,
            difficulty: q.difficulty,
            options: q.options ? JSON.parse(q.options) : null,
            points: q.points,
          }))
        };
      }

      // If completed, return full results with answers
      return {
        quizSessionId: quizSession.id,
        topic: quizSession.topic,
        score: quizSession.score,
        completedAt: quizSession.completedAt,
        totalQuestions: quizSession.totalQuestions,
        totalPoints: quizSession.questions.reduce((sum: number, q: any) => sum + q.points, 0),
        questions: quizSession.questions.map((q: any) => {
          const answer = quizSession.answers.find((a: any) => a.questionId === q.id);
          return {
            id: q.id,
            questionText: q.questionText,
            questionType: q.questionType,
            difficulty: q.difficulty,
            options: q.options ? JSON.parse(q.options) : null,
            correctAnswer: q.correctAnswer,
            points: q.points,
            explanation: q.explanation,
          };
        }),
        answers: quizSession.answers.map((a: any) => ({
          questionId: a.questionId,
          userAnswer: a.userAnswer,
          isCorrect: a.isCorrect,
          timeSpent: a.timeSpent || 0,
        }))
      };
    } catch (error) {
      console.error('[QuizService] Error getting results:', error);
      throw error;
    }
  }

  /**
   * Get all quizzes for a conversation
   */
  async getConversationQuizzes(conversationId: string, userId: string) {
    try {
      const quizzes = await prisma.quizSession.findMany({
        where: {
          conversationId,
          userId,
        },
        orderBy: { createdAt: 'desc' },
      });

      return quizzes.map((q: any) => ({
        quizSessionId: q.id,
        topic: q.topic,
        totalQuestions: q.totalQuestions,
        score: q.score,
        completedAt: q.completedAt,
        createdAt: q.createdAt,
      }));
    } catch (error) {
      console.error('[QuizService] Error getting quizzes:', error);
      throw error;
    }
  }

  /**
   * Extract topic from conversation messages
   */
  private async extractTopic(messages: any[]): Promise<string> {
    // Simple extraction: look for questions in recent messages
    const recentMessages = messages.slice(-5);
    const userMessages = recentMessages.filter(m => m.role === 'user');
    
    if (userMessages.length > 0) {
      const lastUserMessage = userMessages[userMessages.length - 1].content;
      // Extract first few words as topic
      const words = lastUserMessage.split(' ').slice(0, 5).join(' ');
      return words.length > 50 ? words.substring(0, 50) + '...' : words;
    }
    
    return 'General Knowledge';
  }

  /**
   * Generate questions using AI
   */
  private async generateQuestionsWithAI(
    context: string,
    topic: string,
    count: number,
    types: string[],
    difficulty: string
  ): Promise<{ questions: QuizQuestion[], tokensUsed: number }> {
    const prompt = `Based on this conversation about "${topic}", generate ${count} quiz questions.

Conversation context:
${context.substring(0, 2000)}

Requirements:
- Question types: ${types.join(', ')}
- Difficulty: ${difficulty}
- Cover key concepts discussed
- Include detailed explanations

For each question, provide:
1. questionText: The question
2. questionType: ${types.join(' or ')}
3. difficulty: easy, medium, or hard
4. options: Array of 4 options (for MCQ and true-false)
5. correctAnswer: The correct answer (for MCQ: the option text, for true-false: "true" or "false")
6. explanation: 2-3 sentence explanation of why the answer is correct
7. points: 1 for easy, 2 for medium, 3 for hard

Return ONLY a valid JSON array of questions. No markdown, no extra text.`;

    try {
      const response = await ollamaService.generate(prompt, {
        temperature: 0.7,
        num_predict: 2000,
      });

      // Parse AI response
      let jsonText = response.response.trim();
      
      // Remove markdown code blocks if present
      jsonText = jsonText.replace(/```json\n?/g, '').replace(/```\n?/g, '');
      
      const questions = JSON.parse(jsonText);
      
      if (!Array.isArray(questions)) {
        throw new Error('AI response is not an array');
      }

      // Validate and normalize questions
      const normalizedQuestions = questions.slice(0, count).map((q: any, index: number) => ({
        questionText: q.questionText || q.question || `Question ${index + 1}`,
        questionType: types.includes(q.questionType) ? q.questionType : types[0],
        difficulty: ['easy', 'medium', 'hard'].includes(q.difficulty) ? q.difficulty : 'medium',
        options: q.options || (q.questionType === 'true-false' ? ['True', 'False'] : undefined),
        correctAnswer: q.correctAnswer || q.answer,
        explanation: q.explanation || 'No explanation provided.',
        points: q.points || (q.difficulty === 'hard' ? 3 : q.difficulty === 'easy' ? 1 : 2),
      }));

      // Calculate tokens used (from ollama response wrapper)
      const tokensUsed = response.totalTokens || ((response.promptTokens || 0) + (response.completionTokens || 0));
      console.log(`[QuizService] Tokens used for quiz generation: ${tokensUsed}`);

      return { questions: normalizedQuestions, tokensUsed };
    } catch (error) {
      console.error('[QuizService] Error parsing AI response:', error);
      // Fallback: generate simple questions
      const fallbackQuestions = this.generateFallbackQuestions(topic, count);
      return { questions: fallbackQuestions, tokensUsed: 0 };
    }
  }

  /**
   * Fallback question generation if AI fails
   */
  private generateFallbackQuestions(topic: string, count: number): QuizQuestion[] {
    return Array.from({ length: count }, (_, i) => ({
      questionText: `What did you learn about ${topic}?`,
      questionType: 'short-answer',
      difficulty: 'medium',
      correctAnswer: '',
      explanation: 'Describe the key concepts discussed.',
      points: 2,
    }));
  }

  /**
   * Evaluate if an answer is correct
   */
  private evaluateAnswer(questionType: string, userAnswer: string, correctAnswer: string): boolean {
    if (!userAnswer) return false;

    const normalize = (str: string) => str.toLowerCase().trim();

    switch (questionType) {
      case 'mcq':
      case 'true-false':
        return normalize(userAnswer) === normalize(correctAnswer);
      
      case 'short-answer':
        // Simple keyword matching (can be improved with AI)
        const keywords = normalize(correctAnswer).split(' ');
        const answer = normalize(userAnswer);
        return keywords.some(keyword => answer.includes(keyword));
      
      default:
        return false;
    }
  }
}

export const quizService = new QuizService();
