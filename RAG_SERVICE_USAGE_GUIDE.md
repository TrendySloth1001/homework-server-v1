# RAG Service Usage Guide
## Using the Reusable RAG Service Everywhere

The RAG (Retrieval Augmented Generation) service is now available throughout your application. Here's how to use it:

---

## 🎯 Quick Start

### 1. **Simple Text Generation with RAG**

```typescript
import { generateTextService } from './features/ai/ai.service';

// Generate text with automatic context retrieval
const result = await generateTextService({
  prompt: "Explain photosynthesis to Class 6 students",
  teacherId: "teacher123",
  useRAG: true, // Enable RAG (default: true)
  contextFilters: {
    subject: "Biology",
    class: "Class 6",
    board: "CBSE"
  }
});

console.log(result.response);
console.log(`Conversation ID: ${result.conversationId}`);
console.log(`Sources used: ${result.sourceDocuments?.length}`);
```

### 2. **Continue a Conversation**

```typescript
// First message - creates new conversation
const firstMsg = await generateTextService({
  prompt: "What is algebra?",
  teacherId: "teacher123",
  sessionType: "tutoring",
  topic: "Math basics"
});

// Follow-up - uses conversation history
const followUp = await generateTextService({
  prompt: "Can you give me an example?",
  conversationId: firstMsg.conversationId,
  teacherId: "teacher123"
});

// Context maintained across messages!
```

### 3. **Direct RAG Service Usage**

```typescript
import { ragService } from './shared/lib/rag';

// Initialize RAG service (done automatically)
await ragService.initialize();

// Query with RAG
const response = await ragService.query({
  query: "Find topics related to Newton's laws",
  topK: 5, // Retrieve top 5 documents
  filters: {
    subject: "Physics",
    class: "Class 11"
  }
});

console.log(response.answer);
console.log('Sources:', response.sourceNodes);
```

### 4. **Just Retrieve Documents (No Generation)**

```typescript
import { ragService } from './shared/lib/rag';

// Retrieve relevant documents without generating text
const documents = await ragService.retrieve(
  "Photosynthesis process",
  5, // top 5
  { subject: "Biology" }
);

documents.forEach(doc => {
  console.log(`Score: ${doc.score}`);
  console.log(`Text: ${doc.text}`);
  console.log(`Metadata:`, doc.metadata);
});
```

---

## 📦 Core Components

### **1. RAG Service** (`src/shared/lib/rag.ts`)

**Features:**
- ✅ LlamaIndex integration
- ✅ Qdrant vector store
- ✅ Automatic document indexing
- ✅ Context-aware generation
- ✅ Caching support

**Methods:**

```typescript
// Query with generation
await ragService.query(options)

// Retrieve documents only
await ragService.retrieve(query, topK, filters)

// Index content
await ragService.indexSyllabus(syllabusId)
await ragService.indexQuestions(topicId)
await ragService.reindexAll()

// Clear cache
await ragService.clearCache()
```

### **2. Conversation Service** (`src/features/ai/conversation.service.ts`)

**Features:**
- ✅ Sliding window (100 messages)
- ✅ Auto-pruning old messages
- ✅ Message embeddings
- ✅ Token tracking
- ✅ Conversation search

**Methods:**

```typescript
import { conversationService } from './features/ai/conversation.service';

// Create conversation
const conversation = await conversationService.createConversation({
  teacherId: "teacher123",
  title: "Math tutoring session",
  sessionType: "tutoring"
});

// Get history
const messages = await conversationService.getConversationHistory(
  conversationId,
  100 // last 100 messages
);

// Add message
await conversationService.addMessage(conversationId, {
  role: "user",
  content: "Hello!"
});

// Get user's conversations
const conversations = await conversationService.getUserConversations(
  userId,
  { sessionType: "chat", limit: 50 }
);

// Delete conversation
await conversationService.deleteConversation(conversationId, userId);

// Cleanup old conversations (>30 days)
await conversationService.cleanupOldConversations(30);
```

---

## 🔌 API Endpoints

### **Enhanced Text Generation**

```bash
POST /api/v1/ai/generate
```

**Request:**
```json
{
  "prompt": "Explain photosynthesis",
  "teacherId": "teacher123",
  "useRAG": true,
  "ragTopK": 5,
  "contextFilters": {
    "subject": "Biology",
    "class": "Class 6"
  },
  "sessionType": "tutoring",
  "conversationId": "optional-existing-id"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Text generated successfully with RAG",
  "data": {
    "response": "Photosynthesis is the process...",
    "conversationId": "cm4xyz...",
    "messageId": "cm4abc...",
    "sourceDocuments": [
      {
        "text": "Topic: Photosynthesis...",
        "score": 0.92,
        "metadata": {
          "type": "topic",
          "id": "topic123",
          "subject": "Biology"
        }
      }
    ]
  }
}
```

### **Conversation Management**

