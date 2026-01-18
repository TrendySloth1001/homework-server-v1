import { Request, Response } from 'express';
import { discoverService } from './service';
import { discoverMediaService } from './media.service';
import {
  CreatePostRequest,
  UpdatePostRequest,
  PostListQuery,
  PostMedia,
  CreateCommentRequest,
  UpdateCommentRequest,
  VoteRequest,
  ReportRequest
} from './types';
import { JWTPayload } from '../auth/auth.types';

export class DiscoverController {
  /**
   * Create a new post
   * POST /api/discover/posts
   */
  async createPost(req: Request, res: Response): Promise<void> {
    try {
      const user = (req as any).user as JWTPayload | undefined;
      const userId = user?.userId;

      if (!userId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const postData: CreatePostRequest = req.body;

      // Validation
      if (!postData.title || postData.title.trim().length === 0) {
        res.status(400).json({ error: 'Title is required' });
        return;
      }

      if (!postData.postType) {
        res.status(400).json({ error: 'Post type is required' });
        return;
      }

      const post = await discoverService.createPost(userId, postData);
      res.status(201).json(post);
    } catch (error: any) {
      console.error('Error creating post:', error);
      res.status(500).json({ error: error.message || 'Failed to create post' });
    }
  }

  /**
   * Get post by ID
   * GET /api/discover/posts/:id
   */
  async getPostById(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const user = (req as any).user as JWTPayload | undefined;
      const userId = user?.userId;

      const post = await discoverService.getPostById(id as string, userId ?? undefined);

      if (!post) {
        res.status(404).json({ error: 'Post not found' });
        return;
      }

      res.json(post);
    } catch (error: any) {
      console.error('Error getting post:', error);
      res.status(500).json({ error: error.message || 'Failed to get post' });
    }
  }

  /**
   * Get list of posts
   * GET /api/discover/posts
   */
  async getPosts(req: Request, res: Response): Promise<void> {
    try {
      const user = (req as any).user as JWTPayload | undefined;
      const userId = user?.userId;

      const query: PostListQuery = {
        page: parseInt(req.query.page as string) || 1,
        limit: parseInt(req.query.limit as string) || 20,
        sortBy: req.query.sortBy as any || 'new',
        timeRange: req.query.timeRange as any || 'all',
        communityId: req.query.communityId as string,
        authorId: req.query.authorId as string,
        tags: req.query.tags ? (req.query.tags as string).split(',') : [],
        search: req.query.search as string
      };

      const result = await discoverService.getPosts(query, userId);
      res.json(result);
    } catch (error: any) {
      console.error('Error getting posts:', error);
      res.status(500).json({ error: error.message || 'Failed to get posts' });
    }
  }

  /**
   * Update post
   * PUT /api/discover/posts/:id
   */
  async updatePost(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const user = (req as any).user as JWTPayload | undefined;
      const userId = user?.userId;

      if (!userId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const updateData: UpdatePostRequest = req.body;
      const post = await discoverService.updatePost(id as string, userId!, updateData);

      res.json(post);
    } catch (error: any) {
      console.error('Error updating post:', error);

      if (error.message === 'Unauthorized to update this post') {
        res.status(403).json({ error: error.message });
        return;
      }

      res.status(500).json({ error: error.message || 'Failed to update post' });
    }
  }

  /**
   * Crosspost existing post to additional communities
   * POST /api/discover/posts/:id/crosspost
   */
  async crosspostToCommunities(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const user = (req as any).user as JWTPayload | undefined;
      const userId = user?.userId;

      if (!userId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const { communityIds } = req.body;

      if (!communityIds || !Array.isArray(communityIds) || communityIds.length === 0) {
        res.status(400).json({ error: 'communityIds array is required' });
        return;
      }

      const post = await discoverService.crosspostToCommunities(id as string, userId, communityIds);
      res.json(post);
    } catch (error: any) {
      console.error('Error crossposting:', error);

      if (error.message.includes('Unauthorized') || error.message.includes('member')) {
        res.status(403).json({ error: error.message });
        return;
      }

      if (error.message.includes('already crossposted')) {
        res.status(400).json({ error: error.message });
        return;
      }

      res.status(500).json({ error: error.message || 'Failed to crosspost' });
    }
  }

