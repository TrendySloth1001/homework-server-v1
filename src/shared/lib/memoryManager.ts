/**
 * Memory Manager Service using LangChain
 * Handles long-term memory, fact extraction, and conversation search
 * Phase 1: Core Memory Implementation
 */

import { prisma } from './prisma';
import { embeddingService } from './embeddings';
import { qdrantService } from './qdrant';
import { ollamaService } from './ollama';

export interface MemoryFact {
  id: string;
  fact: string;
  category: string;
  confidence: number;
  source: string;
  relevanceCount: number;
  lastUsedAt?: Date | null;
}

export interface ConversationSummary {
  id: string;
  summary: string;
  topics: string[];
  conversationId: string;
  createdAt: Date;
}

class MemoryManager {
  private readonly factCollectionName = 'memory_facts';
  private readonly conversationCollectionName = 'conversation_summaries';

  /**
   * Load relevant facts for a user based on query context
   */
  async loadRelevantFacts(userId: string, query?: string, limit: number = 10): Promise<MemoryFact[]> {
    try {
      if (query) {
        // Vector search for relevant facts
        const queryEmbedding = await embeddingService.generateEmbedding(query);
        
        // Search in Qdrant
        const client = qdrantService.getClient();
        const searchResults = await client.search(this.factCollectionName, {
          vector: queryEmbedding,
          filter: {
            must: [
              { key: 'userId', match: { value: userId } },
              { key: 'confidence', range: { gte: 0.5 } }
            ]
          },
          limit,
        });

        return searchResults.map((result: any) => ({
          id: result.id,
          fact: result.payload.fact,
          category: result.payload.category,
          confidence: result.payload.confidence,
          source: result.payload.source,
          relevanceCount: result.payload.relevanceCount,
          lastUsedAt: result.payload.lastUsedAt ? new Date(result.payload.lastUsedAt) : null,
        }));
      } else {
        // Load most recent/relevant facts from database
        const facts = await prisma.memoryFact.findMany({
          where: {
            userId,
            confidence: { gte: 0.5 },
          },
          orderBy: [
            { relevanceCount: 'desc' },
            { createdAt: 'desc' },
          ],
          take: limit,
        });

        return facts.map((f: any) => ({
          id: f.id,
          fact: f.fact,
          category: f.category,
          confidence: f.confidence,
          source: f.source,
          relevanceCount: f.relevanceCount,
          lastUsedAt: f.lastUsedAt || null,
        }));
      }
    } catch (error) {
      console.error('[MemoryManager] Error loading facts:', error);
      return [];
    }
  }

  /**
   * Store new facts extracted from conversation
   */
  async storeFacts(userId: string, facts: Array<{ fact: string; category: string; conversationId?: string }>): Promise<void> {
    try {
      for (const factData of facts) {
        // Generate embedding for the fact
        const embedding = await embeddingService.generateEmbedding(factData.fact);
        
        // Store in database
        const storedFact = await prisma.memoryFact.create({
          data: {
            userId,
            fact: factData.fact,
            category: factData.category,
            confidence: 1.0,
            source: factData.conversationId ? `conversation:${factData.conversationId}` : 'system',
            conversationId: factData.conversationId || null,
            embedding: JSON.stringify(embedding),
            relevanceCount: 1,
          },
        });

        // Store in Qdrant for vector search
        const client = qdrantService.getClient();
        await client.upsert(this.factCollectionName, {
          wait: true,
          points: [{
            id: storedFact.id,
            vector: embedding,
            payload: {
              userId,
              fact: factData.fact,
              category: factData.category,
              confidence: 1.0,
              source: storedFact.source,
              relevanceCount: 1,
              createdAt: storedFact.createdAt.toISOString(),
            },
          }],
        });
      }

      console.log(`[MemoryManager] Stored ${facts.length} facts for user ${userId}`);
    } catch (error) {
      console.error('[MemoryManager] Error storing facts:', error);
      throw error;
    }
  }

  /**
   * Extract facts from conversation using LLM
   */
  async extractFactsFromConversation(
    userId: string,
    userMessage: string,
    aiResponse: string,
    conversationId: string
  ): Promise<void> {
    try {
      const extractionPrompt = `Analyze this conversation and extract key facts about the user. Focus on:
- Learning preferences and style
- Subject strengths and weaknesses
- Goals and aspirations
- Challenges faced
- Interests and context

User message: "${userMessage}"
AI response: "${aiResponse}"

Extract facts as JSON array. Each fact should be concise and specific.
Format: [{"fact": "description", "category": "difficulty|preference|goal|achievement|fact"}]

Only extract new, meaningful information. If no significant facts, return empty array.
Return only valid JSON array, no explanation.`;

      const response = await ollamaService.generate(extractionPrompt, {
        temperature: 0.1, // Low temperature for consistent extraction
        num_predict: 500,
      });

      try {
        const facts = JSON.parse(response.response);
        
        if (Array.isArray(facts) && facts.length > 0) {
          await this.storeFacts(
            userId,
            facts.map((f: any) => ({
              fact: f.fact,
              category: f.category || 'fact',
              conversationId,
            }))
          );
        }
      } catch (parseError) {
        console.warn('[MemoryManager] Could not parse extracted facts:', response.response);
      }
    } catch (error) {
      console.error('[MemoryManager] Error extracting facts:', error);
      // Don't throw - fact extraction failure shouldn't break the main flow
    }
  }

