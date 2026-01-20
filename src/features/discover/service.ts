import { prisma } from '../../shared/lib/prisma';
import { discoverMediaService } from './media.service';
import { wsManager } from '../chat/services/websocket.service';
import {
  CreatePostRequest,
  UpdatePostRequest,
  PostResponse,
  PostListQuery,
  PostListResponse,
  PostMedia,
  MediaType
} from './types';

export class DiscoverService {
  /**
   * Create a new post
   */
  async createPost(userId: string, data: CreatePostRequest): Promise<PostResponse> {
    // Determine which communities to post to
    const communityIds = data.communityIds || (data.communityId ? [data.communityId] : []);
    const primaryCommunityId = communityIds[0] || null;

    // Verify user is a member of all communities
    if (communityIds.length > 0) {
      const memberships = await prisma.communityMember.findMany({
        where: {
          userId,
          communityId: { in: communityIds }
        }
      });

      if (memberships.length !== communityIds.length) {
        throw new Error('You must be a member of all communities you want to post to');
      }
    }

    // Create the post with transaction to ensure atomicity
    const post = await prisma.$transaction(async (tx) => {
      const newPost = await tx.post.create({
        data: {
          title: data.title,
          description: data.description ?? null,
          postType: data.postType,
          visibility: data.visibility,
          authorId: userId,
          communityId: primaryCommunityId,  // Set primary community for backward compatibility
          linkUrl: data.linkUrl ?? null,
          tags: data.tags || [],
          voteCount: 0,
          commentCount: 0,
          viewCount: 0
        },
        include: {
          author: {
            select: {
              id: true,
              displayName: true,
              avatarUrl: true
            }
          },
          media: true
        }
      });

      // Create PostCommunity entries for crossposting
      if (communityIds.length > 0) {
        await tx.postCommunity.createMany({
          data: communityIds.map(communityId => ({
            postId: newPost.id,
            communityId
          }))
        });

        // Increment post count for all communities
        await tx.community.updateMany({
          where: { id: { in: communityIds } },
          data: { postCount: { increment: 1 } }
        });
      }

      return newPost;
    });

    return this.mapToPostResponse(post, userId);
  }

  /**
   * Get post by ID
   */
  async getPostById(postId: string, userId?: string): Promise<PostResponse | null> {
    const post = await prisma.post.findUnique({
      where: { id: postId },
      include: {
        author: {
          select: {
            id: true,
            displayName: true,
            avatarUrl: true
          }
        },
        media: {
          orderBy: { order: 'asc' }
        }
      }
    });

    if (!post) return null;

    // Increment view count
    await prisma.post.update({
      where: { id: postId },
      data: { viewCount: { increment: 1 } }
    });

    return this.mapToPostResponse(post, userId);
  }

  /**
   * Get list of posts with filters
   */
  async getPosts(query: PostListQuery, userId?: string): Promise<PostListResponse> {
    const page = query.page || 1;
    const limit = query.limit || 20;
    const skip = (page - 1) * limit;

    const where: any = {};

    if (query.communityId) {
      // Filter by posts in this community (using PostCommunity junction table)
      where.communities = {
        some: {
          communityId: query.communityId
        }
      };
    }

    if (query.authorId) {
      where.authorId = query.authorId;
    }

    if (query.tags && query.tags.length > 0) {
      where.tags = { hasSome: query.tags };
    }

    if (query.search) {
      where.OR = [
        { title: { contains: query.search, mode: 'insensitive' } },
        { description: { contains: query.search, mode: 'insensitive' } }
      ];
    }

    // Time range filter
    if (query.timeRange && query.timeRange !== 'all') {
      const now = new Date();
      const timeMap = {
        day: 1,
        week: 7,
        month: 30,
        year: 365
      };
      const days = timeMap[query.timeRange];
      const startDate = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
      where.createdAt = { gte: startDate };
    }

    // Sorting
    let orderBy: any = {};
    switch (query.sortBy) {
      case 'new':
        orderBy = { createdAt: 'desc' };
        break;
      case 'top':
        orderBy = { voteCount: 'desc' };
        break;
      case 'hot':
        // Hot: combination of votes and recency (will sort in memory after fetch)
        orderBy = { createdAt: 'desc' };
        break;
      case 'trending':
        // Trending: recent activity (views + votes) - will sort in memory
        orderBy = { createdAt: 'desc' };
        break;
      default:
        orderBy = { createdAt: 'desc' };
    }

    const [posts, total] = await Promise.all([
      prisma.post.findMany({
        where,
        skip,
        take: query.sortBy === 'hot' || query.sortBy === 'trending' ? limit * 3 : limit, // Fetch more for in-memory sorting
        orderBy,
        include: {
          author: {
            select: {
              id: true,
              displayName: true,
              avatarUrl: true
            }
          },
          media: {
            orderBy: { order: 'asc' }
          }
        }
      }),
      prisma.post.count({ where })
    ]);

    // Apply advanced sorting algorithms
    let sortedPosts = posts;
    if (query.sortBy === 'hot') {
      sortedPosts = this.sortByHot(posts);
    } else if (query.sortBy === 'trending') {
      sortedPosts = this.sortByTrending(posts);
    }

    // Take only the requested limit after sorting
    sortedPosts = sortedPosts.slice(0, limit);

    const postResponses = await Promise.all(
      sortedPosts.map(post => this.mapToPostResponse(post, userId))
    );

    return {
      posts: postResponses,
      total,
      page,
      limit,
      hasMore: skip + sortedPosts.length < total
    };
  }

  /**
   * Sort posts by "hot" algorithm (Reddit-style)
   * Combines vote score with time decay
   */
  private sortByHot(posts: any[]): any[] {
    const now = Date.now();
    const HOUR_MS = 1000 * 60 * 60;

    return posts.sort((a, b) => {
      const aScore = this.calculateHotScore(a.voteCount, a.createdAt, now, HOUR_MS);
      const bScore = this.calculateHotScore(b.voteCount, b.createdAt, now, HOUR_MS);
      return bScore - aScore;
    });
  }

