/**
 * Assessment Grading Engine
 * All grading algorithms in one file
 */

import type { GradingResult, MetricBreakdown } from './assessment.types';


const STOP_WORDS = new Set([
    'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'for', 'from',
    'has', 'he', 'in', 'is', 'it', 'its', 'of', 'on', 'that', 'the',
    'to', 'was', 'will', 'with', 'this', 'but', 'they', 'have', 'had'
]);

function tokenize(text: string): string[] {
    return text.toLowerCase().replace(/[^\w\s]/g, ' ').split(/\s+/).filter(w => w.length > 0);
}

function stem(word: string): string {
    word = word.toLowerCase();
    const suffixes = ['ing', 'ed', 'es', 's', 'ly', 'ment', 'ness', 'tion', 'ation'];
    for (const suffix of suffixes) {
        if (word.endsWith(suffix) && word.length > suffix.length + 2) {
            return word.slice(0, -suffix.length);
        }
    }
    return word;
}

function removeStopWords(tokens: string[]): string[] {
    return tokens.filter(t => !STOP_WORDS.has(t) && t.length > 2);
}


/**
 * TF-IDF Calculation
 */
function calculateTFIDF(text: string, corpus: string[]): Map<string, number> {
    const tokens = tokenize(text);
    const termFreq = new Map<string, number>();
    tokens.forEach(t => termFreq.set(t, (termFreq.get(t) || 0) + 1));

    const tfidf = new Map<string, number>();
    termFreq.forEach((freq, term) => {
        const tf = freq / tokens.length;
        const docsWithTerm = corpus.filter(doc => doc.toLowerCase().includes(term)).length;
        const idf = Math.log((corpus.length + 1) / (docsWithTerm + 1));
        tfidf.set(term, tf * idf);
    });

    return tfidf;
}

/**
 * Cosine Similarity
 */
function cosineSimilarity(text1: string, text2: string): number {
    const corpus = [text1, text2];
    const vec1 = calculateTFIDF(text1, corpus);
    const vec2 = calculateTFIDF(text2, corpus);

    const allTerms = new Set([...vec1.keys(), ...vec2.keys()]);
    let dotProduct = 0, mag1 = 0, mag2 = 0;

    allTerms.forEach(term => {
        const v1 = vec1.get(term) || 0;
        const v2 = vec2.get(term) || 0;
        dotProduct += v1 * v2;
        mag1 += v1 * v1;
        mag2 += v2 * v2;
    });

    const magnitude1 = Math.sqrt(mag1);
    const magnitude2 = Math.sqrt(mag2);
    return (magnitude1 === 0 || magnitude2 === 0) ? 0 : dotProduct / (magnitude1 * magnitude2);
}

/**
 * Jaccard Similarity
 */
function jaccardSimilarity(text1: string, text2: string): number {
    const tokens1 = new Set(removeStopWords(tokenize(text1)));
    const tokens2 = new Set(removeStopWords(tokenize(text2)));
    const intersection = new Set([...tokens1].filter(x => tokens2.has(x)));
    const union = new Set([...tokens1, ...tokens2]);
    return union.size === 0 ? 0 : intersection.size / union.size;
}

/**
 * Levenshtein Distance
 */
function levenshteinDistance(s1: string, s2: string): number {
    const m = s1.length, n = s2.length;
    const dp: number[][] = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));

    for (let i = 0; i <= m; i++) { const row = dp[i]; if (row) row[0] = i; }
    for (let j = 0; j <= n; j++) { const row = dp[0]; if (row) row[j] = j; }

    for (let i = 1; i <= m; i++) {
        for (let j = 1; j <= n; j++) {
            const currRow = dp[i], prevRow = dp[i - 1];
            if (!currRow || !prevRow) continue;
            currRow[j] = s1[i - 1] === s2[j - 1]
                ? (prevRow[j - 1] ?? 0)
                : 1 + Math.min(prevRow[j] ?? 0, currRow[j - 1] ?? 0, prevRow[j - 1] ?? 0);
        }
    }

    return dp[m]?.[n] ?? 0;
}

function normalizedLevenshtein(text1: string, text2: string): number {
    const s1 = text1.toLowerCase().trim(), s2 = text2.toLowerCase().trim();
    if (s1 === s2) return 1.0;
    if (!s1.length || !s2.length) return 0;
    const distance = levenshteinDistance(s1, s2);
    return 1 - (distance / Math.max(s1.length, s2.length));
}

/**
 * Keyword Matching with exponential decay
 */
