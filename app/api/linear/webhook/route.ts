/**
 * Linear Webhook Handler
 *
 * Handles incoming webhook events from Linear for task status changes.
 * Key features:
 * - Status changes trigger story updates
 * - "In Progress" status triggers execution queue (with MULTI_SOURCE_APPROVAL flag)
 * - Comments are captured as priority signals
 */

import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
import { db as prisma } from '@/lib/db';
import crypto from 'crypto';
import { featureFlags } from '@/lib/config/feature-flags';
import { enqueueStoryForExecution } from '@/lib/queue/execution';
import { processPrioritySignal } from '@/lib/priority/classifier';

interface LinearWebhookPayload {
  action: string;
  type: string;
  data: {
    id: string;
    title?: string;
    body?: string; // For comments
    state?: {
      id: string;
      name: string;
      type: string;
    };
    identifier?: string;
    issue?: {
      id: string;
      identifier: string;
    };
    user?: {
      id: string;
      name: string;
    };
  };
  updatedFrom?: {
    stateId?: string;
  };
}

/**
 * Handle Linear comments as priority signals
 */
async function handleLinearComment(payload: LinearWebhookPayload): Promise<void> {
  const commentBody = payload.data.body;
  const issueId = payload.data.issue?.id;
  
  if (!commentBody || !issueId) {
    console.log('[LinearWebhook] Comment missing body or issue ID');
    return;
  }

  // Find the story for this Linear issue
  const story = await prisma.story.findFirst({
    where: { linearTaskId: issueId },
    include: {
      project: {
        select: { workspaceId: true },
      },
    },
  });

  if (!story) {
    console.log(`[LinearWebhook] No story found for Linear issue: ${issueId}`);
    return;
  }

  // Process the comment as a priority signal
  try {
    const result = await processPrioritySignal({
      source: 'linear',
      signalType: 'llm_classified',
      rawContent: commentBody,
      workspaceId: story.project.workspaceId,
      projectId: story.projectId,
      metadata: {
        linear_issue_id: issueId,
        linear_comment_id: payload.data.id,
        linear_user: payload.data.user?.name,
        story_id: story.id,
      },
    });

    console.log(
      `[LinearWebhook] Processed comment as signal: ${result.classification.priorityLevel} (${result.classification.priorityScore})`
    );

    // Update story priority if signal is stronger
    if (
      result.classification.priorityScore >
      (story.priorityScore || 50)
    ) {
      await prisma.story.update({
        where: { id: story.id },
        data: {
          priorityLevel: result.classification.priorityLevel,
          priorityScore: result.classification.priorityScore,
        },
      });
      
      console.log(
        `[LinearWebhook] Updated story ${story.id} priority to ${result.classification.priorityLevel}`
      );
    }
  } catch (error) {
    console.error('[LinearWebhook] Error processing comment:', error);
  }
}

/**
 * Verify Linear webhook signature
 */
function verifySignature(payload: string, signature: string): boolean {
  const webhookSecret = process.env.LINEAR_WEBHOOK_SECRET;

  if (!webhookSecret) {
    console.error('LINEAR_WEBHOOK_SECRET not configured');
    return false;
  }

  const hmac = crypto.createHmac('sha256', webhookSecret);
  const digest = hmac.update(payload).digest('hex');

  return digest === signature;
}

/**
 * Map Linear state type to completion status
 */
function mapLinearStateToStatus(stateType: string): string {
  switch (stateType.toLowerCase()) {
    case 'started':
      return 'in_progress';
    case 'completed':
      return 'completed';
    case 'canceled':
      return 'failed';
    default:
      return 'pending';
  }
}

/**
 * Handle Linear webhook events
 */
export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.text();
    const signature = request.headers.get('linear-signature') || '';

    // Verify webhook signature
    if (!verifySignature(rawBody, signature)) {
      console.error('Invalid webhook signature');
      return NextResponse.json(
        { error: 'Invalid signature' },
        { status: 401 }
      );
    }

    const payload: LinearWebhookPayload = JSON.parse(rawBody);

    // Handle issue update events
    if (payload.type === 'Issue' && payload.action === 'update') {
      const linearTaskId = payload.data.id;
      const newState = payload.data.state;

      if (!newState || !payload.updatedFrom?.stateId) {
        // State didn't change, ignore
        return NextResponse.json({ received: true });
      }

      // Find story with this Linear task ID
      const story = await prisma.story.findFirst({
        where: {
          linearTaskId,
        },
      });

      if (!story) {
        console.log(`No story found for Linear task: ${linearTaskId}`);
        return NextResponse.json({ received: true });
      }

      // Map Linear state to story status
      const newStatus = mapLinearStateToStatus(newState.type);

      // Update story status
      await prisma.story.update({
        where: {
          id: story.id,
        },
        data: {
          status: newStatus,
        },
      });

      console.log(
        `Updated story ${story.id} status to ${newStatus} (Linear: ${newState.name})`
      );

      // If status changed to "in_progress" and multi-source approval is enabled,
      // enqueue the story for execution
      if (
        newStatus === 'in_progress' &&
        featureFlags.MULTI_SOURCE_APPROVAL
      ) {
        const jobId = await enqueueStoryForExecution(
          story.id,
          story.priorityLevel || 'P2',
          'linear'
        );
        
        if (jobId) {
          console.log(
            `Enqueued story ${story.id} for execution (job: ${jobId}) from Linear status change`
          );
        }
      }

      return NextResponse.json({
        success: true,
        storyId: story.id,
        status: newStatus,
        enqueued: newStatus === 'in_progress' && featureFlags.MULTI_SOURCE_APPROVAL,
      });
    }

    // Handle Linear comments - capture as priority signals
    if (payload.type === 'Comment' && payload.action === 'create') {
      await handleLinearComment(payload);
      return NextResponse.json({ received: true, processed: 'comment' });
    }

    // Handle other event types
    return NextResponse.json({ received: true });
  } catch (error) {
    console.error('Error processing Linear webhook:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * Health check endpoint
 */
export async function GET() {
  return NextResponse.json({
    status: 'ok',
    webhook: 'linear',
  });
}
