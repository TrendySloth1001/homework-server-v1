/**
 * Upload Predefined Avatars to MinIO
 * Run this script to populate the avatar folder with default avatars
 */

import 'dotenv/config';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import fs from 'fs';
import path from 'path';

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

// Generate simple avatar placeholders
async function uploadPlaceholderAvatars() {
  console.log('📸 Uploading predefined avatars to MinIO...\n');

  const colors = [
    '#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A', 
    '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E2',
    '#F8B739', '#52B788'
  ];

  for (let i = 0; i < 10; i++) {
    const avatarNum = i + 1;
    const color = colors[i];
    
    // Create SVG avatar
    const svg = `
      <svg width="200" height="200" xmlns="http://www.w3.org/2000/svg">
        <rect width="200" height="200" fill="${color}"/>
        <circle cx="100" cy="70" r="40" fill="white" opacity="0.9"/>
        <circle cx="100" cy="150" r="60" fill="white" opacity="0.9"/>
        <text x="100" y="110" font-family="Arial" font-size="60" fill="${color}" text-anchor="middle" font-weight="bold">
          ${avatarNum}
        </text>
      </svg>
    `;

    const key = `avatar/avatar-${avatarNum}.png`;
    
    try {
      await s3Client.send(new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: Buffer.from(svg),
        ContentType: 'image/svg+xml',
      }));

      console.log(`✅ Uploaded: ${key}`);
    } catch (error) {
      console.error(`❌ Failed to upload ${key}:`, error);
    }
  }

  console.log('\n🎉 All avatars uploaded successfully!');
  console.log(`\nYou can view them at: ${process.env.S3_ENDPOINT}/${bucket}/avatar/`);
}

uploadPlaceholderAvatars().catch(console.error);
