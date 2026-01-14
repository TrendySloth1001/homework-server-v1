# MinIO Integration Setup

## ✅ What's Implemented

MinIO is now integrated for **media storage** in the chat system. It's S3-compatible, meaning it uses the same AWS SDK.

### Components Added:

1. **Docker Service** (`docker-compose.yml`)
   - MinIO server on ports 9000 (API) and 9001 (Console UI)
   - Persistent storage volume
   - Health checks

2. **S3 Service** (`src/shared/lib/s3.ts`)
   - Upload files to MinIO
   - Delete files
   - Auto-creates bucket on first use
   - Supports 50MB file size limit

3. **Configuration** (`src/shared/config/index.ts`)
   - S3 endpoint, credentials, bucket name
   - Configurable via environment variables

4. **File Upload Routes** (`src/features/chat/routes.ts`)
   - Multer middleware for multipart/form-data
   - File type validation (images, videos, audio, docs)
   - Memory storage (no temp files)

5. **Updated Services** (`src/features/chat/services/message_service.ts`)
   - `uploadMedia()` now uses S3 instead of mock
   - Returns MinIO URL for uploaded files

## 🚀 Quick Start

### 1. Start MinIO
```bash
cd /Users/nick/projects/project/homework-server-v1
docker-compose up -d minio
```

### 2. Verify MinIO is Running
```bash
# Check container status
docker ps | grep minio

# Open MinIO Console (Web UI)
open http://localhost:9001
# Login: minioadmin / minioadmin123
```

### 3. Environment Variables
Already added to `.env`:
```env
S3_ENDPOINT=http://localhost:9000
S3_ACCESS_KEY=minioadmin
S3_SECRET_KEY=minioadmin123
S3_BUCKET=homework-media
S3_REGION=us-east-1
```

### 4. Start Backend Server
```bash
npm run dev
```

The bucket `homework-media` will be **automatically created** on first upload.

## 📡 API Usage

### Upload Media File
```bash
POST /api/chat/media/upload
Content-Type: multipart/form-data

Body:
  media: <file>

Response:
{
  "url": "http://localhost:9000/homework-media/media/uuid.jpg",
  "type": "image"
}
```

### Send Media Message
```bash
POST /api/chat/messages/media
Content-Type: application/json

Body:
{
  "conversationId": "conv-id",
  "mediaUrl": "http://localhost:9000/homework-media/media/uuid.jpg",
  "mediaType": "image",
  "content": "Optional caption"
}
```

## 🔧 Frontend Integration

The frontend already has the upload function in `src/lib/chat-api.ts`:

```typescript
async uploadMedia(token: string, file: File): Promise<{ url: string }> {
  const formData = new FormData();
  formData.append('media', file);

  const response = await fetch(`${API_BASE_URL}/media/upload`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}` },
    body: formData,
  });

  return response.json(); // { url: "...", type: "image" }
}
```

**Just use the returned `url` in the send media message call!**

## 📂 File Structure

Uploaded files are stored as:
```
homework-media/
  └── media/
      ├── uuid1.jpg
      ├── uuid2.mp4
      └── uuid3.pdf
```

Each file gets a unique UUID filename to prevent conflicts.

## 🎯 Supported File Types

- **Images**: image/*
- **Videos**: video/*
- **Audio**: audio/*
- **Documents**: PDF, Word, etc. (application/*)

Max file size: **50MB**

## 🔍 MinIO Console

Access the MinIO Console UI at `http://localhost:9001`:
- **Username**: minioadmin
- **Password**: minioadmin123

You can:
- Browse uploaded files
- Create/delete buckets
- Manage access policies
- Monitor storage usage

## 🚨 Troubleshooting

### "S3 client not initialized"
Make sure `S3_ENDPOINT` is set in `.env` and the server restarted.

### "Failed to connect to MinIO"
Check MinIO is running:
```bash
docker ps | grep minio
curl http://localhost:9000/minio/health/live
```

### "Bucket not found"
The bucket is auto-created on first upload. If you see this error, check MinIO logs:
```bash
docker logs homework_minio
```

## 🎉 What's Working

- ✅ MinIO running in Docker
- ✅ S3 service with upload/delete functions
- ✅ Multer file upload middleware
- ✅ Auto bucket creation
- ✅ File type validation
- ✅ 50MB file size limit
- ✅ Integration with message service
- ✅ WebSocket broadcasts for media messages (already implemented)
- ✅ Frontend upload API ready

## 🔐 Production Notes

For production, update these in `.env`:
```env
S3_ENDPOINT=https://your-minio-server.com
S3_ACCESS_KEY=your-secure-access-key
S3_SECRET_KEY=your-secure-secret-key
```

Consider:
- Using HTTPS for MinIO endpoint
- Stronger access credentials
- CDN for media delivery
- Bucket policies for public read access
- File size limits based on your needs

## 🏁 Next Steps

1. **Test Upload**: Use Postman or frontend to upload a file
2. **Send Media Message**: Send a message with the uploaded URL
3. **Verify in Console**: Check MinIO console to see uploaded files
4. **WebSocket**: Media messages already broadcast in real-time!
