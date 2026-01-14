// Quick test to verify MinIO credentials
const { S3Client, ListBucketsCommand } = require('@aws-sdk/client-s3');

const client = new S3Client({
  endpoint: 'http://localhost:9000',
  region: 'us-east-1',
  credentials: {
    accessKeyId: 'minioadmin',
    secretAccessKey: 'minioadmin123',
  },
  forcePathStyle: true,
});

async function test() {
  try {
    console.log('Testing MinIO connection with minioadmin credentials...');
    const result = await client.send(new ListBucketsCommand({}));
    console.log('✅ SUCCESS! Buckets:', result.Buckets?.map(b => b.Name));
  } catch (error) {
    console.error('❌ FAILED:', error.message);
    console.error('Error code:', error.Code);
  }
}

test();
