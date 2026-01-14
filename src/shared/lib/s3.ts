/**
 * S3/MinIO Service
 * Handles media file uploads and management
 */

import { S3Client, PutObjectCommand, DeleteObjectCommand, HeadBucketCommand, CreateBucketCommand } from '@aws-sdk/client-s3';
import { config } from '../config';
import { v4 as uuidv4 } from 'uuid';

class S3Service {
  private client: S3Client | null = null;
  private bucket: string;
  private initialized = false;

  constructor() {
    this.bucket = config.s3?.bucket || 'homework-media';
    
    if (config.s3?.endpoint) {
      this.client = new S3Client({
        endpoint: config.s3.endpoint,
        region: config.s3.region,
        credentials: {
          accessKeyId: config.s3.accessKey,
          secretAccessKey: config.s3.secretKey,
        },
        forcePathStyle: true, // Required for MinIO
        tls: false, // Disable TLS for local MinIO
        requestHandler: {
          requestTimeout: 10000, // 10 seconds
        },
      });
      
      console.log(`[S3Service] Initialized with endpoint: ${config.s3.endpoint}`);
      console.log(`[S3Service] Using credentials: ${config.s3.accessKey} / ${config.s3.secretKey.substring(0, 4)}***`);
    } else {
      console.warn('[S3Service] S3 not configured, file uploads will fail');
    }
  }

  /**
   * Ensure bucket exists, create if it doesn't
   */
  async ensureBucket(): Promise<void> {
    if (this.initialized || !this.client) return;

    try {
      // Check if bucket exists
      await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
      console.log(`[S3Service] Bucket '${this.bucket}' exists`);
      this.initialized = true;
    } catch (error: any) {
      if (error.name === 'NotFound' || error.$metadata?.httpStatusCode === 404) {
        // Bucket doesn't exist, create it
        try {
          await this.client.send(new CreateBucketCommand({ Bucket: this.bucket }));
          console.log(`[S3Service] Created bucket '${this.bucket}'`);
          this.initialized = true;
        } catch (createError) {
          console.error('[S3Service] Failed to create bucket:', createError);
          throw createError;
        }
      } else {
        console.error('[S3Service] Failed to check bucket:', error);
        throw error;
      }
    }
  }

  /**
   * Upload a file to S3/MinIO
   * @param file File buffer and metadata
   * @param folder Optional folder path (default: 'media')
   * @returns Object with URL and media type
   */
  async uploadFile(file: {
    buffer: Buffer;
    mimetype: string;
    originalname: string;
  }, folder: string = 'media'): Promise<{ url: string; type: string }> {
    if (!this.client) {
      throw new Error('S3 client not initialized. Check S3 configuration.');
    }

    await this.ensureBucket();

    // Generate unique filename
    const ext = file.originalname.split('.').pop() || '';
    const filename = `${uuidv4()}.${ext}`;
    const key = `${folder}/${filename}`;
    const mediaType = file.mimetype.split('/')[0]; // image, video, audio, etc.

    try {
      const command = new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: file.buffer,
        ContentType: file.mimetype,
      });

      console.log(`[S3Service] Uploading to bucket: ${this.bucket}, key: ${key}`);
      await this.client.send(command);

      // Construct public URL
      const url = `${config.s3!.endpoint}/${this.bucket}/${key}`;
      
      console.log(`[S3Service] Uploaded file: ${key}`);
      console.log(`[S3Service] File URL: ${url}`);
      
      return { url, type: mediaType as string };
    } catch (error: any) {
      console.error('[S3Service] Upload failed:', error);
      console.error('[S3Service] Error details:', {
        message: error.message,
        code: error.Code,
        bucket: this.bucket,
        key: key,
        endpoint: config.s3!.endpoint,
      });
      throw new Error('Failed to upload file to storage');
    }
  }

  /**
   * Delete a file from S3/MinIO
   * @param url Full URL of the file
   */
  async deleteFile(url: string): Promise<void> {
    if (!this.client) {
      throw new Error('S3 client not initialized');
    }

    try {
      // Extract key from URL
      const urlObj = new URL(url);
      const pathParts = urlObj.pathname.split('/');
      const key = pathParts.slice(2).join('/'); // Remove bucket name from path

      const command = new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: key,
      });

      await this.client.send(command);
      console.log(`[S3Service] Deleted file: ${key}`);
    } catch (error) {
      console.error('[S3Service] Delete failed:', error);
      throw new Error('Failed to delete file from storage');
    }
  }

  /**
   * Get public URL for a file
   * @param key File key in bucket
   */
  getPublicUrl(key: string): string {
    if (!config.s3?.endpoint) {
      throw new Error('S3 endpoint not configured');
    }
    return `${config.s3.endpoint}/${this.bucket}/${key}`;
  }
}

// Export singleton instance
export const s3Service = new S3Service();
