// API route for morning check-in cron
// Sends daily message to Slack asking user about priorities
import { NextResponse } from 'next/server';
import { sendMorningCheckIn } from '@/lib/slack';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    console.log('[Check-in] Sending morning check-in to Slack...');

    // Send morning check-in message
    await sendMorningCheckIn();

    console.log('[Check-in] Morning check-in sent successfully');

    return NextResponse.json({
      success: true,
      message: 'Morning check-in sent',
      timestamp: new Date().toISOString(),
    });

  } catch (error) {
    console.error('[Check-in] Error sending morning check-in:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

// Allow GET for manual testing
export async function GET(request: Request) {
  return POST(request);
}
