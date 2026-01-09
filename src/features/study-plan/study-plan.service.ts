import { prisma } from '../../shared/lib/prisma';
import { ollamaService } from '../../shared/lib/ollama';
import { ValidationError } from '../../shared/lib/errors';
import { createNotificationService } from '../notifications/notifications.service';
import { addAIJob } from '../../shared/queues/ai.queue';

export class StudyPlanService {
  
  /**
   * Generate study plan (async via queue)
   */
  async generateStudyPlan(conversationId: string, subject: string, goal: string) {
    if (!conversationId || !subject || !goal) {
      throw new ValidationError('conversationId, subject, and goal are required');
    }

    // Check if there's already a plan being generated for the same subject/goal
    const existingGenerating = await prisma.studyPlan.findFirst({
      where: {
        conversationId,
        subject,
        goal,
        status: 'generating'
      }
    });
    
    if (existingGenerating) {
      return { 
        id: existingGenerating.id, 
        status: existingGenerating.status,
        content: null,
        message: 'A plan with the same subject and goal is already being generated'
      };
    }
    
    // Get user from conversation
    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
      select: { userId: true, teacherId: true, studentId: true }
    });
    
    const userId = conversation?.userId || conversation?.teacherId || conversation?.studentId;
    
    // Create placeholder record (allows multiple plans per conversation)
    const plan = await prisma.studyPlan.create({
      data: {
        conversationId,
        subject,
        goal,
        status: 'generating'
      }
    });
    
    // Queue the generation job with lower priority (5) since it's a background task
    await addAIJob(
      {
        type: 'study-plan-generation',
        planId: plan.id,
        conversationId,
        subject,
        goal,
        userId
      } as any,
      5 // Lower priority - chat messages are served first
    );
    
    return {
      id: plan.id,
      status: 'generating',
      message: 'Study plan generation started'
    };
  }
  
  /**
   * Process generation (queue worker calls this)
   */
  async processGeneration(planId: string) {
    const startTime = Date.now();
    
    try {
      const plan = await prisma.studyPlan.findUnique({
        where: { id: planId }
      });

      if (!plan) {
        throw new Error(`Study plan ${planId} not found`);
      }
      
      // Skip if already completed or failed (prevents duplicate execution)
      if (plan.status === 'completed') {
        console.log('[StudyPlan] Plan already completed, skipping generation');
        return { success: true, message: 'Plan already completed' };
      }
      
      if (plan.status === 'failed') {
        console.log('[StudyPlan] Plan previously failed, skipping');
        return { success: false, message: 'Plan previously failed' };
      }

      // AI prompt to generate study plan
      const prompt = this.buildGenerationPrompt(plan.subject, plan.goal);
      
      console.log('[StudyPlan] Generating plan with AI...');
      
      const aiResponse = await ollamaService.generate(prompt, {
        temperature: 0.3,
        num_predict: 8000  // Large output for detailed plan
      }, 'deepseek-r1:14b');
      
      console.log('[StudyPlan] AI response token usage:', {
        promptTokens: aiResponse.promptTokens,
        completionTokens: aiResponse.completionTokens,
        totalTokens: aiResponse.totalTokens
      });
      
      // Clean response (remove markdown code blocks if present)
      let cleanedResponse = aiResponse.response.trim();
      if (cleanedResponse.startsWith('```json')) {
        cleanedResponse = cleanedResponse.replace(/```json\n?/, '').replace(/```$/, '').trim();
      } else if (cleanedResponse.startsWith('```')) {
        cleanedResponse = cleanedResponse.replace(/```\n?/, '').replace(/```$/, '').trim();
      }
      
      // Parse AI response
      const content = JSON.parse(cleanedResponse);
      
      // Update database
      const updated = await prisma.studyPlan.update({
        where: { id: planId },
        data: {
          content,
          status: 'completed',
          modelUsed: 'deepseek-r1:14b',
          generationTime: Math.floor((Date.now() - startTime) / 1000)
        }
      });
      
      // Check if message already exists for this study plan
      const existingMessage = await prisma.conversationMessage.findFirst({
        where: {
          studyPlanId: planId,
          messageType: 'study-plan'
        }
      });
      
      // Only create message if it doesn't exist
      if (!existingMessage) {
        // Create a message in the conversation to display the study plan
        const messageCount = await prisma.conversationMessage.count({
          where: { conversationId: plan.conversationId }
        });

        await prisma.conversationMessage.create({
          data: {
            conversationId: plan.conversationId,
            role: 'assistant',
            content: `Study Plan Generated: ${plan.subject}\n\nI've created a personalized study plan to help you ${plan.goal}. Follow the phases and modules below!`,
            messageType: 'study-plan',
            studyPlanId: planId,
            sequenceNumber: messageCount + 1,
            model: 'deepseek-r1:14b',
            tokensUsed: aiResponse.totalTokens,
          }
        });

        console.log('[StudyPlan] ✅ Created study plan message in conversation');
      } else {
        console.log('[StudyPlan] ℹ️ Message already exists for this study plan, skipping creation');
      }
      
      // Get conversation to find user for notification
      const conversation = await prisma.conversation.findUnique({
        where: { id: plan.conversationId },
        select: { teacherId: true, userId: true, studentId: true }
      });
      
      const userId = conversation?.userId || conversation?.teacherId || conversation?.studentId;
      
      // Fire notification if user exists
      if (userId) {
        try {
          console.log('[StudyPlan] Creating notification for user:', userId);
          const notification = await createNotificationService({
            userId,
            title: 'Study Plan Ready!',
            message: `Your ${plan.subject} study plan is ready to view`
          });
          console.log('[StudyPlan] ✅ Notification created successfully:', notification.id);
        } catch (error: any) {
          console.error('[StudyPlan] ❌ Failed to create notification:', error);
          console.error('[StudyPlan] Error details:', {
            userId,
            errorMessage: error.message,
            errorStack: error.stack
          });
          // Don't fail the whole operation if notification fails
        }
      } else {
        console.warn('[StudyPlan] ⚠️ No userId found, skipping notification');
      }
      
      console.log('[StudyPlan] Generation completed successfully');
      
      return { success: true, planId, content: updated.content };
      
    } catch (error: any) {
      console.error('[StudyPlan] Generation failed:', error);
      
      // Mark as failed
      await prisma.studyPlan.update({
        where: { id: planId },
        data: { 
          status: 'failed',
          errorMessage: error.message || 'Unknown error'
        }
      });
      
      throw error;
    }
  }
  
  /**
   * Build AI prompt for study plan generation
   */
  private buildGenerationPrompt(subject: string, goal: string): string {
    return `You are an expert learning path designer. Create a comprehensive, practical study plan.

**Subject:** ${subject}
**Learning Goal:** ${goal}

**Requirements:**
1. Structure into 3 main phases: Foundation → Building → Mastery
2. Each phase should have 2-4 modules
3. Each module should have specific topics to learn (5-8 topics per module)
4. Include estimated timeframes (be realistic)
5. Suggest hands-on projects for practice
6. Keep it practical and achievable for a motivated learner

**Output Format (MUST be valid JSON):**
{
  "overview": "A brief 2-3 sentence description of the complete learning journey",
  "estimatedWeeks": <number>,
  "targetAudience": "beginner" | "intermediate" | "advanced",
  "phases": [
    {
      "name": "Foundation",
      "description": "Build core understanding and basics",
      "duration": "2-3 weeks",
      "modules": [
        {
          "title": "Getting Started with ${subject}",
          "description": "What you'll learn in this module",
          "topics": [
            "Topic 1: Clear concept name",
            "Topic 2: Another concept",
            "Topic 3: Practical skill"
          ],
          "estimatedHours": 8,
          "practiceProject": "Build a simple [specific project idea]"
        }
      ]
    },
    {
      "name": "Building",
      "description": "Apply knowledge through projects",
      "duration": "3-4 weeks",
      "modules": [...]
    },
    {
      "name": "Mastery",
      "description": "Advanced concepts and real-world application",
      "duration": "2-3 weeks",
      "modules": [...]
    }
  ],
  "milestones": [
    { "week": 2, "achievement": "Can build basic [skill]" },
    { "week": 5, "achievement": "Can create complete [project type]" },
    { "week": 8, "achievement": "Ready for [next step]" }
  ],
  "resources": {
    "documentation": ["Official docs URL or name"],
    "practice": ["Practice platform name"]
  }
}

**CRITICAL:** Return ONLY the JSON object, no explanations, no markdown code blocks, no additional text.`;
  }
  
  /**
   * Get plan by conversation ID
   */
  async getByConversation(conversationId: string) {
    return prisma.studyPlan.findUnique({
      where: { conversationId }
    });
  }
  
  /**
   * Check generation status (for polling)
   */
  async getStatus(planId: string) {
    const plan = await prisma.studyPlan.findUnique({
      where: { id: planId },
      select: {
        id: true,
        subject: true,
        goal: true,
        content: true,
        status: true,
        errorMessage: true
      }
    });
    
    if (!plan) {
      return { status: 'not_found', plan: null, error: null };
    }
    
    return {
      status: plan.status,
      plan: plan.status === 'completed' ? {
        id: plan.id,
        subject: plan.subject,
        goal: plan.goal,
        content: plan.content
      } : null,
      error: plan.errorMessage
    };
  }
}

export const studyPlanService = new StudyPlanService();
