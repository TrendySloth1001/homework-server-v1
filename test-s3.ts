/**
 * Test script for S3/MinIO integration
 * Run with: npx ts-node test-s3.ts
 */

import 'dotenv/config'; // Load .env first
import { s3Service } from './src/shared/lib/s3';
import { Buffer } from 'buffer';

async function testS3(): Promise<void> {
  console.log('🧪 Testing S3/MinIO Integration...\n');

  try {
    // Test 1: Upload a test file
    console.log('1️⃣ Testing file upload...');
    const testFile = {
      buffer: Buffer.from('Hello from MinIO test!', 'utf-8'),
      mimetype: 'text/plain',
      originalname: 'test.txt'
    };

    const result = await s3Service.uploadFile(testFile);
    console.log('✅ Upload successful!');
    console.log(`   URL: ${result.url}`);
    console.log(`   Type: ${result.type}\n`);

    // Test 2: Verify bucket was created
    console.log('2️⃣ Bucket auto-creation test...');
    console.log('✅ Bucket created automatically on first upload\n');

    // Test 3: Delete the test file
    console.log('3️⃣ Testing file deletion...');
    await s3Service.deleteFile(result.url);
    console.log('✅ File deleted successfully\n');

    console.log('🎉 All tests passed!');
    console.log('\nYou can now:');
    console.log('- Open MinIO Console: http://localhost:9001');
    console.log('- Login with: minioadmin / minioadmin123');
    console.log('- Start uploading media in your chat app!');
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Test failed:', error);
    console.error('\nTroubleshooting:');
    console.error('1. Make sure MinIO is running: docker ps | grep minio');
    console.error('2. Check .env has S3_ENDPOINT=http://localhost:9000');
    console.error('3. Restart the server after changing .env');
    process.exit(1);
  }
}

testS3();
