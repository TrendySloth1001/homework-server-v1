import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import passport from 'passport';
import syllabusRoutes from './features/syllabus/routes/index';
import aiRoutes from './features/ai/ai.routes';
import questionRoutes from './features/questions/questions.routes';
import notificationRoutes from './features/notifications/notifications.routes';
import assessmentRoutes from './features/assessment/assessment.routes';
import authRoutes from './features/auth/auth.routes';
import signupRoutes from './features/signup/signup.routes';
import legalRoutes from './features/legal/legal.routes';
import aiSettingsRoutes from './features/ai-settings/ai-settings.routes';
import teacherRoutes from './features/teachers/teachers.routes';
import chatRoutes from './features/chat/routes';
import { errorHandler } from './shared/middleware/errorHandler';
import { setupWebSocket } from './shared/websocket/wshandler';
import { config, logConfig } from './shared/config';
import { prisma } from './shared/lib/prisma';
import { embeddingService } from './shared/lib/embeddings';
import { qdrantService } from './shared/lib/qdrant';
import { memoryManager } from './shared/lib/memoryManager';
import { configurePassport } from './shared/lib/passport';

const app = express();

// Configure Passport for Google OAuth
configurePassport();

// Middleware
const baseAllowedOrigins = config.isDevelopment
  ? ['http://localhost:3000', 'http://localhost:3001']
  : (() => {
      const anyConfig = config as any;
      const configuredOrigins: string[] | undefined = anyConfig.allowedOrigins
        || (anyConfig.frontendUrl ? [anyConfig.frontendUrl] : undefined);
      return configuredOrigins ?? [];
    })();

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no Origin header (e.g., curl, server-to-server)
    if (!origin) {
      return callback(null, true);
    }

    if (baseAllowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    return callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(passport.initialize());

// Serve static files from public directory
app.use(express.static(path.join(__dirname, '../public')));

/**
 * API Routes
 * RESTful API endpoints
 */
app.use('/api/auth', authRoutes);                                           // Authentication (Google OAuth)
app.use('/api/signup', signupRoutes);                                       // User signup (teacher/student)
app.use('/api', syllabusRoutes);                                            // Syllabi, Units, Topics
app.use('/api/ai', aiRoutes);                                               // AI-powered features
app.use('/api/questions', questionRoutes);                                  // Question bank
app.use('/api/notifications', notificationRoutes);                          // Notifications
app.use('/api/assessment', assessmentRoutes);                               // Answer grading (mathematical)
app.use('/api/legal', legalRoutes);                                         // Legal documents (privacy, terms, help)
app.use('/api', aiSettingsRoutes);                                          // AI customization settings
app.use('/api/teachers', teacherRoutes);                                    // Teacher discovery and follow system
app.use('/api/chat', chatRoutes);                                           // Real-time chat and messaging




// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Server is healthy',
    environment: config.nodeEnv,
    timestamp: new Date().toISOString()
  });
});

