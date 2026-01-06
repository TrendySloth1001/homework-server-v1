/**
 * Mem0 Client Integration
 * Personalized AI memory management
 */

import { MemoryClient } from 'mem0ai';
import { config } from '../config';

class Mem0Service {
  private client: MemoryClient | null = null;
  private initialized = false;

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
      return result;
    } catch (error) {
      console.error('[Mem0] Failed to add memory:', error);
      throw error;
    }
  }

  /**
   * Search memories for a user based on query
   */
  async searchMemories(userId: string, query: string, limit: number = 5): Promise<any[]> {
    if (!this.client) await this.initialize();

    try {
      const memories = await this.client!.search(query, {
        user_id: userId,
        limit,
      });

      console.log(`[Mem0] Found ${memories.length} relevant memories for user ${userId}`);
      return memories;
    } catch (error) {
      console.error('[Mem0] Failed to search memories:', error);
      return [];
    }
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
