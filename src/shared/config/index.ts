/**
 * Centralized configuration management
 * All environment variables and config values should be accessed through this module
 */

interface Config {
  // Server
  port: number;
  nodeEnv: string;
  isDevelopment: boolean;
  isProduction: boolean;
  frontendUrl: string;

  // Database
  database: {
    url: string;
  };

  // AI Services
  ai: {
    provider: 'ollama' | 'openai';
    ollama: {
      baseUrl: string;
      model: string;
      timeout: number;
    };
    openai?: {
      apiKey?: string;
      model: string;
      maxTokens: number;
    };
  };

  // Caching (for future use)
  redis?: {
    url?: string;
    enabled: boolean;
  };

  // Vector Database
  qdrant?: {
    url: string;
  };

  // Web Search
  tavily?: {
    apiKey: string;
    enabled: boolean;
  };

  // S3/MinIO Storage
  s3?: {
    endpoint: string;
    accessKey: string;
    secretKey: string;
    bucket: string;
    region: string;
    publicUrl: string;
  };

  // API Configuration
  api: {
    rateLimit: {
      windowMs: number;
      maxRequests: number;
    };
  };

  // Authentication
  auth: {
    google: {
      clientId: string;
      clientSecret: string;
      callbackUrl: string;
    };
    jwt: {
      secret: string;
      expiresIn: string;
      tempTokenExpiresIn: string; // For OAuth -> signup flow
    };
  };
}

function validateConfig(): Config {
  const nodeEnv = process.env.NODE_ENV || 'development';

  return {
    port: parseInt(process.env.PORT || '3001', 10),
    nodeEnv,
    isDevelopment: nodeEnv === 'development',
    isProduction: nodeEnv === 'production',
    frontendUrl: process.env.FRONTEND_URL || (nodeEnv === 'development' ? 'http://localhost:3000' : 'http://localhost:3000'),

    database: {
      url: process.env.DATABASE_URL || 'file:./dev.db',
    },

    ai: {
      provider: (process.env.AI_PROVIDER as 'ollama' | 'openai') || 'ollama',
      ollama: {
        baseUrl: process.env.OLLAMA_BASE_URL || 'http://localhost:11434',
        model: process.env.OLLAMA_MODEL || 'qwen2.5:7b', // Dynamically configurable via .env
        timeout: parseInt(process.env.OLLAMA_TIMEOUT || '300000', 10), // 5 minutes for syllabus generation
      },
      ...(process.env.OPENAI_API_KEY ? {
        openai: {
          apiKey: process.env.OPENAI_API_KEY,
          model: process.env.OPENAI_MODEL || 'gpt-4',
          maxTokens: parseInt(process.env.OPENAI_MAX_TOKENS || '2000', 10),
        },
      } : {}),
    },

    ...(process.env.REDIS_URL ? {
      redis: {
        url: process.env.REDIS_URL,
        enabled: true,
      },
    } : {}),

    ...(process.env.QDRANT_URL ? {
      qdrant: {
        url: process.env.QDRANT_URL,
      },
    } : {}),

    ...(process.env.TAVILY_API_KEY ? {
      tavily: {
        apiKey: process.env.TAVILY_API_KEY,
        enabled: true,
      },
    } : {}),

    ...(process.env.S3_ENDPOINT ? {
      s3: {
        endpoint: process.env.S3_ENDPOINT,
        accessKey: process.env.S3_ACCESS_KEY || 'minioadmin',
        secretKey: process.env.S3_SECRET_KEY || 'minioadmin123',
        bucket: process.env.S3_BUCKET || 'homework-media',
        region: process.env.S3_REGION || 'us-east-1',
        publicUrl: process.env.S3_PUBLIC_URL || process.env.S3_ENDPOINT || 'http://localhost:9000',
      },
    } : {}),

    api: {
      rateLimit: {
        windowMs: 15 * 60 * 1000,
        maxRequests: parseInt(process.env.RATE_LIMIT_MAX || '100', 10),
      },
    },

    auth: {
      google: {
        clientId: process.env.GOOGLE_CLIENT_ID || '',
        clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
        callbackUrl: process.env.GOOGLE_CALLBACK_URL || 'http://localhost:3001/api/auth/google/callback',
      },
      jwt: {
        secret: process.env.JWT_SECRET || 'dev-secret-change-in-production-' + nodeEnv,
        expiresIn: process.env.JWT_EXPIRES_IN || '7d',
        tempTokenExpiresIn: '30m', // Temporary token for OAuth -> signup
      },
    },
  };
}

export const config = validateConfig();

export function logConfig(): void {
  console.log('Configuration:', {
    nodeEnv: config.nodeEnv,
    port: config.port,
    database: { url: config.database.url.substring(0, 20) + '...' },
    ai: {
      provider: config.ai.provider,
      ollama: {
        baseUrl: config.ai.ollama.baseUrl,
        model: config.ai.ollama.model,
      },
      openai: {
        configured: !!config.ai.openai?.apiKey,
        model: config.ai.openai?.model,
      },
    },
    redis: { enabled: config.redis?.enabled },
  });
}
