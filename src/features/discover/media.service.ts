/**
 * Discover Media Service
 * Handles media uploads for posts (images, videos, audio)
 */

import { s3Service } from '../../shared/lib/s3';
import { MediaType, PostMedia } from './types';
import { ffmpegService } from './ffmpeg.service';
import sharp from 'sharp';

interface UploadedFile {
  buffer: Buffer;
  mimetype: string;
  originalname: string;
  size: number;
}

export class DiscoverMediaService {
  /**
   * Upload media file for a post
   * @param file Uploaded file from multer
   * @param userId User ID (author of the post)
   * @param postId Post ID
   * @returns Media metadata including URL
   */
  async uploadPostMedia(
    file: UploadedFile,
    userId: string,
    postId: string
  ): Promise<Omit<PostMedia, 'id'>> {
    const mediaType = this.getMediaTypeFromMimetype(file.mimetype);
    
    // Validate file type
    this.validateFile(file, mediaType);

    // Generate structured path: posts/{userId}/{postId}/{filename}
    const folder = `posts/${userId}/${postId}`;

    // Upload main file
    const result = await s3Service.uploadFile(
      {
        buffer: file.buffer,
        mimetype: file.mimetype,
        originalname: file.originalname,
      },
      folder
    );

    const mediaData: Omit<PostMedia, 'id'> = {
      type: mediaType,
      url: result.url,
      filename: file.originalname,
      size: file.size,
      order: 0,
    };

    // Generate thumbnail for images and videos
    if (mediaType === MediaType.IMAGE) {
      const dimensions = await this.getImageDimensions(file.buffer);
      mediaData.width = dimensions.width;
      mediaData.height = dimensions.height;

      // Generate and upload thumbnail
      const thumbnail = await this.generateThumbnail(file.buffer);
      const thumbnailResult = await s3Service.uploadFile(
        {
          buffer: thumbnail,
          mimetype: 'image/jpeg',
          originalname: `thumb_${file.originalname}`,
        },
        `${folder}/thumbnails`
      );
      mediaData.thumbnailUrl = thumbnailResult.url;
    }

    // For video, we'd need video processing library to extract duration/dimensions
    // Placeholder for now - you can integrate ffmpeg or similar
    if (mediaType === MediaType.VIDEO) {
      try {
        const videoMetadata = await ffmpegService.extractVideoMetadata(file.buffer);
        mediaData.duration = videoMetadata.duration;
        mediaData.width = videoMetadata.width;
        mediaData.height = videoMetadata.height;

        // Generate video thumbnail
        const thumbnailBuffer = await ffmpegService.generateVideoThumbnail(file.buffer);
        const thumbnailResult = await s3Service.uploadFile(
          {
            buffer: thumbnailBuffer,
            mimetype: 'image/jpeg',
            originalname: `thumb_${file.originalname}.jpg`,
          },
          `${folder}/thumbnails`
        );
        mediaData.thumbnailUrl = thumbnailResult.url;
      } catch (error) {
        console.error('Failed to process video:', error);
        // Continue without video metadata if processing fails
      }
    }

    // For audio, extract duration if possible
    if (mediaType === MediaType.AUDIO) {
      try {
        const audioMetadata = await ffmpegService.extractAudioMetadata(file.buffer);
        mediaData.duration = audioMetadata.duration;
      } catch (error) {
        console.error('Failed to process audio:', error);
        // Continue without audio metadata if processing fails
      }
    }

    return mediaData;
  }

  /**
   * Delete media file from storage
   * @param url Media URL to delete
   */
  async deleteMedia(url: string): Promise<void> {
    await s3Service.deleteFile(url);
    
    // Also delete thumbnail if it exists
    const thumbnailUrl = this.getThumbnailUrl(url);
    if (thumbnailUrl) {
      try {
        await s3Service.deleteFile(thumbnailUrl);
      } catch (error) {
        // Thumbnail might not exist, ignore error
        console.warn('Failed to delete thumbnail:', error);
      }
    }
  }

  /**
   * Get media type from MIME type
   */
  private getMediaTypeFromMimetype(mimetype: string): MediaType {
    if (mimetype.startsWith('image/')) return MediaType.IMAGE;
    if (mimetype.startsWith('video/')) return MediaType.VIDEO;
    if (mimetype.startsWith('audio/')) return MediaType.AUDIO;
    throw new Error(`Unsupported media type: ${mimetype}`);
  }

  /**
   * Validate file based on media type
   */
  private validateFile(file: UploadedFile, mediaType: MediaType): void {
    const MAX_IMAGE_SIZE = 10 * 1024 * 1024; // 10MB
    const MAX_VIDEO_SIZE = 100 * 1024 * 1024; // 100MB
    const MAX_AUDIO_SIZE = 20 * 1024 * 1024; // 20MB

    switch (mediaType) {
      case MediaType.IMAGE:
        if (file.size > MAX_IMAGE_SIZE) {
          throw new Error('Image size exceeds 10MB limit');
        }
        break;
      case MediaType.VIDEO:
        if (file.size > MAX_VIDEO_SIZE) {
          throw new Error('Video size exceeds 100MB limit');
        }
        break;
      case MediaType.AUDIO:
        if (file.size > MAX_AUDIO_SIZE) {
          throw new Error('Audio size exceeds 20MB limit');
        }
        break;
    }
  }

  /**
   * Get image dimensions using sharp
   */
  private async getImageDimensions(buffer: Buffer): Promise<{ width: number; height: number }> {
    try {
      const metadata = await sharp(buffer).metadata();
      return {
        width: metadata.width || 0,
        height: metadata.height || 0,
      };
    } catch (error) {
      console.error('Failed to get image dimensions:', error);
      return { width: 0, height: 0 };
    }
  }

  /**
   * Generate thumbnail for image
   */
  private async generateThumbnail(buffer: Buffer, width: number = 300): Promise<Buffer> {
    try {
      return await sharp(buffer)
        .resize(width, null, {
          fit: 'inside',
          withoutEnlargement: true,
        })
        .jpeg({ quality: 80 })
        .toBuffer();
    } catch (error) {
      console.error('Failed to generate thumbnail:', error);
      // Return original buffer if thumbnail generation fails
      return buffer;
    }
  }

  /**
   * Get thumbnail URL from original URL
   */
  private getThumbnailUrl(url: string): string | null {
    try {
      const urlParts = url.split('/');
      const filename = urlParts.pop();
      const path = urlParts.join('/');
      return `${path}/thumbnails/thumb_${filename}`;
    } catch (error) {
      return null;
    }
  }
}

export const discoverMediaService = new DiscoverMediaService();
