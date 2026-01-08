/**
 * Stack Ranker
 * 
 * Computes a stack-ranked priority list for stories based on multiple factors:
 * - Priority signals (P0-P3, from Slack/Linear/Scans)
 * - Impact on launch readiness
 * - Estimated effort
 * - Story age
 * - User focus signals
 * 
 * Feature flag: PRIORITY_SYSTEM_ENABLED
 */

import { prisma } from '@/lib/db';
import { calculateStoryPriority, PriorityLevel } from './classifier';
import { featureFlags } from '@/lib/config/feature-flags';

// Scoring weights
const WEIGHTS = {
  prioritySignal: 0.4, // 40% - User/scan priority signals
  launchImpact: 0.25, // 25% - Does this advance launch stage?
  effort: 0.15, // 15% - Lower effort = higher rank
  age: 0.1, // 10% - Older stories get small boost
  userFocus: 0.1, // 10% - Recent user mentions
};

// Priority level to base score
const PRIORITY_BASE_SCORES: Record<PriorityLevel, number> = {
  P0: 100,
  P1: 75,
  P2: 50,
  P3: 25,
};

// Effort estimation to score (lower effort = higher score)
const EFFORT_SCORES: Record<string, number> = {
  low: 100,
  medium: 70,
  high: 40,
  unknown: 50,
};

export interface RankedStory {
  id: string;
  title: string;
  projectId: string;
  projectName: string;
  status: string;
  priorityLevel: PriorityLevel;
  priorityScore: number;
  compositeScore: number;
  factors: {
    prioritySignal: number;
    launchImpact: number;
    effort: number;
    age: number;
    userFocus: number;
  };
  linearTaskId: string | null;
  createdAt: Date;
}

/**
 * Calculate launch impact score
 * Stories that advance the project closer to launch get higher scores
 */
function calculateLaunchImpact(
  advancesLaunchStage: boolean | null,
  storyType?: string
): number {
  if (advancesLaunchStage === true) {
    return 100;
  }

  // Infer from story type if not explicitly set
  const launchCriticalTypes = [
    'deployment',
    'security',
    'authentication',
    'payment',
    'analytics',
  ];

  if (storyType && launchCriticalTypes.some((t) => storyType.toLowerCase().includes(t))) {
    return 80;
  }

  return 50; // Default
}

/**
 * Calculate effort score (inverse - lower effort = higher score)
 */
function calculateEffortScore(effort: string | null): number {
  if (!effort) return EFFORT_SCORES.unknown;
  return EFFORT_SCORES[effort.toLowerCase()] || EFFORT_SCORES.unknown;
}

/**
 * Calculate age score (older stories get a small boost, max 20 points)
 * Prevents stories from languishing forever
 */
function calculateAgeScore(createdAt: Date): number {
  const ageInDays = (Date.now() - createdAt.getTime()) / (1000 * 60 * 60 * 24);

  // Stories older than 7 days get increasing boost, max at 30 days
  if (ageInDays < 1) return 0;
  if (ageInDays < 7) return 10;
  if (ageInDays < 14) return 20;
  if (ageInDays < 30) return 30;
  return 40; // Max boost for very old stories
}

/**
 * Calculate user focus score based on recent mentions/signals
 */
async function calculateUserFocusScore(
  storyId: string,
  workspaceId: string,
  projectId: string
): Promise<number> {
  // Check for recent priority signals mentioning this story/project
  const recentSignals = await prisma.prioritySignal.count({
    where: {
      workspaceId,
      OR: [{ projectId }, { projectId: null }], // Project-specific or global
      expiresAt: { gte: new Date() },
      createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }, // Last 24h
    },
  });

  // More recent signals = higher focus
  if (recentSignals >= 3) return 100;
  if (recentSignals >= 2) return 75;
  if (recentSignals >= 1) return 50;
  return 0;
}

/**
 * Compute composite score from all factors
 */
function computeCompositeScore(factors: {
  prioritySignal: number;
  launchImpact: number;
  effort: number;
  age: number;
  userFocus: number;
}): number {
  return Math.round(
    factors.prioritySignal * WEIGHTS.prioritySignal +
      factors.launchImpact * WEIGHTS.launchImpact +
      factors.effort * WEIGHTS.effort +
      factors.age * WEIGHTS.age +
      factors.userFocus * WEIGHTS.userFocus
  );
}

/**
 * Get stack-ranked stories for a specific project
 */
