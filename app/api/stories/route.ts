import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';

const SINGLE_USER_WORKSPACE_ID = '00000000-0000-0000-0000-000000000002';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    
    // Pagination params
    const page = parseInt(searchParams.get('page') || '1');
    const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 100); // Max 100
    const skip = (page - 1) * limit;
    
    // Filter params
    const status = searchParams.get('status');
    const projectId = searchParams.get('projectId');
    const priorityLevel = searchParams.get('priorityLevel');

    // Build where clause
    const where: Record<string, unknown> = {
      project: { workspaceId: SINGLE_USER_WORKSPACE_ID },
    };
    if (status) where.status = status;
    if (projectId) where.projectId = projectId;
    if (priorityLevel) where.priorityLevel = priorityLevel;

    // Execute count and data queries in parallel
    const [total, stories] = await Promise.all([
      db.story.count({ where }),
      db.story.findMany({
        where,
        include: {
          project: {
            select: {
              id: true,
              name: true,
            },
          },
        },
        orderBy: [
          { priorityScore: 'desc' },
          { createdAt: 'desc' },
        ],
        skip,
        take: limit,
      }),
    ]);

    const totalPages = Math.ceil(total / limit);

    return NextResponse.json({
      stories,
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasMore: page < totalPages,
      },
      _meta: {
        generatedAt: new Date().toISOString(),
        ttlSeconds: 120,
      },
    });
  } catch (error) {
    console.error('Failed to fetch stories:', error);
    return NextResponse.json({
      stories: [],
      pagination: {
        page: 1,
        limit: 50,
        total: 0,
        totalPages: 0,
        hasMore: false,
      },
      error: 'Database connection timeout - please refresh'
    });
  }
}
