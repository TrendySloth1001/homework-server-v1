import { Router } from 'express';
import multer from 'multer';
import { discoverController } from './controller';
import { communityController } from './community.controller';
import { authenticateToken } from '../auth/middleware/auth.middleware';

// Configure multer for media uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB limit for videos
  },
  fileFilter: (req, file, cb) => {
    // Accept images, videos, and audio
    const allowedTypes = ['image/', 'video/', 'audio/'];
    const isAllowed = allowedTypes.some(type => file.mimetype.startsWith(type));
    
    if (isAllowed) {
      cb(null, true);
    } else {
      cb(new Error('Only image, video, and audio files are allowed'));
    }
  },
});

const router = Router();



/**
 * Post Routes
 */

// Create a new post
router.post('/posts', authenticateToken, discoverController.createPost.bind(discoverController));

// Get list of posts with filters and sorting
router.get('/posts', discoverController.getPosts.bind(discoverController));

// Get specific post by ID
router.get('/posts/:id', discoverController.getPostById.bind(discoverController));

// Update post
router.put('/posts/:id', authenticateToken, discoverController.updatePost.bind(discoverController));

// Crosspost existing post to additional communities
router.post('/posts/:id/crosspost', authenticateToken, discoverController.crosspostToCommunities.bind(discoverController));

// Delete post
router.delete('/posts/:id', authenticateToken, discoverController.deletePost.bind(discoverController));

/**
 * Post Voting Routes
 */

// Vote on a post
router.post('/posts/:id/vote', authenticateToken, discoverController.votePost.bind(discoverController));

// Remove vote from post
router.delete('/posts/:id/vote', authenticateToken, discoverController.removePostVote.bind(discoverController));

/**
 * Saved Posts Routes
 */

// Save a post
router.post('/posts/:id/save', authenticateToken, discoverController.savePost.bind(discoverController));

// Unsave a post
router.delete('/posts/:id/save', authenticateToken, discoverController.unsavePost.bind(discoverController));

// Get user's saved posts
router.get('/saved', authenticateToken, discoverController.getSavedPosts.bind(discoverController));

/**
 * Post Reporting Routes
 */

// Report a post
router.post('/posts/:id/report', authenticateToken, discoverController.reportPost.bind(discoverController));

/**
 * Comment Routes
 */

// Create a comment on a post
router.post('/posts/:id/comments', authenticateToken, discoverController.createComment.bind(discoverController));

// Get comments for a post
router.get('/posts/:id/comments', discoverController.getComments.bind(discoverController));

// Update a comment
router.put('/comments/:commentId', authenticateToken, discoverController.updateComment.bind(discoverController));

// Delete a comment
router.delete('/comments/:commentId', authenticateToken, discoverController.deleteComment.bind(discoverController));

/**
 * Comment Voting Routes
 */

// Vote on a comment
router.post('/comments/:commentId/vote', authenticateToken, discoverController.voteComment.bind(discoverController));

// Remove vote from comment
router.delete('/comments/:commentId/vote', authenticateToken, discoverController.removeCommentVote.bind(discoverController));

/**
 * Comment Reaction Routes
 */

// React to a comment
router.post('/comments/:commentId/react', authenticateToken, discoverController.reactToComment.bind(discoverController));

// Remove reaction from comment
router.delete('/comments/:commentId/react', authenticateToken, discoverController.removeCommentReaction.bind(discoverController));

/**
 * Comment Highlight Routes
 */

// Toggle comment highlight (post author only)
router.post('/comments/:commentId/highlight', authenticateToken, discoverController.toggleCommentHighlight.bind(discoverController));

/**
 * Reading History Routes
 */

// Mark post as read
router.post('/posts/:id/read', authenticateToken, discoverController.markPostAsRead.bind(discoverController));

/**
 * Comment Reporting Routes
 */

// Report a comment
router.post('/comments/:commentId/report', authenticateToken, discoverController.reportComment.bind(discoverController));

/**
 * Media Routes
 */

// Upload media to post (with file upload)
router.post('/posts/:id/media', authenticateToken, upload.single('media'), discoverController.uploadMedia.bind(discoverController));

// Delete media from post
router.delete('/media/:mediaId', authenticateToken, discoverController.deleteMedia.bind(discoverController));

/**
 * Moderation Routes (for moderators)
 */

// Get all reports
router.get('/reports', authenticateToken, discoverController.getReports.bind(discoverController));

// Update report status
router.patch('/reports/:reportId', authenticateToken, discoverController.updateReportStatus.bind(discoverController));

/**
 * Community Routes
 */

// Create a new community
router.post('/communities', authenticateToken, communityController.createCommunity.bind(communityController));

// Get list of communities
router.get('/communities', communityController.listCommunities.bind(communityController));

// Get specific community by ID
router.get('/communities/:id', communityController.getCommunity.bind(communityController));

// Update community
router.put('/communities/:id', authenticateToken, communityController.updateCommunity.bind(communityController));

// Delete community
router.delete('/communities/:id', authenticateToken, communityController.deleteCommunity.bind(communityController));

// Join a community
router.post('/communities/:id/join', authenticateToken, communityController.joinCommunity.bind(communityController));

// Leave a community
router.delete('/communities/:id/leave', authenticateToken, communityController.leaveCommunity.bind(communityController));

// Get community members
router.get('/communities/:id/members', communityController.getCommunityMembers.bind(communityController));

// Update member role
router.patch('/communities/:id/members/:userId/role', authenticateToken, communityController.updateMemberRole.bind(communityController));

// Remove member from community
router.delete('/communities/:id/members/:userId', authenticateToken, communityController.removeMember.bind(communityController));

// Get user's communities
router.get('/users/:userId/communities', authenticateToken, communityController.getUserCommunities.bind(communityController));

// Upload community avatar
router.post('/communities/:id/avatar', authenticateToken, upload.single('avatar'), communityController.uploadAvatar.bind(communityController));

// Upload community background image
router.post('/communities/:id/background', authenticateToken, upload.single('background'), communityController.uploadBackground.bind(communityController));

/**
 * Sharing Routes
 */

// Get user's conversations for sharing
router.get('/share/conversations', authenticateToken, discoverController.getShareConversations.bind(discoverController));

// Share post or community to conversation
router.post('/share', authenticateToken, discoverController.shareContent.bind(discoverController));

export default router;
