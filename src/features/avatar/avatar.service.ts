/**
 * Avatar Service
 * Handles user avatar management - predefined avatars and custom uploads
 */

import { S3Client, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { s3Service } from '../../shared/lib/s3';
import { prisma } from '../../shared/lib/prisma';
import { config } from '../../shared/config';

class AvatarService {
  private s3Client: S3Client | null = null;
  private bucket: string;

  constructor() {
    this.bucket = config.s3?.bucket || 'homework-media';
    
    if (config.s3?.endpoint) {
      this.s3Client = new S3Client({
        endpoint: config.s3.endpoint,
        region: config.s3.region,
        credentials: {
          accessKeyId: config.s3.accessKey,
          secretAccessKey: config.s3.secretKey,
        },
        forcePathStyle: true,
      });
    }
  }

  /**
   * Get list of avatars from media/Avatars folder in MinIO
   */
  async getPredefinedAvatars(): Promise<{ id: string; url: string; filename: string }[]> {
    if (!this.s3Client) {
      throw new Error('S3 client not initialized');
    }

    try {
      const command = new ListObjectsV2Command({
        Bucket: this.bucket,
        Prefix: 'media/Avatars/',
      });

      const response = await this.s3Client.send(command);
      const endpoint = config.s3!.endpoint;

      if (!response.Contents || response.Contents.length === 0) {
        console.log('[AvatarService] No avatars found in media/Avatars/');
        return [];
      }

      // Filter out the folder itself, user folders, and only include image files
      const avatars = response.Contents
        .filter((item) => {
          const key = item.Key || '';
          // Exclude the folder itself, anything in users/ subfolder, and non-images
          return key !== 'media/Avatars/' && 
                 !key.includes('/users/') &&  // Exclude all personal avatar uploads
                 (key.endsWith('.png') || key.endsWith('.jpg') || key.endsWith('.jpeg') || 
                  key.endsWith('.gif') || key.endsWith('.svg') || key.endsWith('.webp'));
        })
        .map((item, index) => {
          const key = item.Key!;
          const filename = key.split('/').pop() || key;
          return {
            id: `avatar-${index + 1}`,
            url: `${endpoint}/${this.bucket}/${key}`,
            filename,
          };
        });

      console.log(`[AvatarService] Found ${avatars.length} avatars in media/Avatars/`);
      return avatars;
    } catch (error) {
      console.error('[AvatarService] Failed to fetch avatars:', error);
      throw new Error('Failed to fetch avatars from storage');
    }
  }

  /**
   * Upload custom avatar
   * Uploads to user-specific private folder: media/Avatars/users/{userId}/
   * These avatars are PRIVATE and only visible to the owner
   */
  async uploadCustomAvatar(file: {
    buffer: Buffer;
    mimetype: string;
    originalname: string;
  }, userId: string): Promise<{ url: string }> {
    // Validate file type
    if (!file.mimetype.startsWith('image/')) {
      throw new Error('Only image files are allowed for avatars');
    }

    // Upload to user-specific folder: media/Avatars/users/{userId}/
    const result = await s3Service.uploadFile({
      buffer: file.buffer,
      mimetype: file.mimetype,
      originalname: file.originalname,
    }, `media/Avatars/users/${userId}`);

    return { url: result.url };
  }

  /**
   * Get user's custom avatars
   * PRIVATE: Only returns avatars uploaded by this specific user
   * Personal avatars are stored in media/Avatars/users/{userId}/ and are NOT visible to other users
   */
  async getUserAvatars(userId: string) {
    if (!this.s3Client) {
      throw new Error('S3 client not initialized');
    }

    try {
      const command = new ListObjectsV2Command({
        Bucket: this.bucket,
        Prefix: `media/Avatars/users/${userId}/`,
      });

      const response = await this.s3Client.send(command);
      const endpoint = config.s3!.endpoint;

      if (!response.Contents || response.Contents.length === 0) {
        console.log(`[AvatarService] No custom avatars found for user ${userId}`);
        return [];
      }

      // Filter out the folder itself and only include image files
      const avatars = response.Contents
        .filter((item) => {
          const key = item.Key || '';
          return key !== `media/Avatars/users/${userId}/` && 
                 (key.endsWith('.png') || key.endsWith('.jpg') || key.endsWith('.jpeg') || 
                  key.endsWith('.gif') || key.endsWith('.svg') || key.endsWith('.webp'));
        })
        .map((item, index) => {
          const key = item.Key!;
          const filename = key.split('/').pop() || key;
          return {
            id: `user-avatar-${index + 1}`,
            url: `${endpoint}/${this.bucket}/${key}`,
            filename,
          };
        });

      console.log(`[AvatarService] Found ${avatars.length} custom avatars for user ${userId}`);
      return avatars;
    } catch (error) {
      console.error('[AvatarService] Failed to fetch user avatars:', error);
      throw new Error('Failed to fetch user avatars from storage');
    }
  }

  /**
   * Set user avatar (predefined or custom)
   */
  async setUserAvatar(userId: string, avatarUrl: string): Promise<void> {
    await prisma.user.update({
      where: { id: userId },
      data: { avatarUrl },
    });

    console.log(`[AvatarService] Updated avatar for user ${userId}: ${avatarUrl}`);
  }

  /**
   * Remove user avatar
   */
  async removeUserAvatar(userId: string): Promise<void> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { avatarUrl: true },
    });

    if (user?.avatarUrl && user.avatarUrl.includes(`/media/Avatars/users/${userId}/`)) {
      // Delete custom uploaded avatar from S3 (only user's own uploads)
      try {
        await s3Service.deleteFile(user.avatarUrl);
      } catch (error) {
        console.error('[AvatarService] Failed to delete avatar file:', error);
      }
    }

    await prisma.user.update({
      where: { id: userId },
      data: { avatarUrl: null },
    });

    console.log(`[AvatarService] Removed avatar for user ${userId}`);
  }
}

export const avatarService = new AvatarService();
