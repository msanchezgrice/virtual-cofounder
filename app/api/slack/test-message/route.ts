import { NextResponse } from 'next/server';
import { sendSlackNotification } from '@/lib/slack';

export async function POST() {
  try {
    // Send a test PR notification to Slack
    await sendSlackNotification({
      completionId: 'test-' + Date.now(),
      projectName: 'Test Project',
      title: '🧪 Test Message from Dashboard',
      rationale: 'This is a test message to verify Slack integration is working correctly.',
      prUrl: 'https://github.com/test/test/pull/1',
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
