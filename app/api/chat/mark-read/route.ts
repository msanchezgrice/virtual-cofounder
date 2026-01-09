/**
 * Chat API - Mark Messages as Read
 * 
 * POST /api/chat/mark-read
 * Marks all messages up to a timestamp as read
 */

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Default workspace for MVP (single-tenant)
const DEFAULT_WORKSPACE_ID = 'cm3wev4rp0000pa2o0vyqz4qa';

interface MarkReadRequest {
  beforeTimestamp?: string; // ISO timestamp
  messageIds?: string[]; // Or specific message IDs
  conversationId?: string;
}

export async function POST(req: Request) {
  try {
    const body: MarkReadRequest = await req.json();
    const { beforeTimestamp, messageIds, conversationId = 'main' } = body;

    const now = new Date();
    let updatedCount = 0;

    if (messageIds && messageIds.length > 0) {
      // Mark specific messages as read
      const result = await prisma.chatMessage.updateMany({
        where: {
          id: { in: messageIds },
          workspaceId: DEFAULT_WORKSPACE_ID,
          readAt: null,
        },
        data: { readAt: now },
      });
      updatedCount = result.count;
    } else {
      // Mark all messages before timestamp (or now) as read
      const before = beforeTimestamp ? new Date(beforeTimestamp) : now;
      
      const result = await prisma.chatMessage.updateMany({
        where: {
          workspaceId: DEFAULT_WORKSPACE_ID,
          conversationId,
          role: 'assistant', // Only mark assistant messages
          readAt: null,
          createdAt: { lte: before },
          isProcessing: false,
        },
        data: { readAt: now },
      });
      updatedCount = result.count;
    }

    return NextResponse.json({ 
      success: true, 
      markedRead: updatedCount,
    });
  } catch (error) {
    console.error('[Chat API] Error marking messages as read:', error);
    return NextResponse.json(
      { error: 'Failed to mark messages as read' },
      { status: 500 }
    );
  }
}