function keywordMatchScore(studentAnswer: string, keywords: string[]): { score: number; matched: number } {
    if (!keywords || keywords.length === 0) return { score: 0, matched: 0 };

    const answerStems = removeStopWords(tokenize(studentAnswer)).map(stem);
    let totalWeight = 0, matchedWeight = 0, matchedCount = 0;

    keywords.forEach((keyword, idx) => {
        const weight = Math.exp(-idx * 0.2);
        totalWeight += weight;
        const keywordStem = stem(keyword.toLowerCase().trim());
        if (answerStems.some(s => s === keywordStem || s.includes(keywordStem) || keywordStem.includes(s))) {
            matchedWeight += weight;
            matchedCount++;
        }
    });

    return { score: totalWeight > 0 ? matchedWeight / totalWeight : 0, matched: matchedCount };
}

/**
 * N-Gram Similarity
 */
function nGramSimilarity(text1: string, text2: string, n: number = 2): number {
    const tokens1 = tokenize(text1), tokens2 = tokenize(text2);
    if (tokens1.length < n || tokens2.length < n) return jaccardSimilarity(text1, text2);

    const ngrams1 = Array.from({ length: tokens1.length - n + 1 }, (_, i) => tokens1.slice(i, i + n).join(' '));
    const ngrams2 = Array.from({ length: tokens2.length - n + 1 }, (_, i) => tokens2.slice(i, i + n).join(' '));
    const set1 = new Set(ngrams1), set2 = new Set(ngrams2);
    const intersection = [...set1].filter(x => set2.has(x)).length;
    const union = new Set([...set1, ...set2]).size;
    return union === 0 ? 0 : intersection / union;
}


/**
 * Exact Match Grader (MCQ, True-False)
 */
export function gradeExactMatch(studentAnswer: string, question: any): GradingResult {
    const studentAns = studentAnswer.trim().toLowerCase();
    const correctAns = (question.correctAnswer || '').trim().toLowerCase();
    const isCorrect = studentAns === correctAns;

    return {
        score: isCorrect ? 1.0 : 0.0,
        maxScore: question.points || 1,
        percentage: isCorrect ? 100 : 0,
        isCorrect,
        correctnessLevel: isCorrect ? 'excellent' : 'incorrect',
        feedback: isCorrect ? 'Correct!' : `Incorrect. The correct answer is: ${question.correctAnswer}`,
        confidence: 1.0,
        gradingMethod: 'exact-match'
    };
}

/**
 * Semantic Multi-Metric Grader (Short Answer)
 */
export function gradeSemanticAnswer(studentAnswer: string, question: any): GradingResult {
    const correctAnswer = question.correctAnswer || '';
    const keywords = question.keywords?.split(',').map((k: string) => k.trim()) || [];

    // Calculate all metrics
    const cosine = cosineSimilarity(studentAnswer, correctAnswer);
    const jaccard = jaccardSimilarity(studentAnswer, correctAnswer);
    const levenshtein = normalizedLevenshtein(studentAnswer, correctAnswer);
    const keywordResult = keywordMatchScore(studentAnswer, keywords);
    const ngram = nGramSimilarity(studentAnswer, correctAnswer, 2);

    // Weighted combination
    const score = cosine * 0.35 + jaccard * 0.20 + levenshtein * 0.15 + keywordResult.score * 0.20 + ngram * 0.10;

    // Confidence (low variance = high confidence)
    const scores = [cosine, jaccard, levenshtein, keywordResult.score, ngram];
    const mean = scores.reduce((a, b) => a + b) / scores.length;
    const variance = scores.reduce((sum, s) => sum + Math.pow(s - mean, 2), 0) / scores.length;
    const stdDev = Math.sqrt(variance);
    const confidence = Math.max(0.3, Math.min(1.0, 1 - (mean > 0 ? stdDev / mean : 1)));

    // Correctness level
    const level = score >= 0.90 ? 'excellent' : score >= 0.75 ? 'good' : score >= 0.60 ? 'partial' : 'incorrect';
    const feedback =
        score >= 0.90 ? 'Excellent answer! Very close to the expected response.' :
            score >= 0.75 ? 'Good answer! Most key points covered correctly.' :
                score >= 0.60 ? 'Partially correct. Some key concepts are present but incomplete.' :
                    'Incorrect or incomplete answer. Please review the concept.';

    return {
        score: Math.max(0, Math.min(1, score)),
        maxScore: question.points || 1,
        percentage: Math.round(score * 1000) / 10,
        isCorrect: score >= 0.70,
        correctnessLevel: level,
        feedback: confidence < 0.7 ? `${feedback} (Confidence: ${Math.round(confidence * 100)}% - may need review)` : feedback,
        confidence,
        gradingMethod: 'semantic-multi-metric',
        breakdown: {
            cosine: Math.round(cosine * 100) / 100,
            jaccard: Math.round(jaccard * 100) / 100,
            levenshtein: Math.round(levenshtein * 100) / 100,
            keyword: Math.round(keywordResult.score * 100) / 100,
            ngram: Math.round(ngram * 100) / 100
        }
    };
}

