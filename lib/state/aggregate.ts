/**
 * State Aggregation Functions
 * 
 * Computes project health metrics from scan results and story data.
 * Used by the State Manager agent to generate daily project snapshots.
 */

import { prisma } from '@/lib/db';

// Launch stages in order of progression
export const LAUNCH_STAGES = ['idea', 'mvp', 'alpha', 'beta', 'launch', 'growth'] as const;
export type LaunchStage = typeof LAUNCH_STAGES[number];

// Score thresholds for each stage
const STAGE_THRESHOLDS: Record<LaunchStage, number> = {
  idea: 0,
  mvp: 20,
  alpha: 40,
  beta: 60,
  launch: 80,
  growth: 95,
};

// Checklist items and their weight in the score
const CHECKLIST_ITEMS = {
  // Core (40 points)
  repository_exists: { weight: 5, category: 'core' },
  has_deployment: { weight: 10, category: 'core' },
  domain_configured: { weight: 5, category: 'core' },
  ssl_valid: { weight: 5, category: 'core' },
  auth_working: { weight: 15, category: 'core' },

  // Quality (30 points)
  security_passing: { weight: 10, category: 'quality' },
  performance_passing: { weight: 10, category: 'quality' },
  seo_optimized: { weight: 5, category: 'quality' },
  error_monitoring: { weight: 5, category: 'quality' },

  // Growth (30 points)
  analytics_installed: { weight: 10, category: 'growth' },
  payments_configured: { weight: 15, category: 'growth' },
  has_users: { weight: 5, category: 'growth' },
} as const;

type ChecklistKey = keyof typeof CHECKLIST_ITEMS;

export interface ScanScores {
  domain: number | null;
  seo: number | null;
  security: number | null;
  performance: number | null;
  analytics: number | null;
  vercel: number | null;
  overall: number;
}

export interface WorkSummary {
  pending: number;
  in_progress: number;
  completed: number;
  rejected: number;
  total: number;
  completion_rate: number;
}

export interface LaunchChecklist {
  [key: string]: boolean;
}

export interface AggregatedState {
  launchStage: LaunchStage;
  launchScore: number;
  scanScores: ScanScores;
  workSummary: WorkSummary;
  launchChecklist: LaunchChecklist;
}

/**
 * Aggregate scan scores for a project
 */
export async function aggregateScanScores(projectId: string): Promise<ScanScores> {
  // Get the latest scan of each type
  const scanTypes = ['domain', 'seo', 'security', 'performance', 'analytics', 'vercel'];
  
  const latestScans = await Promise.all(
    scanTypes.map(async (scanType) => {
      const scan = await prisma.scan.findFirst({
        where: {
          projectId,
          scanType,
          status: 'ok',
        },
        orderBy: { scannedAt: 'desc' },
      });
      return { type: scanType, scan };
    })
  );

  const scores: ScanScores = {
    domain: null,
    seo: null,
    security: null,
    performance: null,
    analytics: null,
    vercel: null,
    overall: 0,
  };

  let totalWeight = 0;
  let weightedSum = 0;

  for (const { type, scan } of latestScans) {
    if (!scan) continue;

    let score = 0;
    
    switch (type) {
      case 'domain':
        // Check SSL and DNS status
        const domainData = scan.domainData as { ssl?: { valid?: boolean }, dns?: { resolved?: boolean } } | null;
        const sslOk = domainData?.ssl?.valid ?? false;
        const dnsOk = domainData?.dns?.resolved ?? true;
        score = (sslOk ? 50 : 0) + (dnsOk ? 50 : 0);
        break;

      case 'seo':
        // Check for key SEO elements
        const seoData = scan.seoDetail as { title?: string, metaDesc?: string, ogTags?: object, h1?: string } | null;
        const hasTitle = !!seoData?.title;
        const hasMeta = !!seoData?.metaDesc;
        const hasOg = !!seoData?.ogTags && Object.keys(seoData.ogTags).length > 0;
        const hasH1 = !!seoData?.h1;
        score = (hasTitle ? 30 : 0) + (hasMeta ? 30 : 0) + (hasOg ? 20 : 0) + (hasH1 ? 20 : 0);
        break;

      case 'security':
        // Inverse of issue count
        const securityIssues = scan.securityIssues as Array<{ severity: string }> | null;
        const criticalCount = securityIssues?.filter(i => i.severity === 'critical' || i.severity === 'high').length ?? 0;
        score = Math.max(0, 100 - (criticalCount * 20));
        break;

      case 'performance':
        // Use LCP/FCP metrics
        const perfData = scan.playwrightMetrics as { lcp?: number, fcp?: number } | null;
        const lcp = perfData?.lcp ?? 5000;
        const fcp = perfData?.fcp ?? 3000;
        // Good LCP < 2.5s, Good FCP < 1.8s
        const lcpScore = lcp < 2500 ? 50 : (lcp < 4000 ? 30 : 10);
        const fcpScore = fcp < 1800 ? 50 : (fcp < 3000 ? 30 : 10);
        score = lcpScore + fcpScore;
        break;

      case 'analytics':
        // Check if analytics detected
        const analyticsData = scan.analyticsData as { hasPosthog?: boolean, hasGA?: boolean } | null;
        score = (analyticsData?.hasPosthog || analyticsData?.hasGA) ? 100 : 0;
        break;

      case 'vercel':
        // Check deployment status
        const vercelData = scan.vercelData as { status?: string } | null;
        score = vercelData?.status === 'READY' ? 100 : 0;
        break;
    }

    scores[type as keyof Omit<ScanScores, 'overall'>] = score;
    
    // Weight: security and performance matter more
    const weight = type === 'security' || type === 'performance' ? 2 : 1;
    totalWeight += weight;
    weightedSum += score * weight;
  }

  scores.overall = totalWeight > 0 ? Math.round(weightedSum / totalWeight) : 0;

  return scores;
}

