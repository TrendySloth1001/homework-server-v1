# AI Personalization & Adaptive Learning System
## Plan for User-Specific AI Training

> **Goal**: Build an intelligent system where AI learns from each user's interactions and progressively improves personalization using algorithms, mathematics, and adaptive retrieval.

---

## 1. System Architecture

### Current State
- ✅ Basic memory system (facts extraction)
- ✅ Vector embeddings (Qdrant)
- ✅ Conversation history
- ✅ User preferences (AI settings)
- ❌ No learning from feedback
- ❌ No adaptive context selection
- ❌ No personalization scoring

### Target State
```
User Query → Context Selection AI → Relevance Scoring → Adaptive Retrieval → Personalized Response
              ↓
         Feedback Loop (implicit + explicit)
              ↓
         Update User Model → Retrain Weights
```

---

## 2. Core Algorithms & Mathematics

### 2.1 **Relevance Scoring Algorithm**
**Purpose**: Determine which contexts are most relevant for each query

```typescript
RelevanceScore = α·SemanticSimilarity + β·TemporalRelevance + γ·UsageFrequency + δ·UserPreference

where:
- α, β, γ, δ are learned weights (user-specific)
- SemanticSimilarity: cosine similarity between embeddings
- TemporalRelevance: e^(-λ·age_in_days) [exponential decay]
- UsageFrequency: log(1 + usage_count)
- UserPreference: learned from feedback
```

**Implementation**:
```typescript
interface RelevanceFactors {
  semanticSimilarity: number;    // 0-1 (cosine similarity)
  temporalRelevance: number;     // 0-1 (recency score)
  usageFrequency: number;        // 0-1 (normalized)
  userPreference: number;        // 0-1 (learned)
}

function calculateRelevanceScore(
  factors: RelevanceFactors,
  weights: UserWeights
): number {
  return (
    weights.alpha * factors.semanticSimilarity +
    weights.beta * factors.temporalRelevance +
    weights.gamma * factors.usageFrequency +
    weights.delta * factors.userPreference
  );
}
```

### 2.2 **Adaptive Weight Learning**
**Purpose**: Learn optimal weights for each user based on their behavior

```typescript
// Gradient Descent for weight optimization
function updateWeights(
  currentWeights: UserWeights,
  feedback: Feedback,
  learningRate: number = 0.01
): UserWeights {
  // Calculate gradient based on feedback
  const gradient = calculateGradient(currentWeights, feedback);
  
  // Update weights
  return {
    alpha: currentWeights.alpha - learningRate * gradient.alpha,
    beta: currentWeights.beta - learningRate * gradient.beta,
    gamma: currentWeights.gamma - learningRate * gradient.gamma,
    delta: currentWeights.delta - learningRate * gradient.delta
  };
}
```

### 2.3 **User Profile Embedding**
**Purpose**: Create a dynamic vector representation of user interests

```
UserVector = Σ(w_i · v_i) / Σ(w_i)

where:
- v_i: embedding of topic/fact i
- w_i: weight based on interaction frequency and recency
```

**Implementation**:
```typescript
function computeUserProfileVector(
  interactions: UserInteraction[]
): number[] {
  const weightedVectors: Array<{vector: number[], weight: number}> = [];
  
  interactions.forEach(interaction => {
    const weight = calculateInteractionWeight(
      interaction.frequency,
      interaction.recency,
      interaction.satisfaction
    );
    
    weightedVectors.push({
      vector: interaction.embedding,
      weight
    });
  });
  
  // Weighted average
  return computeWeightedAverage(weightedVectors);
}
```

### 2.4 **Context Necessity Classifier**
**Purpose**: Predict if context is needed using ML classifier

```typescript
// Features for classification
interface QueryFeatures {
  queryLength: number;           // Word count
  hasPersonalPronouns: boolean;  // Contains "my", "I", etc.
  hasTemporalWords: boolean;     // Contains "yesterday", "last time"
  hasMemoryWords: boolean;       // Contains "remember", "recall"
  semanticComplexity: number;    // Calculated from parse tree
  similarityToPastQueries: number; // Max similarity to past
}

// Naive Bayes Classifier
P(NeedsContext | Features) = P(Features | NeedsContext) · P(NeedsContext) / P(Features)
```

