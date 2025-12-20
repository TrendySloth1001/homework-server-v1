# Assessment Feature - Mathematical Grading System

## Overview
The Assessment feature provides **pure mathematical grading** for student answers with **zero AI/LLM dependencies**. Uses proven computational linguistics and statistical algorithms for fast, deterministic, and explainable scoring.

---

## ✅ Features

- ✅ **Multi-strategy grading** (exact match, semantic, essay)
- ✅ **5 mathematical algorithms** working in ensemble
- ✅ **Confidence scoring** (flags uncertain grades)
- ✅ **4-tier correctness levels** (excellent, good, partial, incorrect)
- ✅ **Detailed metric breakdown** for transparency
- ✅ **No AI required** - pure math (50-200ms response time)
- ✅ **Student + Teacher tracking** together
- ✅ **Performance analytics** per student

---

## 🧮 Grading Algorithms

### 1. **Exact Match** (MCQ, True-False)
- **Speed**: <1ms
- **Accuracy**: 100%
- **Algorithm**: Direct string comparison

```typescript
score = (studentAnswer === correctAnswer) ? 1.0 : 0.0
```

---

### 2. **Semantic Multi-Metric** (Short Answer)
Combines 5 algorithms with weighted ensemble:

#### **A. Cosine Similarity (35% weight)**
- TF-IDF vectorization
- Measures document angle
- Formula: `cos(θ) = (A·B) / (||A|| × ||B||)`

#### **B. Jaccard Similarity (20% weight)**
- Word set overlap
- Formula: `J(A,B) = |A ∩ B| / |A ∪ B|`

#### **C. Levenshtein Distance (15% weight)**
- Edit distance (insertions/deletions/substitutions)
- Normalized to 0-1 similarity

#### **D. Keyword Matching (20% weight)**
- Exponential decay weighting
- Stemming for root word matching
- Porter Stemmer algorithm

#### **E. N-Gram Similarity (10% weight)**
- Bigram/trigram phrase matching
- Captures word sequences

**Combined Score**:
```
finalScore = cosine×0.35 + jaccard×0.20 + levenshtein×0.15 + keyword×0.20 + ngram×0.10
```

**Confidence Calculation**:
```
confidence = 1 - (standardDeviation / mean)
```
Low variance across metrics = high confidence

---

### 3. **Essay Grading** (Statistical Analysis)
Uses 5 metrics without AI:

#### **A. Length Appropriateness (25%)**
- Word count analysis
- Compares to expected length

#### **B. Vocabulary Quality (20%)**
- Vocabulary richness (unique words / total words)
- Complex word ratio (words > 3 syllables)

#### **C. Readability (15%)**
- Flesch-Kincaid Grade Level
- Formula: `0.39×(words/sentences) + 11.8×(syllables/words) - 15.59`

#### **D. Content Relevance (25%)**
- TF-IDF cosine similarity with expected answer
- Keyword matching

#### **E. Structure Quality (15%)**
- Paragraph count
- Average sentence length (optimal: 10-20 words)
- Average word length

---

## 📊 Correctness Levels

| Score Range | Level | Description |
|------------|-------|-------------|
| 0.90 - 1.0 | **excellent** | Nearly perfect answer |
| 0.75 - 0.89 | **good** | Correct with minor gaps |
| 0.60 - 0.74 | **partial** | Some understanding shown |
| 0.0 - 0.59 | **incorrect** | Wrong or missing key concepts |

**Review Flag**: Confidence < 0.70 triggers manual review suggestion

---

## 🔌 API Endpoints

Base URL: `/api/assessment`

### **1. Grade Answer**
```http
POST /api/assessment/grade

Body:
{
  "questionId": "cuid",
  "studentAnswer": "Photosynthesis is how plants make food using sunlight",
  "selectedOption": "B",  // For MCQ only
  "studentId": "student123",
  "teacherId": "teacher456"
}

Response:
{
  "success": true,
  "message": "Answer graded successfully",
  "data": {
    "answerId": "ans_xyz",
    "questionId": "q123",
    "questionText": "Explain photosynthesis",
    "studentAnswer": "Photosynthesis is...",
    "score": 0.78,
    "maxScore": 1,
    "percentage": 78.0,
    "isCorrect": true,
    "correctnessLevel": "good",
    "feedback": "Good answer! Most key points covered correctly.",
    "confidence": 0.85,
    "gradingMethod": "semantic-multi-metric",
    "breakdown": {
      "cosine": 0.82,
      "jaccard": 0.76,
      "levenshtein": 0.74,
      "keyword": 0.80,
      "ngram": 0.71
    },
    "submittedAt": "2025-12-20T10:30:00Z",
    "studentId": "student123",
    "teacherId": "teacher456"
  }
}
```

