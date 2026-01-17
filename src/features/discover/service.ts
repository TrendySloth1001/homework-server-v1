import { prisma } from '../../shared/lib/prisma';
import { discoverMediaService } from './media.service';
import { wsManager } from '../chat/services/websocket_service';
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

    if (userId) {
      const [vote, savedPost] = await Promise.all([
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
        })
      ]);
      userVote = vote?.voteType || null;
      isSaved = !!savedPost;
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
      userVote,
      isSaved,
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
  async getComments(postId: string, sortBy: 'new' | 'top' | 'old' = 'top', userId?: string): Promise<any[]> {
    let orderBy: any = {};
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

    const comments = await prisma.comment.findMany({
      where: { postId },
      orderBy,
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

    // Add user vote info if userId provided
    if (userId) {
      const commentIds = comments.map(c => c.id);
      const votes = await prisma.commentVote.findMany({
        where: {
          userId,
          commentId: { in: commentIds }
        }
      });

      const voteMap = new Map(votes.map(v => [v.commentId, v.voteType]));
      return comments.map(comment => ({
        ...comment,
        userVote: voteMap.get(comment.id) || null
      }));
    }

    return comments.map(comment => ({ ...comment, userVote: null }));
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
}

export const discoverService = new DiscoverService();