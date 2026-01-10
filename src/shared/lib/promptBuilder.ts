/**
 * Dynamic Prompt Builder
 * Constructs personalized prompts based on AI settings, user context, and memory
 * Phase 1: Core Prompt Building with Memory Integration
 * Phase 3: Integrated with centralized prompt library
 */

import { AISettings, UserContext } from '@prisma/client';
import { MemoryFact, ConversationSummary } from './memoryManager';
import { buildBaseSystemPrompt, buildChatPrompt, PromptConfig } from './prompts';

export interface PromptContext {
  userMessage: string;
  conversationHistory?: Array<{ role: string; content: string }>;
  aiSettings?: AISettings;
  userContext?: UserContext;
  relevantFacts?: MemoryFact[];
  relevantConversations?: ConversationSummary[];
  userName?: string; // User's display name for personalization
}

class PromptBuilder {
  /**
   * Build system prompt with personality and context
   * Now uses centralized prompt library
   */
  buildSystemPrompt(context: PromptContext): string {
    // Extract quiz history and study plans from userContext if present
    const quizHistory = (context.userContext as any)?.quizHistory;
    const studyPlans = (context.userContext as any)?.studyPlans;
    
    // Build config for centralized prompt system
    const promptConfig: PromptConfig = {
      aiSettings: context.aiSettings || null,
      userContext: context.userContext || null,
      userName: context.userName || undefined,
      conversationHistory: context.conversationHistory || undefined,
      quizHistory,
      studyPlans,
    };
    
    // Use centralized base system prompt
    let systemPrompt = buildBaseSystemPrompt(promptConfig);
    
    // Add memory facts if available
    if (context.relevantFacts && context.relevantFacts.length > 0) {
      const memoryInfo = this.buildMemoryContext(context.relevantFacts);
      systemPrompt += '\n## What I Remember About You:\n';
      systemPrompt += memoryInfo + '\n\n';
    }

    // Add relevant past conversations
    if (context.relevantConversations && context.relevantConversations.length > 0) {
      const convInfo = this.buildConversationContext(context.relevantConversations);
      systemPrompt += '\n## Related Past Discussions:\n';
      systemPrompt += convInfo + '\n\n';
    }

    return systemPrompt;
  }

  /**
   * Get tone instruction from settings
   */
  private getToneInstruction(settings: AISettings): string {
    const parts: string[] = [];

    // Base tone
    const tones = {
      formal: 'Maintain a professional and academic tone.',
      friendly: 'Be warm, approachable, and conversational.',
      casual: 'Keep it relaxed and informal, like chatting with a friend.',
      professional: 'Use clear, precise language with a professional demeanor.',
      encouraging: 'Be supportive, positive, and motivating.',
    };
    parts.push(tones[settings.baseTone as keyof typeof tones] || tones.friendly);

    // Warmth (0-10)
    if (settings.warmth >= 7) {
      parts.push('Show genuine care and empathy in your responses.');
    } else if (settings.warmth <= 3) {
      parts.push('Keep responses concise and to the point.');
    }

    // Enthusiasm (0-10)
    if (settings.enthusiasm >= 7) {
      parts.push('Express excitement about topics and celebrate student progress!');
    } else if (settings.enthusiasm <= 3) {
      parts.push('Maintain a calm, measured tone.');
    }

    // Emoji usage
    if (settings.emojiUsage === 'frequent') {
      parts.push('Use emojis naturally to add personality (2-4 per response).');
    } else if (settings.emojiUsage === 'occasional') {
      parts.push('Use 1-2 emojis when appropriate.');
    } else if (settings.emojiUsage === 'none') {
      parts.push('Do not use emojis.');
    }

    // Headers and structure
    if (settings.useHeaders) {
      parts.push('Use markdown headers (##, ###) and bullet points to organize longer responses.');
    }

    // Response length
    const lengths = {
      concise: 'Keep responses brief and focused (2-3 sentences typically).',
      balanced: 'Provide thorough explanations while staying focused.',
      detailed: 'Give comprehensive, in-depth explanations with examples.',
    };
    parts.push(lengths[settings.responseLength as keyof typeof lengths] || lengths.balanced);

    return parts.join(' ');
  }

  /**
   * Build profile context from user data
   */
  private buildProfileContext(userContext: any): string {
    const parts: string[] = [];

    if (userContext.learningGoals) {
      parts.push(`Goals: ${userContext.learningGoals}`);
    }

    if (userContext.strongSubjects && userContext.strongSubjects.length > 0) {
      parts.push(`Strong in: ${userContext.strongSubjects.join(', ')}`);
    }

    if (userContext.weakSubjects && userContext.weakSubjects.length > 0) {
      parts.push(`Needs help with: ${userContext.weakSubjects.join(', ')}`);
    }

    if (userContext.preferredExamples) {
      parts.push(`Prefers examples: ${userContext.preferredExamples}`);
    }

    if (userContext.interests) {
      parts.push(`Interests: ${userContext.interests}`);
    }

    // Add quiz history if available
    if (userContext.quizHistory) {
      parts.push(userContext.quizHistory);
    }

    return parts.join('\n');
  }

  /**
   * Build memory context from facts
   */
  private buildMemoryContext(facts: MemoryFact[]): string {
    // Group by category
    const byCategory: Record<string, string[]> = {};
    
    facts.forEach(fact => {
      if (!byCategory[fact.category]) {
        byCategory[fact.category] = [];
      }
      byCategory[fact.category]!.push(fact.fact);
    });

    const parts: string[] = [];
    for (const [category, items] of Object.entries(byCategory)) {
      parts.push(`${category}: ${items.join('; ')}`);
    }

    return parts.join('\n');
  }

  /**
   * Build context from past conversations
   */
  private buildConversationContext(conversations: ConversationSummary[]): string {
    return conversations
      .map((conv, idx) => `${idx + 1}. ${conv.summary} (Topics: ${conv.topics.join(', ')})`)
      .join('\n');
  }

  /**
   * Build complete prompt for AI
   */
  buildFullPrompt(context: PromptContext): string {
    const systemPrompt = this.buildSystemPrompt(context);
    
    // Add conversation history if available
    let fullPrompt = systemPrompt + '\n\n---\n\n';
    
    if (context.conversationHistory && context.conversationHistory.length > 0) {
      fullPrompt += 'Conversation History:\n';
      context.conversationHistory.forEach(msg => {
        fullPrompt += `${msg.role.toUpperCase()}: ${msg.content}\n`;
      });
      fullPrompt += '\n';
    }

    fullPrompt += `USER: ${context.userMessage}\n\nASSISTANT:`;
    
    return fullPrompt;
  }
}

export const promptBuilder = new PromptBuilder();
