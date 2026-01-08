// app/api/priorities/route.ts
/**
 * Priorities API - Get and manage priority signals
 * 
 * GET: Returns current priority signals and stack-ranked stories
 * POST: Manual priority override from dashboard
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { classifyPrioritySignal } from '@/lib/priority/classifier';

export const dynamic = 'force-dynamic';

// Single-user mode workspace ID
const SINGLE_USER_WORKSPACE_ID = '00000000-0000-0000-0000-000000000002';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const workspaceId = searchParams.get('workspaceId') || SINGLE_USER_WORKSPACE_ID;
  const projectId = searchParams.get('projectId');

  try {
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

    // Get stack-ranked stories
    const stories = await db.story.findMany({
      where: {
        project: {
          workspaceId,
          ...(projectId ? { id: projectId } : {}),
        },
        status: { in: ['pending', 'approved', 'in_progress'] },
      },
      include: {
        project: {
          select: { id: true, name: true },
        },
      },
      orderBy: [
        { priorityScore: 'desc' },
        { createdAt: 'asc' },
      ],
      take: 100,
    });

    // Group by priority level
    const byPriority = {
      P0: stories.filter(s => s.priorityLevel === 'P0'),
      P1: stories.filter(s => s.priorityLevel === 'P1'),
      P2: stories.filter(s => s.priorityLevel === 'P2'),
      P3: stories.filter(s => s.priorityLevel === 'P3'),
    };

    return NextResponse.json({
      signals,
      stories,
      byPriority,
      summary: {
        totalSignals: signals.length,
        totalStories: stories.length,
        p0Count: byPriority.P0.length,
        p1Count: byPriority.P1.length,
        p2Count: byPriority.P2.length,
        p3Count: byPriority.P3.length,
      },
    });
  } catch (error) {
    console.error('[PrioritiesAPI] Error fetching priorities:', error);
    return NextResponse.json(
      { error: 'Failed to fetch priorities' },
      { status: 500 }
    );
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

      return NextResponse.json({
        success: true,
        story: updatedStory,
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
