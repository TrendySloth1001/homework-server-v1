/**
 * LangChain Service Integration
 * Modern approach using LangChain Expression Language (LCEL) with Mem0
 */

import { ChatOllama } from '@langchain/ollama';
import { ChatPromptTemplate } from '@langchain/core/prompts';
import { StringOutputParser } from '@langchain/core/output_parsers';
import { config } from '../config';
import { mem0Service } from './mem0Client';

interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
}

class LangChainService {
  private model: ChatOllama;
  private initialized = false;

  constructor() {
    this.model = new ChatOllama({
      model: config.ai.ollama.model || 'qwen2.5:7b',
      baseUrl: config.ai.ollama.baseUrl,
      temperature: 0.7,
    });
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;
    
    console.log(':: Initializing LangChain service...');
    this.initialized = true;
    console.log(':: LangChain service initialized');
  }

  /**
   * Chat with context and memory using modern LCEL approach
   */
  async chat(
    userId: string,
    query: string,
    conversationHistory: ConversationMessage[] = [],
    systemPrompt?: string
  ): Promise<string> {
    if (!this.initialized) {
      await this.initialize();
    }

    // Search for relevant memories using Mem0
    const memories = await mem0Service.searchMemories(userId, query, 3);
    const relevantMemories = memories.map((m: any) => m.memory || m.text);

    console.log(`[LangChain] Found ${relevantMemories.length} relevant memories for query`);

    // Build context from memories
    const memoryContext = relevantMemories.length > 0
      ? `\n\nRelevant information about the user:\n${relevantMemories.join('\n')}`
      : '';

    // Build conversation history
    const historyMessages = conversationHistory.map(msg => 
      `${msg.role === 'user' ? 'Human' : 'Assistant'}: ${msg.content}`
    ).join('\n');

    const conversationContext = historyMessages
      ? `\n\nConversation history:\n${historyMessages}`
      : '';

    // Create the full prompt
    const fullSystemPrompt = `${systemPrompt || 'You are a helpful AI assistant.'}${memoryContext}${conversationContext}`;

    // Invoke model directly with formatted prompt
    const fullPrompt = `${fullSystemPrompt}\n\nUser: ${query}\nAssistant:`;
    const response = await this.model.invoke(fullPrompt);
    
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
