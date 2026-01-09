/**
 * Chat API - Send Message
 * 
 * POST /api/chat
 * Creates a user message and placeholder assistant message,
 * returns stream URL for SSE connection
 */

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { parseQuickCommand } from '@/lib/agents/chat';
import { syncMessageToSlack } from '@/lib/chat-slack-sync';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Default workspace for MVP (single-tenant)
const DEFAULT_WORKSPACE_ID = '00000000-0000-0000-0000-000000000002';

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

    // Create placeholder assistant message (will be filled by stream)
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
