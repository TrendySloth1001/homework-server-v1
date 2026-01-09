import { Router } from 'express';
import { studyPlanService } from './study-plan.service';
import { aiQueue } from '../../shared/queues/ai.queue';

const router = Router();

/**
 * Generate study plan
 * POST /api/study-plans/generate
 */
router.post('/generate', async (req, res) => {
  try {
    const { conversationId, subject, goal } = req.body;
    
    if (!conversationId || !subject || !goal) {
      return res.status(400).json({ 
        error: 'conversationId, subject, and goal are required' 
      });
    }
    
    // Create plan record
    const result = await studyPlanService.generateStudyPlan(
      conversationId,
      subject,
      goal
    );
    
    // If plan was just created, queue the generation job
    if (result.status === 'generating' && aiQueue) {
      await aiQueue.add('study-plan-generation', {
        type: 'study-plan-generation',
        planId: result.id,
        teacherId: req.body.teacherId || 'system'
      } as any, {
        jobId: `study-plan-${result.id}`, // Unique job ID prevents duplicates
        removeOnComplete: true,
        removeOnFail: false
      });
    }
    
    res.json(result);
  } catch (error: any) {
    console.error('[StudyPlan API] Generation error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Check status (for polling)
 * GET /api/study-plans/status/:planId
 */
router.get('/status/:planId', async (req, res) => {
  try {
    const status = await studyPlanService.getStatus(req.params.planId);
    res.json(status);
  } catch (error: any) {
    console.error('[StudyPlan API] Status check error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Get plan by conversation
 * GET /api/study-plans/conversation/:conversationId
 */
router.get('/conversation/:conversationId', async (req, res) => {
  try {
    const plan = await studyPlanService.getByConversation(
      req.params.conversationId
    );
    
    if (!plan) {
      return res.status(404).json({ error: 'Study plan not found' });
    }
    
    res.json(plan);
  } catch (error: any) {
    console.error('[StudyPlan API] Get by conversation error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Get job status
 * GET /api/study-plans/job/:planId
 */
router.get('/job/:planId', async (req, res) => {
  try {
    const jobId = `study-plan-${req.params.planId}`;
    const job = await aiQueue?.getJob(jobId);
    
    if (!job) {
      return res.json({ 
        exists: false,
        planId: req.params.planId 
      });
    }
    
    const state = await job.getState();
    const progress = job.progress;
    
    res.json({
      exists: true,
      jobId,
      planId: req.params.planId,
      state,
      progress,
      attemptsMade: job.attemptsMade,
      timestamp: job.timestamp,
      finishedOn: job.finishedOn,
      processedOn: job.processedOn
    });
  } catch (error: any) {
    console.error('[StudyPlan API] Job status error:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
