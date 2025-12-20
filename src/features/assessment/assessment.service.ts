/**
 * Assessment Service Layer
 * Business logic for mathematical answer grading
 */

import { prisma } from '../../shared/lib/prisma';
import { NotFoundError, ValidationError } from '../../shared/lib/errors';
import { cacheService, CacheKeys } from '../../shared/lib/cache';
import { gradeAnswer } from './grading-engine';
import type { GradeAnswerInput, GradingResult, GetAnswersQuery, AnswerHistory } from './assessment.types';

/**
 * Grade a student's answer using mathematical algorithms
 */
export async function gradeAnswerService(input: GradeAnswerInput): Promise<any> {
  const { questionId, studentAnswer, selectedOption, studentId, teacherId } = input;
  
  // Validate inputs
  if (!questionId || !studentId || !teacherId) {
    throw new ValidationError('Missing required fields: questionId, studentId, teacherId');
  }
  
  if (!studentAnswer && !selectedOption) {
    throw new ValidationError('Either studentAnswer or selectedOption must be provided');
  }
  
  // Get question with topic info for keywords
  const question = await prisma.question.findUnique({
    where: { id: questionId },
    include: {
      topic: {
        select: {
          topicName: true,
          keywords: true
        }
      }
    }
  });
  
  if (!question) {
    throw new NotFoundError('Question', questionId);
  }
  
  // Determine answer text based on question type
  let answerText: string;
  if (question.questionType === 'mcq' || question.questionType === 'true-false') {
    answerText = selectedOption || studentAnswer;
  } else {
    answerText = studentAnswer;
  }
  
  // Enrich question with topic keywords if not present
  const questionWithKeywords = {
    ...question,
    keywords: question.topic.keywords || undefined
  };
  
  // Grade the answer using consolidated grading engine
  const result: GradingResult = gradeAnswer(answerText, questionWithKeywords);
  
  // Save to database
  const savedAnswer = await prisma.studentAnswer.create({
    data: {
      questionId,
      studentId,
      teacherId,
      studentAnswer: answerText,
      ...(selectedOption ? { selectedOption } : {}),
      score: result.score,
      maxScore: result.maxScore,
      isCorrect: result.isCorrect,
      correctnessLevel: result.correctnessLevel,
      gradingMethod: result.gradingMethod,
      confidence: result.confidence,
      feedback: result.feedback
    }
  });
  
  // Invalidate cache
  await cacheService.delete(CacheKeys.questionsByTopic(question.topicId, ''));
  
  // Return enriched response with question details (frontend-friendly)
  return {
    answerId: savedAnswer.id,
    studentAnswer: answerText,
    selectedOption: selectedOption || null,
    score: result.score,
    maxScore: result.maxScore,
    percentage: result.percentage,
    isCorrect: result.isCorrect,
    correctnessLevel: result.correctnessLevel,
    feedback: result.feedback,
    confidence: result.confidence,
    gradingMethod: result.gradingMethod,
    breakdown: result.breakdown,
    submittedAt: savedAnswer.submittedAt,
    studentId,
    teacherId,
    // Include question context for frontend display
    question: {
      id: question.id,
      questionText: question.questionText,
      questionType: question.questionType,
      difficulty: question.difficulty,
      points: question.points,
      topicName: question.topic.topicName,
      explanation: question.explanation || undefined
    }
  };
}

/**
 * Get answer history with advanced filtering and sorting (frontend-optimized)
 */
