import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const stories = await db.story.findMany({
      include: {
        project: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return NextResponse.json({
      stories,
    });
  } catch (error) {
    console.error('Failed to fetch stories:', error);
    // Return graceful response with empty data for UI to handle
    return NextResponse.json({
      stories: [],
      error: 'Database connection timeout - please refresh'
    });
  }
}