  /**
   * Calculate hot score for a post
   */
  private calculateHotScore(votes: number, createdAt: Date, now: number, hourMs: number): number {
    const hoursOld = (now - createdAt.getTime()) / hourMs;
    const order = Math.log10(Math.max(Math.abs(votes), 1));
    const sign = votes > 0 ? 1 : votes < 0 ? -1 : 0;

    // Reddit's hot algorithm
    return sign * order - hoursOld / 12.5;
  }

  /**
   * Sort posts by "trending" (recent velocity)
   * Posts with recent engagement (votes + views) in last 24h
   */
  private sortByTrending(posts: any[]): any[] {
    const now = Date.now();
    const DAY_MS = 1000 * 60 * 60 * 24;

    return posts.sort((a, b) => {
      const aScore = this.calculateTrendingScore(a.voteCount, a.viewCount, a.createdAt, now, DAY_MS);
      const bScore = this.calculateTrendingScore(b.voteCount, b.viewCount, b.createdAt, now, DAY_MS);
      return bScore - aScore;
    });
  }

  /**
   * Calculate trending score
   */
  private calculateTrendingScore(votes: number, views: number, createdAt: Date, now: number, dayMs: number): number {
    const ageInDays = (now - createdAt.getTime()) / dayMs;

    // Weight recent posts higher
    if (ageInDays > 7) return 0; // Ignore posts older than 7 days

    const recencyBoost = Math.max(0, 1 - (ageInDays / 7)); // 1.0 for new, 0 for 7 days old
    const engagementScore = (votes * 2) + (views * 0.1); // Votes worth more than views

    return engagementScore * recencyBoost;
  }

  /**
   * Crosspost existing post to additional communities
   */
  async crosspostToCommunities(postId: string, userId: string, communityIds: string[]): Promise<PostResponse> {
    // Verify post exists and user is the author
    const post = await prisma.post.findUnique({
      where: { id: postId }
    });

    if (!post || post.authorId !== userId) {
      throw new Error('Unauthorized to crosspost this post');
    }

    // Get existing crossposted communities
    const existingCommunities = await prisma.postCommunity.findMany({
      where: { postId },
      select: { communityId: true }
    });

    const existingCommunityIds = new Set(existingCommunities.map(pc => pc.communityId));
    const newCommunityIds = communityIds.filter(id => !existingCommunityIds.has(id));

    if (newCommunityIds.length === 0) {
      throw new Error('Post is already crossposted to all selected communities');
    }

    // Verify user is a member of all new communities
    const memberships = await prisma.communityMember.findMany({
      where: {
        userId,
        communityId: { in: newCommunityIds }
      }
    });

    if (memberships.length !== newCommunityIds.length) {
      throw new Error('You must be a member of all communities you want to crosspost to');
    }

    // Add post to new communities
    await prisma.$transaction(async (tx) => {
      // Create PostCommunity entries
      await tx.postCommunity.createMany({
        data: newCommunityIds.map(communityId => ({
          postId,
          communityId
        }))
      });

      // Increment post count for new communities
      await tx.community.updateMany({
        where: { id: { in: newCommunityIds } },
        data: { postCount: { increment: 1 } }
      });
    });

    // Return updated post
    return this.getPostById(postId, userId) as Promise<PostResponse>;
  }

  /**
   * Update post
   */
  async updatePost(postId: string, userId: string, data: UpdatePostRequest): Promise<PostResponse> {
    // Check ownership
    const post = await prisma.post.findUnique({
      where: { id: postId }
    });

    if (!post || post.authorId !== userId) {
      throw new Error('Unauthorized to update this post');
    }

    const updatedPost = await prisma.post.update({
      where: { id: postId },
      data: {
        ...(data.title !== undefined && { title: data.title }),
        ...(data.description !== undefined && { description: data.description }),
        ...(data.visibility !== undefined && { visibility: data.visibility }),
        ...(data.tags !== undefined && { tags: data.tags })
      },
      include: {
        author: {
          select: {
            id: true,
            displayName: true,
            avatarUrl: true
          }
        },
        media: {
          orderBy: { order: 'asc' }
        }
      }
    });

    return this.mapToPostResponse(updatedPost, userId);
  }

  /**
   * Delete post
   */
  async deletePost(postId: string, userId: string): Promise<void> {
    const post = await prisma.post.findUnique({
      where: { id: postId },
      include: { media: true }
    });

    if (!post || post.authorId !== userId) {
      throw new Error('Unauthorized to delete this post');
    }

    // Delete all media files from S3
    for (const media of post.media) {
      try {
        await discoverMediaService.deleteMedia(media.url);
      } catch (error) {
        console.error('Failed to delete media from S3:', error);
        // Continue with post deletion even if media deletion fails
      }
    }

    // Delete post (cascade will delete media records)
    await prisma.post.delete({
      where: { id: postId }
    });
  }

  /**
   * Add media to post
   */
  async addMediaToPost(postId: string, userId: string, mediaData: Omit<PostMedia, 'id'>): Promise<PostMedia> {
    // Check ownership
    const post = await prisma.post.findUnique({
      where: { id: postId }
    });

    if (!post || post.authorId !== userId) {
      throw new Error('Unauthorized to add media to this post');
    }

    const media = await prisma.postMedia.create({
      data: {
        postId,
        type: mediaData.type,
        url: mediaData.url,
        thumbnailUrl: mediaData.thumbnailUrl ?? null,
        filename: mediaData.filename,
        size: mediaData.size,
        duration: mediaData.duration ?? null,
        width: mediaData.width ?? null,
        height: mediaData.height ?? null,
        order: mediaData.order
      }
    });

    return media as PostMedia;
  }

  /**
   * Remove media from post
   */
  async removeMediaFromPost(mediaId: string, userId: string): Promise<void> {
    const media = await prisma.postMedia.findUnique({
      where: { id: mediaId },
      include: { post: true }
    });

    if (!media || media.post.authorId !== userId) {
      throw new Error('Unauthorized to remove this media');
    }

    // Delete from S3
    try {
      await discoverMediaService.deleteMedia(media.url);
    } catch (error) {
      console.error('Failed to delete media from S3:', error);
      // Continue with database deletion
    }

    // Delete from database
    await prisma.postMedia.delete({
      where: { id: mediaId }
    });
  }

