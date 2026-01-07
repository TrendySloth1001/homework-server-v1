/**
 * Caching Service
 * Redis-based caching for embeddings and queries
 */

import { Redis } from 'ioredis';

class CachingService {
  private client: Redis | null = null;
  private readonly TTL = 3600; // 1 hour in seconds

  async initialize(): Promise<void> {
    if (this.client) return;

    try {
      this.client = new Redis({
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379'),
        password: process.env.REDIS_PASSWORD || 'redis123',
        maxRetriesPerRequest: 3,
        retryStrategy: (times) => Math.min(times * 50, 2000),
      });

      console.log(':: Caching service initialized');
    } catch (error) {
      console.error(':: Failed to initialize caching service:', error);
      // Continue without cache
    }
  }

  /**
   * Cache embedding result
   */
  async cacheEmbedding(query: string, embedding: number[]): Promise<void> {
    if (!this.client) return;

    try {
      const key = `embedding:${this.hashQuery(query)}`;
      await this.client.setex(key, this.TTL, JSON.stringify(embedding));
    } catch (error) {
      console.warn('[Cache] Failed to cache embedding:', error);
    }
  }

  /**
   * Get cached embedding
   */
  async getEmbedding(query: string): Promise<number[] | null> {
    if (!this.client) return null;

    try {
      const key = `embedding:${this.hashQuery(query)}`;
      const cached = await this.client.get(key);
      return cached ? JSON.parse(cached) : null;
    } catch (error) {
      console.warn('[Cache] Failed to get cached embedding:', error);
      return null;
    }
  }

  /**
   * Cache memory search results
   */
  async cacheMemorySearch(userId: string, query: string, results: any[]): Promise<void> {
    if (!this.client) return;

    try {
      const key = `memory:${userId}:${this.hashQuery(query)}`;
      await this.client.setex(key, this.TTL, JSON.stringify(results));
    } catch (error) {
      console.warn('[Cache] Failed to cache memory search:', error);
    }
  }

  /**
   * Get cached memory search results
   */
  async getMemorySearch(userId: string, query: string): Promise<any[] | null> {
    if (!this.client) return null;

    try {
      const key = `memory:${userId}:${this.hashQuery(query)}`;
      const cached = await this.client.get(key);
      return cached ? JSON.parse(cached) : null;
    } catch (error) {
      console.warn('[Cache] Failed to get cached memory search:', error);
      return null;
    }
  }

  /**
   * Invalidate user's memory cache (call when new memories added)
   */
  async invalidateUserMemories(userId: string): Promise<void> {
    if (!this.client) return;

    try {
      const pattern = `memory:${userId}:*`;
      const keys = await this.client.keys(pattern);
      if (keys.length > 0) {
        await this.client.del(...keys);
      }
    } catch (error) {
      console.warn('[Cache] Failed to invalidate user memories:', error);
    }
  }

  /**
   * Simple hash function for query strings
   */
  private hashQuery(query: string): string {
    let hash = 0;
    for (let i = 0; i < query.length; i++) {
      const char = query.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash).toString(36);
  }
}

export const cachingService = new CachingService();