  /**
   * Delete post
   * DELETE /api/discover/posts/:id
   */
  async deletePost(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const user = (req as any).user as JWTPayload | undefined;
      const userId = user?.userId;

      if (!userId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      await discoverService.deletePost(id as string, userId!);
      res.status(204).send();
    } catch (error: any) {
      console.error('Error deleting post:', error);

      if (error.message === 'Unauthorized to delete this post') {
        res.status(403).json({ error: error.message });
        return;
      }

      res.status(500).json({ error: error.message || 'Failed to delete post' });
    }
  }

  /**
   * Upload media for a post
   * POST /api/discover/posts/:id/media
   */
  async uploadMedia(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const user = (req as any).user as JWTPayload | undefined;
      const userId = user?.userId;

      if (!userId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      // File should be in req.file (using multer or similar)
      if (!req.file) {
        res.status(400).json({ error: 'No file uploaded' });
        return;
      }

      // Upload file to S3 with structured path
      const mediaData = await discoverMediaService.uploadPostMedia(
        {
          buffer: req.file.buffer,
          mimetype: req.file.mimetype,
          originalname: req.file.originalname,
          size: req.file.size
        },
        userId!,
        id as string
      );

      // Set order if provided
      if (req.body.order) {
        mediaData.order = parseInt(req.body.order);
      }

      const media = await discoverService.addMediaToPost(id as string, userId!, mediaData);
      res.status(201).json({ media });
    } catch (error: any) {
      console.error('Error uploading media:', error);

      if (error.message === 'Unauthorized to add media to this post') {
        res.status(403).json({ error: error.message });
        return;
      }

      res.status(500).json({ error: error.message || 'Failed to upload media' });
    }
  }

  /**
   * Delete media from post
   * DELETE /api/discover/media/:mediaId
   */
  async deleteMedia(req: Request, res: Response): Promise<void> {
    try {
      const { mediaId } = req.params;
      const user = (req as any).user as JWTPayload | undefined;
      const userId = user?.userId;

      if (!userId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      await discoverService.removeMediaFromPost(mediaId as string, userId!);
      res.status(204).send();
    } catch (error: any) {
      console.error('Error deleting media:', error);

      if (error.message === 'Unauthorized to remove this media') {
        res.status(403).json({ error: error.message });
        return;
      }

      res.status(500).json({ error: error.message || 'Failed to delete media' });
    }
  }

  // ===================================
  // VOTING ENDPOINTS
  // ===================================

  /**
   * Vote on a post
   * POST /api/discover/posts/:id/vote
   */
  async votePost(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const user = (req as any).user as JWTPayload | undefined;
      const userId = user?.userId;

      if (!userId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const { voteType }: VoteRequest = req.body;

      if (!voteType || !['UP', 'DOWN'].includes(voteType)) {
        res.status(400).json({ error: 'Invalid vote type. Must be UP or DOWN' });
        return;
      }

      await discoverService.votePost(id as string, userId!, voteType);
      res.status(200).json({ success: true });
    } catch (error: any) {
      console.error('Error voting on post:', error);
      res.status(500).json({ error: error.message || 'Failed to vote on post' });
    }
  }

  /**
   * Remove vote from a post
   * DELETE /api/discover/posts/:id/vote
   */
  async removePostVote(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const user = (req as any).user as JWTPayload | undefined;
      const userId = user?.userId;

      if (!userId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      await discoverService.removePostVote(id as string, userId!);
      res.status(200).json({ success: true });
    } catch (error: any) {
      console.error('Error removing vote:', error);
      res.status(500).json({ error: error.message || 'Failed to remove vote' });
    }
  }

  // ===================================
  // COMMENT ENDPOINTS
  // ===================================

  /**
   * Create a comment
   * POST /api/discover/posts/:id/comments
   */
  async createComment(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const user = (req as any).user as JWTPayload | undefined;
      const userId = user?.userId;

      if (!userId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const { content, parentCommentId }: CreateCommentRequest = req.body;

      if (!content || content.trim().length === 0) {
        res.status(400).json({ error: 'Comment content is required' });
        return;
      }

      const comment = await discoverService.createComment(id as string, userId!, content, parentCommentId);
      res.status(201).json(comment);
    } catch (error: any) {
      console.error('Error creating comment:', error);
      res.status(500).json({ error: error.message || 'Failed to create comment' });
    }
  }

  /**
   * Get comments for a post
   * GET /api/discover/posts/:id/comments
   */
  async getComments(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const user = (req as any).user as JWTPayload | undefined;
      const userId = user?.userId;
      const sortBy = (req.query.sortBy as 'new' | 'top' | 'old' | 'best' | 'controversial') || 'best';

      const comments = await discoverService.getComments(id as string, sortBy, userId);
      res.json(comments);
    } catch (error: any) {
      console.error('Error getting comments:', error);
      res.status(500).json({ error: error.message || 'Failed to get comments' });
    }
  }

