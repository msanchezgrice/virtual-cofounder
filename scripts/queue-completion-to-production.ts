// Queue a story to production Redis for the Railway worker to pick up
import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(__dirname, '../.env.local') });

import { Queue } from 'bullmq';
import Redis from 'ioredis';

async function queueStoryToProduction(storyId: string) {
  console.log('🚀 Queuing story to production Redis...');
  console.log(`   Story ID: ${storyId}`);
  console.log(`   Redis: ${process.env.REDIS_URL?.substring(0, 30)}...`);
  console.log('');

  // Connect to production Redis (Upstash)
  const connection = new Redis(process.env.REDIS_URL!, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    tls: process.env.REDIS_URL?.startsWith('rediss://') ? {} : undefined,
  });

  // Create execution queue
  const executionQueue = new Queue('execution-queue', { connection });

  // Add job to queue
  const job = await executionQueue.add(
    'execute-story',
    { storyId },
    {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 5000,
      },
    }
  );

  console.log('✅ Job added to production queue');
  console.log(`   Job ID: ${job.id}`);
  console.log(`   Queue: execution-queue`);
  console.log('');
  console.log('⏳ Railway execution worker should pick this up within seconds...');
  console.log('   Monitor logs: railway logs --service elegant-fulfillment');

  await executionQueue.close();
  await connection.quit();
}

const storyId = process.argv[2] || '8a3dfa85-c37b-4ba0-aa0c-3d06b6c3f409';
queueStoryToProduction(storyId)
  .then(() => process.exit(0))
  .catch((e) => {
    console.error('❌ Failed to queue story:', e);
    process.exit(1);
  });
