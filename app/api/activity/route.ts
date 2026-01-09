/**
 * Activity API - Aggregated activity feed
 * 
 * Returns all activity types in a single request:
 * - Orchestrator runs
 * - Scans
 * - Story completions
 * - Slack messages
 * 
 * This replaces 4 separate API calls on the history page.
 */

import { NextRequest, NextResponse } from 'next/server';
import { db, prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

const SINGLE_USER_WORKSPACE_ID = '00000000-0000-0000-0000-000000000002';

type ActivityType = 'orchestrator' | 'scan' | 'completion' | 'pr_merged' | 'message';

interface ActivityItem {
  id: string;
  type: ActivityType;
  title: string;
  description: string;
  project?: string;
  projectId?: string;
  timestamp: string;
  metadata?: Record<string, unknown>;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    
    // Pagination
    const page = parseInt(searchParams.get('page') || '1');
    const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 100);
    
    // Filters
    const activityType = searchParams.get('type');
    const projectId = searchParams.get('projectId');
    const days = parseInt(searchParams.get('days') || '30'); // Default last 30 days
    
    const sinceDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    
    // Fetch all activity types in parallel
    const [orchestratorRuns, scans, stories, projects] = await Promise.all([
      // Orchestrator runs (no filter by type if not 'orchestrator')
      (!activityType || activityType === 'orchestrator') 
        ? db.orchestratorRun.findMany({
            where: {
              startedAt: { gte: sinceDate },
            },
            select: {
              id: true,
              runId: true,
              status: true,
              findingsCount: true,
              storiesCount: true,
              startedAt: true,
              completedAt: true,
            },
            orderBy: { startedAt: 'desc' },
            take: 20,
          })
        : [],
      
      // Scans
      (!activityType || activityType === 'scan')
        ? prisma.scan.findMany({
            where: {
              workspaceId: SINGLE_USER_WORKSPACE_ID,
              scannedAt: { gte: sinceDate },
              ...(projectId ? { projectId } : {}),
            },
            select: {
              id: true,
              scanType: true,
              status: true,
              scannedAt: true,
              project: {
                select: { id: true, name: true },
              },
            },
            orderBy: { scannedAt: 'desc' },
            take: 30,
          })
        : [],
      
      // Stories (completions and PR merged)
      (!activityType || activityType === 'completion' || activityType === 'pr_merged')
        ? db.story.findMany({
            where: {
              project: { workspaceId: SINGLE_USER_WORKSPACE_ID },
              status: { in: ['completed', 'in_progress'] },
              createdAt: { gte: sinceDate },
              ...(projectId ? { projectId } : {}),
            },
            select: {
              id: true,
              title: true,
              status: true,
              prUrl: true,
              createdAt: true,
              executedAt: true,
              project: {
                select: { id: true, name: true },
              },
            },
            orderBy: { createdAt: 'desc' },
            take: 30,
          })
        : [],
      
      // Get projects for reference
      db.project.findMany({
        where: { workspaceId: SINGLE_USER_WORKSPACE_ID },
        select: { id: true, name: true },
      }),
    ]);

    // Build unified activity list
    const activities: ActivityItem[] = [];

    // Add orchestrator runs
    orchestratorRuns.forEach((run) => {
      activities.push({
        id: `orch-${run.id}`,
        type: 'orchestrator',
        title: 'Orchestrator Run',
        description: `${run.storiesCount} stories created, ${run.findingsCount} findings`,
        timestamp: run.startedAt.toISOString(),
        metadata: {
          status: run.status,
          runId: run.runId,
        },
      });
    });

    // Add scans
    scans.forEach((scan) => {
      const scanTypeName = scan.scanType.charAt(0).toUpperCase() + scan.scanType.slice(1);
      activities.push({
        id: `scan-${scan.id}`,
        type: 'scan',
        title: `${scanTypeName} Scan`,
        description: scan.project.name,
        project: scan.project.name,
        projectId: scan.project.id,
        timestamp: scan.scannedAt.toISOString(),
        metadata: {
          status: scan.status,
          scanType: scan.scanType,
        },
      });
    });

    // Add stories/completions
    stories.forEach((story) => {
      const hasPr = !!story.prUrl;
      activities.push({
        id: `story-${story.id}`,
        type: hasPr ? 'pr_merged' : 'completion',
        title: hasPr ? 'PR Created' : 'Work Completed',
        description: story.title,
        project: story.project.name,
        projectId: story.project.id,
        timestamp: (story.executedAt || story.createdAt).toISOString(),
        metadata: {
          status: story.status,
          prUrl: story.prUrl,
        },
      });
    });

    // Sort by timestamp (newest first)
    activities.sort((a, b) => 
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );

    // Apply pagination
    const total = activities.length;
    const paginatedActivities = activities.slice((page - 1) * limit, page * limit);
    const totalPages = Math.ceil(total / limit);

    return NextResponse.json({
      activities: paginatedActivities,
      projects: projects.map(p => ({ id: p.id, name: p.name })),
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasMore: page < totalPages,
      },
      _meta: {
        generatedAt: new Date().toISOString(),
        ttlSeconds: 120,
      },
    });
  } catch (error) {
    console.error('[Activity] Error:', error);
    return NextResponse.json({
      activities: [],
      projects: [],
      pagination: {
        page: 1,
        limit: 50,
        total: 0,
        totalPages: 0,
        hasMore: false,
      },
      error: 'Failed to load activity',
    });
  }
}
