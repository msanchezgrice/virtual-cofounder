// app/api/stories/[id]/approve/route.ts
/**
 * Approve Story Endpoint
 * 
 * Approves a story and enqueues it for execution.
 * Supports approval from Dashboard, Slack, or Linear status change.
 */

import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
import { db } from '@/lib/db';
import { enqueueStoryForExecution } from '@/lib/queue/execution';
import { sendMessage } from '@/lib/slack';
import { addLinearComment, updateLinearTaskStatus, getTeamWorkflowStates } from '@/lib/linear';
import { featureFlags } from '@/lib/config/feature-flags';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function POST(
  request: NextRequest,
  { params }: RouteParams
) {
  try {
    const { id: storyId } = await params;
    const body = await request.json().catch(() => ({}));
    const { source = 'dashboard', userId } = body;

    // Find the story with project
    const story = await db.story.findUnique({
      where: { id: storyId },
      include: {
        project: {
          select: {
            id: true,
            name: true,
            linearTeamId: true,
          },
        },
      },
    });

    if (!story) {
      return NextResponse.json(
        { error: 'Story not found' },
        { status: 404 }
      );
    }

    // Check if story can be approved
    if (!['pending', 'draft'].includes(story.status)) {
      return NextResponse.json(
        { error: `Cannot approve story with status: ${story.status}` },
        { status: 400 }
      );
    }

    // Update story status to approved
    const updatedStory = await db.story.update({
      where: { id: storyId },
      data: {
        status: 'approved',
        userApproved: true,
        userNotes: `Approved via ${source} by ${userId || 'user'}`,
      },
    });

    // Enqueue for execution
    const priorityLevel = story.priorityLevel || 'P2';
    await enqueueStoryForExecution(storyId, priorityLevel);

    // Send Slack notification
    await sendMessage(
      `✅ Story approved (via ${source}): "${story.title}"\n` +
      `Priority: ${priorityLevel}\n` +
      `Agent will begin work shortly...`
    );

    // Sync to Linear if task is linked
    const DEFAULT_LINEAR_TEAM_ID = 'd5cbb99d-df57-4b21-87c9-95fc5089a6a2'; // Virtual cofounder team
    if (story.linearTaskId) {
      try {
        // Update status to Todo (ready for execution)
        const teamId = story.project.linearTeamId || DEFAULT_LINEAR_TEAM_ID;
        const states = await getTeamWorkflowStates(teamId);
        const todoState = states.find(s => s.type === 'unstarted' && s.name.toLowerCase().includes('todo'));
        if (todoState) {
          await updateLinearTaskStatus(story.linearTaskId, todoState.id);
          console.log(`[ApproveStory] Updated Linear ${story.linearTaskId} to Todo`);
        }
        // Add comment
        await addLinearComment(
          story.linearTaskId,
          `✅ Story approved via ${source}. Agent execution queued.`
        );
      } catch (linearError) {
        console.error('[ApproveStory] Failed to sync Linear:', linearError);
      }
    }

    // Create priority signal for audit
    if (featureFlags.PRIORITY_SYSTEM_ENABLED) {
      await db.prioritySignal.create({
        data: {
          workspaceId: story.workspaceId,
          projectId: story.projectId,
          storyId,
          source,
          signalType: 'approval',
          priority: priorityLevel,
          rawText: `Story approved: ${story.title}`,
          confidence: 1.0,
          isExplicit: true,
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
        },
      });
    }

    return NextResponse.json({
      success: true,
      story: updatedStory,
      message: `Story "${story.title}" approved and queued for execution`,
    });
  } catch (error) {
    console.error('[ApproveStory] Error:', error);
    return NextResponse.json(
      { error: 'Failed to approve story' },
      { status: 500 }
    );
  }
}