export async function getAnswerHistoryService(query: GetAnswersQuery): Promise<AnswerHistory> {
  const { 
    questionId, 
    studentId, 
    teacherId, 
    page = 1, 
    limit = 20,
    sortBy = 'submittedAt',
    sortOrder = 'desc',
    minScore,
    maxScore,
    correctnessLevel,
    questionType
  } = query;
  
  const skip = (page - 1) * limit;
  
  // Build where clause with filters
  const where: any = {};
  if (questionId) where.questionId = questionId;
  if (studentId) where.studentId = studentId;
  if (teacherId) where.teacherId = teacherId;
  if (correctnessLevel) where.correctnessLevel = correctnessLevel;
  
  // Score range filtering
  if (minScore !== undefined || maxScore !== undefined) {
    where.score = {};
    if (minScore !== undefined) where.score.gte = minScore;
    if (maxScore !== undefined) where.score.lte = maxScore;
  }
  
  // Filter by question type if specified
  if (questionType) {
    where.question = {
      questionType
    };
  }
  
  // Dynamic sorting
  const orderBy: any = {};
  orderBy[sortBy] = sortOrder;
  
  const [answers, total] = await Promise.all([
    prisma.studentAnswer.findMany({
      where,
      skip,
      take: limit,
      orderBy,
      include: {
        question: {
          select: {
            questionText: true,
            questionType: true,
            difficulty: true,
            points: true,
            topic: {
              select: {
                topicName: true
              }
            }
          }
        }
      }
    }),
    prisma.studentAnswer.count({ where })
  ]);
  
  // Enrich answers with calculated percentage
  const enrichedAnswers = answers.map(answer => ({
    ...answer,
    percentage: (answer.score / answer.maxScore) * 100,
    question: {
      ...answer.question,
      topicName: answer.question.topic.topicName
    }
  }));
  
  const totalPages = Math.ceil(total / limit);
  
  return {
    answers: enrichedAnswers as any,
    total,
    page,
    limit,
    totalPages,
    hasNextPage: page < totalPages,
    hasPrevPage: page > 1
  };
}

/**
 * Get single answer with full details (frontend-optimized)
 */
