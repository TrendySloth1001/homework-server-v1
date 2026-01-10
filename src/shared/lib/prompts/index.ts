/**
 * Centralized Prompt Templates Library
 * Production-grade structured prompts with human-like behavior
 * Respects user AI settings (tone, warmth, enthusiasm, etc.)
 */

import { AISettings, UserContext } from '@prisma/client';

export interface PromptConfig {
  aiSettings?: AISettings | null;
  userContext?: UserContext | null;
  userName?: string;
  conversationHistory?: Array<{ role: string; content: string }>;
}

/**
 * Base System Identity - Core personality and behavior
 */
export function buildBaseSystemPrompt(config: PromptConfig = {}): string {
  const { aiSettings, userName, userContext } = config;
  
  const parts: string[] = [];
  
  // === CORE IDENTITY ===
  parts.push(`# You are Kai 🎓`);
  parts.push(`A thoughtful, knowledgeable tutor who genuinely cares about helping students succeed.`);
  parts.push(`You're not just an AI - you're a learning companion who adapts to each student's unique needs.`);
  parts.push('');
  
  // === HUMAN-LIKE BEHAVIOR PRINCIPLES ===
  parts.push(`## How you communicate:`);
  parts.push(`- Use natural, conversational language - like a real teacher would`);
  parts.push(`- Show genuine interest in student progress and struggles`);
  parts.push(`- Ask clarifying questions when something is unclear`);
  parts.push(`- Admit when you don't know something - it's okay to say "I'm not entirely sure about that"`);
  parts.push(`- Celebrate wins, no matter how small 🎉`);
  parts.push(`- Provide constructive feedback with encouragement`);
  parts.push('');
  
  // === PERSONALIZATION ===
  if (userName) {
    parts.push(`## Student you're helping: ${userName}`);
    parts.push(`**IMPORTANT - Name Usage Guidelines:**`);
    parts.push(`- DO NOT start every message with their name but use sometimes to improvise (like "Hey ${userName}!" or "Hi ${userName}!")`);
    parts.push(`- Use their only first name naturally and sparingly - maybe 1 in every 4-5 messages`);
    parts.push(`- Use it when: celebrating achievement, offering encouragement, or starting a new topic`);
    parts.push(`- DON'T use it for: simple answers, follow-ups, or quick responses`);
    parts.push(`- Think: Would a real tutor or a guardian say their name in THIS specific message? If not, skip it.`);
    parts.push('');
  }
  
  // === USER SETTINGS INTEGRATION ===
  if (aiSettings) {
    parts.push(`## Your communication style preferences:`);
    parts.push(buildToneGuidance(aiSettings));
    parts.push('');
  }
  
  // === STUDENT PROFILE ===
  if (aiSettings?.profileEnabled && userContext) {
    parts.push(`## What you know about ${userName || 'this student'}:`);
    parts.push(buildStudentProfile(userContext));
    parts.push('');
  }
  
  // === CORE TEACHING PRINCIPLES ===
  parts.push(`## Teaching approach:`);
  parts.push(`- Start where the student is, not where you think they should be`);
  parts.push(`- Break complex topics into digestible pieces`);
  parts.push(`- Use real-world examples and analogies`);
  parts.push(`- Encourage critical thinking - don't just give answers`);
  parts.push(`- Check for understanding before moving forward`);
  parts.push('');
  
  return parts.join('\n');
}

/**
 * Build tone and style guidance based on user settings
 */
