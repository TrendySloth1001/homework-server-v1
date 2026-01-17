/**
 * Community Service
 * Handles community CRUD, membership management, and permissions
 */

import { prisma } from '../../shared/lib/prisma';
import { s3Service } from '../../shared/lib/s3';
import {
  CreateCommunityRequest,
  UpdateCommunityRequest,
  CommunityResponse,
  CommunityListQuery,
  CommunityListResponse,
  CommunityMemberResponse,
  CommunityRole
} from './community.types';

export class CommunityService {
  /**
   * Create a new community
   */
  async createCommunity(userId: string, data: CreateCommunityRequest): Promise<CommunityResponse> {
    const community = await prisma.community.create({
      data: {
        name: data.name,
        description: data.description ?? null,
        creatorId: userId,
        avatarUrl: data.avatarUrl ?? null,
        bannerUrl: data.bannerUrl ?? null,
        rules: data.rules ?? null,
        visibility: data.visibility || 'PUBLIC',
        allowMemberPosts: data.allowMemberPosts ?? true,
        requireApproval: data.requireApproval ?? false,
        memberCount: 1, // Creator is automatically a member
        postCount: 0
      }
    });

    // Add creator as member with CREATOR role
    await prisma.communityMember.create({
      data: {
        communityId: community.id,
        userId,
        role: 'CREATOR'
      }
    });

    return this.mapToCommunityResponse(community, userId);
  }

  /**
   * Get community by ID
   */
  async getCommunityById(communityId: string, userId?: string): Promise<CommunityResponse | null> {
    const community = await prisma.community.findUnique({
      where: { id: communityId }
    });

    if (!community) return null;

    return this.mapToCommunityResponse(community, userId);
  }

  /**
   * Get list of communities
   */
  async getCommunities(query: CommunityListQuery, userId?: string): Promise<CommunityListResponse> {
    const page = query.page || 1;
    const limit = query.limit || 20;
    const skip = (page - 1) * limit;

    const where: any = {
      visibility: 'PUBLIC' // Only show public communities for now
    };

    if (query.search) {
      where.OR = [
        { name: { contains: query.search, mode: 'insensitive' } },
        { description: { contains: query.search, mode: 'insensitive' } }
      ];
    }

    let orderBy: any = {};
    switch (query.sortBy) {
      case 'new':
        orderBy = { createdAt: 'desc' };
        break;
      case 'popular':
        orderBy = { memberCount: 'desc' };
        break;
      case 'name':
        orderBy = { name: 'asc' };
        break;
      default:
        orderBy = { memberCount: 'desc' };
    }

    const [communities, total] = await Promise.all([
      prisma.community.findMany({
        where,
        skip,
        take: limit,
        orderBy
      }),
      prisma.community.count({ where })
    ]);

    const communityResponses = await Promise.all(
      communities.map(c => this.mapToCommunityResponse(c, userId))
    );

    return {
      communities: communityResponses,
      total,
      page,
      limit,
      hasMore: skip + communities.length < total
    };
  }

  /**
   * Update community
   */
  async updateCommunity(
    communityId: string,
    userId: string,
    data: UpdateCommunityRequest
  ): Promise<CommunityResponse> {
    // Check if user has permission (creator or moderator)
    const member = await prisma.communityMember.findUnique({
      where: {
        communityId_userId: { communityId, userId }
      }
    });

    if (!member || (member.role !== 'CREATOR' && member.role !== 'MODERATOR')) {
      throw new Error('Unauthorized to update this community');
    }

    const updateData: any = {};
    if (data.name !== undefined) updateData.name = data.name;
    if (data.description !== undefined) updateData.description = data.description;
    if (data.avatarUrl !== undefined) updateData.avatarUrl = data.avatarUrl;
    if (data.bannerUrl !== undefined) updateData.bannerUrl = data.bannerUrl;
    if (data.rules !== undefined) updateData.rules = data.rules;
    if (data.visibility !== undefined) updateData.visibility = data.visibility;
    if (data.allowMemberPosts !== undefined) updateData.allowMemberPosts = data.allowMemberPosts;
    if (data.requireApproval !== undefined) updateData.requireApproval = data.requireApproval;

    const community = await prisma.community.update({
      where: { id: communityId },
      data: updateData
    });

    return this.mapToCommunityResponse(community, userId);
  }