  /**
   * Update a comment
   * PUT /api/discover/comments/:commentId
   */
  async updateComment(req: Request, res: Response): Promise<void> {
    try {
      const { commentId } = req.params;
      const user = (req as any).user as JWTPayload | undefined;
      const userId = user?.userId;

      if (!userId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const { content }: UpdateCommentRequest = req.body;

      if (!content || content.trim().length === 0) {
        res.status(400).json({ error: 'Comment content is required' });
        return;
      }

      const comment = await discoverService.updateComment(commentId as string, userId!, content);
      res.json(comment);
    } catch (error: any) {
      console.error('Error updating comment:', error);

      if (error.message === 'Unauthorized to update this comment') {
        res.status(403).json({ error: error.message });
        return;
      }

      res.status(500).json({ error: error.message || 'Failed to update comment' });
    }
  }

  /**
   * Delete a comment
   * DELETE /api/discover/comments/:commentId
   */
  async deleteComment(req: Request, res: Response): Promise<void> {
    try {
      const { commentId } = req.params;
      const user = (req as any).user as JWTPayload | undefined;
      const userId = user?.userId;

      if (!userId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      await discoverService.deleteComment(commentId as string, userId!);
      res.status(204).send();
    } catch (error: any) {
      console.error('Error deleting comment:', error);

      if (error.message === 'Unauthorized to delete this comment') {
        res.status(403).json({ error: error.message });
        return;
      }

      res.status(500).json({ error: error.message || 'Failed to delete comment' });
    }
  }

  /**
   * Vote on a comment
   * POST /api/discover/comments/:commentId/vote
   */
  async voteComment(req: Request, res: Response): Promise<void> {
    try {
      const { commentId } = req.params;
      const user = (req as any).user as JWTPayload | undefined;
      const userId = user?.userId;

      if (!userId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const { voteType }: VoteRequest = req.body;

      if (!voteType || !['UP', 'DOWN', 'LIKE', 'FUNNY', 'HELPFUL', 'INSIGHTFUL', 'HEART'].includes(voteType)) {
        res.status(400).json({ error: 'Invalid vote type' });
        return;
      }

      await discoverService.voteComment(commentId as string, userId!, voteType);
      res.status(200).json({ success: true });
    } catch (error: any) {
      console.error('Error voting on comment:', error);
      res.status(500).json({ error: error.message || 'Failed to vote on comment' });
    }
  }

  /**
   * Remove vote from a comment
   * DELETE /api/discover/comments/:commentId/vote
   */
  async removeCommentVote(req: Request, res: Response): Promise<void> {
    try {
      const { commentId } = req.params;
      const user = (req as any).user as JWTPayload | undefined;
      const userId = user?.userId;

      if (!userId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      await discoverService.removeCommentVote(commentId as string, userId!);
      res.status(200).json({ success: true });
    } catch (error: any) {
      console.error('Error removing comment vote:', error);
      res.status(500).json({ error: error.message || 'Failed to remove comment vote' });
    }
  }

  // ===================================
  // COMMENT REACTIONS ENDPOINTS
  // ===================================

  /**
   * React to a comment
   * POST /api/discover/comments/:commentId/react
   */
  async reactToComment(req: Request, res: Response): Promise<void> {
    try {
      const { commentId } = req.params;
      const { reactionType } = req.body;
      const user = (req as any).user as JWTPayload | undefined;
      const userId = user?.userId;

      if (!userId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      if (!reactionType) {
        res.status(400).json({ error: 'Reaction type is required' });
        return;
      }

      await discoverService.reactToComment(commentId as string, userId, reactionType);
      res.status(200).json({ success: true });
    } catch (error: any) {
      console.error('Error reacting to comment:', error);
      res.status(500).json({ error: error.message || 'Failed to react to comment' });
    }
  }

  /**
   * Remove reaction from a comment
   * DELETE /api/discover/comments/:commentId/react
   */
  async removeCommentReaction(req: Request, res: Response): Promise<void> {
    try {
      const { commentId } = req.params;
      const user = (req as any).user as JWTPayload | undefined;
      const userId = user?.userId;

      if (!userId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      await discoverService.removeCommentReaction(commentId as string, userId);
      res.status(200).json({ success: true });
    } catch (error: any) {
      console.error('Error removing comment reaction:', error);
      res.status(500).json({ error: error.message || 'Failed to remove comment reaction' });
    }
  }

  /**
   * Toggle comment highlight (best comment)
   * POST /api/discover/comments/:commentId/highlight
   */
  async toggleCommentHighlight(req: Request, res: Response): Promise<void> {
    try {
      const { commentId } = req.params;
      const user = (req as any).user as JWTPayload | undefined;
      const userId = user?.userId;

      if (!userId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      await discoverService.toggleCommentHighlight(commentId as string, userId);
      res.status(200).json({ success: true });
    } catch (error: any) {
      console.error('Error toggling comment highlight:', error);

      if (error.message.includes('Only the post author')) {
        res.status(403).json({ error: error.message });
        return;
      }

      res.status(500).json({ error: error.message || 'Failed to toggle comment highlight' });
    }
  }

  // ===================================
  // READING HISTORY ENDPOINTS
  // ===================================

  /**
   * Mark post as read
   * POST /api/discover/posts/:id/read
   */
  async markPostAsRead(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const user = (req as any).user as JWTPayload | undefined;
      const userId = user?.userId;

      if (!userId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      await discoverService.markPostAsRead(id as string, userId);
      res.status(200).json({ success: true });
    } catch (error: any) {
      console.error('Error marking post as read:', error);
      res.status(500).json({ error: error.message || 'Failed to mark post as read' });
    }
  }

  // ===================================
  // SAVED POSTS ENDPOINTS
  // ===================================

  /**
   * Save a post
   * POST /api/discover/posts/:id/save
   */
  async savePost(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const user = (req as any).user as JWTPayload | undefined;
      const userId = user?.userId;

      if (!userId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      await discoverService.savePost(id as string, userId!);
      res.status(200).json({ success: true });
    } catch (error: any) {
      console.error('Error saving post:', error);
      res.status(500).json({ error: error.message || 'Failed to save post' });
    }
  }

  /**
   * Unsave a post
   * DELETE /api/discover/posts/:id/save
   */
  async unsavePost(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const user = (req as any).user as JWTPayload | undefined;
      const userId = user?.userId;

      if (!userId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      await discoverService.unsavePost(id as string, userId!);
      res.status(200).json({ success: true });
    } catch (error: any) {
      console.error('Error unsaving post:', error);
      res.status(500).json({ error: error.message || 'Failed to unsave post' });
    }
  }

  /**
   * Get user's saved posts
   * GET /api/discover/saved
   */
  async getSavedPosts(req: Request, res: Response): Promise<void> {
    try {
      const user = (req as any).user as JWTPayload | undefined;
      const userId = user?.userId;

      if (!userId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 20;

      const result = await discoverService.getSavedPosts(userId!, page, limit);
      res.json(result);
    } catch (error: any) {
      console.error('Error getting saved posts:', error);
      res.status(500).json({ error: error.message || 'Failed to get saved posts' });
    }
  }

  // ===================================
  // MODERATION ENDPOINTS
  // ===================================

  /**
   * Report a post
   * POST /api/discover/posts/:id/report
   */
  async reportPost(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const user = (req as any).user as JWTPayload | undefined;
      const userId = user?.userId;

      if (!userId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const { reason, details }: ReportRequest = req.body;

      if (!reason || reason.trim().length === 0) {
        res.status(400).json({ error: 'Report reason is required' });
        return;
      }

      await discoverService.reportPost(id as string, userId!, reason, details);
      res.status(201).json({ success: true, message: 'Report submitted' });
    } catch (error: any) {
      console.error('Error reporting post:', error);
      res.status(500).json({ error: error.message || 'Failed to report post' });
    }
  }

  /**
   * Report a comment
   * POST /api/discover/comments/:commentId/report
   */
  async reportComment(req: Request, res: Response): Promise<void> {
    try {
      const { commentId } = req.params;
      const user = (req as any).user as JWTPayload | undefined;
      const userId = user?.userId;

      if (!userId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const { reason, details }: ReportRequest = req.body;

      if (!reason || reason.trim().length === 0) {
        res.status(400).json({ error: 'Report reason is required' });
        return;
      }

      await discoverService.reportComment(commentId as string, userId!, reason, details);
      res.status(201).json({ success: true, message: 'Report submitted' });
    } catch (error: any) {
      console.error('Error reporting comment:', error);
      res.status(500).json({ error: error.message || 'Failed to report comment' });
    }
  }

  /**
   * Get all reports (for moderators)
   * GET /api/discover/reports
   */
  async getReports(req: Request, res: Response): Promise<void> {
    try {
      const user = (req as any).user as JWTPayload | undefined;
      const userId = user?.userId;

      if (!userId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      // TODO: Add moderator permission check here

      const status = req.query.status as string | undefined;
      const reports = await discoverService.getReports(status);
      res.json(reports);
    } catch (error: any) {
      console.error('Error getting reports:', error);
      res.status(500).json({ error: error.message || 'Failed to get reports' });
    }
  }

  /**
   * Update report status
   * PATCH /api/discover/reports/:reportId
   */
  async updateReportStatus(req: Request, res: Response): Promise<void> {
    try {
      const { reportId } = req.params;
      const user = (req as any).user as JWTPayload | undefined;
      const userId = user?.userId;

      if (!userId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      // TODO: Add moderator permission check here

      const { reportType, status } = req.body;

      if (!reportType || !['post', 'comment'].includes(reportType)) {
        res.status(400).json({ error: 'Invalid report type' });
        return;
      }

      if (!status) {
        res.status(400).json({ error: 'Status is required' });
        return;
      }

      await discoverService.updateReportStatus(reportId as string, reportType, status);
      res.status(200).json({ success: true });
    } catch (error: any) {
      console.error('Error updating report status:', error);
      res.status(500).json({ error: error.message || 'Failed to update report status' });
    }
  }

  /**
   * Share post or community to conversation
   * POST /api/discover/share
   */
  async shareContent(req: Request, res: Response): Promise<void> {
    try {
      const user = (req as any).user as JWTPayload | undefined;
      const userId = user?.userId;

      if (!userId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const { contentType, contentId, conversationId, message } = req.body;

      if (!contentType || !['POST', 'COMMUNITY'].includes(contentType)) {
        res.status(400).json({ error: 'Invalid content type' });
        return;
      }

      if (!contentId) {
        res.status(400).json({ error: 'Content ID is required' });
        return;
      }

      if (!conversationId) {
        res.status(400).json({ error: 'Conversation ID is required' });
        return;
      }

      const result = await discoverService.shareContent(
        userId,
        contentType,
        contentId,
        conversationId,
        message
      );

      res.status(201).json(result);
    } catch (error: any) {
      console.error('Error sharing content:', error);
      res.status(500).json({ error: error.message || 'Failed to share content' });
    }
  }

  /**
   * Get user's conversations for sharing
   * GET /api/discover/share/conversations
   */
  async getShareConversations(req: Request, res: Response): Promise<void> {
    try {
      const user = (req as any).user as JWTPayload | undefined;
      const userId = user?.userId;

      if (!userId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const conversations = await discoverService.getUserConversations(userId);
      res.json(conversations);
    } catch (error: any) {
      console.error('Error getting conversations:', error);
      res.status(500).json({ error: error.message || 'Failed to get conversations' });
    }
  }

  // ===================================
  // LEADERBOARDS & ANALYTICS
  // ===================================

  /**
   * Get leaderboard
   * GET /api/discover/leaderboard?metric=posts&timeframe=week&limit=10
   */
  async getLeaderboard(req: Request, res: Response): Promise<void> {
    try {
      const { metric = 'engagement', timeframe = 'week', limit = 10 } = req.query;

      const validMetrics = ['posts', 'votes', 'comments', 'engagement'];
      const validTimeframes = ['day', 'week', 'month', 'all'];

      if (!validMetrics.includes(metric as string)) {
        res.status(400).json({ error: 'Invalid metric. Must be: posts, votes, comments, or engagement' });
        return;
      }

      if (!validTimeframes.includes(timeframe as string)) {
        res.status(400).json({ error: 'Invalid timeframe. Must be: day, week, month, or all' });
        return;
      }

      const leaderboard = await discoverService.getLeaderboard(
        metric as any,
        timeframe as any,
        parseInt(limit as string) || 10
      );

      res.json(leaderboard);
    } catch (error: any) {
      console.error('Error getting leaderboard:', error);
      res.status(500).json({ error: error.message || 'Failed to get leaderboard' });
    }
  }

  /**
   * Get popular authors
   * GET /api/discover/authors/popular?limit=10
   */
  async getPopularAuthors(req: Request, res: Response): Promise<void> {
    try {
      const { limit = 10 } = req.query;
      const user = (req as any).user as JWTPayload | undefined;
      const requestingUserId = user?.userId;
      
      const authors = await discoverService.getPopularAuthors(parseInt(limit as string) || 10, requestingUserId);
      res.json(authors);
    } catch (error: any) {
      console.error('Error getting popular authors:', error);
      res.status(500).json({ error: error.message || 'Failed to get popular authors' });
    }
  }

  /**
   * Get recommended posts
   * GET /api/discover/posts/recommended?limit=10
   */
  async getRecommendedPosts(req: Request, res: Response): Promise<void> {
    try {
      const user = (req as any).user as JWTPayload | undefined;
      const userId = user?.userId;
      const { limit = 10 } = req.query;

      const posts = await discoverService.getRecommendedPosts(
        userId,
        parseInt(limit as string) || 10
      );

      res.json(posts);
    } catch (error: any) {
      console.error('Error getting recommended posts:', error);
      res.status(500).json({ error: error.message || 'Failed to get recommended posts' });
    }
  }

  /**
   * Get user discovery stats
   * GET /api/discover/users/:userId/stats
   */
  async getUserStats(req: Request, res: Response): Promise<void> {
    try {
      const { userId } = req.params;
      
      if (!userId) {
        res.status(400).json({ error: 'User ID is required' });
        return;
      }
      
      const stats = await discoverService.getUserStats(userId as string);
      res.json({ data: stats });
    } catch (error: any) {
      console.error('Error getting user stats:', error);
      res.status(500).json({ error: error.message || 'Failed to get user stats' });
    }
  }

  /**
   * Get trending tags
   * GET /api/discover/tags/trending?limit=20
   */
  async getTrendingTags(req: Request, res: Response): Promise<void> {
    try {
      const { limit = 20 } = req.query;
      const tags = await discoverService.getTrendingTags(parseInt(limit as string) || 20);
      res.json(tags);
    } catch (error: any) {
      console.error('Error getting trending tags:', error);
      res.status(500).json({ error: error.message || 'Failed to get trending tags' });
    }
  }
}

export const discoverController = new DiscoverController();