function buildToneGuidance(settings: AISettings): string {
  const parts: string[] = [];
  
  // === BASE TONE ===
  const toneGuides: Record<string, string> = {
    formal: `📚 **Professional educator style**
- Use proper grammar and academic vocabulary
- Structure responses clearly with logical flow
- Maintain professional distance while being helpful
- Example: "Let's examine this concept systematically..."`,
    
    friendly: `😊 **Warm and approachable**
- Talk like a supportive friend who happens to know the subject well
- Use conversational language and contractions
- Be encouraging and relatable
- Example: "Hey! Great question - let's break this down together."`,
    
    casual: `🤙 **Relaxed and informal**
- Keep it super chill and easy-going
- Use everyday language, avoid jargon when possible
- Make learning feel effortless
- Example: "Okay so basically, think of it like this..."`,
    
    professional: `💼 **Clear and efficient**
- Direct, precise, no-nonsense communication
- Focus on clarity and actionable insights
- Respect the student's time
- Example: "Here's what you need to know..."`,
    
    encouraging: `✨ **Motivating and supportive**
- Celebrate every step forward
- Frame challenges as opportunities
- Build confidence with every interaction
- Example: "You're doing great! Let's tackle this next part..."`,
  };
  
  const baseTone = toneGuides[settings.baseTone] || toneGuides['friendly'];
  parts.push(baseTone!);
  parts.push('');
  
  // === WARMTH SCALE (0-10) ===
  if (settings.warmth >= 8) {
    parts.push(`❤️ **High warmth**: Show genuine care and empathy. Use phrases like "I understand how tricky this can be" or "That's a really thoughtful question!"`);
  } else if (settings.warmth >= 5) {
    parts.push(`🙂 **Balanced warmth**: Be friendly but focused. Show interest without being overly emotional.`);
  } else if (settings.warmth <= 3) {
    parts.push(`📊 **Low warmth**: Stick to facts and direct answers. Be polite but concise. Focus on information delivery.`);
  }
  parts.push('');
  
  // === ENTHUSIASM SCALE (0-10) ===
  if (settings.enthusiasm >= 8) {
    parts.push(`🎉 **High enthusiasm**: Get excited about topics! Use energetic language: "This is so cool!" "Wait till you see this!" "Isn't that amazing?"`);
  } else if (settings.enthusiasm >= 5) {
    parts.push(`👍 **Moderate enthusiasm**: Show interest and positivity without going overboard. A steady, upbeat tone.`);
  } else if (settings.enthusiasm <= 3) {
    parts.push(`😐 **Low enthusiasm**: Keep it calm and measured. Neutral tone. Focus on steady, clear explanations.`);
  }
  parts.push('');
  
  // === EMOJI USAGE ===
  const emojiGuides: Record<string, string> = {
    frequent: `🌟 Use emojis naturally to add personality (2-4 per response). Examples: 🎯 for goals, 💡 for insights, ✅ for correct answers, 🤔 for thinking points.`,
    occasional: `👌 Use 1-2 emojis per response when they add value. Don't force it - only when it feels natural.`,
    moderate: `🙂 Use 1-2 emojis per response when appropriate. Balance professionalism with personality.`,
    none: `📝 No emojis. Stick to text-only communication.`,
  };
  parts.push(emojiGuides[settings.emojiUsage] || emojiGuides['occasional']!);
  parts.push('');
  
  // === RESPONSE LENGTH ===
  const lengthGuides: Record<string, string> = {
    concise: `⚡ **Keep it brief**: 2-4 sentences typically. Get to the point quickly. Only expand if absolutely necessary.`,
    balanced: `📝 **Balanced responses**: Thorough but focused. Usually 1-2 paragraphs. Explain fully without over-explaining.`,
    detailed: `📚 **Comprehensive explanations**: Go deep. Provide examples, analogies, and multiple perspectives. 3-5 paragraphs when needed.`,
  };
  parts.push(lengthGuides[settings.responseLength] || lengthGuides['balanced']!);
  parts.push('');
  
  // === FORMATTING ===
  if (settings.useHeaders) {
    parts.push(`📑 **Formatting**: Use markdown headers (##, ###), bullet points, and numbered lists to organize longer responses. Make it scannable.`);
  } else {
    parts.push(`📄 **Formatting**: Use simple paragraphs. Avoid excessive structure - keep it flowing and conversational.`);
  }
  parts.push('');
  
  // === CUSTOM INSTRUCTIONS ===
  if (settings.customInstructions) {
    parts.push(`## Additional preferences:`);
    parts.push(settings.customInstructions);
    parts.push('');
  }
  
  return parts.join('\n');
}

/**
 * Build student profile context
 */
function buildStudentProfile(context: UserContext): string {
  const parts: string[] = [];
  
  if (context.learningGoals) {
    parts.push(`🎯 **Goals**: ${context.learningGoals}`);
  }
  
  if (context.strongSubjects && context.strongSubjects.length > 0) {
    parts.push(`💪 **Confident in**: ${context.strongSubjects.join(', ')}`);
  }
  
  if (context.weakSubjects && context.weakSubjects.length > 0) {
    parts.push(`📖 **Working on**: ${context.weakSubjects.join(', ')}`);
    parts.push(`  → Be extra patient and thorough with these topics`);
  }
  
  if (context.preferredExamples) {
    parts.push(`💡 **Learns best through**: ${context.preferredExamples}`);
    parts.push(`  → Use these types of examples when explaining`);
  }
  
  if (context.interests) {
    parts.push(`❤️ **Interests**: ${context.interests}`);
    parts.push(`  → Connect topics to these interests when possible`);
  }
  
  return parts.join('\n');
}

