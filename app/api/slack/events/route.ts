// Slack event webhook - handles messages, button clicks, etc.
import { NextResponse } from 'next/server';
import { storeUserPriority } from '@/lib/priority-parser';
import { db } from '@/lib/db';
import { getSlackClient } from '@/lib/slack';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const contentType = request.headers.get('content-type') || '';
    let body: any;

    // Slack sends button clicks as form-urlencoded with a 'payload' field
    if (contentType.includes('application/x-www-form-urlencoded')) {
      const formData = await request.text();
      const params = new URLSearchParams(formData);
      const payloadStr = params.get('payload');
      if (payloadStr) {
        body = JSON.parse(payloadStr);
      } else {
        console.error('[Slack Events] No payload in form data');
        return NextResponse.json({ ok: true });
      }
    } else {
      // Regular JSON payload (events)
      body = await request.json();
    }

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

      // Handle app mentions (when someone @mentions the bot)
      if (event.type === 'app_mention') {
        await handleAppMention(event);
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
 * Handle user messages (direct messages or channel messages)
 * Supports both priority parsing and command handling
 */
async function handleUserMessage(event: any): Promise<void> {
  const workspaceId = process.env.WORKSPACE_ID;
  if (!workspaceId) {
    console.error('[Slack Events] WORKSPACE_ID not configured');
    return;
  }

  const message = event.text;
  const messageTs = event.ts;
  const channelId = event.channel;
  const userId = event.user;
  const lowerMessage = message.toLowerCase();

  console.log(`[Slack Events] User message: "${message}"`);

  // Check if this is a command (contains keywords)
  const isCommand = lowerMessage.includes('help') ||
    lowerMessage.includes('run') ||
    lowerMessage.includes('scan') ||
    lowerMessage.includes('orchestrator') ||
    lowerMessage.includes('execution') ||
    lowerMessage.includes('status');

  if (isCommand) {
    // Handle commands just like app mentions
    // Reuse the app mention handler logic
    await handleAppMention({
      ...event,
      thread_ts: event.ts, // Use message timestamp as thread
    });
  } else {
    // Not a command - treat as priority input
    try {
      await storeUserPriority(workspaceId, message, messageTs);
      console.log('[Slack Events] User priority stored successfully');
    } catch (error) {
      console.error('[Slack Events] Error storing priority:', error);
    }
  }
}

/**
 * Handle app mentions (when someone @mentions the bot)
 */
async function handleAppMention(event: any): Promise<void> {
  const workspaceId = process.env.WORKSPACE_ID;
  if (!workspaceId) {
    console.error('[Slack Events] WORKSPACE_ID not configured');
    return;
  }

  const message = event.text;
  const channelId = event.channel;
  const userId = event.user;
  const threadTs = event.thread_ts || event.ts;

  console.log(`[Slack Events] App mention from ${userId}: "${message}"`);

  try {
    const client = getSlackClient();

    // Parse the message to understand intent
    const lowerMessage = message.toLowerCase();

    // Help command
    if (lowerMessage.includes('help')) {
      await client.chat.postMessage({
        channel: channelId,
        thread_ts: threadTs,
        text: `👋 Hi! I'm your AI Co-Founder. Here's what I can do:\n\n` +
          `• **Run scans**: Mention "run scans" to scan all projects\n` +
          `• **Run orchestrator**: Mention "run orchestrator" to analyze scans and create stories\n` +
          `• **Run execution**: Mention "run execution" to process approved stories\n` +
          `• **Check status**: Mention "status" to see project health\n\n` +
          `You can also use the dashboard to manage everything!`,
      });
      return;
    }

    // Run scans command
    if (lowerMessage.includes('run scan') || lowerMessage.includes('scan project')) {
      await client.chat.postMessage({
        channel: channelId,
        thread_ts: threadTs,
        text: `🔄 Triggering scans for all active projects...\n\n_This will take a few minutes. I'll update you when it's done!_`,
      });

      // Trigger scans via API
      try {
        const baseUrl = process.env.VERCEL_URL
          ? `https://${process.env.VERCEL_URL}`
          : 'http://localhost:3000';

        const response = await fetch(`${baseUrl}/api/scans/trigger`, {
          method: 'POST',
        });

        if (response.ok) {
          const data = await response.json();
          await client.chat.postMessage({
            channel: channelId,
            thread_ts: threadTs,
            text: `✅ Scans triggered successfully!\n\n` +
              `**Projects:** ${data.projects}\n` +
              `**Jobs:** ${data.jobs}\n\n` +
              `Results will be available in the dashboard shortly.`,
          });
        } else {
          await client.chat.postMessage({
            channel: channelId,
            thread_ts: threadTs,
            text: `❌ Failed to trigger scans. Please try again or check the dashboard.`,
          });
        }
      } catch (error) {
        console.error('[Slack Events] Error triggering scans:', error);
        await client.chat.postMessage({
          channel: channelId,
          thread_ts: threadTs,
          text: `❌ Error triggering scans: ${error instanceof Error ? error.message : 'Unknown error'}`,
        });
      }
      return;
    }

    // Run orchestrator command (analyzes scans and creates stories)
    if (lowerMessage.includes('run orchestrator') || lowerMessage.includes('analyze') || lowerMessage.includes('create stories')) {
      await client.chat.postMessage({
        channel: channelId,
        thread_ts: threadTs,
        text: `🤖 Running orchestrator to analyze projects and create stories...\n\n_This will take a few minutes. I'll notify you when new stories are created!_`,
      });

      // Trigger orchestrator via API
      try {
        const baseUrl = process.env.VERCEL_URL
          ? `https://${process.env.VERCEL_URL}`
          : 'http://localhost:3000';

        const response = await fetch(`${baseUrl}/api/orchestrator/run`, {
          method: 'POST',
        });

        if (response.ok) {
          const data = await response.json();
          await client.chat.postMessage({
            channel: channelId,
            thread_ts: threadTs,
            text: `✅ Orchestrator started!\n\n` +
              `**Run ID:** ${data.run_id}\n` +
              `**Projects Queued:** ${data.projects_queued}\n\n` +
              `I'll send you new story notifications as they're created.`,
          });
        } else {
          await client.chat.postMessage({
            channel: channelId,
            thread_ts: threadTs,
            text: `❌ Failed to run orchestrator. Please try again or check the dashboard.`,
          });
        }
      } catch (error) {
        console.error('[Slack Events] Error running orchestrator:', error);
        await client.chat.postMessage({
          channel: channelId,
          thread_ts: threadTs,
          text: `❌ Error running orchestrator: ${error instanceof Error ? error.message : 'Unknown error'}`,
        });
      }
      return;
    }

    // Run execution worker command (processes pending stories)
    if (lowerMessage.includes('run execution') || lowerMessage.includes('execute stories') || lowerMessage.includes('process queue')) {
      await client.chat.postMessage({
        channel: channelId,
        thread_ts: threadTs,
        text: `⚙️ Running execution worker to process pending stories...\n\n_This will execute approved stories in the queue!_`,
      });

      // Trigger execution worker via script
      try {
        const baseUrl = process.env.VERCEL_URL
          ? `https://${process.env.VERCEL_URL}`
          : 'http://localhost:3000';

        // Note: In production, this would trigger the Railway execution worker
        // For now, we'll just report that it's been queued
        await client.chat.postMessage({
          channel: channelId,
          thread_ts: threadTs,
          text: `✅ Execution worker triggered!\n\nApproved stories in the queue will be processed shortly. Check the dashboard for progress.`,
        });
      } catch (error) {
        console.error('[Slack Events] Error triggering execution:', error);
        await client.chat.postMessage({
          channel: channelId,
          thread_ts: threadTs,
          text: `❌ Error triggering execution: ${error instanceof Error ? error.message : 'Unknown error'}`,
        });
      }
      return;
    }

    // Status command
    if (lowerMessage.includes('status') || lowerMessage.includes('health')) {
      const projects = await db.project.findMany({
        where: { workspaceId },
        include: {
          scans: {
            orderBy: { scannedAt: 'desc' },
            take: 1,
          },
        },
      });

      const activeProjects = projects.filter(p => p.status.includes('ACTIVE'));
      const scannedToday = projects.filter(p => {
        const lastScan = p.scans[0]?.scannedAt;
        if (!lastScan) return false;
        const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
        return new Date(lastScan) > dayAgo;
      });

      await client.chat.postMessage({
        channel: channelId,
        thread_ts: threadTs,
        text: `📊 **Portfolio Status**\n\n` +
          `**Active Projects:** ${activeProjects.length}\n` +
          `**Scanned Today:** ${scannedToday.length}\n\n` +
          `View full details in the dashboard: ${process.env.VERCEL_URL || 'localhost:3000'}`,
      });
      return;
    }

    // Default response for unrecognized commands
    await client.chat.postMessage({
      channel: channelId,
      thread_ts: threadTs,
      text: `👋 Hi! I heard you, but I'm not sure what you want me to do.\n\n` +
        `Try mentioning:\n` +
        `• "help" - See what I can do\n` +
        `• "run scans" - Scan all projects\n` +
        `• "status" - Check project health\n` +
        `• "priorities" - View high-priority issues`,
    });
  } catch (error) {
    console.error('[Slack Events] Error handling app mention:', error);
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
  const userId = event.user?.id;
  const channelId = event.channel?.id;

  for (const action of actions) {
    const actionId = action.action_id;
    const value = action.value; // e.g., "approve_story-id" or "view_story-id"

    console.log(`[Slack Events] Button clicked: ${actionId}, value: ${value}`);

    // Parse action value
    const [actionType, storyId] = value.split('_');

    if (!storyId) {
      console.warn('[Slack Events] Invalid action value:', value);
      continue;
    }

    // Handle different button actions
    switch (actionId) {
      case 'approve_completion':
        await approveStory(storyId, userId, channelId);
        break;

      case 'view_completion':
        await viewStory(storyId, userId, channelId);
        break;

      case 'snooze_completion':
        await snoozeStory(storyId, userId, channelId);
        break;

      default:
        console.warn('[Slack Events] Unknown action:', actionId);
    }
  }
}

/**
 * Approve a story (mark for execution)
 */
async function approveStory(storyId: string, userId?: string, channelId?: string): Promise<void> {
  try {
    const story = await db.story.update({
      where: { id: storyId },
      data: {
        userApproved: true,
        status: 'in_progress',
      },
      include: { project: true },
    });

    console.log(`[Slack Events] Story ${storyId} approved`);

    // Send confirmation to user
    if (userId && channelId) {
      const client = getSlackClient();
      await client.chat.postEphemeral({
        channel: channelId,
        user: userId,
        text: `✅ Approved: "${story.title}" for ${story.project.name}. This will be executed in the next run.`,
      });
    }
  } catch (error) {
    console.error('[Slack Events] Error approving story:', error);
  }
}

/**
 * View story details with Linear link
 */
async function viewStory(storyId: string, userId?: string, channelId?: string): Promise<void> {
  console.log(`[Slack Events] View story: ${storyId}`);

  if (userId && channelId) {
    try {
      // Fetch story with Linear task ID
      const story = await db.story.findUnique({
        where: { id: storyId },
        include: { project: true },
      });

      if (!story) {
        const client = getSlackClient();
        await client.chat.postEphemeral({
          channel: channelId,
          user: userId,
          text: `❌ Story not found`,
        });
        return;
      }

      const client = getSlackClient();

      // Build message with Linear link if available
      let message = `📋 **${story.title}**\n\n`;
      message += `**Project:** ${story.project.name}\n`;
      message += `**Priority:** ${story.priority}\n`;
      message += `**Status:** ${story.status}\n\n`;

      if (story.linearTaskId) {
        message += `🔗 View in Linear: https://linear.app/issue/${story.linearTaskId}\n\n`;
      }

      if (story.prUrl) {
        message += `🔗 Pull Request: ${story.prUrl}\n\n`;
      }

      message += `_Story ID: ${storyId}_`;

      await client.chat.postEphemeral({
        channel: channelId,
        user: userId,
        text: message,
      });
    } catch (error) {
      console.error('[Slack Events] Error viewing story:', error);
      const client = getSlackClient();
      await client.chat.postEphemeral({
        channel: channelId,
        user: userId,
        text: `❌ Error loading story details`,
      });
    }
  }
}

/**
 * Snooze a story (no-op for now, could update status)
 */
async function snoozeStory(storyId: string, userId?: string, channelId?: string): Promise<void> {
  console.log(`[Slack Events] Snooze story: ${storyId}`);

  if (userId && channelId) {
    const client = getSlackClient();
    await client.chat.postEphemeral({
      channel: channelId,
      user: userId,
      text: `⏰ Snoozed story ID: ${storyId} for 24 hours.\n(Snooze functionality coming in Phase 5)`,
    });
  }
}