// Database health check endpoint
app.get('/health/db', async (req, res) => {
  const start = Date.now();

  try {
    await prisma.$queryRaw`SELECT 1`;

    const dbInfo = await prisma.$queryRaw<Array<{ version: string }>>`
      SELECT version()
    `;
    const postgresVersion = dbInfo[0]?.version || 'Unknown';

    const extensions = await prisma.$queryRaw<
      Array<{ extname: string; extversion: string }>
    >`
      SELECT extname, extversion
      FROM pg_extension
      WHERE extname IN ('vector', 'uuid-ossp', 'pg_trgm')
    `;

    const [
      syllabusCount,
      unitCount,
      topicCount,
      questionCount,
      aiGenerationCount,
      notificationCount
    ] = await Promise.all([
      prisma.syllabus.count(),
      prisma.unit.count(),
      prisma.topic.count(),
      prisma.question.count(),
      prisma.aIGeneration.count(),
      prisma.notification.count()
    ]);

    const dbSize = await prisma.$queryRaw<Array<{ size: string }>>`
      SELECT pg_size_pretty(pg_database_size(current_database())) AS size
    `;

    const duration = Date.now() - start;

    res.status(200).json({
      success: true,
      message: 'Database is healthy',
      database: {
        connected: true,
        type: 'PostgreSQL',
        version: postgresVersion.split(' ')[0] + ' ' + postgresVersion.split(' ')[1],
        size: dbSize[0]?.size || 'Unknown',
        responseTime: `${duration}ms`,
        connectionUrl: config.database.url.replace(/:[^:@]+@/, ':***@')
      },
      extensions: extensions.reduce((acc, ext) => {
        acc[ext.extname] = ext.extversion;
        return acc;
      }, {} as Record<string, string>),
      statistics: {
        syllabuses: syllabusCount,
        units: unitCount,
        topics: topicCount,
        questions: questionCount,
        aiGenerations: aiGenerationCount,
        notifications: notificationCount,
        total:
          syllabusCount +
          unitCount +
          topicCount +
          questionCount +
          aiGenerationCount +
          notificationCount
      },
      timestamp: new Date().toISOString()
    });
  } catch (error: any) {
    res.status(503).json({
      success: false,
      message: 'Database health check failed',
      database: {
        connected: false
      },
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// API Routes

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    success: true,
    message: 'Syllabus Management API',
    version: '1.0.0',
    endpoints: {
      health: '/health',
      databaseHealth: '/health/db',
      databaseInfo: '/api/database/info',
      syllabus: '/api/syllabus',
      units: '/api/unit',
      topics: '/api/topic',
      questions: {
        create: 'POST /api/questions',
        generate: 'POST /api/questions/generate',
        list: 'GET /api/questions',
        get: 'GET /api/questions/:id',
        update: 'PATCH /api/questions/:id',
        delete: 'DELETE /api/questions/:id',
        jobStatus: 'GET /api/questions/job/:jobId'
      },
      ai: {
        health: '/api/ai/health',
        generate: '/api/ai/generate',
        chat: '/api/ai/chat',
        enhanceSyllabus: '/api/ai/enhance-syllabus/:syllabusId',
        summary: '/api/ai/summary/unit/:unitId'
      },
      notifications:{
        create: 'POST /api/notifications',
        list: 'GET /api/notifications',
        get: 'GET /api/notifications/:id',
        markAsRead: 'PATCH /api/notifications/:id/read',
        markAllAsRead: 'PATCH /api/notifications/read-all',
        delete: 'DELETE /api/notifications/:id',
        deleteAll: 'DELETE /api/notifications'
      },
      chat: {
        websocket: 'ws://localhost:3001?userId={userId}',
        users: {
          create: 'POST /api/chat/users',
          list: 'GET /api/chat/users',
          online: 'GET /api/chat/users/online',
          byUsername: 'GET /api/chat/users/username/:username',
          byId: 'GET /api/chat/users/:userId',
          status: 'GET /api/chat/users/:userId/status',
          unreadCount: 'GET /api/chat/users/:userId/unread-count',
          conversations: 'GET /api/chat/users/:userId/conversations'
        },
        conversations: {
          create: 'POST /api/chat/conversations',
          get: 'GET /api/chat/conversations/:conversationId',
          oneToOne: 'POST /api/chat/conversations/one-to-one',
          addMembers: 'POST /api/chat/conversations/:conversationId/members',
          removeMember: 'DELETE /api/chat/conversations/:conversationId/members/:userId',
          updateName: 'PATCH /api/chat/conversations/:conversationId/name',
          getMembers: 'GET /api/chat/conversations/:conversationId/members',
          clear: 'POST /api/chat/conversations/:conversationId/clear',
          leave: 'POST /api/chat/conversations/:conversationId/leave',
          pin: 'PATCH /api/chat/conversations/:conversationId/pin'
        },
        messages: {
          send: 'POST /api/chat/messages',
          list: 'GET /api/chat/conversations/:conversationId/messages',
          markSeen: 'POST /api/chat/messages/:messageId/seen',
          uploadMedia: 'POST /api/chat/media/upload',
          sendMedia: 'POST /api/chat/messages/media'
        }
      }

    }
  });
});

// Global error handler (must be last)
app.use(errorHandler);

/**
 * Initialize RAG services on startup
 */
async function initializeServices() {
  console.log('\n:: Initializing RAG services...\n');
  
  try {
    // Initialize Qdrant collections
    await qdrantService.initializeCollections();
    
    // Initialize memory manager collections
    await memoryManager.ensureCollections();
    
    // Warmup embedding service (downloads model on first use)
    await embeddingService.warmup();
    
    console.log('\n:: All RAG services initialized successfully\n');
  } catch (error) {
    console.error('\n:: Failed to initialize RAG services:', error);
    console.log(':: Server will continue without RAG features\n');
  }
}

// Create HTTP server for WebSocket support
const server = app.listen(config.port, async () => {
  console.log(`\n:: Server is running at http://localhost:${config.port}\n`);
  logConfig();
  
  // Initialize RAG services in background
  initializeServices().catch(err => {
    console.error(':: Background service initialization error:', err);
  });
});

// Setup WebSocket for real-time chat
setupWebSocket(server);