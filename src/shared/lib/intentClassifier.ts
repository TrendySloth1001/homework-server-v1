/**
 * Intent Classification & Model Routing Service
 * Routes queries to specialized models based on domain detection
 * Implements the ChatGPT conversation recommendations for edtech domain routing
 */

export enum QueryDomain {
  MATH = 'math',
  SCIENCE = 'science',
  CODE = 'code',
  GENERAL = 'general',
  REASONING = 'reasoning',
  CREATIVE = 'creative',
}

export interface QueryAnalysis {
  domain: QueryDomain;
  confidence: number;
  recommendedModel: string;
  requiresTools: boolean;
  tools: string[];
  reasoning: string;
}

interface DomainSignals {
  keywords: string[];
  patterns: RegExp[];
  weight: number;
}

/**
 * Intent Classifier - Detects query intent and routes to appropriate model
 */
class IntentClassifier {
  // Domain detection signals - weighted scoring
  private domainSignals: Record<QueryDomain, DomainSignals> = {
    [QueryDomain.MATH]: {
      keywords: [
        'calculate', 'solve', 'equation', 'formula', 'derivative', 'integral',
        'algebra', 'geometry', 'trigonometry', 'calculus', 'matrix', 'vector',
        'probability', 'statistics', 'theorem', 'proof', 'simplify', 'evaluate',
        'factor', 'sum', 'product', 'roots', 'polynomial', 'quadratic',
        'sin', 'cos', 'tan', 'log', 'ln', 'exp', 'sqrt', 'arithmetic progression',
      ],
      patterns: [
        /\d+[\+\-\*\/\^]\d+/,           // Math operations: 2+2, 5*3
        /∫|∑|∏|√|π|∞|≈|≠|≤|≥/,          // Math symbols
        /\b(x|y|z|a|b|c)\s*[=+\-*/]/,  // Variables with operators
        /\d+\s*(km|m|cm|kg|g|l|ml)/,   // Units (word problems)
        /\b\d+%/,                       // Percentages
      ],
      weight: 1.5, // Higher priority for math
    },
    
    [QueryDomain.SCIENCE]: {
      keywords: [
        'physics', 'chemistry', 'biology', 'experiment', 'hypothesis',
        'molecule', 'atom', 'cell', 'DNA', 'electron', 'proton', 'neutron',
        'velocity', 'acceleration', 'force', 'energy', 'mass', 'density',
        'chemical', 'reaction', 'compound', 'element', 'periodic', 'photosynthesis',
        'mitosis', 'meiosis', 'ecosystem', 'evolution', 'genetics', 'enzyme',
      ],
      patterns: [
        /H₂O|CO₂|O₂|N₂|NaCl/,          // Chemical formulas
        /\b[A-Z][a-z]?\d+\b/,           // Chemical notation
        /\d+\s*m\/s²?|N\b|J\b|W\b/,    // Physics units
      ],
      weight: 1.3,
    },
    
    [QueryDomain.CODE]: {
      keywords: [
        'code', 'function', 'algorithm', 'programming', 'debug', 'error',
        'javascript', 'python', 'typescript', 'java', 'react', 'node',
        'API', 'database', 'SQL', 'loop', 'array', 'object', 'class',
        'variable', 'method', 'syntax', 'compile', 'runtime', 'async',
      ],
      patterns: [
        /```[\s\S]*?```/,               // Code blocks
        /function\s+\w+\s*\(/,          // Function declarations
        /const|let|var|def|class/,     // Programming keywords
        /import|export|require/,        // Module keywords
        /\w+\.\w+\(/,                   // Method calls
      ],
      weight: 1.4,
    },
    
    [QueryDomain.REASONING]: {
      keywords: [
        'why', 'how', 'explain', 'reason', 'logic', 'deduce', 'infer',
        'analyze', 'compare', 'contrast', 'evaluate', 'justify', 'prove',
        'demonstrate', 'show', 'derive', 'conclusion', 'premise', 'argument',
      ],
      patterns: [
        /^(why|how|what makes|what causes)/i,
        /\bif\s+.+\s+then\b/i,         // Logical conditionals
      ],
      weight: 1.2,
    },
    
    [QueryDomain.CREATIVE]: {
      keywords: [
        'write', 'story', 'poem', 'essay', 'creative', 'imagine', 'describe',
        'narrative', 'character', 'plot', 'theme', 'metaphor', 'analogy',
        'brainstorm', 'idea', 'design', 'create',
      ],
      patterns: [
        /write.*story|poem|essay/i,
        /imagine|pretend|suppose/i,
      ],
      weight: 1.0,
    },
    
    [QueryDomain.GENERAL]: {
      keywords: ['what', 'who', 'when', 'where', 'tell', 'define', 'meaning'],
      patterns: [],
      weight: 0.8, // Lowest priority
    },
  };

  /**
   * Analyze query and determine domain + recommended model
   */
  classify(query: string): QueryAnalysis {
    const scores = this.calculateDomainScores(query);
    
    // Get highest scoring domain
    const [domain, score] = Object.entries(scores).reduce((max, curr) => 
      curr[1] > max[1] ? curr : max
    );

    const confidence = this.normalizeConfidence(score);
    const recommendedModel = this.selectModelForDomain(domain as QueryDomain, confidence);
    const { requiresTools, tools } = this.detectRequiredTools(domain as QueryDomain, query);

    return {
      domain: domain as QueryDomain,
      confidence,
      recommendedModel,
      requiresTools,
      tools,
      reasoning: this.generateReasoning(domain as QueryDomain, score, query),
    };
  }

  /**
   * Calculate weighted scores for each domain
   */
  private calculateDomainScores(query: string): Record<QueryDomain, number> {
    const lowerQuery = query.toLowerCase();
    const scores: Record<QueryDomain, number> = {} as any;

    for (const [domain, signals] of Object.entries(this.domainSignals)) {
      let score = 0;

      // Keyword matching
      const keywordMatches = signals.keywords.filter(kw => 
        lowerQuery.includes(kw.toLowerCase())
      ).length;
      score += keywordMatches * signals.weight;

      // Pattern matching (higher weight)
      const patternMatches = signals.patterns.filter(pattern => 
        pattern.test(query)
      ).length;
      score += patternMatches * signals.weight * 2;

      scores[domain as QueryDomain] = score;
    }

    return scores;
  }

  /**
   * Normalize confidence score to 0-1 range
   */
  private normalizeConfidence(rawScore: number): number {
    // Use sigmoid-like normalization
    return Math.min(1.0, rawScore / (rawScore + 5));
  }

  /**
   * Select appropriate model based on domain and confidence
   */
  private selectModelForDomain(domain: QueryDomain, confidence: number): string {
    // High-confidence specialized routing
    if (confidence > 0.7) {
      switch (domain) {
        case QueryDomain.MATH:
          return process.env.OLLAMA_MATH_MODEL || 'qwen2.5-math:7b';
        case QueryDomain.CODE:
          return process.env.OLLAMA_CODE_MODEL || 'qwen2.5-coder:7b';
        case QueryDomain.SCIENCE:
          return process.env.OLLAMA_SCIENCE_MODEL || 'qwen2.5:14b';
        case QueryDomain.REASONING:
          return process.env.OLLAMA_REASONING_MODEL || 'qwen2.5:14b';
      }
    }

    // Default to general model
    return process.env.OLLAMA_MODEL || 'qwen2.5:7b';
  }

  /**
   * Detect if query requires external tools (calculators, APIs, etc.)
   */
  private detectRequiredTools(domain: QueryDomain, query: string): { requiresTools: boolean; tools: string[] } {
    const tools: string[] = [];

    if (domain === QueryDomain.MATH) {
      // Check if it needs symbolic computation
      if (/integrate|differentiate|solve|simplify/.test(query.toLowerCase())) {
        tools.push('sympy');
      }
      // Check if it needs numerical calculation
      if (/\d+[\+\-\*\/]\d+/.test(query)) {
        tools.push('calculator');
      }
    }

    if (domain === QueryDomain.SCIENCE) {
      // Check if it needs chemical equation balancing
      if (/balance.*equation|chemical.*reaction/.test(query.toLowerCase())) {
        tools.push('chemistry-engine');
      }
    }

    if (domain === QueryDomain.CODE) {
      // Check if it needs code execution
      if (/run|execute|test|output/.test(query.toLowerCase())) {
        tools.push('code-executor');
      }
    }

    return {
      requiresTools: tools.length > 0,
      tools,
    };
  }

  /**
   * Generate human-readable reasoning for the classification
   */
  private generateReasoning(domain: QueryDomain, score: number, query: string): string {
    const signals = this.domainSignals[domain];
    const matchedKeywords = signals.keywords.filter(kw => 
      query.toLowerCase().includes(kw.toLowerCase())
    );

    if (matchedKeywords.length === 0) {
      return `Classified as ${domain} based on query structure and context.`;
    }

    return `Detected ${domain} domain (confidence: ${(score / (score + 5) * 100).toFixed(0)}%) - matched keywords: ${matchedKeywords.slice(0, 3).join(', ')}`;
  }

  /**
   * Get available specialized models from Ollama
   */
  async getAvailableModels(): Promise<string[]> {
    try {
      // This will be called by the service to check which models are actually installed
      // For now, return expected models
      return [
        'qwen2.5:7b',
        'qwen2.5:14b',
        'qwen2.5-math:7b',
        'qwen2.5-coder:7b',
        'deepseek-math:7b',
        'codellama:7b',
      ];
    } catch (error) {
      console.error('[IntentClassifier] Failed to fetch models:', error);
      return [];
    }
  }
}

export const intentClassifier = new IntentClassifier();
