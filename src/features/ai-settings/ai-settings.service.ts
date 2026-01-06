/**
 * AI Settings Service
 * Manages user AI customization preferences
 * Phase 1: CRUD operations with caching
 */

import { prisma } from '../../shared/lib/prisma';
import { cacheService as redisService } from '../../shared/lib/cache';
import { AISettings, UserContext } from '@prisma/client';

interface AISettingsUpdateDTO {
  baseTone?: string;
  warmth?: number;
  enthusiasm?: number;
  emojiUsage?: string;
  useHeaders?: boolean;
  responseLength?: string;
  customInstructions?: string;
  profileEnabled?: boolean;
}

interface UserContextUpdateDTO {
  learningGoals?: string;
  weakSubjects?: string[];
  strongSubjects?: string[];
  preferredExamples?: string;
  interests?: string;
}

class AISettingsService {
  private readonly CACHE_TTL = 3600; // 1 hour
  private readonly SETTINGS_CACHE_KEY = (userId: string) => `ai:settings:${userId}`;
  private readonly CONTEXT_CACHE_KEY = (userId: string) => `ai:context:${userId}`;

  /**
   * Get AI settings for a user (with caching)
   */
  async getSettings(userId: string): Promise<AISettings> {
    try {
      // Check cache
      const cached = await redisService.get<AISettings>(this.SETTINGS_CACHE_KEY(userId));
      if (cached) {
        return cached;
      }

      // Get from database or create defaults
      let settings = await prisma.aISettings.findUnique({
        where: { userId },
      });

      if (!settings) {
        settings = await this.createDefaultSettings(userId);
      }

      // Cache it
      await redisService.set(
        this.SETTINGS_CACHE_KEY(userId),
        settings,
        this.CACHE_TTL
      );

      return settings;
    } catch (error) {
      console.error('[AISettingsService] Error getting settings:', error);
      throw error;
    }
  }

  /**
   * Update AI settings
   */
  async updateSettings(userId: string, updates: AISettingsUpdateDTO): Promise<AISettings> {
    try {
      // Validate warmth and enthusiasm
      if (updates.warmth !== undefined && (updates.warmth < 0 || updates.warmth > 10)) {
        throw new Error('Warmth must be between 0 and 10');
      }
      if (updates.enthusiasm !== undefined && (updates.enthusiasm < 0 || updates.enthusiasm > 10)) {
        throw new Error('Enthusiasm must be between 0 and 10');
      }

      // Update in database
      const settings = await prisma.aISettings.upsert({
        where: { userId },
        update: {
          ...updates,
          updatedAt: new Date(),
        },
        create: {
          userId,
          ...updates,
          baseTone: updates.baseTone || 'friendly',
          warmth: updates.warmth ?? 7,
          enthusiasm: updates.enthusiasm ?? 7,
          emojiUsage: updates.emojiUsage || 'occasional',
          useHeaders: updates.useHeaders ?? true,
          responseLength: updates.responseLength || 'balanced',
          profileEnabled: updates.profileEnabled ?? false,
        },
      });

      // Invalidate cache
      await redisService.delete(this.SETTINGS_CACHE_KEY(userId));

      return settings;
    } catch (error) {
      console.error('[AISettingsService] Error updating settings:', error);
      throw error;
    }
  }

  /**
   * Get user context (with caching)
   */
  async getUserContext(userId: string): Promise<UserContext | null> {
    try {
      // Check cache
      const cached = await redisService.get<UserContext>(this.CONTEXT_CACHE_KEY(userId));
      if (cached) {
        return cached;
      }

      // Get from database
      const context = await prisma.userContext.findUnique({
        where: { userId },
      });

      if (context) {
        // Cache it
        await redisService.set(
          this.CONTEXT_CACHE_KEY(userId),
          context,
          this.CACHE_TTL
        );
      }

      return context;
    } catch (error) {
      console.error('[AISettingsService] Error getting user context:', error);
      throw error;
    }
  }

  /**
   * Update user context
   */
  async updateUserContext(userId: string, updates: UserContextUpdateDTO): Promise<UserContext> {
    try {
      const context = await prisma.userContext.upsert({
        where: { userId },
        update: {
          ...updates,
          updatedAt: new Date(),
        },
        create: {
          userId,
          ...updates,
        },
      });

      // Invalidate cache
      await redisService.delete(this.CONTEXT_CACHE_KEY(userId));

      return context;
    } catch (error) {
      console.error('[AISettingsService] Error updating user context:', error);
      throw error;
    }
  }

  /**
   * Create default settings for new user
   */
  private async createDefaultSettings(userId: string): Promise<AISettings> {
    return await prisma.aISettings.create({
      data: {
        userId,
        baseTone: 'friendly',
        warmth: 7,
        enthusiasm: 7,
        emojiUsage: 'occasional',
        useHeaders: true,
        responseLength: 'balanced',
        profileEnabled: false,
      },
    });
  }

  /**
   * Reset settings to defaults
   */
  async resetToDefaults(userId: string): Promise<AISettings> {
    try {
      const settings = await prisma.aISettings.upsert({
        where: { userId },
        update: {
          baseTone: 'friendly',
          warmth: 7,
          enthusiasm: 7,
          emojiUsage: 'occasional',
          useHeaders: true,
          responseLength: 'balanced',
          customInstructions: null,
          profileEnabled: false,
          updatedAt: new Date(),
        },
        create: {
          userId,
          baseTone: 'friendly',
          warmth: 7,
          enthusiasm: 7,
          emojiUsage: 'occasional',
          useHeaders: true,
          responseLength: 'balanced',
          profileEnabled: false,
        },
      });

      // Invalidate cache
      await redisService.delete(this.SETTINGS_CACHE_KEY(userId));

      return settings;
    } catch (error) {
      console.error('[AISettingsService] Error resetting settings:', error);
      throw error;
    }
  }
}

export const aiSettingsService = new AISettingsService();
