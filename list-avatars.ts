import 'dotenv/config';
import { S3Client, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { config } from './src/shared/config';

const s3Client = new S3Client({
  endpoint: config.s3!.endpoint,
  region: config.s3!.region,
  credentials: {
    accessKeyId: config.s3!.accessKey,
    secretAccessKey: config.s3!.secretKey,
  },
  forcePathStyle: true,
});

async function listAvatars() {
  try {
    console.log('🔍 Fetching avatars from media/Avatars/...\n');
    
    const command = new ListObjectsV2Command({
      Bucket: config.s3!.bucket,
      Prefix: 'media/Avatars/',
    });

    const response = await s3Client.send(command);

    if (!response.Contents || response.Contents.length === 0) {
      console.log('❌ No files found in media/Avatars/');
      return;
    }

    console.log(`✅ Found ${response.Contents.length} items:\n`);

    const avatars = response.Contents
      .filter((item) => {
        const key = item.Key || '';
        return key !== 'media/Avatars/' && 
               (key.endsWith('.png') || key.endsWith('.jpg') || key.endsWith('.jpeg') || 
                key.endsWith('.gif') || key.endsWith('.svg') || key.endsWith('.webp'));
      });

    if (avatars.length === 0) {
      console.log('❌ No image files found in media/Avatars/');
      return;
    }

    console.log(`📸 ${avatars.length} avatar images:\n`);
    
    avatars.forEach((item, index) => {
      const key = item.Key!;
      const filename = key.split('/').pop() || key;
      const size = item.Size ? `${(item.Size / 1024).toFixed(2)} KB` : 'Unknown';
      const url = `${config.s3!.endpoint}/${config.s3!.bucket}/${key}`;
      
      console.log(`${index + 1}. ${filename}`);
      console.log(`   Size: ${size}`);
      console.log(`   URL: ${url}`);
      console.log(`   Modified: ${item.LastModified?.toLocaleString()}`);
      console.log('');
    });

    console.log('\n🌐 Access these avatars at:');
    console.log(`   ${config.s3!.endpoint}/${config.s3!.bucket}/media/Avatars/`);
    
  } catch (error) {
    console.error('❌ Error listing avatars:', error);
  }
}

listAvatars();
