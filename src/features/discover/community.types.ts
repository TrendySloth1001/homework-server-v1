/**
 * Community Types
 * Types for community management, membership, and roles
 */

export enum CommunityRole {
  CREATOR = 'CREATOR',
  MODERATOR = 'MODERATOR',
  MEMBER = 'MEMBER'
}

export interface CreateCommunityRequest {
  name: string;
  description?: string;
  avatarUrl?: string;
  bannerUrl?: string;
  rules?: string;
  visibility?: 'PUBLIC' | 'FOLLOWERS' | 'PRIVATE';
  allowMemberPosts?: boolean;
  requireApproval?: boolean;
}

export interface UpdateCommunityRequest {
  name?: string;
  description?: string;
  avatarUrl?: string;
  bannerUrl?: string;
  rules?: string;
  visibility?: 'PUBLIC' | 'FOLLOWERS' | 'PRIVATE';
  allowMemberPosts?: boolean;
  requireApproval?: boolean;
}

export interface CommunityResponse {
  id: string;
  name: string;
  description?: string;
  creatorId: string;
  avatarUrl?: string;
  bannerUrl?: string;
  rules?: string;
  visibility: string;
  allowMemberPosts: boolean;
  requireApproval: boolean;
  memberCount: number;
  postCount: number;
  createdAt: Date;
  updatedAt: Date;
  userRole?: CommunityRole | null;
  isMember?: boolean;
  mutualMembers?: {
    id: string;
    displayName: string;
    avatarUrl?: string | null;
  }[];
}

export interface CommunityListQuery {
  page?: number;
  limit?: number;
  search?: string;
  sortBy?: 'new' | 'popular' | 'name';
}

export interface CommunityListResponse {
  communities: CommunityResponse[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
}

export interface CommunityMemberResponse {
  id: string;
  userId: string;
  role: CommunityRole;
  joinedAt: Date;
  user: {
    id: string;
    displayName: string;
    avatarUrl?: string;
  };
}

export interface UpdateMemberRoleRequest {
  role: CommunityRole;
}
