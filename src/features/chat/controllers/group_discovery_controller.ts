import { Response } from 'express';
import { AuthenticatedRequest } from '../../auth/auth.types';
import { asyncHandler } from '../../../shared/lib/errors';
import { discoverGroups, searchGroups } from '../services/group_discovery_service';

// GET /api/chat/groups/discover - Discover public groups
export const discoverGroupsHandler = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user!.userId;
  const { category, search, limit = 20, offset = 0 } = req.query;

  console.log('[discoverGroups] Request from userId:', userId);
  console.log('[discoverGroups] Query params:', { category, search, limit, offset });

  const groups = await discoverGroups(
    userId,
    category as string | undefined,
    search as string | undefined,
    parseInt(limit as string),
    parseInt(offset as string)
  );

  console.log('[discoverGroups] Found', groups.length, 'groups');
  res.json(groups);
});

// GET /api/chat/groups/search - Search groups by name/description
export const searchGroupsHandler = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user!.userId;
  const { query, limit = 20 } = req.query;

  if (!query || typeof query !== 'string') {
    return res.status(400).json({ error: 'Search query is required' });
  }

  const groups = await searchGroups(userId, query, parseInt(limit as string));

  res.json(groups);
});
