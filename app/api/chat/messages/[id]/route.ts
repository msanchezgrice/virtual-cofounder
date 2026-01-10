/**
 * Chat API - Single Message
 *
 * GET /api/chat/messages/[id]
 * Fetches a specific chat message by ID
 */

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(
  req: Request,
  context: RouteContext
) {
  try {
    const { id } = await context.params;

    const message = await prisma.chatMessage.findUnique({
      where: { id },
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

    if (!message) {
      return NextResponse.json(
        { error: 'Message not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ message });
  } catch (error) {
    console.error('[Chat API] Error fetching message:', error);
    return NextResponse.json(
      { error: 'Failed to fetch message' },
      { status: 500 }
    );
  }
}
