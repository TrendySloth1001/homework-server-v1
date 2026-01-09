import 'dotenv/config';
import { prisma } from './src/shared/lib/prisma';

async function cleanupDuplicates() {
  try {
    console.log('Finding duplicate study plan messages...');
    
    // Get all study plan messages grouped by studyPlanId
    const messages = await prisma.conversationMessage.findMany({
      where: {
        messageType: 'study-plan',
        studyPlanId: { not: null }
      },
      orderBy: [
        { studyPlanId: 'asc' },
        { createdAt: 'asc' }
      ]
    });
    
    console.log(`Found ${messages.length} study plan messages`);
    
    // Group by studyPlanId and keep only the first one
    const grouped = new Map();
    const toDelete = [];
    
    for (const msg of messages) {
      if (!grouped.has(msg.studyPlanId)) {
        grouped.set(msg.studyPlanId, msg);
        console.log(`Keeping message ${msg.id} for plan ${msg.studyPlanId}`);
      } else {
        toDelete.push(msg.id);
        console.log(`Marking message ${msg.id} for deletion (duplicate of plan ${msg.studyPlanId})`);
      }
    }
    
    if (toDelete.length > 0) {
      console.log(`\nDeleting ${toDelete.length} duplicate messages...`);
      await prisma.conversationMessage.deleteMany({
        where: {
          id: { in: toDelete }
        }
      });
      console.log('✅ Cleanup complete!');
    } else {
      console.log('✅ No duplicates found!');
    }
    
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

cleanupDuplicates();
