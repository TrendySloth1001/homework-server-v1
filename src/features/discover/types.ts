export enum PostType {
  TEXT = 'TEXT',
  IMAGE = 'IMAGE',
  VIDEO = 'VIDEO',
  AUDIO = 'AUDIO',
  LINK = 'LINK',
  MIXED = 'MIXED'
}

export enum MediaType {
  IMAGE = 'IMAGE',
  VIDEO = 'VIDEO',
  AUDIO = 'AUDIO'
}

export enum PostVisibility {
  PUBLIC = 'PUBLIC',
  FOLLOWERS = 'FOLLOWERS',
  PRIVATE = 'PRIVATE'
}

export enum ReactionType {
  LIKE = 'LIKE',
  FUNNY = 'FUNNY',
  HELPFUL = 'HELPFUL',
  INSIGHTFUL = 'INSIGHTFUL',
  HEART = 'HEART'
}

export interface PostMedia {
  id: string;
  type: MediaType;
  url: string;
  thumbnailUrl?: string;
  filename: string;
  size: number;
  duration?: number; // for video/audio in seconds
  width?: number; // for images/videos
  height?: number; // for images/videos
  order: number;
}

export interface CreatePostRequest {
  title: string;
  description?: string;
  postType: PostType;
  visibility: PostVisibility;
  tags?: string[];
  communityId?: string;      // Legacy: single community (deprecated)
  communityIds?: string[];   // New: multiple communities for crossposting
  linkUrl?: string;
}

export interface UpdatePostRequest {
  title?: string;
  description?: string;
  visibility?: PostVisibility;
  tags?: string[];
}

export interface PostResponse {
  id: string;
  title: string;
  description?: string;
  postType: PostType;
  visibility: PostVisibility;
  authorId: string;
  author: {
    id: string;
    displayName: string;
    avatarUrl?: string;
  };
  communityId?: string;      // Legacy: primary community
  communities?: Array<{      // New: all communities (for crossposting)
    id: string;
    name: string;
    avatarUrl?: string;
  }>;
  linkUrl?: string;
  media: PostMedia[];
  tags: string[];
  voteCount: number;
  commentCount: number;
  viewCount: number;
  userVote?: 'UP' | 'DOWN' | null;
  isSaved?: boolean;
  isRead?: boolean;          // Whether user has viewed this post
  createdAt: Date;
  updatedAt: Date;
}

export interface PostListQuery {
  page?: number;
  limit?: number;
  sortBy?: 'new' | 'hot' | 'top' | 'trending';
  timeRange?: 'day' | 'week' | 'month' | 'year' | 'all';
  communityId?: string;
  authorId?: string;
  tags?: string[];
  search?: string;
}

export interface PostListResponse {
  posts: PostResponse[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
}

export interface UploadMediaResponse {
  media: PostMedia;
}

// ===================================
// COMMENT TYPES
// ===================================

export interface CommentResponse {
  id: string;
  content: string;
  authorId: string;
  author: {
    id: string;
    displayName: string;
    avatarUrl?: string;
  };
  postId: string;
  parentCommentId?: string;
  depth: number;
  voteCount: number;
  userVote?: 'UP' | 'DOWN' | null;
  isHighlighted?: boolean;    // Best comment marker
  reactions?: {
    like: number;
    funny: number;
    helpful: number;
    insightful: number;
    heart: number;
  };
  userReaction?: ReactionType | null;  // User's reaction to this comment
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateCommentRequest {
  content: string;
  parentCommentId?: string;
}

export interface UpdateCommentRequest {
  content: string;
}

// ===================================
// VOTING TYPES
// ===================================

export interface VoteRequest {
  voteType: 'UP' | 'DOWN';
}

// ===================================
// SAVED POSTS TYPES
// ===================================

export interface SavedPostsResponse {
  posts: PostResponse[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
}

// ===================================
// MODERATION TYPES
// ===================================

export interface ReportRequest {
  reason: string;
  details?: string;
}

export interface ReportResponse {
  id: string;
  reason: string;
  details?: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface PostReportResponse extends ReportResponse {
  postId: string;
  reporterId: string;
  post: {
    id: string;
    title: string;
    authorId: string;
  };
  reporter: {
    id: string;
    displayName: string;
  };
}

export interface CommentReportResponse extends ReportResponse {
  commentId: string;
  reporterId: string;
  comment: {
    id: string;
    content: string;
    authorId: string;
  };
  reporter: {
    id: string;
    displayName: string;
  };
}

export interface AllReportsResponse {
  postReports: PostReportResponse[];
  commentReports: CommentReportResponse[];
}