---

## 3. Database Schema Extensions

### 3.1 **User Learning Model Table**
```prisma
model UserLearningModel {
  id        String   @id @default(uuid())
  userId    String   @unique
  
  // Learned weights for relevance scoring
  alphaWeight   Float @default(0.4)  // Semantic similarity
  betaWeight    Float @default(0.3)  // Temporal relevance
  gammaWeight   Float @default(0.2)  // Usage frequency
  deltaWeight   Float @default(0.1)  // User preference
  
  // User profile vector (384D for MiniLM)
  profileVector String?  // JSON stringified array
  
  // Learning statistics
  totalInteractions Int @default(0)
  lastUpdatedAt     DateTime @updatedAt
  
  user User @relation(fields: [userId], references: [id], onDelete: Cascade)
}
```

### 3.2 **Interaction Feedback Table**
```prisma
model InteractionFeedback {
  id              String   @id @default(uuid())
  userId          String
  conversationId  String
  messageId       String
  
  // Implicit feedback
  responseTime    Int?     // Seconds to next message
  followUpType    String?  // clarification, continuation, new_topic
  contextUsed     Json?    // Which contexts were loaded
  
  // Explicit feedback (optional)
  thumbsUp        Boolean?
  thumbsDown      Boolean?
  rating          Int?     // 1-5 stars
  
  // Learning features
  queryFeatures   Json     // Extracted features
  predictedRelevance Float? // Model prediction
  actualRelevance Float?   // Ground truth (inferred)
  
  createdAt DateTime @default(now())
  
  user User @relation(fields: [userId], references: [id], onDelete: Cascade)
}
```

### 3.3 **Topic Affinity Table**
```prisma
model TopicAffinity {
  id       String @id @default(uuid())
  userId   String
  topic    String
  
  // Affinity metrics
  interactionCount Int @default(1)
  avgSatisfaction  Float @default(0.5)
  lastInteraction  DateTime @default(now())
  
  // Calculated affinity score
  affinityScore Float @default(0.5)
  
  @@unique([userId, topic])
}
```

---

## 4. Implementation Phases

### **Phase 1: Data Collection & Tracking (Week 1-2)**
- [ ] Add interaction tracking
- [ ] Implement implicit feedback collection
- [ ] Create feedback database tables
- [ ] Track context usage vs. actual relevance

### **Phase 2: Feature Engineering (Week 2-3)**
- [ ] Extract query features (length, keywords, complexity)
- [ ] Calculate temporal decay functions
- [ ] Implement user profile vector computation
- [ ] Build topic extraction pipeline

### **Phase 3: Scoring Algorithm (Week 3-4)**
- [ ] Implement relevance scoring function
- [ ] Create adaptive weight system
- [ ] Build context necessity classifier
- [ ] Add A/B testing framework

### **Phase 4: Learning Loop (Week 4-5)**
- [ ] Implement gradient descent for weight updates
- [ ] Build feedback processing pipeline
- [ ] Create periodic retraining job
- [ ] Add user model versioning

### **Phase 5: Smart Context Retrieval (Week 5-6)**
- [ ] Replace static context loading with dynamic
- [ ] Implement multi-armed bandit for exploration
- [ ] Add confidence thresholds
- [ ] Build fallback mechanisms

### **Phase 6: Evaluation & Tuning (Week 6-8)**
- [ ] Measure context retrieval accuracy
- [ ] Track user satisfaction metrics
- [ ] Optimize hyperparameters
- [ ] Conduct user studies

---

## 5. Key Algorithms Implementation

