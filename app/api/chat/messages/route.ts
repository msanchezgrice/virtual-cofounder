/**
 * Chat API - Message History
 * 
 * GET /api/chat/messages
 * Fetches conversation history with pagination and time filtering
 */

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Default workspace for MVP (single-tenant)
const DEFAULT_WORKSPACE_ID = '00000000-0000-0000-0000-000000000002';

// Time window constants
const TIME_WINDOWS: Record<string, number> = {
  '1h': 60 * 60 * 1000,
  '24h': 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
};

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    
    // Query params
    const conversationId = searchParams.get('conversationId') || 'main';
    const since = searchParams.get('since') || '1h'; // Default: last hour
    const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 100);
    const before = searchParams.get('before'); // Cursor for pagination
    const projectId = searchParams.get('projectId');

    // Calculate time filter
    let sinceDate: Date | undefined;
    if (since !== 'all' && TIME_WINDOWS[since]) {
      sinceDate = new Date(Date.now() - TIME_WINDOWS[since]);
    }

    // Build query
    const where: any = {
      workspaceId: DEFAULT_WORKSPACE_ID,
      conversationId,
    };

    if (sinceDate) {
      where.createdAt = { gte: sinceDate };
    }

    if (before) {
      where.createdAt = {
        ...where.createdAt,
        lt: new Date(before),
      };
    }

    // If projectId is specified, filter user messages by project
    // but include ALL assistant messages (they respond to user messages in this conversation)
    if (projectId) {
      where.OR = [
        { role: 'assistant' }, // All assistant messages in conversation
        { projectId }, // User messages for this project
      ];
    }

    // Fetch messages (newest first for pagination, will reverse for display)
    const messages = await prisma.chatMessage.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit + 1, // Fetch one extra to check hasMore
      select: {
        id: true,
        role: true,
        content: true,
        contentType: true,
        metadata: true,
        isProcessing: true,
        projectId: true,
        source: true,
        createdAt: true,
        readAt: true,
      },
    });

    // Check if there are more messages
    const hasMore = messages.length > limit;
    if (hasMore) {
      messages.pop(); // Remove the extra one
    }

    // Reverse to chronological order
    messages.reverse();

    // Get next cursor (oldest message in this batch)
    const nextCursor = hasMore && messages.length > 0 
      ? messages[0].createdAt.toISOString()
      : undefined;

    return NextResponse.json({
      messages,
      hasMore,
      nextCursor,
      meta: {
        conversationId,
        since,
        limit,
        count: messages.length,
      },
    });
  } catch (error) {
    console.error('[Chat API] Error fetching messages:', error);
    return NextResponse.json(
      { error: 'Failed to fetch messages' },
      { status: 500 }
    );
  }
}
