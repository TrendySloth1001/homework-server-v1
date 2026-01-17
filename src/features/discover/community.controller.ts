/**
 * Community Controller
 * Handles HTTP requests for community management
 */

import { Request, Response } from 'express';
import { communityService } from './community.service';
import { CreateCommunityRequest, UpdateCommunityRequest, CommunityListQuery, CommunityRole } from './community.types';
import { JWTPayload } from '../auth/auth.types';

export class CommunityController {
  /**
   * Create a new community
   */
  async createCommunity(req: Request, res: Response) {
    try {
      const user = (req as any).user as JWTPayload;
      const data = req.body as CreateCommunityRequest;

      // Validate required fields
      if (!data.name || data.name.trim().length === 0) {
        return res.status(400).json({ error: 'Community name is required' });
      }

      const community = await communityService.createCommunity(user.userId, data);
      res.status(201).json(community);
    } catch (error: any) {
      console.error('Error creating community:', error);
      res.status(500).json({ error: 'Failed to create community' });
    }
  }

  /**
   * Get community by ID
   */
  async getCommunity(req: Request, res: Response) {
    try {
      const { id } = req.params;
      if (!id) {
        return res.status(400).json({ error: 'Community ID is required' });
      }
      const user = (req as any).user as JWTPayload | undefined;

      const community = await communityService.getCommunityById(id, user?.userId);
      if (!community) {
        return res.status(404).json({ error: 'Community not found' });
      }

      res.json(community);
    } catch (error: any) {
      console.error('Error getting community:', error);
      res.status(500).json({ error: 'Failed to get community' });
    }
  }

  /**
   * List communities
   */
  async listCommunities(req: Request, res: Response) {
    try {
      const user = (req as any).user as JWTPayload | undefined;
      const query: CommunityListQuery = {
        page: parseInt(req.query.page as string) || 1,
        limit: parseInt(req.query.limit as string) || 20,
        search: req.query.search as string,
        sortBy: req.query.sortBy as 'new' | 'popular' | 'name'
      };

      const result = await communityService.getCommunities(query, user?.userId);
      res.json(result);
    } catch (error: any) {
      console.error('Error listing communities:', error);
      res.status(500).json({ error: 'Failed to list communities' });
    }
  }

  /**
   * Update community
   */
  async updateCommunity(req: Request, res: Response) {
    try {
      const { id } = req.params;
      if (!id) {
        return res.status(400).json({ error: 'Community ID is required' });
      }
      const user = (req as any).user as JWTPayload;
      const data = req.body as UpdateCommunityRequest;

      const community = await communityService.updateCommunity(id, user.userId, data);
      res.json(community);
    } catch (error: any) {
      console.error('Error updating community:', error);
      if (error.message === 'Unauthorized to update this community') {
        return res.status(403).json({ error: error.message });
      }
      res.status(500).json({ error: 'Failed to update community' });
    }
  }

  /**
   * Delete community
   */
  async deleteCommunity(req: Request, res: Response) {
    try {
      const { id } = req.params;
      if (!id) {
        return res.status(400).json({ error: 'Community ID is required' });
      }
      const user = (req as any).user as JWTPayload;

      await communityService.deleteCommunity(id, user.userId);
      res.status(204).send();
    } catch (error: any) {
      console.error('Error deleting community:', error);
      if (error.message === 'Unauthorized to delete this community') {
        return res.status(403).json({ error: error.message });
      }
      res.status(500).json({ error: 'Failed to delete community' });
    }
  }

  /**
   * Join a community
   */
  async joinCommunity(req: Request, res: Response) {
    try {
      const { id } = req.params;
      if (!id) {
        return res.status(400).json({ error: 'Community ID is required' });
      }
      const user = (req as any).user as JWTPayload;

      await communityService.joinCommunity(id, user.userId);
      res.status(200).json({ message: 'Successfully joined community' });
    } catch (error: any) {
      console.error('Error joining community:', error);
      if (error.message === 'Community not found') {
        return res.status(404).json({ error: error.message });
      }
      res.status(500).json({ error: 'Failed to join community' });
    }
  }

