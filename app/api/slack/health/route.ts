import { NextResponse } from 'next/server';
import { getSlackClient } from '@/lib/slack';

export const dynamic = 'force-dynamic';

/**
 * Health check endpoint for Slack integration
 * Returns 200 if Slack bot token is configured and client is working
 */
export async function GET() {
  try {
    // Check if Slack bot token is configured
    if (!process.env.SLACK_BOT_TOKEN) {
      return NextResponse.json(
        {
          status: 'error',
          message: 'SLACK_BOT_TOKEN not configured',
          listening: false,
        },
        { status: 503 }
      );
    }

    // Try to get Slack client and verify auth
    const client = getSlackClient();
    const auth = await client.auth.test();

    if (!auth.ok) {
      return NextResponse.json(
        {
          status: 'error',
          message: 'Slack authentication failed',
          listening: false,
        },
        { status: 503 }
      );
    }

    return NextResponse.json({
      status: 'ok',
      message: 'Slack is listening',
      listening: true,
      bot_user_id: auth.user_id,
      team: auth.team,
    });

  } catch (error) {
    console.error('[Slack Health] Health check failed:', error);
    return NextResponse.json(
      {
        status: 'error',
        message: error instanceof Error ? error.message : 'Unknown error',
        listening: false,
      },
      { status: 503 }
    );
  }
}