  /**
   * Helper method to map database post to response format
   */
  private async mapToPostResponse(post: any, userId?: string): Promise<PostResponse> {
    let userVote = null;
    let isSaved = false;
    let isRead = false;

    if (userId) {
      const [vote, savedPost, postView] = await Promise.all([
        prisma.postVote.findUnique({
          where: {
            userId_postId: {
              userId,
              postId: post.id
            }
          }
        }),
        prisma.savedPost.findUnique({
          where: {
            userId_postId: {
              userId,
              postId: post.id
            }
          }
        }),
        prisma.postView.findUnique({
          where: {
            userId_postId: {
              userId,
              postId: post.id
            }
          }
        })
      ]);
      userVote = (vote?.voteType === 'UP' || vote?.voteType === 'DOWN') ? vote.voteType : null;
      isSaved = !!savedPost;
      isRead = !!postView;
    }

    // Fetch communities this post is crossposted to
    const postCommunities = await prisma.postCommunity.findMany({
      where: { postId: post.id },
      include: {
        community: {
          select: {
            id: true,
            name: true,
            avatarUrl: true
          }
        }
      }
    });

    return {
      id: post.id,
      title: post.title,
      description: post.description,
      postType: post.postType,
      visibility: post.visibility,
      authorId: post.authorId,
      author: post.author,
      communityId: post.communityId,
      communities: postCommunities.map(pc => ({
        id: pc.community.id,
        name: pc.community.name,
        ...(pc.community.avatarUrl && { avatarUrl: pc.community.avatarUrl })
      })),
      linkUrl: post.linkUrl,
      media: post.media || [],
      tags: post.tags || [],
      voteCount: post.voteCount || 0,
      commentCount: post.commentCount || 0,
      viewCount: post.viewCount || 0,
      userVote: userVote || null,
      isSaved,
      isRead,
      createdAt: post.createdAt,
      updatedAt: post.updatedAt
    };
  }

  // ===================================
  // VOTING SYSTEM
  // ===================================

  /**
   * Vote on a post (upvote or downvote)
   */
  async votePost(postId: string, userId: string, voteType: 'UP' | 'DOWN'): Promise<void> {
    // Check if user already voted
    const existingVote = await prisma.postVote.findUnique({
      where: {
        userId_postId: { userId, postId }
      }
    });

    if (existingVote) {
      if (existingVote.voteType === voteType) {
        // Same vote type, do nothing
        return;
      }

      // Different vote type, update vote and adjust count by 2
      const countChange = voteType === 'UP' ? 2 : -2;
      await prisma.$transaction([
        prisma.postVote.update({
          where: { userId_postId: { userId, postId } },
          data: { voteType }
        }),
        prisma.post.update({
          where: { id: postId },
          data: { voteCount: { increment: countChange } }
        })
      ]);
    } else {
      // New vote
      const countChange = voteType === 'UP' ? 1 : -1;
      await prisma.$transaction([
        prisma.postVote.create({
          data: { userId, postId, voteType }
        }),
        prisma.post.update({
          where: { id: postId },
          data: { voteCount: { increment: countChange } }
        })
      ]);
    }
  }

  /**
   * Remove vote from a post
   */
  async removePostVote(postId: string, userId: string): Promise<void> {
    const existingVote = await prisma.postVote.findUnique({
      where: {
        userId_postId: { userId, postId }
      }
    });

    if (!existingVote) {
      return; // No vote to remove
    }

    const countChange = existingVote.voteType === 'UP' ? -1 : 1;
    await prisma.$transaction([
      prisma.postVote.delete({
        where: { userId_postId: { userId, postId } }
      }),
      prisma.post.update({
        where: { id: postId },
        data: { voteCount: { increment: countChange } }
      })
    ]);
  }

  // ===================================
  // COMMENT SYSTEM
  // ===================================

  /**
   * Create a comment on a post
   */
  async createComment(postId: string, userId: string, content: string, parentCommentId?: string): Promise<any> {
    let depth = 0;

    // Calculate depth if replying to another comment
    if (parentCommentId) {
      const parentComment = await prisma.comment.findUnique({
        where: { id: parentCommentId }
      });

      if (!parentComment) {
        throw new Error('Parent comment not found');
      }

      depth = parentComment.depth + 1;
    }

    const comment = await prisma.$transaction(async (tx) => {
      const newComment = await tx.comment.create({
        data: {
          content,
          authorId: userId,
          postId,
          parentCommentId: parentCommentId ?? null,
          depth,
          voteCount: 0
        },
        include: {
          author: {
            select: {
              id: true,
              displayName: true,
              avatarUrl: true
            }
          }
        }
      });

      // Increment comment count on post
      await tx.post.update({
        where: { id: postId },
        data: { commentCount: { increment: 1 } }
      });

      return newComment;
    });

    return { ...comment, userVote: null };
  }

  /**
   * Get comments for a post
   */
  async getComments(postId: string, sortBy: 'new' | 'top' | 'old' | 'best' | 'controversial' = 'best', userId?: string): Promise<any[]> {
    let orderBy: any = {};
    let comments;

    // For 'controversial', we need custom sorting logic
    if (sortBy === 'controversial' || sortBy === 'best') {
      // Fetch all comments without sorting
      comments = await prisma.comment.findMany({
        where: { postId },
        include: {
          author: {
            select: {
              id: true,
              displayName: true,
              avatarUrl: true
            }
          },
          votes: true,
          reactions: true
        }
      });

      if (sortBy === 'controversial') {
        // Sort by controversial: comments with balanced up/down votes
        comments = this.sortByControversial(comments);
      } else {
        // 'best': combine votes, reactions, and age
        comments = this.sortByBest(comments);
      }
    } else {
      // Regular sorting
      switch (sortBy) {
        case 'new':
          orderBy = { createdAt: 'desc' };
          break;
        case 'old':
          orderBy = { createdAt: 'asc' };
          break;
        case 'top':
          orderBy = { voteCount: 'desc' };
          break;
      }

      comments = await prisma.comment.findMany({
        where: { postId },
        orderBy,
        include: {
          author: {
            select: {
              id: true,
              displayName: true,
              avatarUrl: true
            }
          },
          votes: true,
          reactions: true
        }
      });
    }

    // Calculate reaction counts and add user info
    return this.mapCommentsWithUserData(comments, userId);
  }

