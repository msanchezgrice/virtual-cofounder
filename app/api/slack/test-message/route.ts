import { NextResponse } from 'next/server';
import { sendSlackNotification } from '@/lib/slack';

export async function POST() {
  try {
    // Send a test message to Slack
    await sendSlackNotification({
      title: '🧪 Test Message from Dashboard',
      message: 'This is a test message to verify Slack integration is working correctly.',
      priority: 'medium',
      timestamp: new Date().toISOString(),
    });

    return NextResponse.json({
      success: true,
      message: 'Test message sent to Slack successfully',
    });
  } catch (error) {
    console.error('Failed to send test Slack message:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to send test message',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
