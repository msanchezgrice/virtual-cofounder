import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { PrismaClient } from '@prisma/client';
import { Queue } from 'bullmq';
import Redis from 'ioredis';

const db = new PrismaClient();

// Redis connection for BullMQ
const connection = new Redis(
  process.env.REDIS_URL || 'redis://localhost:6379',
  {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    tls: (process.env.REDIS_URL || '').startsWith('rediss://') ? {} : undefined,
  }
);

const scanQueue = new Queue('scans', { connection });

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const projectId = params.id;

    // Get project and workspace
    const project = await db.project.findUnique({
      where: { id: projectId }
    });

    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    // Get workspace to verify ownership
    const workspace = await db.workspace.findUnique({
      where: { id: project.workspaceId }
    });

    if (!workspace || workspace.ownerUserId !== userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    // Queue all scan types for this project
    const scanTypes = ['domain', 'seo', 'analytics', 'vercel', 'performance', 'screenshot', 'npm_audit', 'secrets'];
    const queuedScans = [];

    for (const scanType of scanTypes) {
      // Skip npm_audit and secrets if no repo
      if ((scanType === 'npm_audit' || scanType === 'secrets') && !project.repo) {
        continue;
      }

      const job = await scanQueue.add('scan-job', {
        projectId: project.id,
        projectName: project.name,
        domain: project.domain,
        repo: project.repo,
        scanType,
        workspaceId: project.workspaceId,
      }, {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 5000,
        }
      });

      queuedScans.push({
        scanType,
        jobId: job.id
      });
    }

    return NextResponse.json({
      success: true,
      message: `Queued ${queuedScans.length} scans for ${project.name}`,
      scans: queuedScans
    });

  } catch (error) {
    console.error('Error triggering scans:', error);
    return NextResponse.json(
      { error: 'Failed to trigger scans' },
      { status: 500 }
    );
  }
}