export async function getAnswerService(questionId: string, studentId: string) {
  const answer = await prisma.studentAnswer.findFirst({
    where: {
      questionId,
      studentId
    },
    include: {
      question: {
        select: {
          id: true,
          questionText: true,
          questionType: true,
          difficulty: true,
          points: true,
          options: true,
          correctAnswer: true,
          explanation: true,
          topic: {
            select: {
              topicName: true,
              description: true,
              unit: {
                select: {
                  title: true,
                  syllabus: {
                    select: {
                      subjectName: true,
                      className: true
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  });
  
  if (!answer) {
    throw new NotFoundError('StudentAnswer', `questionId: ${questionId}, studentId: ${studentId}`);
  }
  
  // Calculate percentage
  const percentage = (answer.score / answer.maxScore) * 100;
  
  return {
    ...answer,
    percentage,
    question: {
      ...answer.question,
      topic: undefined, // Remove nested topic
      topicName: answer.question.topic.topicName,
      topicDescription: answer.question.topic.description,
      unitTitle: answer.question.topic.unit.title,
      subjectName: answer.question.topic.unit.syllabus.subjectName,
      className: answer.question.topic.unit.syllabus.className
    }
  };
}

/**
 * Get comprehensive student performance summary (frontend-optimized)
 */
export async function getStudentPerformanceService(studentId: string, teacherId?: string) {
  const where: any = { studentId };
  if (teacherId) where.teacherId = teacherId;
  
  const answers = await prisma.studentAnswer.findMany({
    where,
    orderBy: { submittedAt: 'desc' },
    include: {
      question: {
        select: {
          id: true,
          questionText: true,
          questionType: true,
          difficulty: true,
          points: true,
          topicId: true,
          topic: {
            select: {
              topicName: true
            }
          }
        }
      }
    }
  });
  
  if (answers.length === 0) {
    return {
      studentId,
      teacherId,
      totalAttempts: 0,
      averageScore: 0,
      averagePercentage: 0,
      averageConfidence: 0,
      correctCount: 0,
      partialCorrectCount: 0,
      incorrectCount: 0,
      byQuestionType: {},
      byDifficulty: {},
      byCorrectness: {},
      byTopic: {},
      recentAnswers: [],
      improvementTrend: []
    };
  }
  
  // Calculate statistics
  const totalScore = answers.reduce((sum, a) => sum + a.score, 0);
  const totalMaxScore = answers.reduce((sum, a) => sum + a.maxScore, 0);
  const totalConfidence = answers.reduce((sum, a) => sum + (a.confidence || 0), 0);
  const correctCount = answers.filter(a => a.isCorrect).length;
  const partialCorrectCount = answers.filter(a => a.correctnessLevel === 'partial' || a.correctnessLevel === 'good').length;
  const incorrectCount = answers.filter(a => !a.isCorrect).length;
  
  // Group by question type, difficulty, and topic
  const byQuestionType: any = {};
  const byDifficulty: any = {};
  const byTopic: any = {};
  const byCorrectness: any = {
    excellent: 0,
    good: 0,
    partial: 0,
    incorrect: 0
  };
  
  answers.forEach(answer => {
    const qType = answer.question.questionType;
    const difficulty = answer.question.difficulty;
    const topicId = answer.question.topicId;
    const topicName = answer.question.topic.topicName;
    const level = answer.correctnessLevel || 'incorrect';
    const percentage = (answer.score / answer.maxScore) * 100;
    
    // By question type
    if (!byQuestionType[qType]) {
      byQuestionType[qType] = { count: 0, correctCount: 0, averageScore: 0, averagePercentage: 0 };
    }
    byQuestionType[qType].count++;
    if (answer.isCorrect) byQuestionType[qType].correctCount++;
    byQuestionType[qType].averageScore += answer.score;
    byQuestionType[qType].averagePercentage += percentage;
    
    // By difficulty
    if (!byDifficulty[difficulty]) {
      byDifficulty[difficulty] = { count: 0, correctCount: 0, averageScore: 0, averagePercentage: 0 };
    }
    byDifficulty[difficulty].count++;
    if (answer.isCorrect) byDifficulty[difficulty].correctCount++;
    byDifficulty[difficulty].averageScore += answer.score;
    byDifficulty[difficulty].averagePercentage += percentage;
    
    // By topic
    if (!byTopic[topicId]) {
      byTopic[topicId] = { 
        topicName,
        count: 0, 
        correctCount: 0, 
        averageScore: 0, 
        averagePercentage: 0 
      };
    }
    byTopic[topicId].count++;
    if (answer.isCorrect) byTopic[topicId].correctCount++;
    byTopic[topicId].averageScore += answer.score;
    byTopic[topicId].averagePercentage += percentage;
    
    byCorrectness[level]++;
  });
  
  // Calculate averages for all groups
  Object.keys(byQuestionType).forEach(key => {
    byQuestionType[key].averageScore = Math.round((byQuestionType[key].averageScore / byQuestionType[key].count) * 100) / 100;
    byQuestionType[key].averagePercentage = Math.round((byQuestionType[key].averagePercentage / byQuestionType[key].count) * 10) / 10;
  });
  
  Object.keys(byDifficulty).forEach(key => {
    byDifficulty[key].averageScore = Math.round((byDifficulty[key].averageScore / byDifficulty[key].count) * 100) / 100;
    byDifficulty[key].averagePercentage = Math.round((byDifficulty[key].averagePercentage / byDifficulty[key].count) * 10) / 10;
  });
  
  Object.keys(byTopic).forEach(key => {
    byTopic[key].averageScore = Math.round((byTopic[key].averageScore / byTopic[key].count) * 100) / 100;
    byTopic[key].averagePercentage = Math.round((byTopic[key].averagePercentage / byTopic[key].count) * 10) / 10;
  });
  
  // Calculate improvement trend (last 30 days grouped by week)
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  
  const recentAnswersForTrend = answers.filter(a => a.submittedAt >= thirtyDaysAgo);
  const trendData: any[] = [];
  
  if (recentAnswersForTrend.length > 0) {
    // Group by week
    const weekGroups: Record<string, { scores: number[]; count: number }> = {};
    recentAnswersForTrend.forEach(answer => {
      const weekStart = new Date(answer.submittedAt);
      weekStart.setDate(weekStart.getDate() - weekStart.getDay()); // Start of week
      const weekKey = weekStart.toISOString().split('T')[0] || 'unknown';
      
      if (!weekGroups[weekKey]) {
        weekGroups[weekKey] = { scores: [], count: 0 };
      }
      weekGroups[weekKey].scores.push((answer.score / answer.maxScore) * 100);
      weekGroups[weekKey].count++;
    });
    
    Object.keys(weekGroups).sort().forEach(date => {
      const weekData = weekGroups[date];
      if (!weekData) return;
      const scores = weekData.scores;
      const avg = scores.reduce((sum: number, s: number) => sum + s, 0) / scores.length;
      trendData.push({
        date,
        averageScore: Math.round(avg * 10) / 10,
        count: weekData.count
      });
    });
  }
  
  // Get recent answers with question details (limit to 10 most recent)
  const recentAnswers = answers.slice(0, 10).map(answer => ({
    id: answer.id,
    questionId: answer.questionId,
    studentAnswer: answer.studentAnswer,
    score: answer.score,
    maxScore: answer.maxScore,
    percentage: Math.round((answer.score / answer.maxScore) * 100 * 10) / 10,
    isCorrect: answer.isCorrect,
    correctnessLevel: answer.correctnessLevel,
    submittedAt: answer.submittedAt,
    question: {
      questionText: answer.question.questionText,
      questionType: answer.question.questionType,
      difficulty: answer.question.difficulty,
      topicName: answer.question.topic.topicName
    }
  }));
  
  return {
    studentId,
    ...(teacherId ? { teacherId } : {}),
    totalAttempts: answers.length,
    averageScore: Math.round((totalScore / totalMaxScore) * 100) / 100,
    averagePercentage: Math.round((totalScore / totalMaxScore) * 100 * 10) / 10,
    averageConfidence: Math.round((totalConfidence / answers.length) * 100) / 100,
    correctCount,
    partialCorrectCount,
    incorrectCount,
    correctPercentage: Math.round((correctCount / answers.length) * 100 * 10) / 10,
    byQuestionType,
    byDifficulty,
    byCorrectness,
    byTopic,
    recentAnswers,
    improvementTrend: trendData
  };
}

/**
 * Regrade an answer (useful if question updated or manual review needed)
 */
export async function regradeAnswerService(questionId: string, studentId: string) {
  const existingAnswer = await prisma.studentAnswer.findFirst({
    where: {
      questionId,
      studentId
    },
    include: {
      question: {
        include: {
          topic: {
            select: {
              keywords: true,
              topicName: true
            }
          }
        }
      }
    }
  });
  
  if (!existingAnswer) {
    throw new NotFoundError('StudentAnswer', `questionId: ${questionId}, studentId: ${studentId}`);
  }
  
  // Enrich question with topic keywords
  const questionWithKeywords = {
    ...existingAnswer.question,
    keywords: existingAnswer.question.topic.keywords || undefined
  };
  
  // Regrade using consolidated grading engine
  const result = gradeAnswer(existingAnswer.studentAnswer, questionWithKeywords);
  
  // Update database
  const updated = await prisma.studentAnswer.update({
    where: { id: existingAnswer.id },
    data: {
      score: result.score,
      maxScore: result.maxScore,
      isCorrect: result.isCorrect,
      correctnessLevel: result.correctnessLevel,
      confidence: result.confidence,
      feedback: result.feedback,
      gradingMethod: result.gradingMethod
    }
  });
  
  return {
    answerId: updated.id,
    previousScore: existingAnswer.score,
    newScore: result.score,
    previousCorrectness: existingAnswer.correctnessLevel,
    newCorrectness: result.correctnessLevel,
    scoreDifference: result.score - existingAnswer.score,
    improved: result.score > existingAnswer.score,
    ...result
  };
}

/**
 * Get all answers for a specific question (for teacher review)
 */
export async function getQuestionAnswersService(questionId: string, teacherId?: string) {
  // Verify question exists
  const question = await prisma.question.findUnique({
    where: { id: questionId },
    select: {
      id: true,
      questionText: true,
      questionType: true,
      difficulty: true,
      correctAnswer: true,
      explanation: true,
      topic: {
        select: {
          topicName: true
        }
      }
    }
  });
  
  if (!question) {
    throw new NotFoundError('Question', questionId);
  }
  
  const where: any = { questionId };
  if (teacherId) where.teacherId = teacherId;
  
  const answers = await prisma.studentAnswer.findMany({
    where,
    orderBy: { submittedAt: 'desc' },
    select: {
      id: true,
      studentId: true,
      teacherId: true,
      studentAnswer: true,
      selectedOption: true,
      score: true,
      maxScore: true,
      isCorrect: true,
      correctnessLevel: true,
      gradingMethod: true,
      confidence: true,
      feedback: true,
      submittedAt: true
    }
  });
  
  // Calculate statistics
  const totalAttempts = answers.length;
  const correctCount = answers.filter(a => a.isCorrect).length;
  const averageScore = totalAttempts > 0 
    ? answers.reduce((sum, a) => sum + a.score, 0) / totalAttempts 
    : 0;
  const averagePercentage = totalAttempts > 0
    ? answers.reduce((sum, a) => sum + (a.score / a.maxScore) * 100, 0) / totalAttempts
    : 0;
  
  // Group by correctness level
  const byCorrectness: any = {
    excellent: 0,
    good: 0,
    partial: 0,
    incorrect: 0
  };
  answers.forEach(a => {
    const level = a.correctnessLevel || 'incorrect';
    byCorrectness[level]++;
  });
  
  // Enrich answers with percentage
  const enrichedAnswers = answers.map(answer => ({
    ...answer,
    percentage: Math.round((answer.score / answer.maxScore) * 100 * 10) / 10
  }));
  
  return {
    question: {
      ...question,
      topicName: question.topic.topicName
    },
    statistics: {
      totalAttempts,
      correctCount,
      incorrectCount: totalAttempts - correctCount,
      correctPercentage: totalAttempts > 0 ? Math.round((correctCount / totalAttempts) * 100 * 10) / 10 : 0,
      averageScore: Math.round(averageScore * 100) / 100,
      averagePercentage: Math.round(averagePercentage * 10) / 10,
      byCorrectness
    },
    answers: enrichedAnswers
  };
}

/**
 * Get assessment statistics for teacher dashboard
 */
export async function getAssessmentStatsService(teacherId: string) {
  const answers = await prisma.studentAnswer.findMany({
    where: { teacherId },
    include: {
      question: {
        select: {
          questionType: true,
          difficulty: true,
          topicId: true,
          topic: {
            select: {
              topicName: true
            }
          }
        }
      }
    }
  });
  
  if (answers.length === 0) {
    return {
      teacherId,
      totalAttempts: 0,
      uniqueStudents: 0,
      uniqueQuestions: 0,
      averageScore: 0,
      averagePercentage: 0,
      byQuestionType: {},
      byDifficulty: {},
      recentActivity: []
    };
  }
  
  // Calculate overall stats
  const uniqueStudents = new Set(answers.map(a => a.studentId)).size;
  const uniqueQuestions = new Set(answers.map(a => a.questionId)).size;
  const totalScore = answers.reduce((sum, a) => sum + a.score, 0);
  const totalMaxScore = answers.reduce((sum, a) => sum + a.maxScore, 0);
  
  // Group by question type and difficulty
  const byQuestionType: any = {};
  const byDifficulty: any = {};
  
  answers.forEach(answer => {
    const qType = answer.question.questionType;
    const difficulty = answer.question.difficulty;
    const percentage = (answer.score / answer.maxScore) * 100;
    
    if (!byQuestionType[qType]) {
      byQuestionType[qType] = { count: 0, averagePercentage: 0 };
    }
    byQuestionType[qType].count++;
    byQuestionType[qType].averagePercentage += percentage;
    
    if (!byDifficulty[difficulty]) {
      byDifficulty[difficulty] = { count: 0, averagePercentage: 0 };
    }
    byDifficulty[difficulty].count++;
    byDifficulty[difficulty].averagePercentage += percentage;
  });
  
  // Calculate averages
  Object.keys(byQuestionType).forEach(key => {
    byQuestionType[key].averagePercentage = Math.round((byQuestionType[key].averagePercentage / byQuestionType[key].count) * 10) / 10;
  });
  
  Object.keys(byDifficulty).forEach(key => {
    byDifficulty[key].averagePercentage = Math.round((byDifficulty[key].averagePercentage / byDifficulty[key].count) * 10) / 10;
  });
  
  // Recent activity (last 10)
  const recentActivity = answers
    .sort((a, b) => b.submittedAt.getTime() - a.submittedAt.getTime())
    .slice(0, 10)
    .map(answer => ({
      studentId: answer.studentId,
      questionId: answer.questionId,
      topicName: answer.question.topic.topicName,
      score: answer.score,
      maxScore: answer.maxScore,
      percentage: Math.round((answer.score / answer.maxScore) * 100 * 10) / 10,
      isCorrect: answer.isCorrect,
      submittedAt: answer.submittedAt
    }));
  
  return {
    teacherId,
    totalAttempts: answers.length,
    uniqueStudents,
    uniqueQuestions,
    averageScore: Math.round((totalScore / totalMaxScore) * 100) / 100,
    averagePercentage: Math.round((totalScore / totalMaxScore) * 100 * 10) / 10,
    byQuestionType,
    byDifficulty,
    recentActivity
  };
}
