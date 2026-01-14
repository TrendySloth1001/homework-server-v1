/**
 * Avatar Controller
 * API endpoints for avatar management
 */

import { Request, Response } from 'express';
import { avatarService } from './avatar.service';

/**
 * Get predefined avatars
 * GET /api/avatar/predefined
 */
export const getPredefinedAvatars = async (req: Request, res: Response) => {
  try {
    console.log('[Avatar Controller] Getting predefined avatars...');
    const avatars = await avatarService.getPredefinedAvatars();
    console.log(`[Avatar Controller] Found ${avatars.length} avatars`);
    return res.json(avatars);
  } catch (error) {
    console.error('[Avatar Controller] Error:', error);
    const message = error instanceof Error ? error.message : 'Failed to get avatars';
    return res.status(500).json({ error: message });
  }
};

/**
 * Get user's custom avatars
 * GET /api/avatar/my-avatars
 * Returns only the logged-in user's personal avatar uploads (PRIVATE)
 */
export const getUserAvatars = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    console.log(`[Avatar Controller] Getting custom avatars for user ${userId}...`);
    const avatars = await avatarService.getUserAvatars(userId);
    console.log(`[Avatar Controller] Found ${avatars.length} custom avatars`);
    return res.json(avatars);
  } catch (error) {
    console.error('[Avatar Controller] Error:', error);
    const message = error instanceof Error ? error.message : 'Failed to get user avatars';
    return res.status(500).json({ error: message });
  }
};

/**
 * Upload custom avatar
 * POST /api/avatar/upload
 */
export const uploadCustomAvatar = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId;
    const file = (req as any).file;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    if (!file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const result = await avatarService.uploadCustomAvatar({
      buffer: file.buffer,
      mimetype: file.mimetype,
      originalname: file.originalname,
    }, userId);

    // Automatically set as user's avatar
    await avatarService.setUserAvatar(userId, result.url);

    return res.json({ avatarUrl: result.url });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to upload avatar';
    return res.status(500).json({ error: message });
  }
};

/**
 * Set user avatar (select predefined or set custom)
 * POST /api/avatar/set
 */
export const setAvatar = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId;
    const { avatarUrl } = req.body;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    if (!avatarUrl || typeof avatarUrl !== 'string') {
      return res.status(400).json({ error: 'avatarUrl is required' });
    }

    await avatarService.setUserAvatar(userId, avatarUrl);

    return res.json({ success: true, avatarUrl });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to set avatar';
    return res.status(500).json({ error: message });
  }
};

/**
 * Remove user avatar
 * DELETE /api/avatar
 */
export const removeAvatar = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    await avatarService.removeUserAvatar(userId);

    return res.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to remove avatar';
    return res.status(500).json({ error: message });
  }
};