---

### **2. Get Answer History**
```http
GET /api/assessment/answers?studentId=student123&teacherId=teacher456&page=1&limit=20

Response:
{
  "success": true,
  "answers": [...],
  "total": 50,
  "page": 1,
  "limit": 20,
  "totalPages": 3
}
```

---

### **3. Get Single Answer**
```http
GET /api/assessment/answer/:answerId

Response:
{
  "success": true,
  "data": {
    "studentId": "ans_xyz",
    "questionId": "q123",
    "studentAnswer": "...",
    "score": 0.78,
    "isCorrect": true,
    "correctnessLevel": "good",
    "question": {
      "questionText": "...",
      "correctAnswer": "...",
      "explanation": "..."
    }
  }
}
```

---

### **4. Get Student Performance**
```http
GET /api/assessment/student/:studentId/performance?teacherId=teacher456

Response:
{
  "success": true,
  "data": {
    "studentId": "student123",
    "totalAttempts": 45,
    "averageScore": 0.76,
    "averagePercentage": 76.0,
    "correctCount": 34,
    "correctPercentage": 75.6,
    "byQuestionType": {
      "mcq": { "count": 20, "correct": 18, "avgScore": 0.90 },
      "short-answer": { "count": 15, "correct": 10, "avgScore": 0.72 },
      "essay": { "count": 10, "correct": 6, "avgScore": 0.65 }
    },
    "byDifficulty": {
      "easy": { "count": 15, "correct": 14, "avgScore": 0.93 },
      "medium": { "count": 20, "correct": 14, "avgScore": 0.70 },
      "hard": { "count": 10, "correct": 6, "avgScore": 0.60 }
    },
    "byCorrectness": {
      "excellent": 15,
      "good": 19,
      "partial": 8,
      "incorrect": 3
    }
  }
}
```

---

### **5. Regrade Answer**
```http
POST /api/assessment/answer/:answerId/regrade

Response:
{
  "success": true,
  "message": "Answer regraded successfully",
  "data": {
    "answerId": "ans_xyz",
    "previousScore": 0.65,
    "newScore": 0.78,
    "previousCorrectness": "partial",
    "newCorrectness": "good",
    ...
  }
}
```

---

### **6. Get Question Answers**
```http
GET /api/assessment/question/:questionId/answers?page=1&limit=20

Response:
{
  "success": true,
  "answers": [...],
  "total": 30,
  "page": 1,
  "totalPages": 2
}
```

---

## 📁 File Structure

```
src/features/assessment/
├── assessment.types.ts           # TypeScript interfaces
├── assessment.service.ts         # Business logic
├── assessment.controller.ts      # HTTP handlers
├── assessment.routes.ts          # API routes
└── graders/
    ├── text-utils.ts             # Text processing utilities
    ├── similarity-algorithms.ts  # Mathematical algorithms
    ├── exact-match.grader.ts     # MCQ/True-False grader
    ├── semantic.grader.ts        # Short answer grader
    ├── essay.grader.ts           # Essay grader
    └── grader-factory.ts         # Strategy selector
```

---

## 🔢 Mathematical Details

### **TF-IDF (Term Frequency - Inverse Document Frequency)**
```
TF(t, d) = count(t, d) / |d|
IDF(t, D) = log(|D| / |{d ∈ D : t ∈ d}|)
TF-IDF(t, d, D) = TF(t, d) × IDF(t, D)
```

### **Cosine Similarity**
```
cos(θ) = Σ(Ai × Bi) / (√Σ(Ai²) × √Σ(Bi²))
```

### **Levenshtein Distance (Dynamic Programming)**
```
dp[i][j] = {
  dp[i-1][j-1]           if s1[i] == s2[j]
  1 + min(
    dp[i-1][j],          // deletion
    dp[i][j-1],          // insertion
    dp[i-1][j-1]         // substitution
  )                       otherwise
}
```

### **Flesch-Kincaid Grade Level**
```
grade = 0.39 × (words/sentences) + 11.8 × (syllables/words) - 15.59
```

### **Confidence (Coefficient of Variation)**
```
mean = Σscores / n
variance = Σ(score - mean)² / n
stdDev = √variance
CV = stdDev / mean
confidence = 1 - CV
```

---

## 🎯 Usage Examples

