/**
 * AI Settings Controller
 * HTTP handlers for AI customization endpoints
 * Phase 1: Settings and context management
 */

import { Request, Response } from 'express';
import { aiSettingsService } from './ai-settings.service';
import { JWTPayload } from '../auth/auth.types';

class AISettingsController {
  /**
   * GET /api/users/:userId/ai-settings
   * Get user's AI customization settings
   */
  async getSettings(req: Request, res: Response): Promise<void> {
    try {
      const { userId } = req.params;
      const user = req.user as JWTPayload;

      // Verify user is requesting their own settings
      if (user?.userId !== userId) {
        res.status(403).json({ error: 'Unauthorized' });
        return;
      }

      const settings = await aiSettingsService.getSettings(userId);
      res.json(settings);
    } catch (error) {
      console.error('[AISettingsController] Error getting settings:', error);
      res.status(500).json({ error: 'Failed to get AI settings' });
    }
  }

  /**
   * PUT /api/users/:userId/ai-settings
   * Update AI customization settings
   */
  async updateSettings(req: Request, res: Response): Promise<void> {
    try {
      const { userId } = req.params;
      const updates = req.body;
      const user = req.user as JWTPayload;

      // Verify user is updating their own settings
      if (user?.userId !== userId) {
        res.status(403).json({ error: 'Unauthorized' });
        return;
      }

      const settings = await aiSettingsService.updateSettings(userId, updates);
      res.json(settings);
    } catch (error: any) {
      console.error('[AISettingsController] Error updating settings:', error);
      res.status(400).json({ error: error.message || 'Failed to update AI settings' });
    }
  }

  /**
   * POST /api/users/:userId/ai-settings/reset
   * Reset settings to defaults
   */
  async resetSettings(req: Request, res: Response): Promise<void> {
    try {
      const { userId } = req.params;
      const user = req.user as JWTPayload;

      // Verify user is resetting their own settings
      if (user?.userId !== userId) {
        res.status(403).json({ error: 'Unauthorized' });
        return;
      }

      const settings = await aiSettingsService.resetToDefaults(userId);
      res.json(settings);
    } catch (error) {
      console.error('[AISettingsController] Error resetting settings:', error);
      res.status(500).json({ error: 'Failed to reset AI settings' });
    }
  }

  /**
   * GET /api/users/:userId/context
   * Get user profile/learning context
   */
  async getUserContext(req: Request, res: Response): Promise<void> {
    try {
      const { userId } = req.params;
      const user = req.user as JWTPayload;

      // Verify user is requesting their own context
      if (user?.userId !== userId) {
        res.status(403).json({ error: 'Unauthorized' });
        return;
      }

      const context = await aiSettingsService.getUserContext(userId);
      res.json(context || {});
    } catch (error) {
      console.error('[AISettingsController] Error getting user context:', error);
      res.status(500).json({ error: 'Failed to get user context' });
    }
  }

  /**
   * PUT /api/users/:userId/context
   * Update user profile/learning context
   */
  async updateUserContext(req: Request, res: Response): Promise<void> {
    try {
      const { userId } = req.params;
      const updates = req.body;
      const user = req.user as JWTPayload;

      // Verify user is updating their own context
      if (user?.userId !== userId) {
        res.status(403).json({ error: 'Unauthorized' });
        return;
      }

      const context = await aiSettingsService.updateUserContext(userId, updates);
      res.json(context);
    } catch (error) {
      console.error('[AISettingsController] Error updating user context:', error);
      res.status(500).json({ error: 'Failed to update user context' });
    }
  }
}

export const aiSettingsController = new AISettingsController();
