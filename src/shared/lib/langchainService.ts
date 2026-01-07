/**
 * LangChain Service Integration
 * Modern approach using LangChain Expression Language (LCEL) with Mem0
 */

import { ChatOllama } from '@langchain/ollama';
import { config } from '../config';
import { mem0Service } from './mem0Client';
import { cachingService } from './cachingService';
import { intentClassifier, QueryDomain } from './intentClassifier';

interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface ChatOptions {
  stream?: boolean;
  onToken?: (token: string) => void;
  modelOverride?: string;
  useIntentRouting?: boolean; // NEW: Enable smart model routing
}

class LangChainService {
  private modelCache: Map<string, ChatOllama> = new Map();
  private initialized = false;

  /**
   * Get or create model instance with connection pooling
   */
  private getModel(modelName?: string): ChatOllama {
    const name = modelName || config.ai.ollama.model || 'qwen2.5:7b';
    
    if (!this.modelCache.has(name)) {
      this.modelCache.set(name, new ChatOllama({
        model: name,
        baseUrl: config.ai.ollama.baseUrl,
        temperature: 0.7,
        keepAlive: '10m', // Keep connection alive for 10 minutes
      }));
      console.log(`[LangChain] Created model instance: ${name}`);
    }
    
    return this.modelCache.get(name)!;
  }

  /**
   * Smart model selection based on query complexity and intent classification
   */
  private selectModel(query: string, useIntentRouting: boolean = false): string {
    // PHASE 1: Intent-based routing (if enabled)
    if (useIntentRouting) {
      const analysis = intentClassifier.classify(query);
      
      if (analysis.confidence > 0.7) {
        console.log(`[LangChain] Intent routing: ${analysis.domain} (${(analysis.confidence * 100).toFixed(0)}%)`);
        console.log(`[LangChain] Recommended model: ${analysis.recommendedModel}`);
        console.log(`[LangChain] Reasoning: ${analysis.reasoning}`);
        
        if (analysis.requiresTools) {
          console.log(`[LangChain] Required tools: ${analysis.tools.join(', ')}`);
        }
        
        return analysis.recommendedModel;
      }
    }

    // PHASE 2: Complexity-based routing (fallback)
    const wordCount = query.split(/\s+/).length;
    const hasCode = /```|function|class|const|let|var/.test(query);
    const hasMath = /\d+[+\-*/]\d+|equation|formula|calculate/.test(query);
    const isComplex = wordCount > 50 || hasCode || hasMath;

    // Use larger model for complex queries
    if (isComplex && process.env.OLLAMA_LARGE_MODEL) {
      console.log('[LangChain] Using large model for complex query');
      return process.env.OLLAMA_LARGE_MODEL;
    }

    return config.ai.ollama.model || 'qwen2.5:7b';
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;
    
    console.log(':: Initializing LangChain service...');
    this.initialized = true;
    console.log(':: LangChain service initialized');
  }

  /**
   * Chat with context and memory using modern LCEL approach
   * Now with streaming, caching, and smart model selection
   */
  async chat(
    userId: string,
    query: string,
    conversationHistory: ConversationMessage[] = [],
    systemPrompt?: string,
    options?: ChatOptions
  ): Promise<string> {
    if (!this.initialized) {
      await this.initialize();
    }

    // Smart model selection with intent routing
    const selectedModel = options?.modelOverride || this.selectModel(query, options?.useIntentRouting ?? true);
    const model = this.getModel(selectedModel);

    // Search for relevant memories using Mem0 (with relevance threshold)
    const memories = await mem0Service.searchMemories(userId, query, 3, {
      minRelevanceScore: 0.7,
    });
    const relevantMemories = memories.map((m: any) => m.memory || m.text);

    console.log(`[LangChain] Found ${relevantMemories.length} relevant memories for query`);

    // Build context from memories
    const memoryContext = relevantMemories.length > 0
      ? `\n\nRelevant information about the user:\n${relevantMemories.join('\n')}`
      : '';

    // Build conversation history (with sliding window)
    const recentHistory = conversationHistory.slice(-10); // Last 10 messages
    const historyMessages = recentHistory.map(msg => 
      `${msg.role === 'user' ? 'Human' : 'Assistant'}: ${msg.content}`
    ).join('\n');

    const conversationContext = historyMessages
      ? `\n\nConversation history:\n${historyMessages}`
      : '';

    // Create the full prompt
    const fullSystemPrompt = `${systemPrompt || 'You are a helpful AI assistant.'}${memoryContext}${conversationContext}`;
    const fullPrompt = `${fullSystemPrompt}\n\nUser: ${query}\nAssistant:`;

    // Handle streaming if requested
    if (options?.stream && options?.onToken) {
      const stream = await model.stream(fullPrompt);
      let fullResponse = '';

      for await (const chunk of stream) {
        const token = chunk.content.toString();
        fullResponse += token;
        options.onToken(token);
      }

      return fullResponse;
    }

    // Regular invocation
    const response = await model.invoke(fullPrompt);
    return response.content.toString();
  }

  /**
   * Store a conversation in Mem0 for future reference
   */
  async storeConversation(
    userId: string,
    conversationId: string,
    userMessage: string,
    assistantResponse: string
  ): Promise<void> {
    try {
      // Store the exchange as a memory  
      await mem0Service.addMemory(
        userId,
        [
          { role: 'user', content: userMessage },
          { role: 'assistant', content: assistantResponse },
        ],
        { conversationId }
      );
      console.log(`[LangChain] Stored conversation in Mem0`);
    } catch (error) {
      console.error('[LangChain] Failed to store conversation:', error);
    }
  }
}

export const langchainService = new LangChainService();