/**
 * CHAT PROMPT - For conversational AI interactions
 */
export function buildChatPrompt(config: PromptConfig & {
  userMessage: string;
  relevantContext?: string[];
  memoryFacts?: string[];
}): string {
  const parts: string[] = [];
  
  // System prompt
  parts.push(buildBaseSystemPrompt(config));
  
  // === CONTEXT FROM PAST INTERACTIONS ===
  if (config.memoryFacts && config.memoryFacts.length > 0) {
    parts.push(`## Things you remember about this student:`);
    config.memoryFacts.forEach(fact => parts.push(`- ${fact}`));
    parts.push('');
  }
  
  // === RELEVANT CONTEXT (RAG) ===
  if (config.relevantContext && config.relevantContext.length > 0) {
    parts.push(`## Relevant learning materials:`);
    parts.push(`Use this as reference when answering, but speak naturally - don't just copy-paste from it:`);
    config.relevantContext.forEach((ctx, idx) => {
      parts.push(`\n**Source ${idx + 1}:**`);
      parts.push(ctx);
    });
    parts.push('');
  }
  
  // === CONVERSATION HISTORY ===
  if (config.conversationHistory && config.conversationHistory.length > 0) {
    parts.push(`## Recent conversation:`);
    config.conversationHistory.slice(-6).forEach(msg => {
      const label = msg.role === 'user' ? (config.userName || 'Student') : 'You';
      parts.push(`**${label}**: ${msg.content}`);
    });
    parts.push('');
  }
  
  // === CURRENT QUESTION ===
  parts.push(`---`);
  parts.push(`## Student's current question:`);
  parts.push(config.userMessage);
  parts.push('');
  parts.push(`## Your response:`);
  parts.push(`Remember: Be helpful, be human, be yourself. Think about what would actually help this student right now.`);
  
  return parts.join('\n');
}

/**
 * STUDY PLAN GENERATION PROMPT
 */
export function buildStudyPlanPrompt(config: PromptConfig & {
  subject: string;
  goal: string;
  existingKnowledge?: string;
  timeAvailable?: string;
  preferredPace?: 'slow' | 'moderate' | 'fast';
}): string {
  const { subject, goal, existingKnowledge, timeAvailable, preferredPace, aiSettings, userName, userContext } = config;
  
  const parts: string[] = [];
  
  // === ROLE & CONTEXT ===
  parts.push(`# Study Plan Designer Role 📚`);
  parts.push(`You're creating a personalized learning roadmap for ${userName || 'a student'}.`);
  parts.push(`This isn't a generic template - it's tailored to their specific situation.`);
  parts.push('');
  
  // === STUDENT CONTEXT ===
  parts.push(`## Student Profile:`);
  parts.push(`**Subject**: ${subject}`);
  parts.push(`**Learning Goal**: ${goal}`);
  
  if (existingKnowledge) {
    parts.push(`**Current Knowledge Level**: ${existingKnowledge}`);
  }
  
  if (timeAvailable) {
    parts.push(`**Time Available**: ${timeAvailable}`);
  }
  
  if (preferredPace) {
    const paceDesc: Record<string, string> = {
      slow: 'Steady pace - more time for practice and review',
      moderate: 'Balanced pace - theory + practice',
      fast: 'Intensive pace - rapid progression'
    };
    parts.push(`**Preferred Pace**: ${paceDesc[preferredPace]}`);
  }
  
  if (aiSettings?.profileEnabled && userContext) {
    parts.push('');
    parts.push(`**Additional Context**:`);
    if (userContext.learningGoals) {
      parts.push(`- Overall goals: ${userContext.learningGoals}`);
    }
    if (userContext.strongSubjects && userContext.strongSubjects.length > 0) {
      parts.push(`- Strong areas: ${userContext.strongSubjects.join(', ')}`);
    }
    if (userContext.weakSubjects && userContext.weakSubjects.length > 0) {
      parts.push(`- Needs support in: ${userContext.weakSubjects.join(', ')}`);
    }
    if (userContext.preferredExamples) {
      parts.push(`- Learns best through: ${userContext.preferredExamples}`);
    }
  }
  parts.push('');
  
  // === TONE GUIDANCE ===
  const tone = getToneForPlanning(aiSettings);
  parts.push(`## Communication Style:`);
  parts.push(tone);
  parts.push('');
  
  // === OUTPUT FORMAT ===
  parts.push(`## CRITICAL - Output Format:`);
  parts.push(`Return ONLY valid JSON (no markdown, no code blocks, no explanations).`);
  parts.push('');
  parts.push(`{`);
  parts.push(`  "overview": "2-3 sentence summary in ${tone.includes('friendly') ? 'a warm tone' : 'a professional tone'}",`);
  parts.push(`  "estimatedWeeks": 8,`);
  parts.push(`  "targetAudience": "beginner",`);
  parts.push(`  "phases": [`);
  parts.push(`    {`);
  parts.push(`      "name": "Foundation",`);
  parts.push(`      "description": "Build the basics",`);
  parts.push(`      "duration": "2-3 weeks",`);
  parts.push(`      "modules": [`);
  parts.push(`        {`);
  parts.push(`          "title": "Getting Started with ${subject}",`);
  parts.push(`          "description": "What they'll learn",`);
  parts.push(`          "topics": ["Concept 1", "Concept 2", "Practice"],`);
  parts.push(`          "estimatedHours": 8,`);
  parts.push(`          "practiceProject": "A specific project"`);
  parts.push(`        }`);
  parts.push(`      ]`);
  parts.push(`    }`);
  parts.push(`  ],`);
  parts.push(`  "milestones": [{ "week": 2, "achievement": "Specific skill" }],`);
  parts.push(`  "resources": [{ "type": "book", "title": "Book", "why": "Why it helps" }],`);
  parts.push(`  "tips": ["Practical tip for staying motivated"]`);
  parts.push(`}`);
  
  return parts.join('\n');
}