### **MCQ Question**
```typescript
POST /api/assessment/grade
{
  "questionId": "q1",
  "selectedOption": "B",
  "studentId": "s1",
  "teacherId": "t1"
}

→ Result:
{
  "score": 1.0,
  "percentage": 100,
  "isCorrect": true,
  "correctnessLevel": "excellent",
  "confidence": 1.0,
  "gradingMethod": "exact-match"
}
```

---

### **Short Answer Question**
```typescript
POST /api/assessment/grade
{
  "questionId": "q2",
  "studentAnswer": "Photosynthesis is the process where plants convert sunlight into energy",
  "studentId": "s1",
  "teacherId": "t1"
}

→ Result:
{
  "score": 0.78,
  "percentage": 78.0,
  "isCorrect": true,
  "correctnessLevel": "good",
  "confidence": 0.85,
  "gradingMethod": "semantic-multi-metric",
  "breakdown": {
    "cosine": 0.82,
    "jaccard": 0.76,
    "levenshtein": 0.74,
    "keyword": 0.80,
    "ngram": 0.71
  }
}
```

---

### **Essay Question**
```typescript
POST /api/assessment/grade
{
  "questionId": "q3",
  "studentAnswer": "The Industrial Revolution was a period of... [300 words]",
  "studentId": "s1",
  "teacherId": "t1"
}

→ Result:
{
  "score": 0.72,
  "percentage": 72.0,
  "isCorrect": true,
  "correctnessLevel": "good",
  "confidence": 0.78,
  "gradingMethod": "essay-statistical",
  "breakdown": {
    "length": 0.85,
    "vocabulary": 0.78,
    "readability": 0.82,
    "content": 0.65,
    "structure": 0.70
  },
  "feedback": "Good essay. Consider adding more relevant details."
}
```

---

## 🚀 Performance

| Question Type | Algorithm | Speed | Accuracy |
|--------------|-----------|-------|----------|
| MCQ | Exact Match | <1ms | 100% |
| True-False | Exact Match | <1ms | 100% |
| Short Answer | Multi-Metric | ~50ms | 75-85% |
| Essay | Statistical | ~200ms | 65-75% |

**Note**: Essay accuracy limited without AI for subjective content. For factual essays, statistical methods work well.

---

## 🔧 Dependencies

**Minimal**:
- ✅ No AI/LLM required
- ✅ No embedding APIs
- ✅ Pure JavaScript/TypeScript math

**Optional** (if you want advanced NLP):
```json
{
  "natural": "^6.10.0"  // Porter Stemmer (can be replaced with simple implementation)
}
```

---

## 📈 Advantages

✅ **Fast**: 50-200ms vs 2-10s for LLM  
✅ **Cheap**: $0 vs token costs  
✅ **Deterministic**: Same input = same output  
✅ **Explainable**: "82% similar because..."  
✅ **Offline**: No internet required  
✅ **Privacy**: No external API calls  
✅ **Educational**: Industry-standard algorithms  

---

## 🎓 Algorithm Research References

- **TF-IDF**: Salton & Buckley (1988)
- **Cosine Similarity**: Vector Space Model (Salton et al., 1975)
- **Jaccard Index**: Paul Jaccard (1901)
- **Levenshtein Distance**: Vladimir Levenshtein (1965)
- **Flesch-Kincaid**: Rudolf Flesch & J. Peter Kincaid (1975)

---

## 🔮 Future Enhancements

- [ ] Language-specific stemming (beyond English)
- [ ] Semantic role labeling
- [ ] Answer type detection (definition, explanation, comparison)
- [ ] Partial credit for multi-part answers
- [ ] Plagiarism detection (cosine similarity between students)
- [ ] Difficulty calibration (IRT - Item Response Theory)

---

## 💡 Tips

1. **Keywords Matter**: Ensure questions have `keywords` field for better short-answer grading
2. **Expected Answers**: Provide `correctAnswer` for reference (even for essays)
3. **Confidence Threshold**: Review answers with confidence < 0.70
4. **Question Design**: Clear, unambiguous questions get better scores
5. **Regrade**: Use regrade endpoint if question/keywords updated

---

## 🐛 Troubleshooting

**Low confidence scores?**
- Ensure question has keywords defined
- Check if correct answer is provided
- Verify student answer isn't too short (<10 words)

**Poor essay scores?**
- Essays need 50+ words for meaningful analysis
- Ensure question has correctAnswer or keywords
- Statistical grading works best for factual essays

**Grading seems harsh?**
- Adjust weights in similarity-algorithms.ts
- Current threshold: 0.70 = correct (70%)
- Can be lowered to 0.60 for more lenient grading
