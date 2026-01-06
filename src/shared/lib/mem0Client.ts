/**
 * Mem0 Client Integration
 * Personalized AI memory management
 */

import { MemoryClient } from 'mem0ai';
import { config } from '../config';
import { cachingService } from './cachingService';

interface MemorySearchOptions {
  limit?: number;
  minRelevanceScore?: number;
}

class Mem0Service {
  private client: MemoryClient | null = null;
  private initialized = false;
  private readonly DEFAULT_RELEVANCE_THRESHOLD = 0.7;

  /**
   * Initialize Mem0 client
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      // Initialize Mem0 with our configuration
      this.client = new MemoryClient({
        apiKey: process.env.MEM0_API_KEY || '',
      });

      this.initialized = true;
      console.log(':: Mem0 client initialized successfully');
    } catch (error) {
      console.error(':: Failed to initialize Mem0:', error);
      throw error;
    }
  }

  /**
   * Add memory for a user
   */
  async addMemory(userId: string, messages: Array<{ role: string; content: string }>, metadata?: any): Promise<any> {
    if (!this.client) await this.initialize();

    try {
      const result = await this.client!.add(messages, {
        user_id: userId,
        metadata,
      });

      console.log(`[Mem0] Added memory for user ${userId}`);
      
      // Invalidate cache for this user
      await cachingService.invalidateUserMemories(userId);
      
      return result;
    } catch (error) {
      console.error('[Mem0] Failed to add memory:', error);
      throw error;
    }
  }

  /**
   * Search memories for a user based on query with caching and relevance filtering
   */
  async searchMemories(userId: string, query: string, limit: number = 5, options?: MemorySearchOptions): Promise<any[]> {
    if (!this.client) await this.initialize();

    // Check cache first
    const cached = await cachingService.getMemorySearch(userId, query);
    if (cached) {
      console.log(`[Mem0] Cache hit for user ${userId}`);
      return this.filterByRelevance(cached, options?.minRelevanceScore);
    }

    try {
      const memories = await this.client!.search(query, {
        user_id: userId,
        limit: limit * 2, // Fetch more for filtering
      });

      // Cache results
      await cachingService.cacheMemorySearch(userId, query, memories);

      // Filter by relevance score
      const filtered = this.filterByRelevance(memories, options?.minRelevanceScore);
      
      console.log(`[Mem0] Found ${filtered.length}/${memories.length} relevant memories (threshold: ${options?.minRelevanceScore || this.DEFAULT_RELEVANCE_THRESHOLD})`);
      return filtered.slice(0, limit);
    } catch (error) {
      console.error('[Mem0] Failed to search memories:', error);
      return [];
    }
  }

  /**
   * Batch search memories for multiple queries
   */
  async batchSearchMemories(userId: string, queries: string[], limit: number = 3): Promise<Map<string, any[]>> {
    const results = new Map<string, any[]>();
    
    // Execute searches in parallel
    const searches = queries.map(query => 
      this.searchMemories(userId, query, limit)
        .then(memories => ({ query, memories }))
    );

    const allResults = await Promise.all(searches);
    
    allResults.forEach(({ query, memories }) => {
      results.set(query, memories);
    });

    return results;
  }

  /**
   * Filter memories by relevance score
   */
  private filterByRelevance(memories: any[], minScore?: number): any[] {
    const threshold = minScore ?? this.DEFAULT_RELEVANCE_THRESHOLD;
    return memories.filter(m => {
      const score = m.score || m.relevance_score || 1.0;
      return score >= threshold;
    });
  }

  /**
   * Get all memories for a user
   */
  async getUserMemories(userId: string): Promise<any[]> {
    if (!this.client) await this.initialize();

    try {
      const memories = await this.client!.getAll({
        user_id: userId,
      });

      return memories;
    } catch (error) {
      console.error('[Mem0] Failed to get user memories:', error);
      return [];
    }
  }

  /**
   * Delete a specific memory
   */
  async deleteMemory(memoryId: string): Promise<void> {
    if (!this.client) await this.initialize();

    try {
      await this.client!.delete(memoryId);
      console.log(`[Mem0] Deleted memory ${memoryId}`);
    } catch (error) {
      console.error('[Mem0] Failed to delete memory:', error);
      throw error;
    }
  }

  /**
   * Update a memory
   */
  async updateMemory(memoryId: string, data: string): Promise<any> {
    if (!this.client) await this.initialize();

    try {
      const result = await this.client!.update(memoryId, data);
      console.log(`[Mem0] Updated memory ${memoryId}`);
      return result;
    } catch (error) {
      console.error('[Mem0] Failed to update memory:', error);
      throw error;
    }
  }

  /**
   * Get memory history for a user
   */
  async getMemoryHistory(memoryId: string): Promise<any[]> {
    if (!this.client) await this.initialize();

    try {
      const history = await this.client!.history(memoryId);
      return history;
    } catch (error) {
      console.error('[Mem0] Failed to get memory history:', error);
      return [];
    }
  }
}

export const mem0Service = new Mem0Service();