```bash
# Get user's conversations
GET /api/v1/ai/conversations?userId=xxx&sessionType=chat&limit=50

# Get specific conversation with messages
GET /api/v1/ai/conversations/:id?userId=xxx

# Get conversation stats
GET /api/v1/ai/conversations/:id/stats

# Search conversations
GET /api/v1/ai/conversations/search?userId=xxx&query=physics

# Delete conversation
DELETE /api/v1/ai/conversations/:id?userId=xxx
```

### **Content Indexing**

```bash
# Index syllabus
POST /api/v1/ai/index
{
  "type": "syllabus",
  "id": "syllabus123"
}

# Index questions
POST /api/v1/ai/index
{
  "type": "question",
  "id": "topic123"  # optional - index all if not provided
}

# Reindex everything
POST /api/v1/ai/index
{
  "type": "all"
}
```

---

## 🎨 Advanced Usage Patterns

### **1. Tutoring Session with Context**

```typescript
// Student asks a question
const session = await generateTextService({
  prompt: "I don't understand quadratic equations",
  studentId: "student123",
  sessionType: "tutoring",
  topic: "Algebra - Quadratic Equations",
  useRAG: true,
  contextFilters: {
    subject: "Mathematics",
    class: "Class 10"
  }
});

// Continue the session
const followUp = await generateTextService({
  prompt: "Can you show me how to solve x² + 5x + 6 = 0?",
  conversationId: session.conversationId,
  studentId: "student123"
});

// AI remembers the context and previous messages!
```

### **2. Question Generation with Context**

```typescript
// Generate questions with syllabus context
const result = await generateTextService({
  prompt: "Generate 5 MCQ questions about photosynthesis for Class 6",
  teacherId: "teacher123",
  sessionType: "question-gen",
  useRAG: true,
  contextFilters: {
    subject: "Biology",
    class: "Class 6",
    topicIds: ["topic123", "topic456"] // Specific topics
  }
});

// Response includes relevant syllabus content for better questions
```

### **3. Syllabus Enhancement**

```typescript
// Enhance syllabus with external knowledge
const enhanced = await generateTextService({
  prompt: "Suggest modern teaching strategies for quantum physics",
  teacherId: "teacher123",
  sessionType: "syllabus",
  useRAG: true,
  contextFilters: {
    subject: "Physics",
    class: "Class 12"
  }
});

// RAG retrieves existing syllabus content + combines with AI knowledge
```

### **4. Semantic Search in Your Code**

```typescript
import { ragService } from './shared/lib/rag';

// Find similar topics across syllabi
const similarTopics = await ragService.retrieve(
  "climate change and global warming",
  10,
  { subject: "Environmental Science" }
);

// Use in recommendations
similarTopics.forEach(topic => {
  console.log(`${topic.metadata.topicName} - Score: ${topic.score}`);
});
```

---

## 🔧 Configuration

### **Environment Variables**

Add to `.env`:

```bash
# Ollama (already configured)
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=qwen2.5:14b
OLLAMA_EMBEDDING_MODEL=nomic-embed-text:v1.5

# Qdrant (already configured)
QDRANT_URL=http://localhost:6333

# Conversation Settings
MAX_CONVERSATION_MESSAGES=100
CONVERSATION_CACHE_TTL=300
OLD_CONVERSATION_CLEANUP_DAYS=30
```

### **Update Config** (`src/shared/config/index.ts`)

Already integrated! The RAG service uses:
- `config.ollama.baseUrl`
- `config.ollama.model`
- `config.ollama.embeddingModel`
- `config.qdrant.url`

---

## 📊 Monitoring & Debugging

### **Check Conversation Stats**

```typescript
const stats = await conversationService.getConversationStats(conversationId);

console.log(`Messages: ${stats.messageCount}`);
console.log(`Total tokens: ${stats.totalTokens}`);
console.log(`Avg tokens/msg: ${stats.averageTokensPerMessage}`);
console.log(`Duration: ${stats.duration} minutes`);
```

### **Cache Management**

```typescript
// Clear RAG cache
await ragService.clearCache();

// Clear conversation cache
await cacheService.deletePattern('conversation:*');
```

### **Logging**

The RAG service automatically logs:
- Query processing
- Document retrieval counts
- Indexing operations
- Cache hits/misses

Watch server logs for:
```
✅ RAG Service initialized successfully
✅ RAG query served from cache
✅ Indexed syllabus xyz with 45 documents
✅ Pruned 10 old messages from conversation abc
```

---

## 🚀 Indexing Workflow

### **Automatic Indexing**

When you create/update syllabi, index them:

```typescript
// After creating syllabus
const syllabus = await createSyllabusService({ ... });
await ragService.indexSyllabus(syllabus.id);

// After AI generation
const aiSyllabus = await generateAISyllabusService({ ... });
await ragService.indexSyllabus(aiSyllabus.id);
```

### **Batch Indexing**

```typescript
// Index all syllabi for a teacher
const syllabi = await prisma.syllabus.findMany({
  where: { teacherId: "teacher123" }
});

for (const syllabus of syllabi) {
  await ragService.indexSyllabus(syllabus.id);
}

// Or reindex everything
await ragService.reindexAll();
```

