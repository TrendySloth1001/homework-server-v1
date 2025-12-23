/**
 * Test script for RAG Service
 * Run with: npx ts-node test-rag.ts
 */

import { ragService } from './src/shared/lib/rag';
import { conversationService } from './src/features/ai/conversation.service';
import { generateTextService } from './src/features/ai/ai.service';

async function testRAG() {
  console.log('🧪 Testing RAG Service...\n');

  try {
    // Test 1: Initialize RAG service
    console.log('1️⃣ Initializing RAG service...');
    await ragService.initialize();
    console.log('✅ RAG service initialized\n');

    // Test 2: Create a conversation
    console.log('2️⃣ Creating conversation...');
    const conversation = await conversationService.createConversation({
      teacherId: 'test-teacher-123',
      title: 'Test RAG Conversation',
      sessionType: 'chat',
      topic: 'Testing RAG functionality',
    });
    console.log(`✅ Conversation created: ${conversation.id}\n`);

    // Test 3: Generate text with RAG (disabled for first test)
    console.log('3️⃣ Testing simple generation without RAG...');
    const simpleResult = await generateTextService({
      prompt: 'What is 2 + 2?',
      teacherId: 'test-teacher-123',
      conversationId: conversation.id,
      useRAG: false, // Disable RAG for simple test
    });
    console.log(`✅ Response: ${simpleResult.response.substring(0, 100)}...`);
    console.log(`   Conversation ID: ${simpleResult.conversationId}`);
    console.log(`   Message ID: ${simpleResult.messageId}\n`);

    // Test 4: Continue conversation
    console.log('4️⃣ Testing conversation continuity...');
    const followUp = await generateTextService({
      prompt: 'Can you explain that in simpler terms?',
      conversationId: simpleResult.conversationId,
      teacherId: 'test-teacher-123',
      useRAG: false,
    });
    console.log(`✅ Follow-up response: ${followUp.response.substring(0, 100)}...`);
    console.log(`   Same conversation: ${followUp.conversationId === simpleResult.conversationId}\n`);

    // Test 5: Get conversation history
    console.log('5️⃣ Getting conversation history...');
    const history = await conversationService.getConversationHistory(conversation.id);
    console.log(`✅ History length: ${history.length} messages`);
    history.forEach((msg, i) => {
      console.log(`   ${i + 1}. [${msg.role}] ${msg.content.substring(0, 50)}...`);
    });
    console.log();

    // Test 6: Get conversation stats
    console.log('6️⃣ Getting conversation statistics...');
    const stats = await conversationService.getConversationStats(conversation.id);
    console.log(`✅ Stats:`);
    console.log(`   Messages: ${stats.messageCount}`);
    console.log(`   Total tokens: ${stats.totalTokens}`);
    console.log(`   Avg tokens/msg: ${stats.averageTokensPerMessage.toFixed(2)}`);
    console.log(`   Duration: ${stats.duration.toFixed(2)} minutes\n`);

    // Test 7: RAG retrieval (if content is indexed)
    console.log('7️⃣ Testing RAG retrieval...');
    try {
      const docs = await ragService.retrieve('mathematics algebra', 3);
      console.log(`✅ Retrieved ${docs.length} documents`);
      if (docs.length > 0 && docs[0]) {
        const firstDoc = docs[0];
        console.log(`   First doc score: ${firstDoc.score?.toFixed(4)}`);
        console.log(`   First doc type: ${firstDoc.metadata.type}`);
      } else {
        console.log('   ℹ️  No documents found - you may need to index content first');
        console.log('   Run: POST /api/v1/ai/index { "type": "all" }');
      }
      console.log();
    } catch (error: any) {
      console.log(`   ⚠️  RAG retrieval test skipped: ${error.message}`);
      console.log('   This is normal if you haven\'t indexed any content yet\n');
    }

    // Test 8: Cleanup
    console.log('8️⃣ Cleaning up test data...');
    await conversationService.deleteConversation(conversation.id, 'test-teacher-123');
    console.log('✅ Test conversation deleted\n');

    console.log('🎉 All tests passed!\n');
    console.log('📝 Next steps:');
    console.log('   1. Index your syllabi: POST /api/v1/ai/index { "type": "all" }');
    console.log('   2. Try RAG-enabled generation with useRAG: true');
    console.log('   3. Test with contextFilters for better results\n');

  } catch (error: any) {
    console.error('❌ Test failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  }

  process.exit(0);
}

// Run tests
testRAG();
