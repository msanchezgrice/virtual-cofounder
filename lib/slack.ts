// Slack integration utilities for Virtual Cofounder
import { WebClient } from '@slack/web-api';

// Initialize Slack client
const slackToken = process.env.SLACK_BOT_TOKEN;
const slackChannel = process.env.SLACK_CHANNEL || '#cofounder-updates';

let slackClient: WebClient | null = null;

export function getSlackClient(): WebClient {
  if (!slackClient) {
    if (!slackToken) {
      throw new Error('SLACK_BOT_TOKEN not configured');
    }
    slackClient = new WebClient(slackToken);
  }
  return slackClient;
}

// Types
export interface CompletionNotification {
  completionId: string;
  projectName: string;
  title: string;
  rationale: string;
  priority: 'high' | 'medium' | 'low';
  policy: 'auto_safe' | 'approval_required' | 'suggest_only';
  agentName?: string;
  linearUrl?: string; // Linear issue URL for direct linking
}

/**
 * Send a completion notification to Slack using Block Kit
 */
export async function sendCompletionNotification(
  completion: CompletionNotification
): Promise<void> {
  // Skip if Slack not configured
  if (!slackToken) {
    console.log('[Slack] Skipping notification - SLACK_BOT_TOKEN not configured');
    return;
  }

  const client = getSlackClient();

  // Priority emoji and color
  const priorityConfig = {
    high: { emoji: '🔴', color: '#FF0000' },
    medium: { emoji: '🟡', color: '#FFA500' },
    low: { emoji: '🟢', color: '#00FF00' },
  };

  const config = priorityConfig[completion.priority];

  // Policy label
  const policyLabel = {
    auto_safe: '✓ Auto-Safe',
    approval_required: '⚠️ Approval Required',
    suggest_only: '💡 Suggestion',
  };

  try {
    await client.chat.postMessage({
      channel: slackChannel,
      text: `${config.emoji} New completion: ${completion.title}`,
      blocks: [
        {
          type: 'header',
          text: {
            type: 'plain_text',
            text: `${config.emoji} ${completion.projectName}`,
            emoji: true,
          },
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*${completion.title}*\n\n${completion.rationale}`,
          },
        },
        {
          type: 'section',
          fields: [
            {
              type: 'mrkdwn',
              text: `*Priority:*\n${config.emoji} ${completion.priority.toUpperCase()}`,
            },
            {
              type: 'mrkdwn',
              text: `*Policy:*\n${policyLabel[completion.policy]}`,
            },
          ],
        },
        {
          type: 'actions',
          elements: [
            {
              type: 'button',
              text: {
                type: 'plain_text',
                text: 'Approve & Execute',
                emoji: true,
              },
              style: 'primary',
              value: `approve_${completion.completionId}`,
              action_id: 'approve_completion',
            },
            // View Details button - opens Linear directly if URL available
            completion.linearUrl
              ? {
                  type: 'button',
                  text: {
                    type: 'plain_text',
                    text: '📊 View in Linear',
                    emoji: true,
                  },
                  url: completion.linearUrl,
                }
              : {
                  type: 'button',
                  text: {
                    type: 'plain_text',
                    text: 'View Details',
                    emoji: true,
                  },
                  value: `view_${completion.completionId}`,
                  action_id: 'view_completion',
                },
            {
              type: 'button',
              text: {
                type: 'plain_text',
                text: 'Snooze',
                emoji: true,
              },
              value: `snooze_${completion.completionId}`,
              action_id: 'snooze_completion',
            },
          ],
        },
        {
          type: 'context',
          elements: [
            {
              type: 'mrkdwn',
              text: `Completion ID: ${completion.completionId} ${completion.agentName ? `| Agent: ${completion.agentName}` : ''}`,
            },
          ],
        },
      ],
    });

    console.log(`[Slack] Sent completion notification: ${completion.completionId}`);
  } catch (error) {
    console.error('[Slack] Error sending completion notification:', error);
    throw error;
  }
}

/**
 * Send morning check-in message
 */
export async function sendMorningCheckIn(): Promise<void> {
  if (!slackToken) {
    console.log('[Slack] Skipping check-in - SLACK_BOT_TOKEN not configured');
    return;
  }

  const client = getSlackClient();

  try {
    await client.chat.postMessage({
      channel: slackChannel,
      text: 'Good morning! What are your priorities today?',
      blocks: [
        {
          type: 'header',
          text: {
            type: 'plain_text',
            text: '☀️ Good morning, Miguel!',
            emoji: true,
          },
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: "Ready to help you ship today. What are your priorities?\n\nJust reply with what you're focusing on (e.g., \"Focus on Warmstart launch\" or \"Fix bugs in TalkingObject\").",
          },
        },
        {
          type: 'context',
          elements: [
            {
              type: 'mrkdwn',
              text: '💡 _Your priorities will guide my work for the next 72 hours_',
            },
          ],
        },
      ],
    });

    console.log('[Slack] Sent morning check-in');
  } catch (error) {
    console.error('[Slack] Error sending morning check-in:', error);
    throw error;
  }
}

/**
 * Send evening recap message
 */
export async function sendEveningRecap(summary: {
  completionsCreated: number;
  completionsApproved: number;
  completionsCompleted: number;
  topProjects: string[];
}): Promise<void> {
  if (!slackToken) {
    console.log('[Slack] Skipping recap - SLACK_BOT_TOKEN not configured');
    return;
  }

  const client = getSlackClient();

  try {
    await client.chat.postMessage({
      channel: slackChannel,
      text: `End of day wrap-up: ${summary.completionsCompleted} completions shipped today`,
      blocks: [
        {
          type: 'header',
          text: {
            type: 'plain_text',
            text: '🌆 End of day wrap-up',
            emoji: true,
          },
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `Pretty productive day overall!

*Today's Stats:*
• ${summary.completionsCompleted} completions shipped ✅
• ${summary.completionsApproved} waiting for execution ⏳
• ${summary.completionsCreated} new opportunities identified 💡

*Projects worked on:*
${summary.topProjects.map(p => `• ${p}`).join('\n')}`,
          },
        },
        {
          type: 'context',
          elements: [
            {
              type: 'mrkdwn',
              text: '_See you tomorrow at 9am for the morning check-in_ ☀️',
            },
          ],
        },
      ],
    });

    console.log('[Slack] Sent evening recap');
  } catch (error) {
    console.error('[Slack] Error sending evening recap:', error);
    throw error;
  }
}

/**
 * Send PR creation notification to Slack
 */
export async function sendSlackNotification(data: {
  completionId: string;
  projectName: string;
  title: string;
  rationale: string;
  prUrl: string;
}): Promise<void> {
  if (!slackToken) {
    console.log('[Slack] Skipping PR notification - SLACK_BOT_TOKEN not configured');
    return;
  }

  const client = getSlackClient();

  try {
    await client.chat.postMessage({
      channel: slackChannel,
      text: `✅ PR created: ${data.title}`,
      blocks: [
        {
          type: 'header',
          text: {
            type: 'plain_text',
            text: `✅ Pull Request Created`,
            emoji: true,
          },
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*${data.projectName}*\n\n*${data.title}*\n\n${data.rationale}`,
          },
        },
        {
          type: 'actions',
          elements: [
            {
              type: 'button',
              text: {
                type: 'plain_text',
                text: 'View PR',
                emoji: true,
              },
              style: 'primary',
              url: data.prUrl,
              action_id: 'view_pr',
            },
          ],
        },
        {
          type: 'context',
          elements: [
            {
              type: 'mrkdwn',
              text: `Completion ID: ${data.completionId}`,
            },
          ],
        },
      ],
    });

    console.log(`[Slack] Sent PR notification: ${data.completionId}`);
  } catch (error) {
    console.error('[Slack] Error sending PR notification:', error);
    throw error;
  }
}

/**
 * Send a simple text message to Slack
 */
export async function sendMessage(text: string, channel?: string): Promise<void> {
  if (!slackToken) {
    console.log('[Slack] Skipping message - SLACK_BOT_TOKEN not configured');
    return;
  }

  const client = getSlackClient();

  try {
    await client.chat.postMessage({
      channel: channel || slackChannel,
      text,
    });

    console.log('[Slack] Sent message');
  } catch (error) {
    console.error('[Slack] Error sending message:', error);
    throw error;
  }
}

/**
 * Test Slack connection
 */
export async function testSlackConnection(): Promise<boolean> {
  if (!slackToken) {
    console.log('[Slack] SLACK_BOT_TOKEN not configured');
    return false;
  }

  try {
    const client = getSlackClient();
    const result = await client.auth.test();
    console.log('[Slack] Connection successful:', result.user);
    return true;
  } catch (error) {
    console.error('[Slack] Connection failed:', error);
    return false;
  }
}
