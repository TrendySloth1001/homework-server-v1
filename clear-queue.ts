import 'dotenv/config';
import { Queue } from 'bullmq';
import IORedis from 'ioredis';

async function clearQueue() {
  // Use the same Redis URL as the server
  const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
  const connection = new IORedis(redisUrl, {
    maxRetriesPerRequest: null,
  });

  const aiQueue = new Queue('ai-generation', { connection: connection as any });

  try {
    console.log('Clearing AI queue...');
    
    // Get counts before
    const waiting = await aiQueue.getWaitingCount();
    const active = await aiQueue.getActiveCount();
    const delayed = await aiQueue.getDelayedCount();
    const failed = await aiQueue.getFailedCount();
    
    console.log(`Before: Waiting: ${waiting}, Active: ${active}, Delayed: ${delayed}, Failed: ${failed}`);
    
    // Clean all jobs
    await aiQueue.drain(); // Remove all waiting jobs
    await aiQueue.clean(0, 100, 'completed'); // Remove completed
    await aiQueue.clean(0, 100, 'failed'); // Remove failed
    
    console.log('✅ Queue cleared!');
    
    await connection.quit();
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

clearQueue();
