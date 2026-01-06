/**
 * Response Enhancer
 * Makes AI responses more human, engaging, and personable
 */

interface EnhancementOptions {
  addEmojis?: boolean;
  addPersonalTouch?: boolean;
  maxLength?: number;
}

export class ResponseEnhancer {
  /**
   * Enhance response with personality
   */
  enhance(response: string, options: EnhancementOptions = {}): string {
    let enhanced = response;

    // Remove robotic phrases
    enhanced = this.removeRoboticPhrases(enhanced);

    // Add conversational elements
    if (options.addPersonalTouch !== false) {
      enhanced = this.addPersonalTouch(enhanced);
    }

    // Add strategic emojis
    if (options.addEmojis !== false) {
      enhanced = this.addEmojis(enhanced);
    }

    // Add engaging hooks
    enhanced = this.addEngagingHooks(enhanced);

    return enhanced;
  }

  private removeRoboticPhrases(text: string): string {
    const replacements: Record<string, string> = {
      'As an AI language model': '',
      'As an AI assistant': '',
      'I apologize, but': 'Hmm,',
      'It is important to note that': 'Keep in mind:',
      'In conclusion': 'So,',
      'Furthermore': 'Also,',
      'Additionally': 'Plus,',
      'Moreover': 'Also,',
      'Therefore': 'So',
      'However': 'But',
      'Nevertheless': 'Still',
      'Consequently': 'So',
    };

    let result = text;
    Object.entries(replacements).forEach(([old, newPhrase]) => {
      const regex = new RegExp(old, 'gi');
      result = result.replace(regex, newPhrase);
    });

    // Remove empty lines at start
    result = result.replace(/^\n+/, '');

    return result;
  }

  private addPersonalTouch(text: string): string {
    // Add occasional personal touches
    const openings = [
      'Great question! ',
      'Good thinking! ',
      'Interesting question! ',
      'Let me help you with that! ',
    ];

    const closings = [
      '\n\nDoes this make sense?',
      '\n\nWant me to explain anything in more detail?',
      '\n\nNeed me to clarify anything?',
      '\n\nHope this helps!',
    ];

    // Add opening (20% chance)
    if (Math.random() < 0.2 && !text.match(/^(Great|Good|Interesting|Let me)/i)) {
      const opening = openings[Math.floor(Math.random() * openings.length)];
      text = opening + text;
    }

    // Add closing for longer responses (30% chance)
    if (text.length > 300 && Math.random() < 0.3) {
      const closing = closings[Math.floor(Math.random() * closings.length)];
      if (!text.match(/\?$/)) {
        text = text + closing;
      }
    }

    // Replace formal phrases
    text = text.replace(/Let me explain/gi, 'Let me help you understand');
    text = text.replace(/I will provide/gi, "I'll give you");
    text = text.replace(/I shall/gi, "I'll");

    return text;
  }

  private addEmojis(text: string): string {
    // Add contextual emojis (sparingly to avoid spam)
    const emojiMappings = [
      { pattern: /\b(important|crucial|key point)\b/i, emoji: '💡', maxUses: 2 },
      { pattern: /\b(example|for instance)\b/i, emoji: '📝', maxUses: 1 },
      { pattern: /\b(learn|study|education)\b/i, emoji: '📚', maxUses: 1 },
      { pattern: /\b(success|correct|excellent|great)\b/i, emoji: '✨', maxUses: 1 },
      { pattern: /\b(caution|warning|careful|note)\b/i, emoji: '⚠️', maxUses: 1 },
      { pattern: /\b(tip|hint|pro tip)\b/i, emoji: '💡', maxUses: 1 },
      { pattern: /\b(summary|tldr|in short)\b/i, emoji: '📌', maxUses: 1 },
      { pattern: /\b(question|ask)\b/i, emoji: '❓', maxUses: 1 },
    ];

    let result = text;
    let used = new Map<string, number>();

    emojiMappings.forEach(({ pattern, emoji, maxUses }) => {
      let count = 0;
      result = result.replace(pattern, (match) => {
        const currentUse = used.get(emoji) || 0;
        if (count < maxUses && currentUse < maxUses) {
          count++;
          used.set(emoji, currentUse + 1);
          return `${match} ${emoji}`;
        }
        return match;
      });
    });

    return result;
  }

  private addEngagingHooks(text: string): string {
    // Add engaging elements based on content length
    if (text.length > 500) {
      const paragraphs = text.split('\n\n');
      
      if (paragraphs.length > 3) {
        // Add friendly section break in middle
        const midPoint = Math.floor(paragraphs.length / 2);
        
        // Check if this paragraph is substantial
        if (paragraphs[midPoint] && paragraphs[midPoint]!.length > 100) {
          paragraphs[midPoint] = `**Here's the key part:**\n\n${paragraphs[midPoint]}`;
        }
        
        return paragraphs.join('\n\n');
      }
    }

    // For technical content, add TLDR
    if (text.length > 800 && text.includes('definition') || text.includes('formula')) {
      const sentences = text.split('. ');
      const tldr = sentences[0] + '.';
      return `**Quick answer:** ${tldr}\n\n**Detailed explanation:**\n${text}`;
    }

    return text;
  }

  /**
   * Check if response needs enhancement
   */
  shouldEnhance(text: string): boolean {
    // Don't enhance if already personable
    const personalMarkers = [
      /Great question/i,
      /Let me help/i,
      /[!?]/,
      /😊|💡|📚|✨/,
    ];

    return !personalMarkers.some(marker => marker.test(text));
  }
}

export const responseEnhancer = new ResponseEnhancer();
