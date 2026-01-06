/**
 * Memory Pruning Service
 * Automatic cleanup of old, low-relevance memories
 */

import { mem0Service } from './mem0Client';

interface PruningConfig {
  maxAge: number; // days
  minRelevanceScore: number;
  checkInterval: number; // hours
}

class MemoryPruningService {
  private config: PruningConfig = {
    maxAge: 90, // 90 days
    minRelevanceScore: 0.3,
    checkInterval: 24, // daily
  };

  private pruningInterval: NodeJS.Timeout | null = null;

  /**
   * Start automatic pruning
   */
  startAutoPruning(): void {
    if (this.pruningInterval) return;

    console.log(':: Starting automatic memory pruning');
    
    // Run immediately, then on interval
    this.pruneMemories().catch(err => 
      console.error('[MemoryPruning] Initial pruning failed:', err)
    );

    this.pruningInterval = setInterval(() => {
      this.pruneMemories().catch(err =>
        console.error('[MemoryPruning] Scheduled pruning failed:', err)
      );
    }, this.config.checkInterval * 60 * 60 * 1000);
  }

  /**
   * Stop automatic pruning
   */
  stopAutoPruning(): void {
    if (this.pruningInterval) {
      clearInterval(this.pruningInterval);
      this.pruningInterval = null;
      console.log(':: Stopped automatic memory pruning');
    }
  }

  /**
   * Prune old and low-relevance memories
   */
  async pruneMemories(): Promise<{ deleted: number; kept: number }> {
    console.log('[MemoryPruning] Starting memory pruning...');
    
    let deleted = 0;
    let kept = 0;

    try {
      // This would need to be implemented based on Mem0's API
      // For now, this is a placeholder that shows the structure
      
      // Example: Get all memories (would need to be paginated)
      // const allMemories = await mem0Service.getAllMemories();
      
      // const cutoffDate = new Date();
      // cutoffDate.setDate(cutoffDate.getDate() - this.config.maxAge);

      // for (const memory of allMemories) {
      //   const memoryDate = new Date(memory.created_at);
      //   const isOld = memoryDate < cutoffDate;
      //   const hasLowRelevance = memory.relevance_score < this.config.minRelevanceScore;
      //   const notRecentlyUsed = !memory.last_accessed || 
      //     new Date(memory.last_accessed) < cutoffDate;

      //   if (isOld && (hasLowRelevance || notRecentlyUsed)) {
      //     await mem0Service.deleteMemory(memory.id);
      //     deleted++;
      //   } else {
      //     kept++;
      //   }
      // }

      console.log(`[MemoryPruning] Completed: ${deleted} deleted, ${kept} kept`);
      
      return { deleted, kept };
    } catch (error) {
      console.error('[MemoryPruning] Pruning failed:', error);
      return { deleted: 0, kept: 0 };
    }
  }

  /**
   * Update pruning configuration
   */
  updateConfig(config: Partial<PruningConfig>): void {
    this.config = { ...this.config, ...config };
    console.log('[MemoryPruning] Configuration updated:', this.config);
  }
}

export const memoryPruningService = new MemoryPruningService();
