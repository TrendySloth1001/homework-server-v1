# Assessment API - Quick Reference

## Endpoints

### 1. Grade Answer
```http
POST /api/v1/assessment/grade
Content-Type: application/json

{
  "questionId": "clx...",
  "studentId": "student-123",
  "teacherId": "teacher-456",
  "studentAnswer": "Plants convert light energy into chemical energy",
  "selectedOption": "A"  // Optional, for MCQ
}
```

**Returns**: Answer ID, score, feedback, confidence, **full question details**

---

### 2. Get Answer History (With Filters)
```http
GET /api/v1/assessment/answers?studentId=student-123&page=1&limit=20&sortBy=score&sortOrder=desc&minScore=70&correctnessLevel=excellent&questionType=short-answer
```

**Returns**: Array of answers with pagination, **question details included**

---

### 3. Get Single Answer
```http
GET /api/v1/assessment/answer/:answerId
```

**Returns**: Full answer details with complete hierarchy (answer → question → topic → unit → syllabus)

---

### 4. Student Performance
```http
GET /api/v1/assessment/student/:studentId/performance?teacherId=teacher-456
```

**Returns**: 
- Total attempts, averages, correct count
- Breakdown by question type, difficulty, topic
- Improvement trend (time series)
- Recent answers (last 10)

---

### 5. Regrade Answer
```http
POST /api/v1/assessment/answer/:answerId/regrade
```

**Returns**: Previous vs new score, improvement indicator

---

### 6. Question Answers (Teacher Review)
```http
GET /api/v1/assessment/question/:questionId/answers?teacherId=teacher-456
```

**Returns**:
- Question details
- Aggregate statistics (total attempts, correct %, average score)
- All student answers

---

### 7. Teacher Statistics
```http
GET /api/v1/assessment/stats/:teacherId
```

**Returns**:
- Total attempts, unique students, unique questions
- Breakdown by question type and difficulty
- Recent activity feed

---

## Query Parameters

### Filtering
- `studentId` - Filter by student
- `teacherId` - Filter by teacher
- `questionId` - Filter by question
- `minScore` - Minimum score (e.g., 70)
- `maxScore` - Maximum score (e.g., 100)
- `correctnessLevel` - excellent, good, partial, incorrect
- `questionType` - mcq, short-answer, essay, true-false

### Sorting
- `sortBy` - Field to sort by (submittedAt, score, confidence)
- `sortOrder` - asc or desc

### Pagination
- `page` - Page number (default: 1)
- `limit` - Items per page (default: 20)

---

## Response Format

All responses follow:
```json
{
  "success": true,
  "message": "Description",
  "data": { /* payload */ },
  "pagination": {  // For list endpoints
    "total": 100,
    "page": 1,
    "limit": 20,
    "totalPages": 5,
    "hasNextPage": true,
    "hasPrevPage": false
  }
}
```

---

## Question Mapping

**StudentAnswer → Question**: One-to-many relationship
```
Question (1) ←→ (Many) StudentAnswer
  ↓
  - questionId (foreign key)
  - onDelete: Cascade
  - Indexed for performance
```

**Question has built-in answers** (from AI generation):
- `correctAnswer` - Expected answer
- `explanation` - Learning context
- `keywords` - From topic (for semantic grading)

---

## Grading Methods

1. **exact-match** - MCQ, true-false (binary scoring)
2. **semantic-multi-metric** - Short answer (5 algorithms: cosine, jaccard, keyword, n-gram, levenshtein)
3. **essay-statistical** - Essays (5 metrics: keyword coverage, length, similarity, readability, diversity)

---

## Frontend Integration

### React Example
```tsx
import axios from 'axios';

// Grade answer
const gradeAnswer = async (questionId, answer, studentId, teacherId) => {
  const response = await axios.post('/api/v1/assessment/grade', {
    questionId,
    studentAnswer: answer,
    studentId,
    teacherId
  });
  
  const { data } = response.data;
  console.log('Score:', data.percentage);
  console.log('Feedback:', data.feedback);
  console.log('Question:', data.question.questionText);  // ✅ Included!
};

// Get performance analytics
const getPerformance = async (studentId) => {
  const response = await axios.get(`/api/v1/assessment/student/${studentId}/performance`);
  const { data } = response.data;
  
  // Ready for charts
  return {
    byType: data.byQuestionType,      // Bar chart
    trend: data.improvementTrend,     // Line chart
    distribution: data.byCorrectness, // Pie chart
    topics: data.byTopic             // Heatmap
  };
};

// Get answers with filtering
const getAnswers = async (filters) => {
  const response = await axios.get('/api/v1/assessment/answers', {
    params: {
      studentId: filters.studentId,
      page: filters.page,
      limit: 20,
      sortBy: 'score',
      sortOrder: 'desc',
      minScore: filters.minScore
    }
  });
  
  const { data, pagination } = response.data;
  return { answers: data, ...pagination };
};
```

---

## Database Schema

```prisma
model StudentAnswer {
  id               String   @id @default(cuid())
  questionId       String
  studentId        String
  teacherId        String
  studentAnswer    String   @db.Text
  selectedOption   String?
  score            Float
  maxScore         Float
  isCorrect        Boolean
  correctnessLevel String?
  gradingMethod    String
  confidence       Float?
  feedback         String?  @db.Text
  submittedAt      DateTime @default(now())
  
  question Question @relation(fields: [questionId], references: [id], onDelete: Cascade)
  
  @@index([questionId])
  @@index([studentId])
  @@index([teacherId])
}
```

---

## Key Features

✅ **Single API calls** - Question details included in responses
✅ **Advanced filtering** - Score range, type, level
✅ **Server-side sorting** - No client-side processing
✅ **Chart-ready data** - Pre-aggregated statistics
✅ **Performance optimized** - Indexed queries, single fetches
✅ **Type-safe** - Full TypeScript support
✅ **Pagination built-in** - Boolean flags for UI
✅ **Trend analysis** - Time series data
✅ **Topic breakdown** - Identify strengths/weaknesses

---

## Error Codes

- `400` - Validation error (missing fields)
- `404` - Not found (question/answer doesn't exist)
- `500` - Server error

---

## Postman Collection

Import this to test:
```json
{
  "name": "Assessment API",
  "requests": [
    {
      "name": "Grade Answer",
      "method": "POST",
      "url": "{{baseUrl}}/api/v1/assessment/grade",
      "body": {
        "questionId": "{{questionId}}",
        "studentId": "student-123",
        "teacherId": "teacher-456",
        "studentAnswer": "Your answer here"
      }
    }
  ]
}
```

---

**For complete details, see**: `readmes/ASSESSMENT_OPTIMIZATION.md`