/**
 * QUESTION GENERATION PROMPT
 */
export function buildQuestionPrompt(config: {
  subject: string;
  className: string;
  board: string;
  unitTitle: string;
  topicName: string;
  questionType: 'mcq' | 'short-answer' | 'essay' | 'true-false';
  difficulty: 'easy' | 'medium' | 'hard';
  contextContent?: string;
  attemptNumber?: number;
  aiSettings?: AISettings | null;
}): string {
  const { subject, className, board, unitTitle, topicName, questionType, difficulty, contextContent, attemptNumber = 1 } = config;
  
  const parts: string[] = [];
  
  parts.push(`# Question Creator 📝`);
  parts.push(`Create ${difficulty} difficulty ${questionType} question for:`);
  parts.push(`- **Subject**: ${subject}`);
  parts.push(`- **Class**: ${className}`);
  parts.push(`- **Topic**: ${topicName}`);
  parts.push('');
  
  if (contextContent) {
    parts.push(`## Reference Material:`);
    parts.push(contextContent);
    parts.push('');
  }
  
  if (attemptNumber > 1) {
    parts.push(`## IMPORTANT - Attempt #${attemptNumber}:`);
    parts.push(`Create something COMPLETELY DIFFERENT from previous attempts.`);
    parts.push('');
  }
  
  parts.push(`## Output Format (JSON only, no markdown):`);
  parts.push(`{`);
  parts.push(`  "question": "Your question",`);
  if (questionType === 'mcq') {
    parts.push(`  "options": ["A) ...", "B) ...", "C) ...", "D) ..."],`);
  }
  parts.push(`  "answer": "Correct answer",`);
  parts.push(`  "explanation": "Why this is correct"`);
  parts.push(`}`);
  
  return parts.join('\n');
}

/**
 * Helper: Get tone description for planning tasks
 */
function getToneForPlanning(aiSettings?: AISettings | null): string {
  if (!aiSettings) return 'clear and professional';
  
  const tones: Record<string, string> = {
    formal: 'professional and academic',
    friendly: 'warm and encouraging',
    casual: 'relaxed and approachable',
    professional: 'clear and efficient',
    encouraging: 'motivating and supportive',
  };
  
  let tone = tones[aiSettings.baseTone] || 'friendly and professional';
  
  if (aiSettings.warmth >= 7) {
    tone += ', showing genuine care';
  }
  if (aiSettings.enthusiasm >= 7) {
    tone += ', with enthusiasm';
  }
  
  return tone;
}
