import { NextRequest, NextResponse } from 'next/server';
import { Queue } from 'bullmq';
import { db } from '@/lib/db';
import Redis from 'ioredis';

// Lazy initialization of Redis connection and queue
let connection: Redis | null = null;
let scanQueue: Queue | null = null;

function getQueue() {
  if (!connection) {
    // Initialize Redis connection for BullMQ
    // For Upstash: rediss://default:PASSWORD@HOST:6379
    // For local dev: redis://localhost:6379
    const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

    connection = new Redis(redisUrl, {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
      // TLS required for Upstash (rediss://)
      tls: redisUrl.startsWith('rediss://') ? {} : undefined,
      retryStrategy: (times) => {
        const delay = Math.min(times * 50, 2000);
        return delay;
      }
    });
  }

  if (!scanQueue) {
    scanQueue = new Queue('scans', { connection });
  }

  return scanQueue;
}

export async function POST(req: NextRequest) {
  try {
    const workspaceId = process.env.WORKSPACE_ID || '00000000-0000-0000-0000-000000000002';

    // Get all active projects for the workspace
    const projects = await db.project.findMany({
      where: {
        workspaceId,
        status: {
          contains: 'ACTIVE'
        }
      },
      select: {
        id: true,
        name: true,
        domain: true
      }
    });

    if (projects.length === 0) {
      return NextResponse.json({
        status: 'success',
        message: 'No active projects found',
        jobs: []
      });
    }

    // Enqueue scan jobs for each project
    const jobs = [];
    const scanTypes = ['domain', 'seo', 'analytics'];

    for (const project of projects) {
      // Skip projects without domains
      if (!project.domain) {
        continue;
      }

      for (const scanType of scanTypes) {
        const queue = getQueue();
        const job = await queue.add(
          `scan-${scanType}`,
          {
            projectId: project.id,
            projectName: project.name,
            domain: project.domain,
            scanType,
            workspaceId
          },
          {
            jobId: `${project.id}-${scanType}-${Date.now()}`,
            attempts: 3,
            backoff: {
              type: 'exponential',
              delay: 2000
            }
          }
        );

        jobs.push({
          jobId: job.id,
          projectId: project.id,
          projectName: project.name,
          scanType,
          status: 'queued'
        });
      }
    }

    // Update last_scanned_at for all projects
    await db.project.updateMany({
      where: {
        id: {
          in: projects.map(p => p.id)
        }
      },
      data: {
        lastScannedAt: new Date()
      }
    });

    return NextResponse.json({
      status: 'success',
      message: `Enqueued ${jobs.length} scan jobs for ${projects.length} projects`,
      projects: projects.length,
      jobs: jobs.length,
      jobDetails: jobs
    });

  } catch (error) {
    console.error('Error triggering scans:', error);

    return NextResponse.json(
      {
        status: 'error',
        message: error instanceof Error ? error.message : 'Unknown error',
        jobs: []
      },
      { status: 500 }
    );
  }
}