### **Background Job Integration**

Add to `ai.queue.ts`:

```typescript
export async function processIndexingJob(data: any) {
  const { type, id } = data;
  
  switch (type) {
    case 'syllabus':
      await ragService.indexSyllabus(id);
      break;
    case 'question':
      await ragService.indexQuestions(id);
      break;
    case 'full-reindex':
      await ragService.reindexAll();
      break;
  }
}
```

---

## 🔒 Security & Privacy

### **Access Control**

The conversation service automatically checks ownership:

```typescript
// Only returns conversation if userId matches
const conversation = await conversationService.getConversation(
  conversationId,
  userId
);
// Throws NotFoundError if user doesn't own conversation
```

### **Data Retention**

Conversations auto-delete after 30 days (configurable):

```typescript
// Manual cleanup
await conversationService.cleanupOldConversations(30);

// Setup cron job
setInterval(async () => {
  await conversationService.cleanupOldConversations(30);
}, 24 * 60 * 60 * 1000); // Daily
```

---

## 🎯 Best Practices

### **1. Always Use RAG for Educational Content**

```typescript
// ✅ GOOD - Uses syllabus context
await generateTextService({
  prompt: "Explain photosynthesis",
  useRAG: true,
  contextFilters: { subject: "Biology" }
});

// ❌ BAD - No context, generic response
await generateTextService({
  prompt: "Explain photosynthesis",
  useRAG: false
});
```

### **2. Filter Context Appropriately**

```typescript
// ✅ GOOD - Specific filters
contextFilters: {
  subject: "Mathematics",
  class: "Class 10",
  board: "CBSE",
  topicIds: ["algebra-topic-1", "algebra-topic-2"]
}

// ❌ BAD - No filters, retrieves irrelevant content
contextFilters: {}
```

### **3. Reuse Conversations**

```typescript
// ✅ GOOD - Maintains context
const conv1 = await generateTextService({ 
  prompt: "What is algebra?", 
  teacherId: "t1" 
});

const conv2 = await generateTextService({ 
  prompt: "Give me an example", 
  conversationId: conv1.conversationId 
});

// ❌ BAD - Creates new conversation each time, loses context
```

### **4. Index Content After Changes**

```typescript
// ✅ GOOD - Update index after changes
await updateSyllabusService(syllabusId, updates);
await ragService.indexSyllabus(syllabusId);

// ❌ BAD - Old content in vector store
await updateSyllabusService(syllabusId, updates);
// Forgot to reindex!
```

---

## 📈 Performance Tips

1. **Use topK wisely**: More documents = better context but higher tokens
   - Tutoring: `topK: 3-5`
   - Research: `topK: 10-15`

2. **Cache aggressively**: RAG queries are cached for 1 hour by default

3. **Batch indexing**: Index multiple syllabi in parallel

4. **Filter context**: Reduces search space and improves relevance

5. **Monitor tokens**: Track `tokensUsed` in conversation stats

---

## 🐛 Troubleshooting

### **RAG not returning relevant documents?**

```typescript
// Check if content is indexed
const docs = await ragService.retrieve("your query", 10);
console.log('Retrieved docs:', docs.length);

// Reindex if needed
await ragService.indexSyllabus(syllabusId);
```

### **Conversations not maintaining context?**

```typescript
// Verify conversation history
const history = await conversationService.getConversationHistory(convId);
console.log('History length:', history.length);

// Check if sliding window pruned too much
// History should have up to 100 messages
```

### **Slow responses?**

```typescript
// Check cache
await ragService.clearCache(); // If stale data

// Reduce topK
ragTopK: 3 // Instead of 10

// Use specific filters
contextFilters: { subject: "Math", class: "Class 10" }
```

---

## ✅ Implementation Checklist

- [x] Prisma schema updated with Conversation models
- [x] RAG service created (`src/shared/lib/rag.ts`)
- [x] Conversation service created (`src/features/ai/conversation.service.ts`)
- [x] AI types updated with RAG support
- [x] `generateTextService` enhanced with RAG
- [x] API routes added for conversations
- [x] Database migrated and Prisma client generated
- [x] LlamaIndex dependency installed

### **Next Steps:**

1. ✅ Index existing content:
   ```bash
   POST /api/v1/ai/index { "type": "all" }
   ```

2. ✅ Test RAG query:
   ```bash
   POST /api/v1/ai/generate
   {
     "prompt": "Explain photosynthesis",
     "teacherId": "teacher123",
     "useRAG": true,
     "contextFilters": { "subject": "Biology" }
   }
   ```

3. ✅ Test conversation continuity:
   - Send first message
   - Send follow-up with `conversationId`
   - Verify context maintained

---

**Happy RAG-ing! 🚀**

Your RAG service is now ready to use everywhere in your application. It's a standalone service that can be imported and used in any feature.
