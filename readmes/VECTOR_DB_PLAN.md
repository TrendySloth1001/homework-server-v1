# Vector DB + Smart Caching Implementation Plan

## 🎯 **Objectives**

1. **Fill ALL model fields** during AI generation
2. **Vector DB integration** for semantic search
3. **Multi-layer caching** to avoid redundant web searches
4. **Embedding storage** for all content and search results

---

## 📊 **Current Model Fields Status**

### Syllabus Model ✅
- ✅ teacherId, subjectName, className, board, term, academicYear
- ✅ objectives, overview
- ✅ generatedBy, aiPrompt
- ✅ published, stage, completionStage

### Unit Model ⚠️
- ✅ syllabusId, teacherId, title, description
- ❌ **teachingHours** (not filled)
- ❌ **durationDays** (not filled)
- ✅ order, generatedBy

### Topic Model ⚠️
- ✅ unitId, teacherId, topicName, keywords
- ❌ **description** (often empty)
- ❌ **embedding** (not generated)
- ✅ order, generatedBy

---

## 🔄 **Multi-Layer Cache Strategy**

### Layer 1: Vector DB (Semantic Similarity)
```
Query: "CBSE Class 10 Physics syllabus"
   ↓
Qdrant: Find similar queries (cosine similarity > 0.85)
   ↓
If found: Use existing results
If not: → Layer 2
```

### Layer 2: WebSearchCache (Exact Match)
```
Query Hash: MD5("CBSE Class 10 Physics syllabus-5-advanced")
   ↓
Database: Check WebSearchCache table
   ↓
If found & not expired: Use cached results
If not: → Layer 3
```

### Layer 3: Tavily API (Fetch & Store)
```
Tavily API: Search the web
   ↓
Store in:
  - WebSearchCache (exact match)
  - Qdrant (embedding for similarity)
  - TopicResource (linked to topics)
```

---

## 🧠 **Vector DB Collections**

### Collection 1: `curriculum-searches`
**Purpose**: Store embeddings of search queries and results
```typescript
{
  id: string,              // unique ID
  vector: number[],        // 384D embedding
  payload: {
    query: string,         // original query
    board: string,
    className: string,
    subject: string,
    results: SearchResult[], // full results
    timestamp: Date
  }
}
```

### Collection 2: `syllabus-content`
**Purpose**: Store embeddings of generated syllabi
```typescript
{
  id: string,              // syllabusId
  vector: number[],        // 384D embedding (objectives + overview)
  payload: {
    syllabusId: string,
    teacherId: string,
    subjectName: string,
    className: string,
    board: string,
    objectives: string,
    overview: string,
    unitsCount: number,
    topicsCount: number
  }
}
```

### Collection 3: `topic-embeddings`
**Purpose**: Store embeddings of individual topics
```typescript
{
  id: string,              // topicId
  vector: number[],        // 384D embedding (name + description + keywords)
  payload: {
    topicId: string,
    topicName: string,
    description: string,
    keywords: string,
    unitId: string,
    syllabusId: string
  }
}
```

---

## 🛠️ **Implementation Steps**

### Step 1: Enhance AI Prompt for ALL Fields ✅ (Will implement)
```typescript
// Add to prompt:
- Unit teachingHours (2-8 hours per unit)
- Unit durationDays (5-15 days per unit)
- Topic description (minimum 30 words)
- All fields must be filled
```

### Step 2: Create Vector Search Service ✅ (Will implement)
```typescript
// src/shared/lib/vectorSearch.ts
- searchSimilarQueries(query, threshold)
- storeCurriculumSearch(query, results)
- searchSimilarSyllabi(params)
- storeTopicEmbeddings(topics)
```

### Step 3: Integrate Vector Search into Queue ✅ (Will implement)
```typescript
// Before web search:
1. Generate query embedding
2. Search Qdrant for similar queries (threshold: 0.85)
3. If found: Use existing results
4. If not: Check WebSearchCache
5. If not: Call Tavily API
6. Store in both Qdrant and WebSearchCache
```

### Step 4: Generate Embeddings for All Content ✅ (Will implement)
```typescript
// After syllabus creation:
1. Generate syllabus embedding (objectives + overview)
2. Store in Qdrant 'syllabus-content'
3. Generate topic embeddings (name + description + keywords)
4. Store in Qdrant 'topic-embeddings'
5. Update Topic.embedding field in database
```