  /**
   * Leave a community
   */
  async leaveCommunity(req: Request, res: Response) {
    try {
      const { id } = req.params;
      if (!id) {
        return res.status(400).json({ error: 'Community ID is required' });
      }
      const user = (req as any).user as JWTPayload;

      if (!user || !user.userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      await communityService.leaveCommunity(id, user.userId);
      res.status(200).json({ message: 'Successfully left community' });
    } catch (error: any) {
      console.error('Error leaving community:', error);
      if (error.message.includes('Creator cannot leave')) {
        return res.status(400).json({ error: error.message });
      }
      res.status(500).json({ error: 'Failed to leave community' });
    }
  }

  /**
   * Get community members
   */
  async getCommunityMembers(req: Request, res: Response) {
    try {
      const { id } = req.params;
      if (!id) {
        return res.status(400).json({ error: 'Community ID is required' });
      }
      const members = await communityService.getCommunityMembers(id);
      res.json(members);
    } catch (error: any) {
      console.error('Error getting community members:', error);
      res.status(500).json({ error: 'Failed to get community members' });
    }
  }

  /**
   * Update member role
   */
  async updateMemberRole(req: Request, res: Response) {
    try {
      const { id, userId } = req.params;
      if (!id || !userId) {
        return res.status(400).json({ error: 'Community ID and User ID are required' });
      }
      const { role } = req.body;
      const currentUser = (req as any).user as JWTPayload;

      if (!role || !['MEMBER', 'MODERATOR'].includes(role)) {
        return res.status(400).json({ error: 'Invalid role. Must be MEMBER or MODERATOR' });
      }

      await communityService.updateMemberRole(id, userId, role as CommunityRole, currentUser.userId);
      res.status(200).json({ message: 'Member role updated successfully' });
    } catch (error: any) {
      console.error('Error updating member role:', error);
      if (error.message.includes('Only the creator') || error.message.includes('Cannot assign creator')) {
        return res.status(403).json({ error: error.message });
      }
      if (error.message.includes('not a member')) {
        return res.status(404).json({ error: error.message });
      }
      res.status(500).json({ error: 'Failed to update member role' });
    }
  }

  /**
   * Remove member from community
   */
  async removeMember(req: Request, res: Response) {
    try {
      const { id, userId } = req.params;
      if (!id || !userId) {
        return res.status(400).json({ error: 'Community ID and User ID are required' });
      }
      const currentUser = (req as any).user as JWTPayload;

      await communityService.removeMember(id, userId, currentUser.userId);
      res.status(200).json({ message: 'Member removed successfully' });
    } catch (error: any) {
      console.error('Error removing member:', error);
      if (error.message.includes('Unauthorized') || error.message.includes('Cannot remove')) {
        return res.status(403).json({ error: error.message });
      }
      res.status(500).json({ error: 'Failed to remove member' });
    }
  }

  /**
   * Get user's communities
   */
  async getUserCommunities(req: Request, res: Response) {
    try {
      const user = (req as any).user as JWTPayload;
      const { userId } = req.params;

      // Only allow users to see their own communities for now
      if (userId !== user.userId) {
        return res.status(403).json({ error: 'Unauthorized' });
      }

      // This is a simplified version - you might want to add pagination
      const query: CommunityListQuery = {
        page: 1,
        limit: 100,
        sortBy: 'name'
      };

      const result = await communityService.getCommunities(query, user.userId);
      
      // Filter to only communities user is a member of
      const userCommunities = result.communities.filter(c => c.isMember);
      
      res.json({
        communities: userCommunities,
        total: userCommunities.length
      });
    } catch (error: any) {
      console.error('Error getting user communities:', error);
      res.status(500).json({ error: 'Failed to get user communities' });
    }
  }

  /**
   * Upload community avatar
   */
  async uploadAvatar(req: Request, res: Response) {
    try {
      const { id } = req.params;
      if (!id) {
        return res.status(400).json({ error: 'Community ID is required' });
      }
      
      const user = (req as any).user as JWTPayload;
      const file = req.file;

      if (!file) {
        return res.status(400).json({ error: 'No avatar file provided' });
      }

      // Validate file type
      if (!file.mimetype.startsWith('image/')) {
        return res.status(400).json({ error: 'Avatar must be an image file' });
      }

      const avatarUrl = await communityService.uploadAvatar(id, user.userId, file);
      res.json({ avatarUrl });
    } catch (error: any) {
      console.error('Error uploading avatar:', error);
      if (error.message === 'Unauthorized to update this community' || error.message === 'Community not found') {
        return res.status(403).json({ error: error.message });
      }
      res.status(500).json({ error: 'Failed to upload avatar' });
    }
  }

  /**
   * Upload community background image
   */
  async uploadBackground(req: Request, res: Response) {
    try {
      const { id } = req.params;
      if (!id) {
        return res.status(400).json({ error: 'Community ID is required' });
      }
      
      const user = (req as any).user as JWTPayload;
      const file = req.file;

      if (!file) {
        return res.status(400).json({ error: 'No background image file provided' });
      }

      // Validate file type
      if (!file.mimetype.startsWith('image/')) {
        return res.status(400).json({ error: 'Background must be an image file' });
      }

      const bannerUrl = await communityService.uploadBackground(id, user.userId, file);
      res.json({ bannerUrl });
    } catch (error: any) {
      console.error('Error uploading background:', error);
      if (error.message === 'Unauthorized to update this community' || error.message === 'Community not found') {
        return res.status(403).json({ error: error.message });
      }
      res.status(500).json({ error: 'Failed to upload background image' });
    }
  }
}

export const communityController = new CommunityController();