### 5.1 **Smart Context Retrieval**
```typescript
async function retrieveRelevantContext(
  userId: string,
  query: string,
  userModel: UserLearningModel
): Promise<RetrievedContext> {
  
  // 1. Extract query features
  const features = extractQueryFeatures(query);
  
  // 2. Predict if context is needed
  const needsContext = classifyContextNecessity(features, userModel);
  
  if (!needsContext.probability > 0.5) {
    return { contexts: [], confidence: needsContext.confidence };
  }
  
  // 3. Retrieve candidate contexts
  const candidates = await getCandidateContexts(userId, query);
  
  // 4. Score each context using learned weights
  const scoredContexts = candidates.map(ctx => ({
    context: ctx,
    score: calculateRelevanceScore({
      semanticSimilarity: cosineSimilarity(query, ctx.embedding),
      temporalRelevance: temporalDecay(ctx.timestamp),
      usageFrequency: normalizeFrequency(ctx.usageCount),
      userPreference: ctx.userAffinityScore || 0.5
    }, userModel.weights)
  }));
  
  // 5. Select top-k contexts above threshold
  const threshold = 0.6; // Learned per user
  const selected = scoredContexts
    .filter(s => s.score > threshold)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);
  
  return {
    contexts: selected.map(s => s.context),
    confidence: calculateConfidence(selected)
  };
}
```

### 5.2 **Implicit Feedback Processing**
```typescript
async function processImplicitFeedback(
  userId: string,
  interaction: Interaction
): Promise<void> {
  
  // Calculate satisfaction from implicit signals
  const satisfaction = inferSatisfaction({
    responseTime: interaction.responseTime,
    followUpType: interaction.followUpType,
    contextRelevance: interaction.contextUsed?.length || 0,
    conversationContinued: interaction.hasFollowUp
  });
  
  // Update topic affinities
  const topics = extractTopics(interaction.query);
  for (const topic of topics) {
    await updateTopicAffinity(userId, topic, satisfaction);
  }
  
  // Adjust user weights if needed
  if (shouldUpdateWeights(userId)) {
    await retrainUserModel(userId);
  }
}

function inferSatisfaction(signals: ImplicitSignals): number {
  // Quick response + continuation = satisfied
  // Long response time + clarification = unsatisfied
  
  let score = 0.5; // Baseline
  
  if (signals.responseTime < 10) score += 0.2;
  if (signals.responseTime > 60) score -= 0.2;
  
  if (signals.followUpType === 'continuation') score += 0.3;
  if (signals.followUpType === 'clarification') score -= 0.2;
  
  if (signals.conversationContinued) score += 0.1;
  
  return Math.max(0, Math.min(1, score));
}
```

### 5.3 **Periodic Model Retraining**
```typescript
async function retrainUserModel(userId: string): Promise<void> {
  
  // 1. Gather recent feedback (last 100 interactions)
  const feedback = await getRecentFeedback(userId, 100);
  
  if (feedback.length < 20) {
    console.log('[Learning] Not enough data for retraining');
    return;
  }
  
  // 2. Load current model
  const currentModel = await loadUserModel(userId);
  
  // 3. Calculate new weights using gradient descent
  let weights = currentModel.weights;
  const learningRate = 0.01;
  const epochs = 50;
  
  for (let epoch = 0; epoch < epochs; epoch++) {
    for (const interaction of feedback) {
      const gradient = calculateGradient(
        weights,
        interaction.predicted,
        interaction.actual
      );
      
      weights = updateWeights(weights, gradient, learningRate);
    }
  }
  
  // 4. Update user profile vector
  const profileVector = computeUserProfileVector(feedback);
  
  // 5. Save updated model
  await saveUserModel(userId, {
    weights,
    profileVector,
    totalInteractions: currentModel.totalInteractions + feedback.length
  });
  
  console.log(`[Learning] Retrained model for user ${userId}`);
}
```

---

## 6. Metrics & Evaluation

### Success Metrics
1. **Context Precision**: % of loaded contexts actually used in response
2. **Context Recall**: % of needed contexts successfully loaded
3. **User Satisfaction**: Inferred from implicit feedback
4. **Response Quality**: Measured by conversation continuation
5. **Efficiency**: Reduction in unnecessary context loading