/**
 * Aggregate work summary for a project
 */
export async function aggregateWorkSummary(projectId: string): Promise<WorkSummary> {
  const stories = await prisma.story.groupBy({
    by: ['status'],
    where: { projectId },
    _count: { id: true },
  });

  const summary: WorkSummary = {
    pending: 0,
    in_progress: 0,
    completed: 0,
    rejected: 0,
    total: 0,
    completion_rate: 0,
  };

  for (const group of stories) {
    const count = group._count.id;
    summary.total += count;

    switch (group.status) {
      case 'pending':
        summary.pending = count;
        break;
      case 'in_progress':
        summary.in_progress = count;
        break;
      case 'completed':
        summary.completed = count;
        break;
      case 'rejected':
      case 'failed':
        summary.rejected += count;
        break;
    }
  }

  summary.completion_rate = summary.total > 0 
    ? Math.round((summary.completed / summary.total) * 100) 
    : 0;

  return summary;
}

/**
 * Calculate launch checklist from project and scan data
 */
export async function calculateLaunchChecklist(projectId: string): Promise<LaunchChecklist> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: {
      scans: {
        orderBy: { scannedAt: 'desc' },
        take: 20, // Recent scans
      },
    },
  });

  if (!project) {
    return Object.fromEntries(
      Object.keys(CHECKLIST_ITEMS).map(key => [key, false])
    );
  }

  const latestScan = (type: string) => 
    project.scans.find((s: any) => s.scanType === type && s.status === 'ok');

  const checklist: LaunchChecklist = {
    repository_exists: !!project.repo,
    has_deployment: !!project.vercelProjectId || !!latestScan('vercel'),
    domain_configured: !!project.domain,
    ssl_valid: (() => {
      const scan = latestScan('domain');
      const data = scan?.domainData as { ssl?: { valid?: boolean } } | null;
      return data?.ssl?.valid ?? false;
    })(),
    auth_working: true, // Assume true if project is active
    security_passing: (() => {
      const scan = latestScan('security');
      const issues = scan?.securityIssues as Array<{ severity: string }> | null;
      const criticalCount = issues?.filter(i => 
        i.severity === 'critical' || i.severity === 'high'
      ).length ?? 0;
      return criticalCount === 0;
    })(),
    performance_passing: (() => {
      const scan = latestScan('performance');
      const data = scan?.playwrightMetrics as { lcp?: number } | null;
      return (data?.lcp ?? 5000) < 4000;
    })(),
    seo_optimized: (() => {
      const scan = latestScan('seo');
      const data = scan?.seoDetail as { title?: string, metaDesc?: string } | null;
      return !!(data?.title && data?.metaDesc);
    })(),
    error_monitoring: false, // Would need Sentry integration check
    analytics_installed: project.hasPosthog || (() => {
      const scan = latestScan('analytics');
      const data = scan?.analyticsData as { hasPosthog?: boolean, hasGA?: boolean } | null;
      return !!(data?.hasPosthog || data?.hasGA);
    })(),
    payments_configured: false, // Would need Stripe check
    has_users: project.status.includes('Live'), // Proxy: if live, likely has users
  };

  return checklist;
}

/**
 * Calculate launch score from checklist
 */
export function calculateLaunchScore(checklist: LaunchChecklist): number {
  let score = 0;
  
  for (const [key, config] of Object.entries(CHECKLIST_ITEMS)) {
    if (checklist[key]) {
      score += config.weight;
    }
  }

  return Math.min(100, score);
}

/**
 * Derive launch stage from score
 */
export function deriveLaunchStage(score: number): LaunchStage {
  // Go from highest to lowest threshold
  for (let i = LAUNCH_STAGES.length - 1; i >= 0; i--) {
    const stage = LAUNCH_STAGES[i];
    if (score >= STAGE_THRESHOLDS[stage]) {
      return stage;
    }
  }
  return 'idea';
}

/**
 * Full state aggregation for a project
 */
export async function aggregateProjectState(projectId: string): Promise<AggregatedState> {
  const [scanScores, workSummary, launchChecklist] = await Promise.all([
    aggregateScanScores(projectId),
    aggregateWorkSummary(projectId),
    calculateLaunchChecklist(projectId),
  ]);

  const launchScore = calculateLaunchScore(launchChecklist);
  const launchStage = deriveLaunchStage(launchScore);

  return {
    launchStage,
    launchScore,
    scanScores,
    workSummary,
    launchChecklist,
  };
}

/**
 * Create a project snapshot in the database
 */
export async function createProjectSnapshot(
  projectId: string,
  aiAssessment?: string,
  recommendedFocus?: string[]
) {
  const state = await aggregateProjectState(projectId);

  const snapshot = await prisma.projectSnapshot.create({
    data: {
      projectId,
      launchStage: state.launchStage,
      launchScore: state.launchScore,
      scanScores: state.scanScores as object,
      workSummary: state.workSummary as object,
      launchChecklist: state.launchChecklist as object,
      aiAssessment,
      recommendedFocus: recommendedFocus ?? [],
    },
  });

  return snapshot;
}
