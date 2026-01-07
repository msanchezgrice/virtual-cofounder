// API route to run the Head of Product orchestrator
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { type ScanContext } from '@/lib/orchestrator';
import { Queue } from 'bullmq';
import Redis from 'ioredis';
import { randomUUID } from 'crypto';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Redis connection for BullMQ
const connection = new Redis(
  process.env.REDIS_URL || 'redis://localhost:6379',
  {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    tls: process.env.REDIS_URL?.startsWith('rediss://') ? {} : undefined,
  }
);

// Create orchestrator queue
const orchestratorQueue = new Queue('orchestrator', { connection });

export async function POST(request: Request) {
  try {
    const workspaceId = process.env.WORKSPACE_ID;
    if (!workspaceId) {
      return NextResponse.json(
        { error: 'WORKSPACE_ID not configured' },
        { status: 500 }
      );
    }

    console.log('[Orchestrator] Starting orchestrator run...');

    // 1. Fetch recent scan results from database (last 24 hours)
    const cutoffTime = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const projects = await db.project.findMany({
      where: {
        workspaceId,
        status: {
          contains: 'ACTIVE', // Only active projects
        },
      },
      include: {
        scans: {
          where: {
            scannedAt: {
              gte: cutoffTime,
            },
          },
          orderBy: {
            scannedAt: 'desc',
          },
        },
      },
    });

    console.log(`[Orchestrator] Found ${projects.length} active projects with recent scans`);

    // 2. Build scan contexts for orchestrator
    const scanContexts: ScanContext[] = projects
      .filter(project => project.scans.length > 0) // Only projects with scans
      .map(project => {
        // Group scans by type (take most recent of each type)
        const scansByType = project.scans.reduce((acc, scan) => {
          if (!acc[scan.scanType] || scan.scannedAt > acc[scan.scanType].scannedAt) {
            acc[scan.scanType] = scan;
          }
          return acc;
        }, {} as Record<string, typeof project.scans[0]>);

        return {
          project: {
            id: project.id,
            name: project.name,
            domain: project.domain,
            status: project.status,
          },
          scans: {
            domain: scansByType.domain ? {
              status: scansByType.domain.status,
              data: scansByType.domain.domainData,
            } : undefined,
            seo: scansByType.seo ? {
              status: scansByType.seo.status,
              detail: scansByType.seo.seoDetail,
            } : undefined,
            analytics: scansByType.analytics ? {
              status: scansByType.analytics.status,
              data: scansByType.analytics.analyticsData,
            } : undefined,
          },
        };
      });

    if (scanContexts.length === 0) {
      return NextResponse.json({
        success: false,
        message: 'No projects with recent scans found',
        run_id: null,
        findings_count: 0,
        stories_count: 0,
      });
    }

    console.log(`[Orchestrator] Queueing ${scanContexts.length} projects for background processing`);

    // 3. Create orchestrator run record
    const runId = randomUUID();
    const orchestratorRun = await db.orchestratorRun.create({
      data: {
        runId,
        status: 'in_progress',
        findingsCount: 0,
        storiesCount: 0,
        conversation: [],
      },
    });

    // 4. Queue jobs for each project (background processing via worker)
    const jobPromises = scanContexts.map((scanContext, index) =>
      orchestratorQueue.add(
        'analyze-project',
        {
          projectId: scanContext.project.id,
          scanContext,
          runId,
          workspaceId,
        },
        {
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 5000,
          },
          // Stagger job starts to avoid overwhelming the worker
          delay: index * 2000, // 2 seconds between each job start
        }
      )
    );

    await Promise.all(jobPromises);

    console.log(`[Orchestrator] Queued ${scanContexts.length} projects for analysis (run: ${runId})`);

    // 5. Return immediately (worker will process in background)
    return NextResponse.json({
      success: true,
      run_id: runId,
      message: `Queued ${scanContexts.length} projects for background analysis`,
      projects_queued: scanContexts.length,
      status: 'processing',
    });

  } catch (error) {
    console.error('[Orchestrator] Error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
