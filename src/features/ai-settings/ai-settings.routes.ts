/**
 * AI Settings Routes
 * API endpoints for AI customization
 * Phase 1: Settings and context management
 */

import { Router } from 'express';
import { aiSettingsController } from './ai-settings.controller';
import { authenticateToken } from '../auth/middleware/auth.middleware';

const router = Router();

// All routes require authentication
router.use(authenticateToken);

// AI Settings endpoints
router.get('/users/:userId/ai-settings', aiSettingsController.getSettings.bind(aiSettingsController));
router.put('/users/:userId/ai-settings', aiSettingsController.updateSettings.bind(aiSettingsController));
router.post('/users/:userId/ai-settings/reset', aiSettingsController.resetSettings.bind(aiSettingsController));

// User Context endpoints
router.get('/users/:userId/context', aiSettingsController.getUserContext.bind(aiSettingsController));
router.put('/users/:userId/context', aiSettingsController.updateUserContext.bind(aiSettingsController));

export default router;