  /**
   * Delete community
   */
  async deleteCommunity(communityId: string, userId: string): Promise<void> {
    const community = await prisma.community.findUnique({
      where: { id: communityId }
    });

    if (!community || community.creatorId !== userId) {
      throw new Error('Unauthorized to delete this community');
    }

    await prisma.community.delete({
      where: { id: communityId }
    });
  }

  /**
   * Join a community
   */
  async joinCommunity(communityId: string, userId: string): Promise<void> {
    // Check if community exists
    const community = await prisma.community.findUnique({
      where: { id: communityId }
    });

    if (!community) {
      throw new Error('Community not found');
    }

    // Check if already a member
    const existing = await prisma.communityMember.findUnique({
      where: {
        communityId_userId: { communityId, userId }
      }
    });

    if (existing) {
      return; // Already a member
    }

    await prisma.$transaction([
      prisma.communityMember.create({
        data: {
          communityId,
          userId,
          role: 'MEMBER'
        }
      }),
      prisma.community.update({
        where: { id: communityId },
        data: { memberCount: { increment: 1 } }
      })
    ]);
  }

  /**
   * Leave a community
   */
  async leaveCommunity(communityId: string, userId: string): Promise<void> {
    const member = await prisma.communityMember.findUnique({
      where: {
        communityId_userId: { communityId, userId }
      }
    });

    if (!member) {
      return; // Not a member
    }

    if (member.role === 'CREATOR') {
      throw new Error('Creator cannot leave the community. Delete the community instead.');
    }

    await prisma.$transaction([
      prisma.communityMember.delete({
        where: {
          communityId_userId: { communityId, userId }
        }
      }),
      prisma.community.update({
        where: { id: communityId },
        data: { memberCount: { decrement: 1 } }
      })
    ]);
  }

  /**
   * Get community members
   */
  async getCommunityMembers(communityId: string): Promise<CommunityMemberResponse[]> {
    const members = await prisma.communityMember.findMany({
      where: { communityId },
      include: {
        user: {
          select: {
            id: true,
            displayName: true,
            avatarUrl: true
          }
        }
      },
      orderBy: [
        { role: 'asc' }, // CREATOR first, then MODERATOR, then MEMBER
        { joinedAt: 'asc' }
      ]
    });

    return members.map(m => ({
      id: m.id,
      userId: m.userId,
      role: m.role as CommunityRole,
      joinedAt: m.joinedAt,
      user: {
        id: m.user.id,
        displayName: m.user.displayName,
        avatarUrl: m.user.avatarUrl ?? ''
      }
    }));
  }

  /**
   * Update member role (moderator management)
   */
  async updateMemberRole(
    communityId: string,
    targetUserId: string,
    newRole: CommunityRole,
    currentUserId: string
  ): Promise<void> {
    // Check if current user has permission (must be creator)
    const currentMember = await prisma.communityMember.findUnique({
      where: {
        communityId_userId: { communityId, userId: currentUserId }
      }
    });

    if (!currentMember || currentMember.role !== 'CREATOR') {
      throw new Error('Only the creator can update member roles');
    }

    // Cannot change creator role
    if (newRole === 'CREATOR') {
      throw new Error('Cannot assign creator role');
    }

    const targetMember = await prisma.communityMember.findUnique({
      where: {
        communityId_userId: { communityId, userId: targetUserId }
      }
    });

    if (!targetMember) {
      throw new Error('User is not a member of this community');
    }

    if (targetMember.role === 'CREATOR') {
      throw new Error('Cannot change creator role');
    }

    await prisma.communityMember.update({
      where: {
        communityId_userId: { communityId, userId: targetUserId }
      },
      data: { role: newRole }
    });
  }

  /**
   * Remove member from community (moderator action)
   */
  async removeMember(
    communityId: string,
    targetUserId: string,
    currentUserId: string
  ): Promise<void> {
    // Check if current user has permission (creator or moderator)
    const currentMember = await prisma.communityMember.findUnique({
      where: {
        communityId_userId: { communityId, userId: currentUserId }
      }
    });

    if (!currentMember || (currentMember.role !== 'CREATOR' && currentMember.role !== 'MODERATOR')) {
      throw new Error('Unauthorized to remove members');
    }

    const targetMember = await prisma.communityMember.findUnique({
      where: {
        communityId_userId: { communityId, userId: targetUserId }
      }
    });

    if (!targetMember) {
      return; // Not a member
    }

    if (targetMember.role === 'CREATOR') {
      throw new Error('Cannot remove the creator');
    }

    await prisma.$transaction([
      prisma.communityMember.delete({
        where: {
          communityId_userId: { communityId, userId: targetUserId }
        }
      }),
      prisma.community.update({
        where: { id: communityId },
        data: { memberCount: { decrement: 1 } }
      })
    ]);
  }

