/**
 * Queue API - Efficient endpoint for execution queue data
 * 
 * Features:
 * - Server-side filtering for queue stories (pending, approved, in_progress)
 * - Pagination support
 * - Includes queue stats
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';

const SINGLE_USER_WORKSPACE_ID = '00000000-0000-0000-0000-000000000002';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const workspaceId = searchParams.get('workspaceId') || SINGLE_USER_WORKSPACE_ID;
  const page = parseInt(searchParams.get('page') || '1', 10);
  const limit = Math.min(parseInt(searchParams.get('limit') || '50', 10), 100);
  const skip = (page - 1) * limit;

  try {
    const queueStatuses = ['pending', 'approved', 'in_progress'];

    // Get total count for pagination
    const totalCount = await db.story.count({
      where: {
        project: { workspaceId },
        status: { in: queueStatuses },
      },
    });

    // Get currently executing story (in_progress) - always first
    const executingStory = await db.story.findFirst({
      where: {
        project: { workspaceId },
        status: 'in_progress',
      },
      include: {
        project: {
          select: { id: true, name: true },
        },
      },
    });

    // Get paginated queue stories (excluding in_progress since it's shown separately)
    const upNextStories = await db.story.findMany({
      where: {
        project: { workspaceId },
        status: { in: ['pending', 'approved'] },
      },
      include: {
        project: {
          select: { id: true, name: true },
        },
      },
      orderBy: [
        { priorityScore: 'desc' },
        { createdAt: 'asc' }, // FIFO for same priority
      ],
      skip,
      take: limit,
    });

    // Get count by status for stats
    const [pendingCount, approvedCount, inProgressCount] = await Promise.all([
      db.story.count({
        where: {
          project: { workspaceId },
          status: 'pending',
        },
      }),
      db.story.count({
        where: {
          project: { workspaceId },
          status: 'approved',
        },
      }),
      db.story.count({
        where: {
          project: { workspaceId },
          status: 'in_progress',
        },
      }),
    ]);

    // Calculate up next count (excluding in_progress)
    const upNextTotal = totalCount - inProgressCount;
    const totalPages = Math.ceil(upNextTotal / limit);

    return NextResponse.json({
      executing: executingStory,
      upNext: upNextStories,
      stats: {
        total: totalCount,
        pending: pendingCount,
        approved: approvedCount,
        inProgress: inProgressCount,
        upNextTotal,
      },
      pagination: {
        page,
        limit,
        total: upNextTotal,
        totalPages,
        hasMore: page < totalPages,
      },
    });
  } catch (error) {
    console.error('[QueueAPI] Error fetching queue:', error);
    return NextResponse.json({
      executing: null,
      upNext: [],
      stats: {
        total: 0,
        pending: 0,
        approved: 0,
        inProgress: 0,
        upNextTotal: 0,
      },
      pagination: {
        page: 1,
        limit,
        total: 0,
        totalPages: 0,
        hasMore: false,
      },
      error: 'Failed to fetch queue data',
    });
  }
}
