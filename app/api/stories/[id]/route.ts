/**
 * Story Detail API - Get a single story by ID
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    
    const story = await db.story.findUnique({
      where: { id },
      include: {
        project: {
          select: {
            id: true,
            name: true,
            repo: true,
            linearTeamId: true,
          },
        },
      },
    });

    if (!story) {
      return NextResponse.json(
        { story: null, error: 'Story not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      story,
      _meta: {
        generatedAt: new Date().toISOString(),
        ttlSeconds: 60,
      },
    });
  } catch (error) {
    console.error('Failed to fetch story:', error);
    return NextResponse.json(
      { story: null, error: 'Failed to fetch story' },
      { status: 500 }
    );
  }
}