### Monitoring Dashboard
```typescript
interface UserModelMetrics {
  userId: string;
  
  // Retrieval metrics
  avgContextPrecision: number;
  avgContextRecall: number;
  contextLoadRate: number;  // % queries loading context
  
  // Learning metrics
  modelVersion: number;
  trainingIterations: number;
  convergenceScore: number;
  
  // Satisfaction metrics
  avgSatisfaction: number;
  conversationCompletionRate: number;
  avgResponseTime: number;
}
```

---

## 7. Advanced Features (Future)

### 7.1 **Multi-Armed Bandit**
Use exploration-exploitation for context selection:
```
UCB1 = μ_i + c√(ln(n)/n_i)

where:
- μ_i: average reward for context i
- n: total interactions
- n_i: times context i was selected
- c: exploration parameter
```

### 7.2 **Collaborative Filtering**
Learn from similar users:
```
UserSimilarity = cosine(UserVector_A, UserVector_B)

If similarity > threshold:
  Borrow successful patterns from similar users
```

### 7.3 **Neural Context Ranker**
Replace weighted scoring with neural network:
```
Input: [query_embedding, context_embedding, user_profile, temporal_features]
  ↓
Hidden Layer (128 units, ReLU)
  ↓
Hidden Layer (64 units, ReLU)
  ↓
Output: Relevance Score (sigmoid, 0-1)
```

---

## 8. Implementation Checklist

### Backend Services
- [ ] `UserLearningService` - Manage user models
- [ ] `FeedbackCollector` - Track interactions
- [ ] `FeatureExtractor` - Extract query features
- [ ] `RelevanceScorer` - Score contexts
- [ ] `ModelTrainer` - Update weights
- [ ] `ContextSelector` - Smart retrieval

### Database Migrations
- [ ] Add `UserLearningModel` table
- [ ] Add `InteractionFeedback` table
- [ ] Add `TopicAffinity` table
- [ ] Add indexes for performance

### API Endpoints
- [ ] `POST /api/ai/feedback` - Submit explicit feedback
- [ ] `GET /api/ai/user-model/:userId` - Get user model stats
- [ ] `POST /api/ai/retrain/:userId` - Trigger retraining

### Background Jobs
- [ ] Feedback processing (every 5 minutes)
- [ ] Model retraining (daily per user)
- [ ] Metric aggregation (hourly)

---

## 9. Technical Stack

### Current
- **Vector DB**: Qdrant (384D embeddings)
- **Embeddings**: Xenova/all-MiniLM-L6-v2
- **AI Model**: Ollama (qwen2.5:7b)
- **Database**: PostgreSQL + Prisma

### Additions Needed
- **ML Library**: TensorFlow.js or Brain.js (for neural ranker)
- **Math Library**: mathjs (for matrix operations)
- **Optimization**: Simple gradient descent (custom)
- **Caching**: Redis (for user models)

---

## 10. Estimated Timeline

| Phase | Duration | Deliverable |
|-------|----------|-------------|
| Data Collection | 2 weeks | Feedback tracking system |
| Feature Engineering | 1 week | Query feature extraction |
| Scoring Algorithm | 1 week | Relevance scoring + weights |
| Learning Loop | 1 week | Gradient descent training |
| Smart Retrieval | 1 week | Adaptive context loading |
| Testing & Tuning | 2 weeks | Production-ready system |

**Total**: ~8 weeks for MVP

---

## 11. Next Steps

1. **Immediate** (This Week):
   - Add interaction tracking to existing AI service
   - Create database migrations for new tables
   - Implement basic query feature extraction

2. **Short-term** (Next 2 Weeks):
   - Build relevance scoring algorithm
   - Implement feedback collection
   - Create initial user model

3. **Medium-term** (Next Month):
   - Add learning loop with gradient descent
   - Deploy smart context retrieval
   - Begin A/B testing

---

## Questions to Consider

1. Should we use supervised learning (explicit feedback) or unsupervised (implicit only)?
2. How often should we retrain models? (Real-time, hourly, daily?)
3. What's the cold-start strategy for new users?
4. Should we implement federated learning for privacy?
5. How do we handle model drift over time?

---

**Status**: Planning Phase
**Author**: AI Personalization Team
**Last Updated**: January 7, 2026