  /**
   * Sort comments by "best" algorithm
   * Combines vote count, reactions, and time decay
   */
  private sortByBest(comments: any[]): any[] {
    const now = Date.now();
    const HOUR_MS = 1000 * 60 * 60;

    return comments.sort((a, b) => {
      const aScore = this.calculateBestScore(a, now, HOUR_MS);
      const bScore = this.calculateBestScore(b, now, HOUR_MS);
      return bScore - aScore;
    });
  }

  /**
   * Calculate best score for a comment
   */
  private calculateBestScore(comment: any, now: number, hourMs: number): number {
    const hoursOld = (now - comment.createdAt.getTime()) / hourMs;
    const reactionCount = comment.reactions.length;
    const score = comment.voteCount + (reactionCount * 0.5);

    // Time decay factor (less aggressive than posts)
    const timeFactor = 1 / (1 + hoursOld / 24); // Decay over 24 hours

    return score * timeFactor;
  }

  /**
   * Sort comments by controversial
   * Comments with balanced up/down votes
   */
  private sortByControversial(comments: any[]): any[] {
    return comments.sort((a, b) => {
      const aControversy = this.calculateControversy(a);
      const bControversy = this.calculateControversy(b);
      return bControversy - aControversy;
    });
  }

  /**
   * Calculate controversy score
   * Higher score = more balanced between upvotes and downvotes
   */
  private calculateControversy(comment: any): number {
    const upvotes = comment.votes.filter((v: any) => v.voteType === 'UP').length;
    const downvotes = comment.votes.filter((v: any) => v.voteType === 'DOWN').length;
    const total = upvotes + downvotes;

    if (total === 0) return 0;

    // Controversy is highest when votes are 50/50
    const balance = Math.min(upvotes, downvotes);
    const magnitude = Math.sqrt(total);

    return balance * magnitude;
  }

  /**
   * Map comments with user vote and reaction data
   */
  private async mapCommentsWithUserData(comments: any[], userId?: string): Promise<any[]> {
    const commentIds = comments.map(c => c.id);

    // Get user votes and reactions if userId provided
    let voteMap = new Map();
    let reactionMap = new Map();

    if (userId && commentIds.length > 0) {
      const [votes, userReactions] = await Promise.all([
        prisma.commentVote.findMany({
          where: {
            userId,
            commentId: { in: commentIds }
          }
        }),
        prisma.commentReaction.findMany({
          where: {
            userId,
            commentId: { in: commentIds }
          }
        })
      ]);

      voteMap = new Map(votes.map(v => [v.commentId, v.voteType]));
      reactionMap = new Map(userReactions.map(r => [r.commentId, r.reactionType]));
    }

    return comments.map(comment => {
      // Calculate reaction counts
      const reactions = {
        like: comment.reactions.filter((r: any) => r.reactionType === 'LIKE').length,
        funny: comment.reactions.filter((r: any) => r.reactionType === 'FUNNY').length,
        helpful: comment.reactions.filter((r: any) => r.reactionType === 'HELPFUL').length,
        insightful: comment.reactions.filter((r: any) => r.reactionType === 'INSIGHTFUL').length,
        heart: comment.reactions.filter((r: any) => r.reactionType === 'HEART').length
      };

      return {
        id: comment.id,
        content: comment.content,
        authorId: comment.authorId,
        author: comment.author,
        postId: comment.postId,
        parentCommentId: comment.parentCommentId,
        depth: comment.depth,
        voteCount: comment.voteCount,
        isHighlighted: comment.isHighlighted,
        reactions,
        userVote: voteMap.get(comment.id) || null,
        userReaction: reactionMap.get(comment.id) || null,
        createdAt: comment.createdAt,
        updatedAt: comment.updatedAt
      };
    });
  }

  /**
   * Update a comment
   */
  async updateComment(commentId: string, userId: string, content: string): Promise<any> {
    const comment = await prisma.comment.findUnique({
      where: { id: commentId }
    });

    if (!comment || comment.authorId !== userId) {
      throw new Error('Unauthorized to update this comment');
    }

    return await prisma.comment.update({
      where: { id: commentId },
      data: { content },
      include: {
        author: {
          select: {
            id: true,
            displayName: true,
            avatarUrl: true
          }
        }
      }
    });
  }

  /**
   * Delete a comment
   */
  async deleteComment(commentId: string, userId: string): Promise<void> {
    const comment = await prisma.comment.findUnique({
      where: { id: commentId },
      include: { post: true }
    });

    if (!comment || comment.authorId !== userId) {
      throw new Error('Unauthorized to delete this comment');
    }

    // Get count of all comments to delete (including nested replies)
    const commentCount = await this.countCommentAndReplies(commentId);

    await prisma.$transaction(async (tx) => {
      // Delete comment (cascade will handle replies)
      await tx.comment.delete({
        where: { id: commentId }
      });

      // Decrement comment count on post
      await tx.post.update({
        where: { id: comment.postId },
        data: { commentCount: { decrement: commentCount } }
      });
    });
  }

  /**
   * Count comment and all its replies recursively
   */
  private async countCommentAndReplies(commentId: string): Promise<number> {
    const replies = await prisma.comment.findMany({
      where: { parentCommentId: commentId },
      select: { id: true }
    });

    let count = 1; // Current comment
    for (const reply of replies) {
      count += await this.countCommentAndReplies(reply.id);
    }

    return count;
  }

  // ===================================
  // COMMENT VOTING
  // ===================================

