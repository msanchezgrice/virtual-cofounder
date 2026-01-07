/**
 * Linear Webhook Handler
 *
 * Handles incoming webhook events from Linear for task status changes
 */

import { NextRequest, NextResponse } from 'next/server';
import { db as prisma } from '@/lib/db';
import crypto from 'crypto';

interface LinearWebhookPayload {
  action: string;
  type: string;
  data: {
    id: string;
    title?: string;
    state?: {
      id: string;
      name: string;
      type: string;
    };
    identifier?: string;
  };
  updatedFrom?: {
    stateId?: string;
  };
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

      return NextResponse.json({
        success: true,
        storyId: story.id,
        status: newStatus,
      });
    }

    // Handle other event types (comments, etc.) - future enhancement
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
