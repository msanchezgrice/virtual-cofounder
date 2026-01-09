/**
 * Chat API - Unread Count
 * 
 * GET /api/chat/unread
 * Returns count of unread assistant messages for badge display
 */

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Default workspace for MVP (single-tenant)
const DEFAULT_WORKSPACE_ID = 'cm3wev4rp0000pa2o0vyqz4qa';

export async function GET() {
  try {
    // Count assistant messages that haven't been read
    const unreadCount = await prisma.chatMessage.count({
      where: {
        workspaceId: DEFAULT_WORKSPACE_ID,
        role: 'assistant',
        readAt: null,
        isProcessing: false, // Don't count messages still being generated
      },
    });

    return NextResponse.json({ unreadCount });
  } catch (error) {
    console.error('[Chat API] Error fetching unread count:', error);
    return NextResponse.json(
      { error: 'Failed to fetch unread count', unreadCount: 0 },
      { status: 500 }
    );
  }
}