  /**
   * Vote on a comment
   */
  async voteComment(commentId: string, userId: string, voteType: 'UP' | 'DOWN'): Promise<void> {
    const existingVote = await prisma.commentVote.findUnique({
      where: {
        userId_commentId: { userId, commentId }
      }
    });

    if (existingVote) {
      if (existingVote.voteType === voteType) {
        return;
      }

      const countChange = voteType === 'UP' ? 2 : -2;
      await prisma.$transaction([
        prisma.commentVote.update({
          where: { userId_commentId: { userId, commentId } },
          data: { voteType }
        }),
        prisma.comment.update({
          where: { id: commentId },
          data: { voteCount: { increment: countChange } }
        })
      ]);
    } else {
      const countChange = voteType === 'UP' ? 1 : -1;
      await prisma.$transaction([
        prisma.commentVote.create({
          data: { userId, commentId, voteType }
        }),
        prisma.comment.update({
          where: { id: commentId },
          data: { voteCount: { increment: countChange } }
        })
      ]);
    }
  }

  /**
   * Remove vote from a comment
   */
  async removeCommentVote(commentId: string, userId: string): Promise<void> {
    const existingVote = await prisma.commentVote.findUnique({
      where: {
        userId_commentId: { userId, commentId }
      }
    });

    if (!existingVote) {
      return;
    }

    const countChange = existingVote.voteType === 'UP' ? -1 : 1;
    await prisma.$transaction([
      prisma.commentVote.delete({
        where: { userId_commentId: { userId, commentId } }
      }),
      prisma.comment.update({
        where: { id: commentId },
        data: { voteCount: { increment: countChange } }
      })
    ]);
  }

  // ===================================
  // COMMENT REACTIONS
  // ===================================

  /**
   * Add or update reaction to a comment
   */
  async reactToComment(commentId: string, userId: string, reactionType: string): Promise<void> {
    // Check if user already has a reaction on this comment
    const existingReaction = await prisma.commentReaction.findFirst({
      where: {
        userId,
        commentId
      }
    });

    if (existingReaction) {
      if (existingReaction.reactionType === reactionType) {
        // Same reaction, remove it (toggle off)
        await prisma.commentReaction.delete({
          where: { id: existingReaction.id }
        });
      } else {
        // Different reaction, update it
        await prisma.commentReaction.update({
          where: { id: existingReaction.id },
          data: { reactionType: reactionType as any }
        });
      }
    } else {
      // New reaction
      await prisma.commentReaction.create({
        data: {
          userId,
          commentId,
          reactionType: reactionType as any
        }
      });
    }
  }

  /**
   * Remove reaction from a comment
   */
  async removeCommentReaction(commentId: string, userId: string): Promise<void> {
    await prisma.commentReaction.deleteMany({
      where: {
        userId,
        commentId
      }
    });
  }

  /**
   * Toggle comment highlight (best comment marker)
   */
  async toggleCommentHighlight(commentId: string, userId: string): Promise<void> {
    const comment = await prisma.comment.findUnique({
      where: { id: commentId },
      include: {
        post: {
          select: { authorId: true }
        }
      }
    });

    if (!comment) {
      throw new Error('Comment not found');
    }

    // Only post author can highlight comments
    if (comment.post.authorId !== userId) {
      throw new Error('Only the post author can highlight comments');
    }

    await prisma.comment.update({
      where: { id: commentId },
      data: { isHighlighted: !comment.isHighlighted }
    });
  }

  // ===================================
  // READING HISTORY
  // ===================================

  /**
   * Mark post as read/viewed
   */
  async markPostAsRead(postId: string, userId: string): Promise<void> {
    await prisma.postView.upsert({
      where: {
        userId_postId: { userId, postId }
      },
      create: { userId, postId },
      update: { viewedAt: new Date() }
    });
  }

  /**
   * Check if user has read a post
   */
  async hasUserReadPost(postId: string, userId: string): Promise<boolean> {
    const view = await prisma.postView.findUnique({
      where: {
        userId_postId: { userId, postId }
      }
    });
    return !!view;
  }

  // ===================================
  // SAVED POSTS
  // ===================================

  /**
   * Save a post
   */
  async savePost(postId: string, userId: string): Promise<void> {
    await prisma.savedPost.upsert({
      where: {
        userId_postId: { userId, postId }
      },
      create: { userId, postId },
      update: {}
    });
  }

  /**
   * Unsave a post
   */
  async unsavePost(postId: string, userId: string): Promise<void> {
    await prisma.savedPost.delete({
      where: {
        userId_postId: { userId, postId }
      }
    }).catch(() => {
      // Ignore error if not found
    });
  }

  /**
   * Get user's saved posts
   */
  async getSavedPosts(userId: string, page: number = 1, limit: number = 20): Promise<PostListResponse> {
    const skip = (page - 1) * limit;

    const [savedPosts, total] = await Promise.all([
      prisma.savedPost.findMany({
        where: { userId },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          post: {
            include: {
              author: {
                select: {
                  id: true,
                  displayName: true,
                  avatarUrl: true
                }
              },
              media: {
                orderBy: { order: 'asc' }
              }
            }
          }
        }
      }),
      prisma.savedPost.count({ where: { userId } })
    ]);

    const postResponses = await Promise.all(
      savedPosts.map(sp => this.mapToPostResponse(sp.post, userId))
    );