  /**
   * Search past conversations by similarity
   */
  async searchConversations(userId: string, query: string, limit: number = 3): Promise<ConversationSummary[]> {
    try {
      const queryEmbedding = await embeddingService.generateEmbedding(query);
      
      const client = qdrantService.getClient();
      const searchResults = await client.search(this.conversationCollectionName, {
        vector: queryEmbedding,
        filter: {
          must: [{ key: 'userId', match: { value: userId } }]
        },
        limit,
      });

      return searchResults.map((result: any) => ({
        id: result.id,
        summary: result.payload.summary,
        topics: result.payload.topics,
        conversationId: result.payload.conversationId,
        createdAt: new Date(result.payload.createdAt),
      }));
    } catch (error) {
      console.error('[MemoryManager] Error searching conversations:', error);
      return [];
    }
  }

  /**
   * Create conversation summary and store for future reference
   */
  async summarizeConversation(conversationId: string, userId: string): Promise<void> {
    try {
      // Get all messages from conversation
      const messages = await prisma.conversationMessage.findMany({
        where: { conversationId },
        orderBy: { createdAt: 'asc' },
        take: 50, // Limit to avoid token overflow
      });

      if (messages.length < 2) {
        return; // Not enough messages to summarize
      }

      // Build conversation text
      const conversationText = messages
        .map(m => `${m.role.toUpperCase()}: ${m.content}`)
        .join('\n\n');

      // Generate summary
      const summaryPrompt = `Summarize this conversation in 2-3 sentences. Focus on what was discussed and any important outcomes.

${conversationText}

Provide just the summary, no preamble.`;

      const summaryResponse = await ollamaService.generate(summaryPrompt, {
        temperature: 0.3,
        num_predict: 200,
      });

      const summary = summaryResponse.response.trim();

      // Extract topics
      const topicsPrompt = `Extract 3-5 main topics from this conversation as a JSON array of strings.

${conversationText}

Return only the JSON array, e.g., ["physics", "motion", "newton's laws"]`;

      const topicsResponse = await ollamaService.generate(topicsPrompt, {
        temperature: 0.1,
        num_predict: 100,
      });

      let topics: string[] = [];
      try {
        topics = JSON.parse(topicsResponse.response);
      } catch {
        topics = [];
      }

      // Generate embedding for summary
      const embedding = await embeddingService.generateEmbedding(summary);

      // Store in database
      const convRef = await prisma.conversationReference.create({
        data: {
          userId,
          conversationId,
          summary,
          topics,
        },
      });

      // Store in Qdrant
      const client = qdrantService.getClient();
      await client.upsert(this.conversationCollectionName, {
        wait: true,
        points: [{
          id: convRef.id,
          vector: embedding,
          payload: {
            userId,
            conversationId,
            summary,
            topics,
            messageCount: messages.length,
            createdAt: convRef.createdAt.toISOString(),
          },
        }],
      });

      console.log(`[MemoryManager] Summarized conversation ${conversationId}`);
    } catch (error) {
      console.error('[MemoryManager] Error summarizing conversation:', error);
    }
  }

  /**
   * Update fact relevance when used in context
   */
  async markFactAsUsed(factId: string): Promise<void> {
    try {
      await prisma.memoryFact.update({
        where: { id: factId },
        data: {
          relevanceCount: { increment: 1 },
          lastUsedAt: new Date(),
        },
      });
    } catch (error) {
      console.error('[MemoryManager] Error marking fact as used:', error);
    }
  }

  /**
   * Ensure Qdrant collections exist for memory
   */
  async ensureCollections(): Promise<void> {
    try {
      const client = qdrantService.getClient();

      // Check/create facts collection
      try {
        await client.getCollection(this.factCollectionName);
      } catch {
        await client.createCollection(this.factCollectionName, {
          vectors: { size: 384, distance: 'Cosine' }
        });
        console.log(`[MemoryManager] Created collection: ${this.factCollectionName}`);
      }

      // Check/create conversations collection
      try {
        await client.getCollection(this.conversationCollectionName);
      } catch {
        await client.createCollection(this.conversationCollectionName, {
          vectors: { size: 384, distance: 'Cosine' }
        });
        console.log(`[MemoryManager] Created collection: ${this.conversationCollectionName}`);
      }
    } catch (error) {
      console.error('[MemoryManager] Error ensuring collections:', error);
      throw error;
    }
  }
}

export const memoryManager = new MemoryManager();
