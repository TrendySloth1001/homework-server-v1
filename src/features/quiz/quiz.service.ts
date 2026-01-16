/**
 * Quiz Service
 * Generates and manages in-chat quizzes based on conversation context
 */

import { prisma } from '../../shared/lib/prisma';
import { ollamaService } from '../../shared/lib/ollama';
import { conversationService } from '../ai/conversation.service';
import { createNotificationService } from '../notifications/notifications.service';
import { addAIJob } from '../../shared/queues/ai.queue';

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

      // Get previous questions to avoid duplicates
      const previousQuestions = await this.getPreviousQuestions(conversationId);
      const previousQuestionsContext = previousQuestions.length > 0
        ? `\n\nPreviously asked questions (DO NOT repeat or ask similar questions):\n${previousQuestions.map((q, i) => `${i + 1}. ${q}`).join('\n')}\n`
        : '';

      // Generate questions using AI
      const { questions, tokensUsed } = await this.generateQuestionsWithAI(
        conversationContext + previousQuestionsContext,
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

      // Queue quiz generation with lower priority (5) - chat messages served first
      await addAIJob(
        {
          type: 'quiz-generation',
          quizSessionId: quizSession.id,
          conversationId,
          userId,
          topic
        } as any,
        5 // Lower priority for background task
      );

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

      // Get conversation to find user for notification
      const conversation = await prisma.conversation.findUnique({
        where: { id: conversationId },
        select: { teacherId: true, userId: true, studentId: true }
      });

      const notificationUserId = conversation?.userId || conversation?.teacherId || conversation?.studentId;

      // Fire notification if user exists
      if (notificationUserId) {
        try {
          console.log('[QuizService] Creating notification for user:', notificationUserId);
          const notification = await createNotificationService({
            userId: notificationUserId,
            title: 'Quiz Ready!',
            message: `Your ${topic} quiz with ${savedQuestions.length} questions is ready`,
            type: 'success',
            actionLabel: 'take Quiz',
            actionLink: `/messages/${conversationId}`
          });
          console.log('[QuizService] ✅ Notification created successfully:', notification.id);
        } catch (error: any) {
          console.error('[QuizService] ❌ Failed to create notification:', error);
          console.error('[QuizService] Error details:', {
            userId: notificationUserId,
            errorMessage: error.message,
            errorStack: error.stack
          });
          // Don't fail the whole operation if notification fails
        }
      } else {
        console.warn('[QuizService] ⚠️ No userId found, skipping notification');
      }

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
   * Get quiz history summary for AI context
   * Returns completed quizzes with scores and question texts for context
   */
  async getQuizHistoryForAI(conversationId: string): Promise<string> {
    try {
      const quizzes = await prisma.quizSession.findMany({
        where: {
          conversationId,
          completedAt: { not: null }, // Only completed quizzes
        },
        include: {
          questions: {
            select: {
              questionText: true,
              questionType: true,
              difficulty: true,
              points: true,
            }
          },
          answers: {
            select: {
              isCorrect: true,
              userAnswer: true,
              question: {
                select: {
                  questionText: true,
                  difficulty: true,
                  correctAnswer: true,
                }
              }
            }
          }
        },
        orderBy: { createdAt: 'desc' },
        take: 10, // Last 10 quizzes for better trend analysis
      });

      if (quizzes.length === 0) {
        return '';
      }

      // Calculate overall statistics
      const totalQuizzes = quizzes.length;
      const totalCorrect = quizzes.reduce((sum, q) => sum + q.answers.filter((a: any) => a.isCorrect).length, 0);
      const totalQuestions = quizzes.reduce((sum, q) => sum + q.totalQuestions, 0);
      const averageScore = quizzes.reduce((sum, q) => sum + (q.score || 0), 0) / totalQuizzes;
      const accuracyRate = Math.round((totalCorrect / totalQuestions) * 100);

      // Performance trend (last 5 vs first 5)
      const recentScores = quizzes.slice(0, Math.min(5, totalQuizzes)).map(q => q.score || 0);
      const olderScores = quizzes.slice(-Math.min(5, totalQuizzes)).map(q => q.score || 0);
      const recentAvg = recentScores.reduce((a, b) => a + b, 0) / recentScores.length;
      const olderAvg = olderScores.reduce((a, b) => a + b, 0) / olderScores.length;
      const trend = recentAvg > olderAvg + 5 ? '📈 Improving' : recentAvg < olderAvg - 5 ? '📉 Declining' : '➡️ Stable';

      // Difficulty breakdown
      const difficultyStats: Record<string, { correct: number; total: number }> = {};
      quizzes.forEach(quiz => {
        quiz.answers.forEach((a: any) => {
          const diff = a.question?.difficulty || 'unknown';
          if (!difficultyStats[diff]) difficultyStats[diff] = { correct: 0, total: 0 };
          difficultyStats[diff].total++;
          if (a.isCorrect) difficultyStats[diff].correct++;
        });
      });

      const difficultyBreakdown = Object.entries(difficultyStats)
        .map(([diff, stats]) => {
          const percent = Math.round((stats.correct / stats.total) * 100);
          return `    ${diff}: ${percent}% (${stats.correct}/${stats.total})`;
        })
        .join('\n');

      // Detailed quiz summaries (last 5 only)
      const quizSummaries = quizzes.slice(0, 5).map((quiz: any, idx: number) => {
        const correctCount = quiz.answers.filter((a: any) => a.isCorrect).length;
        const totalQuestions = quiz.totalQuestions;
        const score = quiz.score || 0;
        const date = new Date(quiz.createdAt).toLocaleDateString();

        // Show wrong answers with corrections
        const wrongAnswers = quiz.answers
          .filter((a: any) => !a.isCorrect)
          .slice(0, 3) // Max 3 wrong answers per quiz
          .map((a: any) =>
            `      ❌ ${a.question?.questionText}\n         Your answer: ${a.userAnswer}\n         Correct: ${a.question?.correctAnswer}`
          )
          .join('\n');

        return `  ${idx + 1}. Quiz: "${quiz.topic}" (${date})\n     Score: ${score}% (${correctCount}/${totalQuestions} correct)${wrongAnswers ? '\n     Mistakes:\n' + wrongAnswers : ''}`;
      }).join('\n\n');

      return `\n\n╔══════════════════════════════════════════════════════════════╗\n║              COMPREHENSIVE QUIZ PERFORMANCE DATA             ║\n╚══════════════════════════════════════════════════════════════╝\n\n📊 OVERALL STATISTICS:\n  • Total Quizzes Taken: ${totalQuizzes}\n  • Total Questions Answered: ${totalQuestions}\n  • Overall Accuracy: ${accuracyRate}%\n  • Average Score: ${Math.round(averageScore)}%\n  • Performance Trend: ${trend}\n\n📈 DIFFICULTY BREAKDOWN:\n${difficultyBreakdown}\n\n📝 RECENT QUIZ HISTORY (Last 5):\n${quizSummaries}\n\n⚠️ CRITICAL INSTRUCTIONS FOR YOU:\n1. When asked about quiz performance, scores, or progress - YOU HAVE THIS EXACT DATA\n2. DO NOT say "I can't see your scores" or "I don't have access" - YOU DO!\n3. Reference specific numbers: "You've taken ${totalQuizzes} quizzes with ${accuracyRate}% accuracy"\n4. Mention the trend: "Your performance is ${trend.toLowerCase()}"\n5. Point out patterns: strengths in ${Object.entries(difficultyStats).sort((a, b) => (b[1].correct / b[1].total) - (a[1].correct / a[1].total))[0]?.[0] || 'certain areas'} difficulty\n6. For recent mistakes, give targeted advice based on the wrong answers shown above\n\n════════════════════════════════════════════════════════════════\n`;
    } catch (error) {
      console.error('[QuizService] Error getting quiz history:', error);
      return '';
    }
  }

  /**
   * Get all previous quiz questions for duplicate detection
   */
  async getPreviousQuestions(conversationId: string): Promise<string[]> {
    try {
      const questions = await prisma.question.findMany({
        where: {
          conversationId,
        },
        select: {
          questionText: true,
        }
      });

      return questions.map(q => q.questionText);
    } catch (error) {
      console.error('[QuizService] Error getting previous questions:', error);
      return [];
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