### Step 5: API Endpoints for Vector Search ✅ (Will implement)
```typescript
// GET /api/syllabus/similar?subject=Physics&class=10&board=CBSE
// Returns similar syllabi from vector DB

// GET /api/syllabus/topic/:topicId/similar
// Returns similar topics from vector DB
```

---

## 📝 **Enhanced AI Prompt Structure**

```typescript
const prompt = `
REQUIREMENTS:
1. Learning Objectives: 5-7 SMART goals
2. Course Overview: 150+ words, 3 paragraphs
3. Units (4-6): Each with:
   - Title
   - Description (40+ words)
   - Teaching Hours (2-8 hours) ← NEW
   - Duration Days (5-15 days) ← NEW
   - Topics (3-5): Each with:
     * Topic Name
     * Description (30+ words) ← NEW
     * Keywords (5-10 terms)

CRITICAL: ALL fields are MANDATORY.

Example:
{
  "objectives": "1. Students will...",
  "overview": "This course...",
  "units": [
    {
      "title": "Unit 1: Cell Biology",
      "description": "This unit explores...",
      "teachingHours": 6,
      "durationDays": 10,
      "topics": [
        {
          "topicName": "Cell Structure",
          "description": "Students will examine the intricate structure of cells...",
          "keywords": "nucleus, mitochondria, cell membrane, cytoplasm, organelles"
        }
      ]
    }
  ]
}
`;
```

---

## 🔍 **Smart Search Flow**

### Before Web Search:
```typescript
async function smartCurriculumSearch(params) {
  // 1. Generate query embedding
  const queryText = `${params.board} ${params.className} ${params.subject} syllabus`;
  const queryEmbedding = await embeddingService.generateEmbedding(queryText);
  
  // 2. Search Vector DB for similar queries
  const similarSearches = await qdrantService.search(
    'curriculum-searches',
    queryEmbedding,
    3, // top 3 similar
    0.85 // threshold
  );
  
  if (similarSearches.length > 0) {
    console.log('[SmartCache] Found similar search, using cached results');
    return similarSearches[0].payload.results;
  }
  
  // 3. Check exact match cache
  const cached = await getCachedResults(queryHash);
  if (cached) return cached;
  
  // 4. Fetch from Tavily
  const results = await searchWeb(query);
  
  // 5. Store in Vector DB
  await qdrantService.upsertVectors('curriculum-searches', [{
    id: queryHash,
    vector: queryEmbedding,
    payload: { query: queryText, results, ...params }
  }]);
  
  return results;
}
```

---

## 💾 **Database Schema Updates**

### Already Exists ✅
- Topic.embedding (String, @db.Text)
- WebSearchCache table
- TopicResource table

### No Changes Needed ✅
All required fields already exist in the schema.

---

## 📈 **Expected Performance Improvements**

### Cache Hit Rates:
- **Exact Match** (WebSearchCache): ~30-40%
- **Semantic Match** (Vector DB): ~20-30%
- **Total Cache Hit**: ~50-70%
- **Tavily API Calls Saved**: ~50-70%

### Cost Savings:
- Current: 1000 generations = 1000 Tavily calls = $5
- With caching: 1000 generations = 300-500 Tavily calls = $1.50-$2.50
- **Savings: 50-70%**

### Response Time:
- Tavily API: ~500-1500ms
- Vector DB search: ~50-150ms
- WebSearchCache: ~10-50ms
- **Speed improvement: 10-30x for cached requests**

---

## 🚀 **Implementation Priority**

### Phase 1: Complete Field Population (Immediate)
1. ✅ Update AI prompt with ALL field requirements
2. ✅ Add teachingHours, durationDays to units
3. ✅ Add description to topics (mandatory)
4. ✅ Validate all fields are filled

### Phase 2: Vector DB Integration (30 minutes)
1. ✅ Create vectorSearch.ts service
2. ✅ Integrate into AI queue
3. ✅ Store embeddings for searches and content
4. ✅ Implement similarity search

### Phase 3: Smart Caching (15 minutes)
1. ✅ Add multi-layer cache logic
2. ✅ Vector DB → WebSearchCache → Tavily
3. ✅ Store results in all layers

### Phase 4: API Endpoints (15 minutes)
1. ✅ Similar syllabi endpoint
2. ✅ Similar topics endpoint
3. ✅ Cache statistics endpoint

---

## ✅ **Ready to Implement?**

All components are designed and ready. The implementation will:
- Fill ALL model fields properly
- Add Vector DB smart caching
- Reduce Tavily API calls by 50-70%
- Speed up responses by 10-30x for cached requests
- Provide semantic search capabilities

**Shall I proceed with the implementation?**