export async function getStackRankedStoriesByProject(
  projectId: string,
  workspaceId: string,
  limit: number = 50
): Promise<RankedStory[]> {
  // Fetch stories for this project
  const stories = await prisma.story.findMany({
    where: {
      projectId,
      status: { notIn: ['completed', 'rejected', 'cancelled'] },
    },
    include: {
      project: {
        select: { name: true },
      },
    },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });

  if (!featureFlags.PRIORITY_SYSTEM_ENABLED) {
    // Return simple sort by priority level if system disabled
    return stories.map((story) => ({
      id: story.id,
      title: story.title,
      projectId: story.projectId,
      projectName: story.project.name,
      status: story.status,
      priorityLevel: (story.priorityLevel as PriorityLevel) || 'P2',
      priorityScore: story.priorityScore || 50,
      compositeScore: story.priorityScore || 50,
      factors: {
        prioritySignal: story.priorityScore || 50,
        launchImpact: 50,
        effort: 50,
        age: 0,
        userFocus: 0,
      },
      linearTaskId: story.linearTaskId,
      createdAt: story.createdAt,
    }));
  }

  // Calculate scores for each story
  const rankedStories: RankedStory[] = await Promise.all(
    stories.map(async (story) => {
      // Get priority from signals
      const signalPriority = await calculateStoryPriority(
        story.id,
        workspaceId,
        projectId
      );

      // Calculate all factors
      const prioritySignal = signalPriority.priorityScore;
      const launchImpact = calculateLaunchImpact(
        story.advancesLaunchStage,
        undefined // Story type not available in schema
      );
      const effort = calculateEffortScore(null); // Effort not available in schema
      const age = calculateAgeScore(story.createdAt);
      const userFocus = await calculateUserFocusScore(story.id, workspaceId, projectId);

      const factors = { prioritySignal, launchImpact, effort, age, userFocus };
      const compositeScore = computeCompositeScore(factors);

      return {
        id: story.id,
        title: story.title,
        projectId: story.projectId,
        projectName: story.project.name,
        status: story.status,
        priorityLevel: signalPriority.priorityLevel,
        priorityScore: signalPriority.priorityScore,
        compositeScore,
        factors,
        linearTaskId: story.linearTaskId,
        createdAt: story.createdAt,
      };
    })
  );

  // Sort by composite score (descending)
  return rankedStories.sort((a, b) => b.compositeScore - a.compositeScore);
}

/**
 * Get stack-ranked stories across all projects in a workspace
 */
export async function getStackRankedStoriesGlobal(
  workspaceId: string,
  limit: number = 100
): Promise<RankedStory[]> {
  // Get all projects in workspace
  const projects = await prisma.project.findMany({
    where: { workspaceId },
    select: { id: true },
  });

  // Get ranked stories from each project
  const allRanked: RankedStory[] = [];

  for (const project of projects) {
    const projectStories = await getStackRankedStoriesByProject(
      project.id,
      workspaceId,
      Math.ceil(limit / projects.length) + 10 // Fetch extra to ensure we have enough
    );
    allRanked.push(...projectStories);
  }

  // Sort globally and limit
  return allRanked
    .sort((a, b) => b.compositeScore - a.compositeScore)
    .slice(0, limit);
}

/**
 * Update story priority in database based on current signals
 */
export async function updateStoryPriority(
  storyId: string,
  workspaceId: string,
  projectId: string
): Promise<{ priorityLevel: PriorityLevel; priorityScore: number }> {
  const priority = await calculateStoryPriority(storyId, workspaceId, projectId);

  await prisma.story.update({
    where: { id: storyId },
    data: {
      priorityLevel: priority.priorityLevel,
      priorityScore: priority.priorityScore,
    },
  });

  return priority;
}

/**
 * Refresh priorities for all active stories in a project
 */
export async function refreshProjectPriorities(
  projectId: string,
  workspaceId: string
): Promise<number> {
  const stories = await prisma.story.findMany({
    where: {
      projectId,
      status: { notIn: ['completed', 'rejected', 'cancelled'] },
    },
    select: { id: true },
  });

  for (const story of stories) {
    await updateStoryPriority(story.id, workspaceId, projectId);
  }

  return stories.length;
}

/**
 * Keywords that indicate a story advances launch readiness
 */
const LAUNCH_ADVANCING_KEYWORDS = [
  // Core launch requirements
  'deploy', 'deployment', 'production', 'release',
  'domain', 'dns', 'ssl', 'certificate', 'https',
  'authentication', 'auth', 'login', 'signup', 'signin',
  
  // Quality gates
  'security', 'vulnerability', 'xss', 'csrf', 'injection',
  'performance', 'speed', 'optimization', 'lighthouse',
  'seo', 'meta', 'sitemap', 'robots',
  'monitoring', 'logging', 'error tracking', 'sentry',
  
  // Growth requirements
  'analytics', 'tracking', 'posthog', 'google analytics',
  'payment', 'stripe', 'billing', 'subscription', 'pricing',
  'onboarding', 'welcome', 'tutorial',
];

/**
 * Determine if a story advances the launch stage
 * Based on title/description keyword matching
 */
export function computeAdvancesLaunchStage(
  title: string,
  description?: string | null
): boolean {
  const text = `${title} ${description || ''}`.toLowerCase();
  
  return LAUNCH_ADVANCING_KEYWORDS.some(keyword => text.includes(keyword));
}

/**
 * Update advancesLaunchStage flag for all stories in a project
 */
export async function updateLaunchStageFlags(projectId: string): Promise<number> {
  const stories = await prisma.story.findMany({
    where: { projectId },
    select: { id: true, title: true, rationale: true },
  });

  let updated = 0;

  for (const story of stories) {
    const advances = computeAdvancesLaunchStage(story.title, story.rationale);
    
    await prisma.story.update({
      where: { id: story.id },
      data: { advancesLaunchStage: advances },
    });
    
    updated++;
  }

  return updated;
}
