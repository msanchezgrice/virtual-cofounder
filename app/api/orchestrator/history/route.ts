import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';

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
    // Return graceful response with empty data for UI to handle
    return NextResponse.json({
      runs: [],
      error: 'Database connection timeout - please refresh'
    });
  }
}
