// app/api/priorities/route.ts
/**
 * Priorities API - Get and manage priority signals
 * 
 * GET: Returns current priority signals and stack-ranked stories
 * POST: Manual priority override from dashboard (syncs to Linear)
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { classifyPrioritySignal } from '@/lib/priority/classifier';
import { updateLinearTaskPriority, mapPriorityToLinear } from '@/lib/linear';

export const dynamic = 'force-dynamic';

// Single-user mode workspace ID
const SINGLE_USER_WORKSPACE_ID = '00000000-0000-0000-0000-000000000002';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const workspaceId = searchParams.get('workspaceId') || SINGLE_USER_WORKSPACE_ID;
  const projectId = searchParams.get('projectId');
  const page = parseInt(searchParams.get('page') || '1', 10);
  const limit = Math.min(parseInt(searchParams.get('limit') || '50', 10), 100);
  const skip = (page - 1) * limit;

  try {
    // Get total count for pagination
    const totalCount = await db.story.count({
      where: {
        project: {
          workspaceId,
          ...(projectId ? { id: projectId } : {}),
        },
        status: { in: ['pending', 'approved', 'in_progress'] },
      },
    });

    // Get priority level counts (for summary, regardless of pagination)
    const [p0Count, p1Count, p2Count, p3Count] = await Promise.all([
      db.story.count({
        where: {
          project: { workspaceId, ...(projectId ? { id: projectId } : {}) },
          status: { in: ['pending', 'approved', 'in_progress'] },
          priorityLevel: 'P0',
        },
      }),
      db.story.count({
        where: {
          project: { workspaceId, ...(projectId ? { id: projectId } : {}) },
          status: { in: ['pending', 'approved', 'in_progress'] },
          priorityLevel: 'P1',
        },
      }),
      db.story.count({
        where: {
          project: { workspaceId, ...(projectId ? { id: projectId } : {}) },
          status: { in: ['pending', 'approved', 'in_progress'] },
          priorityLevel: 'P2',
        },
      }),
      db.story.count({
        where: {
          project: { workspaceId, ...(projectId ? { id: projectId } : {}) },
          status: { in: ['pending', 'approved', 'in_progress'] },
          priorityLevel: 'P3',
        },
      }),
    ]);

    // Get active priority signals (not expired)
    const signals = await db.prioritySignal.findMany({
      where: {
        workspaceId,
        ...(projectId ? { projectId } : {}),
        OR: [
          { expiresAt: { gte: new Date() } },
          { expiresAt: null },
        ],
      },
      orderBy: [
        { createdAt: 'desc' },
      ],
      take: 50,
    });

    // Get paginated stack-ranked stories
    const stories = await db.story.findMany({
      where: {
        project: {
          workspaceId,
          ...(projectId ? { id: projectId } : {}),
        },
        status: { in: ['pending', 'approved', 'in_progress'] },
      },
      select: {
        id: true,
        title: true,
        rationale: true,
        projectId: true,
        status: true,
        priorityLevel: true,
        priorityScore: true,
        linearTaskId: true,
        linearIssueUrl: true,
        linearIdentifier: true,
        prUrl: true,
        createdAt: true,
        project: {
          select: { id: true, name: true },
        },
      },
      orderBy: [
        { priorityScore: 'desc' },
        { createdAt: 'asc' },
      ],
      skip,
      take: limit,
    });

    const totalPages = Math.ceil(totalCount / limit);

    return NextResponse.json({
      signals,
      stories,
      summary: {
        totalSignals: signals.length,
        totalStories: totalCount,
        p0Count,
        p1Count,
        p2Count,
        p3Count,
      },
      pagination: {
        page,
        limit,
        total: totalCount,
        totalPages,
        hasMore: page < totalPages,
      },
    });
  } catch (error) {
    console.error('[PrioritiesAPI] Error fetching priorities:', error);
    // Return graceful response with empty data for UI to handle
    return NextResponse.json({
      signals: [],
      stories: [],
      summary: {
        totalSignals: 0,
        totalStories: 0,
        p0Count: 0,
        p1Count: 0,
        p2Count: 0,
        p3Count: 0,
      },
      pagination: {
        page: 1,
        limit,
        total: 0,
        totalPages: 0,
        hasMore: false,
      },
      error: 'Database connection timeout - please refresh'
    });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { projectId, storyId, priorityLevel, source = 'dashboard' } = body;
    const workspaceId = body.workspaceId || SINGLE_USER_WORKSPACE_ID;

    // If storyId is provided, update story priority directly
    if (storyId) {
      const classified = await classifyPrioritySignal(
        priorityLevel ? `[${priorityLevel}] Manual override` : 'Manual priority change'
      );

      const updatedStory = await db.story.update({
        where: { id: storyId },
        data: {
          priorityLevel: priorityLevel || classified.priorityLevel,
          priorityScore: classified.priorityScore,
        },
      });

      // Also create a priority signal for audit trail
      await db.prioritySignal.create({
        data: {
          workspaceId,
          projectId: updatedStory.projectId,
          storyId,
          source,
          signalType: 'priority_set',
          priority: priorityLevel || classified.priorityLevel,
          rawText: `Manual priority set to ${priorityLevel} for story: ${updatedStory.title}`,
          confidence: 1.0,
          isExplicit: true,
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
        },
      });

      // Sync priority to Linear if task is linked
      let linearSynced = false;
      if (updatedStory.linearTaskId) {
        try {
          const linearPriority = mapPriorityToLinear(priorityLevel || classified.priorityLevel);
          await updateLinearTaskPriority(updatedStory.linearTaskId, linearPriority);
          linearSynced = true;
          console.log(`[PrioritiesAPI] Synced priority ${priorityLevel} to Linear task ${updatedStory.linearTaskId}`);
        } catch (linearError) {
          console.error('[PrioritiesAPI] Failed to sync priority to Linear:', linearError);
          // Don't fail the request if Linear sync fails
        }
      }

      return NextResponse.json({
        success: true,
        story: updatedStory,
        linearSynced,
      });
    }

    // Create a general priority signal
    const { rawContent } = body;
    if (!rawContent) {
      return NextResponse.json(
        { error: 'rawContent is required when not updating a story' },
        { status: 400 }
      );
    }

    const classified = await classifyPrioritySignal(rawContent);

    const signal = await db.prioritySignal.create({
      data: {
        workspaceId,
        projectId,
        source,
        signalType: 'priority_set',
        priority: classified.priorityLevel,
        rawText: rawContent,
        confidence: 0.8,
        isExplicit: false,
        expiresAt: new Date(Date.now() + 72 * 60 * 60 * 1000), // 72 hours
      },
    });

    return NextResponse.json({
      success: true,
      signal,
      classified,
    });
  } catch (error) {
    console.error('[PrioritiesAPI] Error creating priority:', error);
    return NextResponse.json(
      { error: 'Failed to create priority' },
      { status: 500 }
    );
  }
}
