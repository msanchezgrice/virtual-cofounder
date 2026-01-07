import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET() {
  try {
    const runs = await db.orchestratorRun.findMany({
      orderBy: {
        startedAt: 'desc',
      },
      take: 50, // Limit to last 50 runs
    });

    return NextResponse.json({ runs });
  } catch (error) {
    console.error('Failed to fetch orchestrator history:', error);
    return NextResponse.json(
      { error: 'Failed to fetch history' },
      { status: 500 }
    );
  }
}
