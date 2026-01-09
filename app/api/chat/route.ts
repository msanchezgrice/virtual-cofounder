/**
 * Chat API - Send Message
 * 
 * POST /api/chat
 * Creates a user message, queues processing to Railway chat worker,
 * returns stream URL for SSE connection.
 * 
 * Architecture:
 * 1. Save user message to DB
 * 2. Create placeholder assistant message
 * 3. Queue job to 'chat' BullMQ queue (processed by Railway worker)
 * 4. Return stream URL for client to subscribe to Redis pub/sub
 */

import { NextResponse } from 'next/server';
import { Queue } from 'bullmq';
import Redis from 'ioredis';
import { prisma } from '@/lib/db';
import { parseQuickCommand } from '@/lib/agents/chat';
import { syncMessageToSlack } from '@/lib/chat-slack-sync';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Default workspace for MVP (single-tenant)
const DEFAULT_WORKSPACE_ID = '00000000-0000-0000-0000-000000000002';

// Redis connection for BullMQ
let chatQueue: Queue | null = null;

async function getChatQueue(): Promise<Queue> {
  if (!chatQueue) {
    const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
    const connection = new Redis(redisUrl, {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
      tls: redisUrl.startsWith('rediss://') ? {} : undefined,
    });
    
    chatQueue = new Queue('chat', { connection });
  }
  return chatQueue;
}

interface SendMessageRequest {
  content: string;
  projectId?: string;
  conversationId?: string;
}

export async function POST(req: Request) {
  try {
    const body: SendMessageRequest = await req.json();
    const { content, projectId, conversationId = 'main' } = body;

    if (!content?.trim()) {
      return NextResponse.json(
        { error: 'Message content is required' },
        { status: 400 }
      );
    }

    // Parse for quick commands
    const command = parseQuickCommand(content);
    
    // Create user message
    const userMessage = await prisma.chatMessage.create({
      data: {
        workspaceId: DEFAULT_WORKSPACE_ID,
        conversationId,
        role: 'user',
        content: content.trim(),
        contentType: 'text',
        source: 'web',
        projectId,
        metadata: command.type !== 'none' ? { command } : undefined,
        readAt: new Date(), // User's own messages are read
      },
    });

    // Create placeholder assistant message (will be filled by worker)
    const assistantMessage = await prisma.chatMessage.create({
      data: {
        workspaceId: DEFAULT_WORKSPACE_ID,
        conversationId,
        role: 'assistant',
        content: '',
        contentType: 'text',
        source: 'web',
        isProcessing: true,
        metadata: command.type !== 'none' ? { respondingTo: command } : undefined,
      },
    });

    // Queue job to chat worker on Railway
    const queue = await getChatQueue();
    await queue.add(
      'chat-message',
      {
        messageId: assistantMessage.id,
        userMessageId: userMessage.id,
        workspaceId: DEFAULT_WORKSPACE_ID,
        conversationId,
        userContent: content.trim(),
        projectId,
      },
      {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 1000,
        },
        removeOnComplete: 100,
        removeOnFail: 50,
      }
    );

    console.log(`[Chat API] Queued message ${assistantMessage.id} for processing`);

    // Sync user message to Slack (async, don't block)
    syncMessageToSlack(userMessage.id).catch(err => 
      console.error('[Chat API] Slack sync error:', err)
    );

    // Return both messages and stream URL
    return NextResponse.json({
      userMessage: {
        id: userMessage.id,
        role: userMessage.role,
        content: userMessage.content,
        createdAt: userMessage.createdAt,
      },
      assistantMessage: {
        id: assistantMessage.id,
        role: assistantMessage.role,
        content: '',
        isProcessing: true,
        createdAt: assistantMessage.createdAt,
      },
      streamUrl: `/api/chat/stream/${assistantMessage.id}`,
      command: command.type !== 'none' ? command : undefined,
    });
  } catch (error) {
    console.error('[Chat API] Error creating message:', error);
    return NextResponse.json(
      { error: 'Failed to create message' },
      { status: 500 }
    );
  }
}
