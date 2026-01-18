/**
 * Create MinIO Bucket
 */

import 'dotenv/config';
import { S3Client, CreateBucketCommand, HeadBucketCommand } from '@aws-sdk/client-s3';

const s3Client = new S3Client({
  endpoint: process.env.S3_ENDPOINT || 'http://localhost:9000',
  region: process.env.S3_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY || 'minioadmin',
    secretAccessKey: process.env.S3_SECRET_KEY || 'minioadmin123',
  },
  forcePathStyle: true,
});

const bucket = process.env.S3_BUCKET || 'homework-media';

async function createBucket() {
  try {
    // Check if bucket exists
    console.log(`Checking if bucket '${bucket}' exists...`);
    await s3Client.send(new HeadBucketCommand({ Bucket: bucket }));
    console.log(`✅ Bucket '${bucket}' already exists`);
  } catch (error: any) {
    if (error.name === 'NotFound' || error.$metadata?.httpStatusCode === 404) {
      // Bucket doesn't exist, create it
      try {
        console.log(`Creating bucket '${bucket}'...`);
        await s3Client.send(new CreateBucketCommand({ Bucket: bucket }));
        console.log(`✅ Created bucket '${bucket}'`);
      } catch (createError) {
        console.error('❌ Failed to create bucket:', createError);
        throw createError;
      }
    } else {
      console.error('❌ Failed to check bucket:', error);
      throw error;
    }
  }
}

createBucket().catch(console.error);
