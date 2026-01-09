/**
 * Chat-Slack Bidirectional Sync
 * 
 * Handles syncing messages between the web chat interface and Slack:
 * - Web → Slack: User messages and assistant responses forwarded to Slack
 * - Slack → Web: Inbound Slack messages synced to chat history
 */

import { prisma } from '@/lib/db';
import { WebClient } from '@slack/web-api';

// Initialize Slack client
const slack = new WebClient(process.env.SLACK_BOT_TOKEN);

// Default workspace for MVP
const DEFAULT_WORKSPACE_ID = 'cm3wev4rp0000pa2o0vyqz4qa';

// Slack channel from environment (or default)
const SLACK_CHANNEL = process.env.SLACK_CHANNEL_ID || process.env.SLACK_CHANNEL || '#cofounder-updates';

/**
 * Sync a chat message to Slack
 * Called after a message is saved to the chat_messages table
 */
export async function syncMessageToSlack(messageId: string): Promise<boolean> {
  try {
    // Get the message
    const message = await prisma.chatMessage.findUnique({
      where: { id: messageId },
    });
    
    if (!message || message.slackMessageTs) {
      // Already synced or doesn't exist
      return false;
    }
    
    // Get Slack channel from environment
    const slackChannelId = SLACK_CHANNEL;
    if (!slackChannelId || !process.env.SLACK_BOT_TOKEN) {
      console.log('[Chat-Slack Sync] Slack not configured');
      return false;
    }
    
    // Format message for Slack
    let slackText: string;
    if (message.role === 'user') {
      slackText = `💬 *From Web Chat:*\n${message.content}`;
    } else if (message.role === 'assistant') {
      slackText = `🤖 *Virtual Cofounder:*\n${message.content}`;
    } else {
      slackText = message.content;
    }
    
    // Add priority card formatting if present
    const metadata = message.metadata as any;
    if (metadata?.priorities?.length > 0) {
      const priorityText = metadata.priorities
        .map((p: any) => `• [${p.level || p.priority}] ${p.title || p.content}`)
        .join('\n');
      slackText += `\n\n📋 *Priorities:*\n${priorityText}`;
    }
    
    // Post to Slack
    const result = await slack.chat.postMessage({
      channel: slackChannelId,
      text: slackText,
      mrkdwn: true,
    });
    
    if (result.ok && result.ts) {
      // Update message with Slack reference
      await prisma.chatMessage.update({
        where: { id: messageId },
        data: {
          slackMessageTs: result.ts,
          slackChannelId: slackChannelId,
        },
      });
      
      return true;
    }
    
    return false;
  } catch (error) {
    console.error('[Chat-Slack Sync] Error syncing to Slack:', error);
    return false;
  }
}

/**
 * Import a Slack message into chat history
 * Called from Slack webhook handler
 */
export async function importSlackMessage(
  slackMessage: {
    ts: string;
    channel: string;
    text: string;
    user?: string;
    bot_id?: string;
  },
  conversationId: string = 'main'
): Promise<string | null> {
  try {
    // Check if message already exists
    const existing = await prisma.chatMessage.findFirst({
      where: { slackMessageTs: slackMessage.ts },
    });
    
    if (existing) {
      return existing.id;
    }
    
    // Determine role
    const role = slackMessage.bot_id ? 'assistant' : 'user';
    
    // Clean up Slack formatting
    let content = slackMessage.text
      .replace(/<@[A-Z0-9]+>/g, '') // Remove user mentions
      .replace(/<#[A-Z0-9]+\|([^>]+)>/g, '#$1') // Convert channel links
      .replace(/<(https?:\/\/[^|>]+)(\|[^>]+)?>/g, '$1') // Convert URL links
      .trim();
    
    // Create chat message
    const chatMessage = await prisma.chatMessage.create({
      data: {
        workspaceId: DEFAULT_WORKSPACE_ID,
        conversationId,
        role,
        content,
        contentType: 'text',
        source: 'slack',
        slackMessageTs: slackMessage.ts,
        slackChannelId: slackMessage.channel,
        // Slack messages start unread
        readAt: null,
      },
    });
    
    return chatMessage.id;
  } catch (error) {
    console.error('[Chat-Slack Sync] Error importing from Slack:', error);
    return null;
  }
}

/**
 * Sync recent Slack messages to chat (for initial load or catch-up)
 * Fetches messages from Slack channel and imports them
 */
export async function syncRecentSlackMessages(
  channelId: string,
  since?: Date,
  limit: number = 50
): Promise<number> {
  try {
    // Fetch messages from Slack
    const oldest = since 
      ? (since.getTime() / 1000).toString() 
      : undefined;
    
    const result = await slack.conversations.history({
      channel: channelId,
      oldest,
      limit,
    });
    
    if (!result.ok || !result.messages) {
      return 0;
    }
    
    let imported = 0;
    
    // Import each message
    for (const msg of result.messages) {
      if (msg.ts && msg.text) {
        const id = await importSlackMessage({
          ts: msg.ts,
          channel: channelId,
          text: msg.text,
          user: msg.user,
          bot_id: msg.bot_id,
        });
        if (id) imported++;
      }
    }
    
    return imported;
  } catch (error) {
    console.error('[Chat-Slack Sync] Error syncing from Slack:', error);
    return 0;
  }
}

/**
 * Check if a Slack message should be synced to chat
 * (Filter out bot's own messages, system messages, etc.)
 */
export function shouldSyncSlackMessage(message: {
  subtype?: string;
  bot_id?: string;
  text?: string;
}): boolean {
  // Skip subtypes like channel_join, channel_leave
  if (message.subtype && ['channel_join', 'channel_leave', 'bot_message'].includes(message.subtype)) {
    return false;
  }
  
  // Skip empty messages
  if (!message.text?.trim()) {
    return false;
  }
  
  // Skip our own bot's messages (check by bot ID)
  // The bot ID should be from env or detected
  const ourBotId = process.env.SLACK_BOT_ID;
  if (ourBotId && message.bot_id === ourBotId) {
    return false;
  }
  
  return true;
}