  /**
   * Upload community avatar
   */
  async uploadAvatar(communityId: string, userId: string, file: Express.Multer.File): Promise<string> {
    // Check if user has permission (creator or moderator)
    const member = await prisma.communityMember.findUnique({
      where: {
        communityId_userId: { communityId, userId }
      }
    });

    if (!member || (member.role !== 'CREATOR' && member.role !== 'MODERATOR')) {
      throw new Error('Unauthorized to update this community');
    }

    // Import s3Service and sharp
    const sharp = (await import('sharp')).default;

    // Resize and optimize image for avatar (square)
    const optimizedBuffer = await sharp(file.buffer)
      .resize(400, 400, {
        fit: 'cover',
        position: 'center'
      })
      .jpeg({ quality: 85 })
      .toBuffer();

    // Delete old avatar if exists
    const community = await prisma.community.findUnique({
      where: { id: communityId },
      select: { avatarUrl: true }
    });

    if (community?.avatarUrl) {
      try {
        await s3Service.deleteFile(community.avatarUrl);
      } catch (error) {
        console.warn('Failed to delete old avatar:', error);
      }
    }

    // Upload to S3 with structured path: communities/{communityId}/avatar.jpg
    const folder = `communities/${communityId}`;
    const result = await s3Service.uploadFile(
      {
        buffer: optimizedBuffer,
        mimetype: 'image/jpeg',
        originalname: 'avatar.jpg'
      },
      folder
    );

    // Update community with new avatar URL
    await prisma.community.update({
      where: { id: communityId },
      data: { avatarUrl: result.url }
    });

    return result.url;
  }

  /**
   * Upload community background image
   */
  async uploadBackground(communityId: string, userId: string, file: Express.Multer.File): Promise<string> {
    // Check if user has permission (creator or moderator)
    const member = await prisma.communityMember.findUnique({
      where: {
        communityId_userId: { communityId, userId }
      }
    });

    if (!member || (member.role !== 'CREATOR' && member.role !== 'MODERATOR')) {
      throw new Error('Unauthorized to update this community');
    }

    // Import s3Service and sharp
    const sharp = (await import('sharp')).default;

    // Resize and optimize image for banner (wide format)
    const optimizedBuffer = await sharp(file.buffer)
      .resize(1920, 480, {
        fit: 'cover',
        position: 'center'
      })
      .jpeg({ quality: 85 })
      .toBuffer();

    // Delete old banner if exists
    const community = await prisma.community.findUnique({
      where: { id: communityId },
      select: { bannerUrl: true }
    });

    if (community?.bannerUrl) {
      try {
        await s3Service.deleteFile(community.bannerUrl);
      } catch (error) {
        console.warn('Failed to delete old banner:', error);
      }
    }

    // Upload to S3 with structured path: communities/{communityId}/banner.jpg
    const folder = `communities/${communityId}`;
    const result = await s3Service.uploadFile(
      {
        buffer: optimizedBuffer,
        mimetype: 'image/jpeg',
        originalname: 'banner.jpg'
      },
      folder
    );

    // Update community with new banner URL
    await prisma.community.update({
      where: { id: communityId },
      data: { bannerUrl: result.url }
    });

    return result.url;
  }

  /**
   * Helper to map community to response format
   */
  private async mapToCommunityResponse(
    community: any,
    userId?: string
  ): Promise<CommunityResponse> {
    let userRole = null;
    let isMember = false;

    if (userId) {
      const member = await prisma.communityMember.findUnique({
        where: {
          communityId_userId: { communityId: community.id, userId }
        }
      });

      if (member) {
        userRole = member.role as CommunityRole;
        isMember = true;
      }
    }

    return {
      id: community.id,
      name: community.name,
      description: community.description,
      creatorId: community.creatorId,
      avatarUrl: community.avatarUrl,
      bannerUrl: community.bannerUrl,
      rules: community.rules,
      visibility: community.visibility,
      allowMemberPosts: community.allowMemberPosts,
      requireApproval: community.requireApproval,
      memberCount: community.memberCount,
      postCount: community.postCount,
      createdAt: community.createdAt,
      updatedAt: community.updatedAt,
      userRole,
      isMember
    };
  }
}

export const communityService = new CommunityService();
