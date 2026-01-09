/**
 * Dashboard Stats API - Aggregated endpoint for dashboard data
 * 
 * Returns all dashboard stats in a single request:
 * - Story counts by status
 * - Recent high-priority stories
 * - Launch score
 * - Shipped this week count
 * 
 * This replaces multiple /api/stories and /api/projects calls
 */

import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';

const SINGLE_USER_WORKSPACE_ID = '00000000-0000-0000-0000-000000000002';

export async function GET() {
  try {
    // Get current date boundaries for "this week" calculation
    const now = new Date();
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - now.getDay()); // Start of current week (Sunday)
    startOfWeek.setHours(0, 0, 0, 0);

    // Execute all queries in parallel for better performance
    const [
      statusCounts,
      focusStories,
      completedThisWeek,
      projectCount,
      recentActivity,
    ] = await Promise.all([
      // 1. Get story counts by status in a single query
      db.story.groupBy({
        by: ['status'],
        where: {
          project: { workspaceId: SINGLE_USER_WORKSPACE_ID },
        },
        _count: { status: true },
      }),

      // 2. Get top 5 high-priority stories for "Today's Focus"
      db.story.findMany({
        where: {
          project: { workspaceId: SINGLE_USER_WORKSPACE_ID },
          status: { in: ['pending', 'approved', 'in_progress'] },
        },
        select: {
          id: true,
          title: true,
          priorityLevel: true,
          priorityScore: true,
          status: true,
          linearTaskId: true,
          project: {
            select: { id: true, name: true },
          },
        },
        orderBy: [
          { priorityScore: 'desc' },
          { createdAt: 'asc' },
        ],
        take: 5,
      }),

      // 3. Count stories completed this week
      db.story.count({
        where: {
          project: { workspaceId: SINGLE_USER_WORKSPACE_ID },
          status: 'completed',
          executedAt: { gte: startOfWeek },
        },
      }),

      // 4. Get project count for launch score calculation
      db.project.count({
        where: { workspaceId: SINGLE_USER_WORKSPACE_ID },
      }),

      // 5. Get recent activity summary (last 24h)
      db.story.count({
        where: {
          project: { workspaceId: SINGLE_USER_WORKSPACE_ID },
          createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
        },
      }),
    ]);

    // Process status counts into a map
    const statusMap = statusCounts.reduce((acc, item) => {
      acc[item.status] = item._count.status;
      return acc;
    }, {} as Record<string, number>);

    // Calculate launch score based on completion rate and project health
    // This is a simplified calculation - in production would use project snapshots
    const totalStories = Object.values(statusMap).reduce((sum, count) => sum + count, 0);
    const completedStories = statusMap['completed'] || 0;
    const baseScore = totalStories > 0 
      ? Math.round((completedStories / totalStories) * 60) 
      : 50;
    const launchScore = Math.min(100, baseScore + (projectCount > 0 ? 15 : 0) + 
      (completedThisWeek > 0 ? Math.min(20, completedThisWeek * 4) : 0));

    return NextResponse.json({
      stats: {
        workInProgress: statusMap['in_progress'] || 0,
        readyForReview: (statusMap['pending'] || 0) + (statusMap['approved'] || 0),
        shippedThisWeek: completedThisWeek,
        launchScore,
        totalStories,
        completedStories,
      },
      focusStories,
      activity: {
        newStoriesLast24h: recentActivity,
        projectCount,
      },
      // Cache metadata
      _meta: {
        generatedAt: new Date().toISOString(),
        ttlSeconds: 300, // Suggest 5 min cache
      },
    });
  } catch (error) {
    console.error('[DashboardStats] Error:', error);
    return NextResponse.json({
      stats: {
        workInProgress: 0,
        readyForReview: 0,
        shippedThisWeek: 0,
        launchScore: 0,
        totalStories: 0,
        completedStories: 0,
      },
      focusStories: [],
      activity: {
        newStoriesLast24h: 0,
        projectCount: 0,
      },
      error: 'Failed to load dashboard data',
      _meta: {
        generatedAt: new Date().toISOString(),
        ttlSeconds: 60, // Shorter cache on error
      },
    });
  }
}
