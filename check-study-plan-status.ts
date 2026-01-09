import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkStudyPlans() {
  const messages = await prisma.conversationMessage.findMany({
    where: { messageType: 'study-plan' },
    select: {
      id: true,
      conversationId: true,
      studyPlanId: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'desc' }
  });
  
  console.log('\n📊 Study Plan Messages:');
  console.log('Total:', messages.length);
  messages.forEach(m => {
    console.log(`- ID: ${m.id}, ConvID: ${m.conversationId}, PlanID: ${m.studyPlanId}, Created: ${m.createdAt.toISOString()}`);
  });
  
  const plans = await prisma.studyPlan.findMany({
    select: {
      id: true,
      conversationId: true,
      subject: true,
      status: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'desc' }
  });
  
  console.log('\n📚 Study Plans:');
  console.log('Total:', plans.length);
  plans.forEach(p => {
    console.log(`- ID: ${p.id}, ConvID: ${p.conversationId}, Subject: ${p.subject}, Status: ${p.status}`);
  });
  
  await prisma.$disconnect();
}

checkStudyPlans().catch(console.error);
