/**
 * Projects With Stats API - Returns all projects with their progress data
 * 
 * This eliminates the N+1 problem on the projects page where we were
 * fetching /api/projects and then /api/projects/[id]/progress for each.
 * 
 * Now returns all data in a single efficient query.
 */

import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';

const SINGLE_USER_WORKSPACE_ID = '00000000-0000-0000-0000-000000000002';

// Launch stage definitions
const STAGES = ['idea', 'mvp', 'alpha', 'beta', 'launch', 'growth'] as const;

function calculateStageFromScore(score: number): typeof STAGES[number] {
  if (score >= 90) return 'growth';
  if (score >= 76) return 'launch';
  if (score >= 60) return 'beta';
  if (score >= 40) return 'alpha';
  if (score >= 20) return 'mvp';
  return 'idea';
}

export async function GET() {
  try {
    // Fetch projects with aggregated story counts in a single query
    const projects = await db.project.findMany({
      where: { workspaceId: SINGLE_USER_WORKSPACE_ID },
      select: {
        id: true,
        name: true,
        domain: true,
        status: true,
        hasPosthog: true,
        hasResend: true,
        lastScannedAt: true,
        createdAt: true,
        // Include story aggregates
        stories: {
          select: {
            status: true,
            priorityLevel: true,
          },
        },
        // Include latest snapshot if available
        snapshots: {
          select: {
            launchScore: true,
            launchStage: true,
            workSummary: true,
          },
          orderBy: { snapshotAt: 'desc' },
          take: 1,
        },
        // Include scan count for health calculation
        scans: {
          select: { status: true },
          orderBy: { scannedAt: 'desc' },
          take: 10,
        },
      },
      orderBy: { name: 'asc' },
    });

    // Process each project to compute stats
    const projectsWithStats = projects.map((project) => {
      const stories = project.stories;
      const snapshot = project.snapshots[0];
      
      // Calculate work summary from stories
      const pending = stories.filter(s => s.status === 'pending').length;
      const inProgress = stories.filter(s => s.status === 'in_progress').length;
      const completed = stories.filter(s => s.status === 'completed').length;
      const total = stories.length;
      
      // Calculate launch score
      // Use snapshot if available, otherwise calculate from project state
      let launchScore = snapshot?.launchScore ?? 0;
      if (!snapshot) {
        // Calculate score based on:
        // - Has domain: +10
        // - Has analytics: +10
        // - Completion rate: up to 30
        // - Recent activity: up to 20
        // - Has scans: +10
        let score = 0;
        if (project.domain) score += 15;
        if (project.hasPosthog) score += 10;
        if (total > 0) {
          score += Math.round((completed / total) * 30);
        }
        if (inProgress > 0) score += 10;
        if (project.scans.length > 0) score += 10;
        if (project.lastScannedAt) {
          const daysSinceLastScan = Math.floor(
            (Date.now() - new Date(project.lastScannedAt).getTime()) / (1000 * 60 * 60 * 24)
          );
          if (daysSinceLastScan < 7) score += 10;
        }
        launchScore = Math.min(100, score);
      }

      // Determine stage
      const stage = snapshot?.launchStage ?? calculateStageFromScore(launchScore);

      // Calculate health score based on scan pass rate and recent activity
      const recentScans = project.scans;
      const passedScans = recentScans.filter(s => s.status === 'ok').length;
      const healthScore = recentScans.length > 0 
        ? Math.round((passedScans / recentScans.length) * 100)
        : 80; // Default health if no scans

      return {
        id: project.id,
        name: project.name,
        domain: project.domain,
        status: project.status,
        createdAt: project.createdAt.toISOString(),
        // Computed stats
        launchScore,
        stage,
        healthScore,
        inProgress,
        forReview: pending,
        totalStories: total,
        completedStories: completed,
        // Feature flags
        hasPosthog: project.hasPosthog,
        hasResend: project.hasResend,
        lastScannedAt: project.lastScannedAt?.toISOString() ?? null,
      };
    });

    return NextResponse.json({
      projects: projectsWithStats,
      count: projectsWithStats.length,
      _meta: {
        generatedAt: new Date().toISOString(),
        ttlSeconds: 300, // 5 min cache suggestion
      },
    });
  } catch (error) {
    console.error('[ProjectsWithStats] Error:', error);
    return NextResponse.json({
      projects: [],
      count: 0,
      error: 'Failed to load projects',
      _meta: {
        generatedAt: new Date().toISOString(),
        ttlSeconds: 60,
      },
    });
  }
}