/**
 * Essay Statistical Grader
 */
export function gradeEssay(studentAnswer: string, question: any): GradingResult {
    const words = tokenize(studentAnswer);
    const sentences = studentAnswer.split(/[.!?]+/).filter(s => s.trim().length > 0);
    const paragraphs = studentAnswer.split(/\n\s*\n/).filter(p => p.trim().length > 0);

    // Metrics
    const lengthScore = words.length >= 150 && words.length <= 500 ? 1.0 :
        words.length >= 100 ? 0.8 : words.length >= 50 ? 0.6 : 0.4;

    const uniqueWords = new Set(words).size;
    const vocabRichness = words.length > 0 ? uniqueWords / words.length : 0;
    const vocabScore = vocabRichness >= 0.6 && vocabRichness <= 0.8 ? 1.0 : vocabRichness >= 0.5 ? 0.8 : 0.6;

    const avgWordsPerSentence = sentences.length > 0 ? words.length / sentences.length : 0;
    const readabilityScore = avgWordsPerSentence >= 10 && avgWordsPerSentence <= 20 ? 1.0 :
        avgWordsPerSentence >= 8 ? 0.8 : 0.6;

    const contentScore = question.correctAnswer ? cosineSimilarity(studentAnswer, question.correctAnswer) : 0.5;

    const structureScore = (paragraphs.length >= 3 && paragraphs.length <= 6 ? 0.5 : 0.3) +
        (avgWordsPerSentence >= 10 && avgWordsPerSentence <= 20 ? 0.3 : 0.1) + 0.2;

    // Final score
    const finalScore = lengthScore * 0.25 + vocabScore * 0.20 + readabilityScore * 0.15 +
        contentScore * 0.25 + Math.min(1, structureScore) * 0.15;

    const level = finalScore >= 0.85 ? 'excellent' : finalScore >= 0.75 ? 'good' :
        finalScore >= 0.60 ? 'partial' : 'incorrect';

    const feedback = finalScore >= 0.85 ? 'Excellent essay! Well-structured with strong content.' :
        finalScore >= 0.75 ? 'Good essay. ' + (contentScore < 0.7 ? 'Consider adding more details. ' : '') :
            finalScore >= 0.60 ? 'Partially correct. ' + (words.length < 100 ? 'Essay is too short. ' : 'Missing key concepts. ') :
                'Needs improvement. Please review the topic and try again.';

    const scoreValues = [lengthScore, vocabScore, readabilityScore, contentScore, Math.min(1, structureScore)];
    const confidence = Math.max(0.6, Math.min(1.0, 1 - Math.sqrt(
        scoreValues.reduce((sum, s) => sum + Math.pow(s - finalScore, 2), 0) / scoreValues.length
    )));

    return {
        score: finalScore,
        maxScore: question.points || 10,
        percentage: Math.round(finalScore * 1000) / 10,
        isCorrect: finalScore >= 0.70,
        correctnessLevel: level,
        feedback,
        confidence,
        gradingMethod: 'essay-statistical',
        breakdown: {
            length: Math.round(lengthScore * 100) / 100,
            vocabulary: Math.round(vocabScore * 100) / 100,
            readability: Math.round(readabilityScore * 100) / 100,
            content: Math.round(contentScore * 100) / 100,
            structure: Math.round(Math.min(1, structureScore) * 100) / 100
        }
    };
}

/**
 * Main grading function - routes to appropriate grader
 */
export function gradeAnswer(studentAnswer: string, question: any): GradingResult {
    const questionType = question.questionType.toLowerCase();

    if (questionType === 'mcq' || questionType === 'true-false') {
        return gradeExactMatch(studentAnswer, question);
    } else if (questionType === 'essay') {
        return gradeEssay(studentAnswer, question);
    } else {
        return gradeSemanticAnswer(studentAnswer, question);
    }
}
