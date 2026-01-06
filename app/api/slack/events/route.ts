// Slack event webhook - handles messages, button clicks, etc.
import { NextResponse } from 'next/server';
import { storeUserPriority } from '@/lib/priority-parser';
import { db } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const body = await request.json();

    // Handle Slack URL verification challenge
    if (body.type === 'url_verification') {
      console.log('[Slack Events] URL verification challenge received');
      return NextResponse.json({ challenge: body.challenge });
    }

    // Handle event callback
    if (body.type === 'event_callback') {
      const event = body.event;

      console.log(`[Slack Events] Received event: ${event.type}`);

      // Handle message events (user replies to check-in)
      if (event.type === 'message' && !event.bot_id) {
        await handleUserMessage(event);
      }

      // Handle button interactions
      if (event.type === 'block_actions') {
        await handleButtonClick(event);
      }

      // Acknowledge event receipt immediately (Slack requires response within 3s)
      return NextResponse.json({ ok: true });
    }

    // Handle interactive messages (button clicks)
    if (body.type === 'block_actions') {
      await handleButtonClick(body);
      return NextResponse.json({ ok: true });
    }

    console.warn('[Slack Events] Unknown event type:', body.type);
    return NextResponse.json({ ok: true });

  } catch (error) {
    console.error('[Slack Events] Error processing event:', error);
    // Still return 200 to prevent Slack retries
    return NextResponse.json({ ok: true });
  }
}

/**
 * Handle user messages (priority replies)
 */
async function handleUserMessage(event: any): Promise<void> {
  const workspaceId = process.env.WORKSPACE_ID;
  if (!workspaceId) {
    console.error('[Slack Events] WORKSPACE_ID not configured');
    return;
  }

  const message = event.text;
  const messageTs = event.ts;

  console.log(`[Slack Events] User message: "${message}"`);

  // Parse and store priority
  try {
    await storeUserPriority(workspaceId, message, messageTs);
    console.log('[Slack Events] User priority stored successfully');
  } catch (error) {
    console.error('[Slack Events] Error storing priority:', error);
  }
}

/**
 * Handle button clicks (approve, view, snooze)
 */
async function handleButtonClick(event: any): Promise<void> {
  const workspaceId = process.env.WORKSPACE_ID;
  if (!workspaceId) {
    console.error('[Slack Events] WORKSPACE_ID not configured');
    return;
  }

  const actions = event.actions || [];

  for (const action of actions) {
    const actionId = action.action_id;
    const value = action.value; // e.g., "approve_completion-id" or "view_completion-id"

    console.log(`[Slack Events] Button clicked: ${actionId}, value: ${value}`);

    // Parse action value
    const [actionType, completionId] = value.split('_');

    if (!completionId) {
      console.warn('[Slack Events] Invalid action value:', value);
      continue;
    }

    // Handle different button actions
    switch (actionId) {
      case 'approve_completion':
        await approveCompletion(completionId);
        break;

      case 'view_completion':
        await viewCompletion(completionId);
        break;

      case 'snooze_completion':
        await snoozeCompletion(completionId);
        break;

      default:
        console.warn('[Slack Events] Unknown action:', actionId);
    }
  }
}

/**
 * Approve a completion (mark for execution)
 */
async function approveCompletion(completionId: string): Promise<void> {
  try {
    await db.completion.update({
      where: { id: completionId },
      data: {
        userApproved: true,
        status: 'in_progress',
      },
    });

    console.log(`[Slack Events] Completion ${completionId} approved`);
  } catch (error) {
    console.error('[Slack Events] Error approving completion:', error);
  }
}

/**
 * View completion details (no-op for now, could open modal)
 */
async function viewCompletion(completionId: string): Promise<void> {
  console.log(`[Slack Events] View completion: ${completionId}`);
  // TODO: Could open a Slack modal with full details
}

/**
 * Snooze a completion (no-op for now, could update status)
 */
async function snoozeCompletion(completionId: string): Promise<void> {
  console.log(`[Slack Events] Snooze completion: ${completionId}`);
  // TODO: Could add a snooze timestamp or status
}