    return {
      posts: postResponses,
      total,
      page,
      limit,
      hasMore: skip + savedPosts.length < total
    };
  }

  // ===================================
  // MODERATION
  // ===================================

  /**
   * Report a post
   */
  async reportPost(postId: string, reporterId: string, reason: string, details?: string): Promise<void> {
    await prisma.postReport.create({
      data: {
        postId,
        reporterId,
        reason,
        details: details ?? null,
        status: 'pending'
      }
    });
  }

  /**
   * Report a comment
   */
  async reportComment(commentId: string, reporterId: string, reason: string, details?: string): Promise<void> {
    await prisma.commentReport.create({
      data: {
        commentId,
        reporterId,
        reason,
        details: details ?? null,
        status: 'pending'
      }
    });
  }

  /**
   * Get all reports (for moderators)
   */
  async getReports(status?: string): Promise<any> {
    const where: any = {};
    if (status) {
      where.status = status;
    }

    const [postReports, commentReports] = await Promise.all([
      prisma.postReport.findMany({
        where,
        include: {
          post: {
            select: {
              id: true,
              title: true,
              authorId: true
            }
          },
          reporter: {
            select: {
              id: true,
              displayName: true
            }
          }
        },
        orderBy: { createdAt: 'desc' }
      }),
      prisma.commentReport.findMany({
        where,
        include: {
          comment: {
            select: {
              id: true,
              content: true,
              authorId: true
            }
          },
          reporter: {
            select: {
              id: true,
              displayName: true
            }
          }
        },
        orderBy: { createdAt: 'desc' }
      })
    ]);

    return {
      postReports,
      commentReports
    };
  }

  /**
   * Update report status
   */
  async updateReportStatus(reportId: string, reportType: 'post' | 'comment', status: string): Promise<void> {
    if (reportType === 'post') {
      await prisma.postReport.update({
        where: { id: reportId },
        data: { status }
      });
    } else {
      await prisma.commentReport.update({
        where: { id: reportId },
        data: { status }
      });
    }
  }

  /**
   * Share post or community to chat conversation
   */
  async shareContent(
    userId: string,
    contentType: 'POST' | 'COMMUNITY',
    contentId: string,
    conversationId: string,
    message?: string
  ): Promise<any> {
    // Verify content exists
    if (contentType === 'POST') {
      const post = await prisma.post.findUnique({ where: { id: contentId } });
      if (!post) throw new Error('Post not found');
    } else {
      const community = await prisma.community.findUnique({ where: { id: contentId } });
      if (!community) throw new Error('Community not found');
    }

    // Verify user is member of conversation
    const member = await prisma.chatConversationMember.findFirst({
      where: {
        conversationId,
        userId
      }
    });

    if (!member) {
      throw new Error('You are not a member of this conversation');
    }

    // Create default message if no custom message provided
    const messageContent = message || (contentType === 'POST' ? 'Hey check this post' : 'Hey check this community');

    // Create message with shared content
    const chatMessage = await prisma.message.create({
      data: {
        conversationId,
        userId: userId,
        messageType: 'TEXT',
        content: messageContent,
        sharedDiscovery: {
          create: {
            contentType,
            postId: contentType === 'POST' ? contentId : null,
            communityId: contentType === 'COMMUNITY' ? contentId : null,
            sharedBy: userId,
            shareMessage: message || null
          }
        }
      },

      include: {
        sharedDiscovery: {
          include: {
            post: {
              include: {
                author: {
                  select: {
                    id: true,
                    displayName: true,
                    avatarUrl: true,
                    username: true // Added username
                  }
                },
                media: true,
                community: true
              }
            },
            community: {
              include: {
                creator: {
                  select: {
                    id: true,
                    displayName: true,
                    avatarUrl: true
                  }
                }
              }
            }
          }
        }
      }
    });

    // Map to ChatMessage format (flatten sharedDiscovery)
    const formattedMessage: any = {
      ...chatMessage,
      sharedPost: chatMessage.sharedDiscovery?.post,
      sharedCommunity: chatMessage.sharedDiscovery?.community,
      sharedPostId: chatMessage.sharedDiscovery?.postId,
      sharedCommunityId: chatMessage.sharedDiscovery?.communityId,
    };

    // Emit websocket event
    wsManager.emitNewMessage(conversationId, formattedMessage);

    return formattedMessage;
  }

  /**
   * Get user's conversations for sharing
   */
  async getUserConversations(userId: string): Promise<any[]> {
    const memberships = await prisma.chatConversationMember.findMany({
      where: {
        userId
      },
      include: {
        conversation: {
          include: {
            members: {
              include: {
                user: {
                  select: {
                    id: true,
                    displayName: true,
                    avatarUrl: true
                  }
                }
              }
            }
          }
        }
      },
      orderBy: {
        joinedAt: 'desc'
      }
    });

    return memberships.map((m: any) => {
      const conversation = m.conversation;
      let name = conversation.name;
      let avatarUrl = conversation.avatarUrl;

      // For one-to-one conversations, get the other user's info
      if (!conversation.isGroup) {
        const otherMember = conversation.members.find((mem: any) => mem.userId !== userId);
        if (otherMember) {
          name = otherMember.user.displayName;
          avatarUrl = otherMember.user.avatarUrl;
        }
      }

      return {
        id: conversation.id,
        name,
        avatarUrl,
        isGroup: conversation.isGroup,
        memberCount: conversation.members.length
      };
    });
  }

  // ===================================
  // LEADERBOARDS & ANALYTICS
  // ===================================

  /**
   * Get leaderboard with different metrics
   */
  async getLeaderboard(
    metric: 'posts' | 'votes' | 'comments' | 'engagement',
    timeframe: 'day' | 'week' | 'month' | 'all' = 'week',
    limit: number = 10
  ): Promise<any[]> {
    const now = new Date();
    let startDate: Date | undefined;

    // Calculate start date based on timeframe
    switch (timeframe) {
      case 'day':
        startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        break;
      case 'week':
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case 'month':
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      case 'all':
        startDate = undefined;
        break;
    }

    switch (metric) {
      case 'posts': {
        // Top post creators
        const topUsers = await prisma.post.groupBy({
          by: ['authorId'],
          where: startDate ? {
            createdAt: { gte: startDate }
          } : {},
          _count: {
            id: true
          },
          orderBy: {
            _count: {
              id: 'desc'
            }
          },
          take: limit
        });

        const userIds = topUsers.map(u => u.authorId);
        const users = await prisma.user.findMany({
          where: { id: { in: userIds } },
          select: {
            id: true,
            displayName: true,
            avatarUrl: true
          }
        });

        return topUsers.map((item, index) => {
          const user = users.find(u => u.id === item.authorId);
          return {
            rank: index + 1,
            user,
            score: item._count?.id || 0,
            metric: 'posts'
          };
        });
      }

      case 'votes': {
        // Top voted users (users with most upvotes on their posts)
        const topUsers = await prisma.postVote.groupBy({
          by: ['postId'],
          where: {
            voteType: 'UP',
            ...(startDate && { createdAt: { gte: startDate } })
          },
          _count: {
            id: true
          }
        });

        // Get posts with their authors
        const postIds = topUsers.map(v => v.postId);
        const posts = await prisma.post.findMany({
          where: { id: { in: postIds } },
          select: {
            id: true,
            authorId: true
          }
        });

        // Aggregate votes by author
        const authorVotes = new Map<string, number>();
        topUsers.forEach(vote => {
          const post = posts.find(p => p.id === vote.postId);
          if (post) {
            authorVotes.set(post.authorId, (authorVotes.get(post.authorId) || 0) + vote._count.id);
          }
        });

        // Sort and get top users
        const sortedAuthors = Array.from(authorVotes.entries())
          .sort((a, b) => b[1] - a[1])
          .slice(0, limit);

        const userIds = sortedAuthors.map(([userId]) => userId);
        const users = await prisma.user.findMany({
          where: { id: { in: userIds } },
          select: {
            id: true,
            displayName: true,
            avatarUrl: true
          }
        });

        return sortedAuthors.map(([userId, score], index) => {
          const user = users.find(u => u.id === userId);
          return {
            rank: index + 1,
            user,
            score,
            metric: 'upvotes'
          };
        });
      }

      case 'comments': {
        // Top commenters
        const topUsers = await prisma.comment.groupBy({
          by: ['authorId'],
          where: startDate ? {
            createdAt: { gte: startDate }
          } : {},
          _count: {
            id: true
          },
          orderBy: {
            _count: {
              id: 'desc'
            }
          },
          take: limit
        });

        const userIds = topUsers.map(u => u.authorId);
        const users = await prisma.user.findMany({
          where: { id: { in: userIds } },
          select: {
            id: true,
            displayName: true,
            avatarUrl: true
          }
        });

        return topUsers.map((item, index) => {
          const user = users.find(u => u.id === item.authorId);
          return {
            rank: index + 1,
            user,
            score: item._count?.id || 0,
            metric: 'comments'
          };
        });
      }

      case 'engagement': {
        // Combined engagement score (posts * 3 + comments * 1 + reactions * 0.5)
        const [postCounts, commentCounts, reactionCounts] = await Promise.all([
          prisma.post.groupBy({
            by: ['authorId'],
            where: startDate ? { createdAt: { gte: startDate } } : {},
            _count: { id: true }
          }),
          prisma.comment.groupBy({
            by: ['authorId'],
            where: startDate ? { createdAt: { gte: startDate } } : {},
            _count: { id: true }
          }),
          prisma.commentReaction.groupBy({
            by: ['userId'],
            where: startDate ? { createdAt: { gte: startDate } } : {},
            _count: { id: true }
          })
        ]);

        // Calculate engagement scores
        const engagementScores = new Map<string, number>();

        postCounts.forEach(item => {
          engagementScores.set(item.authorId, (engagementScores.get(item.authorId) || 0) + (item._count?.id || 0) * 3);
        });

        commentCounts.forEach(item => {
          engagementScores.set(item.authorId, (engagementScores.get(item.authorId) || 0) + (item._count?.id || 0));
        });

        reactionCounts.forEach(item => {
          engagementScores.set(item.userId, (engagementScores.get(item.userId) || 0) + (item._count?.id || 0) * 0.5);
        });

        // Sort and get top users
        const sortedUsers = Array.from(engagementScores.entries())
          .sort((a, b) => b[1] - a[1])
          .slice(0, limit);

        const userIds = sortedUsers.map(([userId]) => userId);
        const users = await prisma.user.findMany({
          where: { id: { in: userIds } },
          select: {
            id: true,
            displayName: true,
            avatarUrl: true
          }
        });

        return sortedUsers.map(([userId, score], index) => {
          const user = users.find(u => u.id === userId);
          return {
            rank: index + 1,
            user,
            score: Math.round(score),
            metric: 'engagement'
          };
        });
      }

      default:
        throw new Error('Invalid metric');
    }
  }

  /**
   * Get popular authors based on various criteria
   */
  async getPopularAuthors(limit: number = 10, requestingUserId?: string): Promise<any[]> {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    // Get authors with most engagement in last 30 days
    const authorPosts = await prisma.post.groupBy({
      by: ['authorId'],
      where: {
        createdAt: { gte: thirtyDaysAgo }
      },
      _count: { id: true },
      _sum: { voteCount: true }
    });

    // Calculate popularity scores
    const popularityScores = new Map<string, { posts: number; votes: number; followers: number }>();

    authorPosts.forEach((item: any) => {
      popularityScores.set(item.authorId, {
        posts: item._count?.id || 0,
        votes: item._sum?.voteCount || 0,
        followers: 0
      });
    });

    // Calculate final score: (posts * 2) + (votes * 0.1)
    const scoredAuthors = Array.from(popularityScores.entries())
      .map(([userId, stats]: [string, any]) => ({
        userId,
        score: (stats.posts * 2) + (stats.votes * 0.1),
        stats
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);

    // Get user and teacher details
    const userIds = scoredAuthors.map(a => a.userId);
    const users = await prisma.user.findMany({
      where: { id: { in: userIds } },
      select: {
        id: true,
        displayName: true,
        avatarUrl: true
      }
    });

    // Get teacher IDs for these users
    const teachers = await prisma.teacher.findMany({
      where: { userId: { in: userIds } },
      select: {
        id: true,
        userId: true
      }
    });

    const teacherMap = new Map(teachers.map(t => [t.userId, t.id]));

    // Check follow status if requesting user is provided
    let followedTeacherIds = new Set<string>();
    if (requestingUserId) {
      const student = await prisma.student.findUnique({
        where: { userId: requestingUserId },
        select: { id: true }
      });

      const requestingTeacher = !student ? await prisma.teacher.findUnique({
        where: { userId: requestingUserId },
        select: { id: true }
      }) : null;

      if (student) {
        const follows = await prisma.teacherFollower.findMany({
          where: { studentId: student.id },
          select: { teacherId: true }
        });
        followedTeacherIds = new Set(follows.map(f => f.teacherId));
      } else if (requestingTeacher) {
        const follows = await prisma.teacherToTeacher.findMany({
          where: { followerId: requestingTeacher.id },
          select: { followedId: true }
        });
        followedTeacherIds = new Set(follows.map(f => f.followedId));
      }
    }

    return scoredAuthors.map((item, index) => {
      const user = users.find(u => u.id === item.userId);
      const teacherId = teacherMap.get(item.userId);
      return {
        rank: index + 1,
        user: {
          ...user,
          teacherId
        },
        stats: item.stats,
        popularityScore: Math.round(item.score),
        isFollowing: teacherId ? followedTeacherIds.has(teacherId) : false
      };
    });
  }

  /**
   * Get recommended posts (trending or personalized)
   */
  async getRecommendedPosts(userId?: string, limit: number = 10): Promise<any[]> {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    if (userId) {
      // Personalized recommendations based on user's interests

      // Get communities user is part of
      const userCommunities = await prisma.communityMember.findMany({
        where: { userId },
        select: { communityId: true }
      });

      const communityIds = userCommunities.map(cm => cm.communityId);

      // Get tags from posts user has voted on
      const votedPosts = await prisma.postVote.findMany({
        where: { userId, voteType: 'UP' },
        take: 20,
        orderBy: { createdAt: 'desc' },
        include: {
          post: {
            select: { tags: true }
          }
        }
      });

      const userTags = new Set<string>();
      votedPosts.forEach(vote => {
        vote.post.tags?.forEach(tag => userTags.add(tag));
      });

      // Get posts viewed by user (to exclude)
      const viewedPostIds = await prisma.postView.findMany({
        where: { userId },
        select: { postId: true }
      });

      const excludeIds = viewedPostIds.map(v => v.postId);

      // Find relevant posts
      const posts = await prisma.post.findMany({
        where: {
          id: { notIn: excludeIds },
          createdAt: { gte: sevenDaysAgo },
          OR: [
            { communityId: { in: communityIds } },
            { tags: { hasSome: Array.from(userTags) } }
          ]
        },
        include: {
          author: {
            select: {
              id: true,
              displayName: true,
              avatarUrl: true
            }
          },
          community: {
            select: {
              id: true,
              name: true,
              avatarUrl: true
            }
          }
        },
        orderBy: [
          { voteCount: 'desc' },
          { commentCount: 'desc' }
        ],
        take: limit
      });

      return posts.map(post => this.mapToPostResponse(post, userId));
    } else {
      // Trending posts for non-authenticated users
      return this.getTrendingPosts(limit);
    }
  }

  /**
   * Get trending posts (public, high engagement)
   */
  private async getTrendingPosts(limit: number = 10): Promise<any[]> {
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);

    // Calculate trending score: voteCount + (commentCount * 2) with time decay
    const posts = await prisma.post.findMany({
      where: {
        createdAt: { gte: threeDaysAgo },
        visibility: 'PUBLIC'
      },
      include: {
        author: {
          select: {
            id: true,
            displayName: true,
            avatarUrl: true
          }
        },
        community: {
          select: {
            id: true,
            name: true,
            avatarUrl: true
          }
        }
      },
      orderBy: [
        { voteCount: 'desc' },
        { commentCount: 'desc' }
      ],
      take: limit * 2 // Get more for sorting
    });

    // Apply time decay
    const scoredPosts = posts.map(post => {
      const hoursSincePost = (Date.now() - post.createdAt.getTime()) / (1000 * 60 * 60);
      const decayFactor = Math.max(0.1, 1 - (hoursSincePost / 72)); // 3-day decay
      const trendingScore = ((post.voteCount || 0) + ((post.commentCount || 0) * 2)) * decayFactor;

      return {
        post,
        trendingScore
      };
    });

    // Sort by trending score and take top limit
    const topPosts = scoredPosts
      .sort((a, b) => b.trendingScore - a.trendingScore)
      .slice(0, limit);

    return topPosts.map(({ post }) => this.mapToPostResponse(post));
  }

  /**
   * Get user discovery stats
   */
  async getUserStats(userId: string): Promise<any> {
    const [posts, comments, votes] = await Promise.all([
      // Count posts by user
      prisma.post.count({
        where: { authorId: userId }
      }),
      // Count comments by user
      prisma.comment.count({
        where: { authorId: userId }
      }),
      // Count votes by user
      prisma.postVote.count({
        where: { userId }
      })
    ]);

    // Calculate total engagement (posts + comments + votes given)
    const totalEngagement = posts + comments + votes;

    return {
      posts,
      comments,
      votes,
      totalEngagement
    };
  }

  /**
   * Get trending tags/topics
   */
  async getTrendingTags(limit: number = 20): Promise<any[]> {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    // Get all posts from last 7 days
    const recentPosts = await prisma.post.findMany({
      where: {
        createdAt: { gte: sevenDaysAgo },
        tags: { isEmpty: false }
      },
      select: {
        tags: true,
        voteCount: true,
        commentCount: true,
        createdAt: true
      }
    });

    // Count tag occurrences and calculate engagement scores
    const tagStats = new Map<string, { count: number; totalVotes: number; totalComments: number }>();

    recentPosts.forEach(post => {
      post.tags?.forEach(tag => {
        const existing = tagStats.get(tag) || { count: 0, totalVotes: 0, totalComments: 0 };
        existing.count++;
        existing.totalVotes += post.voteCount || 0;
        existing.totalComments += post.commentCount || 0;
        tagStats.set(tag, existing);
      });
    });

    // Calculate trending score for each tag
    const trendingTags = Array.from(tagStats.entries())
      .map(([tag, stats]) => ({
        tag,
        postCount: stats.count,
        totalVotes: stats.totalVotes,
        totalComments: stats.totalComments,
        trendingScore: stats.count + (stats.totalVotes * 0.5) + (stats.totalComments * 2)
      }))
      .sort((a, b) => b.trendingScore - a.trendingScore)
      .slice(0, limit);

    return trendingTags;
  }
}

export const discoverService = new DiscoverService();