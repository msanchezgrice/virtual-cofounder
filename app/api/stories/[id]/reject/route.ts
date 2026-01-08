// app/api/stories/[id]/reject/route.ts
/**
 * Reject Story Endpoint
 * 
 * Rejects a story with optional feedback.
 */

import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
import { db } from '@/lib/db';
import { sendMessage } from '@/lib/slack';
import { addLinearComment, updateLinearTaskStatus, getTeamWorkflowStates } from '@/lib/linear';

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
    const { source = 'dashboard', reason } = body;

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

    // Update story status to rejected
    const updatedStory = await db.story.update({
      where: { id: storyId },
      data: {
        status: 'rejected',
        userApproved: false,
        userNotes: reason || 'Rejected by user',
      },
    });

    // Send Slack notification
    await sendMessage(
      `❌ Story rejected (via ${source}): "${story.title}"\n` +
      (reason ? `Reason: ${reason}` : '')
    );

    // Update Linear task status
    if (story.linearTaskId) {
      try {
        const linearTeamId = story.project?.linearTeamId;
        if (linearTeamId) {
          const states = await getTeamWorkflowStates(linearTeamId);
          const canceledState = states.find(s => 
            s.type.toLowerCase() === 'canceled' || s.name.toLowerCase().includes('rejected')
          );
          
          if (canceledState) {
            await updateLinearTaskStatus(story.linearTaskId, canceledState.id);
          }
        }

        await addLinearComment(
          story.linearTaskId,
          `❌ Story rejected via ${source}.${reason ? `\nReason: ${reason}` : ''}`
        );
      } catch (linearError) {
        console.error('[RejectStory] Linear update error:', linearError);
      }
    }

    return NextResponse.json({
      success: true,
      story: updatedStory,
      message: `Story "${story.title}" rejected`,
    });
  } catch (error) {
    console.error('[RejectStory] Error:', error);
    return NextResponse.json(
      { error: 'Failed to reject story' },
      { status: 500 }
    );
  }
}
