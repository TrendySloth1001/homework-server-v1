import 'dotenv/config';
import { cacheService } from './src/shared/lib/cache';

async function clearCache() {
  try {
    console.log('Clearing conversation cache...');
    
    // Clear all conversation cache keys
    const result = await cacheService.deletePattern('conversation:*');
    console.log(`✅ Cleared ${result} cache keys!`);
    
    process.exit(0);
  } catch (error) {
    console.error('Error clearing cache:', error);
    process.exit(1);
  }
}

clearCache();
