/**
 * Project Progress API
 * 
 * Returns launch readiness data for a project including:
 * - Launch score and stage
 * - Checklist items
 * - AI recommendations
 * - Work summary
 */

import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
import { prisma } from '@/lib/db';
import { 
  aggregateProjectState, 
  LAUNCH_STAGES,
  type LaunchStage 
} from '@/lib/state/aggregate';

interface StageData {
  id: LaunchStage;
  name: string;
  complete: boolean;
  current?: boolean;
}

interface ChecklistItem {
  id: string;
  label: string;
  complete: boolean;
  category: string;
}

const CHECKLIST_LABELS: Record<string, { label: string; category: string }> = {
  repository_exists: { label: 'Repository exists', category: 'core' },
  has_deployment: { label: 'Deployment configured', category: 'core' },
  domain_configured: { label: 'Domain configured', category: 'core' },
  ssl_valid: { label: 'SSL certificate valid', category: 'core' },
  auth_working: { label: 'Authentication working', category: 'core' },
  security_passing: { label: 'Security scan passing', category: 'quality' },
  performance_passing: { label: 'Performance passing', category: 'quality' },
  seo_optimized: { label: 'SEO optimized', category: 'quality' },
  error_monitoring: { label: 'Error monitoring', category: 'quality' },
  analytics_installed: { label: 'Analytics installed', category: 'growth' },
  payments_configured: { label: 'Payments configured', category: 'growth' },
  has_users: { label: 'Has active users', category: 'growth' },
};

const STAGE_NAMES: Record<LaunchStage, string> = {
  idea: 'Idea',
  mvp: 'MVP',
  alpha: 'Alpha',
  beta: 'Beta',
  launch: 'Launch',
  growth: 'Growth',
};

function generateRecommendations(
  checklist: Record<string, boolean>,
  launchStage: LaunchStage,
  launchScore: number
): string[] {
  const recommendations: string[] = [];

  // Priority order for recommendations
  const priorityItems = [
    { key: 'security_passing', msg: 'Complete security scan and address all critical issues' },
    { key: 'analytics_installed', msg: 'Set up PostHog or similar analytics to track user behavior' },
    { key: 'payments_configured', msg: 'Configure Stripe or similar for payment processing before launch' },
    { key: 'error_monitoring', msg: 'Add error monitoring with Sentry to catch production issues' },
    { key: 'seo_optimized', msg: 'Optimize SEO - add meta tags, descriptions, and structured data' },
    { key: 'performance_passing', msg: 'Improve performance - optimize images, reduce bundle size' },
    { key: 'domain_configured', msg: 'Configure a custom domain for your production deployment' },
    { key: 'ssl_valid', msg: 'Ensure SSL certificate is properly configured and valid' },
  ];

  for (const item of priorityItems) {
    if (!checklist[item.key]) {
      recommendations.push(item.msg);
      if (recommendations.length >= 4) break;
    }
  }

  // Stage-specific recommendations
  if (launchStage === 'idea' && recommendations.length < 4) {
    recommendations.push('Focus on defining core features and building an MVP');
  }
  if (launchStage === 'mvp' && recommendations.length < 4) {
    recommendations.push('Get early user feedback to validate product-market fit');
  }
  if (launchStage === 'alpha' && recommendations.length < 4) {
    recommendations.push('Address critical bugs and prepare for wider testing');
  }
  if (launchStage === 'beta' && recommendations.length < 4) {
    recommendations.push('Polish UX and prepare go-to-market strategy');
  }
  if (launchStage === 'launch' && recommendations.length < 4) {
    recommendations.push('Monitor metrics closely and respond to user feedback quickly');
  }

  return recommendations.slice(0, 4);
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Verify project exists
    const project = await prisma.project.findUnique({
      where: { id },
      select: { id: true, name: true },
    });

    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    // Get aggregated state
    const state = await aggregateProjectState(id);

    // Build stages array
    const currentStageIndex = LAUNCH_STAGES.indexOf(state.launchStage);
    const stages: StageData[] = LAUNCH_STAGES.map((stage, index) => ({
      id: stage,
      name: STAGE_NAMES[stage],
      complete: index < currentStageIndex,
      current: index === currentStageIndex,
    }));

    // Build checklist items
    const checklist: ChecklistItem[] = Object.entries(state.launchChecklist).map(
      ([key, complete]) => ({
        id: key,
        label: CHECKLIST_LABELS[key]?.label || key,
        category: CHECKLIST_LABELS[key]?.category || 'other',
        complete: complete as boolean,
      })
    );

    // Generate recommendations
    const recommendations = generateRecommendations(
      state.launchChecklist,
      state.launchStage,
      state.launchScore
    );

    return NextResponse.json({
      projectId: id,
      projectName: project.name,
      stage: state.launchStage,
      score: state.launchScore,
      stages,
      checklist,
      recommendations,
      workSummary: state.workSummary,
      scanScores: state.scanScores,
      updatedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error fetching project progress:', error);
    return NextResponse.json(
      { error: 'Failed to fetch project progress' },
      { status: 500 }
    );
  }
}
