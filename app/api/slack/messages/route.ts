import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * Get all Slack messages for the workspace
 */
export async function GET() {
  try {
    const workspaceId = process.env.WORKSPACE_ID;
    if (!workspaceId) {
      return NextResponse.json(
        { error: 'WORKSPACE_ID not configured' },
        { status: 500 }
      );
    }

    const messages = await db.slackMessage.findMany({
      where: { workspaceId },
      orderBy: {
        createdAt: 'desc',
      },
      take: 100, // Last 100 messages
    });

    return NextResponse.json({ messages });
  } catch (error) {
    console.error('Failed to fetch Slack messages:', error);
    return NextResponse.json(
      { error: 'Failed to fetch messages' },
      { status: 500 }
    );
  }
}
