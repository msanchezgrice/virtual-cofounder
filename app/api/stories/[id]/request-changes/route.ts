// app/api/stories/[id]/request-changes/route.ts
/**
 * Request Changes on Story Endpoint
 * 
 * Requests changes/feedback on a story without fully rejecting it.
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { sendMessage } from '@/lib/slack';
import { addLinearComment } from '@/lib/linear';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function POST(
  request: NextRequest,
  { params }: RouteParams
) {
  try {
    const { id: storyId } = await params;
    const body = await request.json();
    const { source = 'dashboard', feedback } = body;

    if (!feedback) {
      return NextResponse.json(
        { error: 'feedback is required' },
        { status: 400 }
      );
    }

    // Find the story with project
    const story = await db.story.findUnique({
      where: { id: storyId },
      include: {
        project: {
          select: {
            id: true,
            name: true,
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

    // Update story status to pending (needs revision)
    const updatedStory = await db.story.update({
      where: { id: storyId },
      data: {
        status: 'pending',
        userApproved: false,
        userNotes: `Changes requested: ${feedback}`,
      },
    });

    // Send Slack notification
    await sendMessage(
      `🔄 Changes requested (via ${source}) for: "${story.title}"\n` +
      `Feedback: ${feedback}\n` +
      `Orchestrator will re-analyze...`
    );

    // Add Linear comment
    if (story.linearTaskId) {
      await addLinearComment(
        story.linearTaskId,
        `🔄 Changes requested via ${source}.\n\nFeedback:\n${feedback}`
      );
    }

    return NextResponse.json({
      success: true,
      story: updatedStory,
      message: `Changes requested for "${story.title}"`,
    });
  } catch (error) {
    console.error('[RequestChanges] Error:', error);
    return NextResponse.json(
      { error: 'Failed to request changes' },
      { status: 500 }
    );
  }
}
