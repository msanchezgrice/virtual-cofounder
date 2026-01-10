/**
 * Execution Queue Helper
 * 
 * Shared utilities for enqueuing stories for execution.
 * Used by Linear webhooks, Slack approvals, and Dashboard approvals.
 */

import { Queue } from 'bullmq';
import Redis from 'ioredis';
import { prisma } from '@/lib/db';

// Redis connection configuration
function getRedisConnection(): Redis {
  return new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    tls: process.env.REDIS_URL?.startsWith('rediss://') ? {} : undefined,
  });
}

// Priority number mapping
const PRIORITY_NUMBER: Record<string, number> = {
  P0: 1,
  P1: 2,
  P2: 3,
  P3: 4,
};

/**
 * Get numeric priority for queue ordering (lower = higher priority)
 */
export function getPriorityNumber(priority: string): number {
  return PRIORITY_NUMBER[priority] || 3; // Default to P2
}

/**
 * Enqueue a story for execution
 *
 * @param storyId - The story ID to execute
 * @param priority - Optional priority level (P0-P3), defaults to story's priority
 * @param source - Where the approval came from (linear, slack, dashboard, chat)
 * @returns The job ID if successful
 */
export async function enqueueStoryForExecution(
  storyId: string,
  priority?: string,
  source?: 'linear' | 'slack' | 'dashboard' | 'chat'
): Promise<string | null> {
  const connection = getRedisConnection();
  
  try {
    // Get the story to verify it exists and get default priority
    const story = await prisma.story.findUnique({
      where: { id: storyId },
      select: {
        id: true,
        status: true,
        priorityLevel: true,
        linearTaskId: true,
        projectId: true,
      },
    });

    if (!story) {
      console.error(`[ExecutionQueue] Story not found: ${storyId}`);
      return null;
    }

    // Don't re-enqueue if already in progress or completed
    if (story.status === 'in_progress' || story.status === 'completed') {
      console.log(`[ExecutionQueue] Story ${storyId} already ${story.status}, skipping`);
      return null;
    }

    // Use provided priority or fall back to story's priority
    const effectivePriority = priority || story.priorityLevel || 'P2';
    const priorityNumber = getPriorityNumber(effectivePriority);

    // Create the execution queue
    const executionQueue = new Queue('execution-queue', { connection });

    // Check if job already exists (idempotency)
    const existingJobs = await executionQueue.getJobs(['waiting', 'active', 'delayed']);
    const alreadyQueued = existingJobs.some(
      (job) => job.data.storyId === storyId
    );

    if (alreadyQueued) {
      console.log(`[ExecutionQueue] Story ${storyId} already in queue, skipping`);
      await executionQueue.close();
      return null;
    }

    // Add job to queue with priority
    const job = await executionQueue.add(
      'execute-story',
      {
        storyId,
        priority: effectivePriority,
        source: source || 'unknown',
        enqueuedAt: new Date().toISOString(),
      },
      {
        // BullMQ priority: lower number = higher priority
        priority: priorityNumber,
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 5000,
        },
        // Store metadata for tracking
        jobId: `story-${storyId}-${Date.now()}`,
      }
    );

    // Update story status to 'approved' or 'queued'
    await prisma.story.update({
      where: { id: storyId },
      data: {
        status: 'approved',
      },
    });

    console.log(
      `[ExecutionQueue] Enqueued story ${storyId} with priority ${effectivePriority} (${priorityNumber}) from ${source}`
    );

    await executionQueue.close();
    return job.id || null;

  } catch (error) {
    console.error('[ExecutionQueue] Error enqueuing story:', error);
    return null;
  } finally {
    await connection.quit();
  }
}

/**
 * Get queue status for monitoring
 */
export async function getQueueStatus(): Promise<{
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  jobs: Array<{
    id: string;
    storyId: string;
    priority: string;
    status: string;
    enqueuedAt: string;
  }>;
}> {
  const connection = getRedisConnection();
  
  try {
    const executionQueue = new Queue('execution-queue', { connection });

    const [waiting, active, completed, failed] = await Promise.all([
      executionQueue.getWaitingCount(),
      executionQueue.getActiveCount(),
      executionQueue.getCompletedCount(),
      executionQueue.getFailedCount(),
    ]);

    // Get details of waiting jobs
    const waitingJobs = await executionQueue.getJobs(['waiting', 'active']);
    const jobs = waitingJobs.map((job) => {
      const isActive = typeof job.isActive === 'function' ? job.isActive() : false;
      return {
        id: job.id || '',
        storyId: job.data.storyId,
        priority: job.data.priority || 'P2',
        status: isActive ? 'active' : 'waiting',
        enqueuedAt: job.data.enqueuedAt || String(job.timestamp || ''),
      };
    });

    await executionQueue.close();

    return {
      waiting,
      active,
      completed,
      failed,
      jobs: jobs.sort((a, b) => getPriorityNumber(a.priority) - getPriorityNumber(b.priority)),
    };

  } finally {
    await connection.quit();
  }
}

/**
 * Remove a story from the queue (for rejections)
 */
export async function removeFromQueue(storyId: string): Promise<boolean> {
  const connection = getRedisConnection();
  
  try {
    const executionQueue = new Queue('execution-queue', { connection });

    const jobs = await executionQueue.getJobs(['waiting', 'delayed']);
    const jobToRemove = jobs.find((job) => job.data.storyId === storyId);

    if (jobToRemove) {
      await jobToRemove.remove();
      console.log(`[ExecutionQueue] Removed story ${storyId} from queue`);
      await executionQueue.close();
      return true;
    }

    await executionQueue.close();
    return false;

  } finally {
    await connection.quit();
  }
}
