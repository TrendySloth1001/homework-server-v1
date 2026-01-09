const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function check() {
  try {
    const messages = await prisma.conversationMessage.findMany({
      where: { conversationId: 'cmk5pzwxe0000t1v3k33i4qa9' },
      orderBy: { sequenceNumber: 'asc' },
      select: {
        id: true,
        role: true,
        messageType: true,
        quizSessionId: true,
        studyPlanId: true,
        sequenceNumber: true,
        content: true
      }
    });
    
    console.log('Total messages:', messages.length);
    console.log('\nMessage details:');
    messages.forEach(m => {
      console.log(`\nID: ${m.id}`);
      console.log(`  Role: ${m.role}`);
      console.log(`  Type: ${m.messageType}`);
      console.log(`  StudyPlanId: ${m.studyPlanId || 'NULL'}`);
      console.log(`  QuizSessionId: ${m.quizSessionId || 'NULL'}`);
      console.log(`  Content preview: ${m.content.substring(0, 50)}...`);
    });
    
    // Also check StudyPlan table
    console.log('\n\n=== StudyPlan Table ===');
    const plans = await prisma.studyPlan.findMany({
      where: { conversationId: 'cmk5pzwxe0000t1v3k33i4qa9' },
      select: {
        id: true,
        subject: true,
        learningGoal: true,
        status: true,
        createdAt: true
      }
    });
    
    console.log('Total study plans:', plans.length);
    plans.forEach(p => {
      console.log(`\nPlan ID: ${p.id}`);
      console.log(`  Subject: ${p.subject}`);
      console.log(`  Goal: ${p.learningGoal}`);
      console.log(`  Status: ${p.status}`);
      console.log(`  Created: ${p.createdAt}`);
    });
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

check();
