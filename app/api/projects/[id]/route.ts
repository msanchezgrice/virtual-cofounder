import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    // In Next.js 15, params is a Promise that needs to be awaited
    const { id: projectId } = await context.params;

    const project = await db.project.findUnique({
      where: { id: projectId },
      select: {
        id: true,
        name: true,
        domain: true,
        repo: true,
        status: true,
        hasPosthog: true,
        hasResend: true,
        vercelProjectId: true,
        lastScannedAt: true,
        scans: {
          orderBy: { scannedAt: 'desc' },
          take: 20,
        },
        stories: {
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            title: true,
            status: true,
            priority: true,
            createdAt: true,
            prUrl: true,
            linearTaskId: true,
          },
        },
        snapshots: {
          orderBy: { snapshotAt: 'desc' },
          take: 1,
          select: {
            launchStage: true,
            launchScore: true,
            scanScores: true,
          },
        },
      },
    });

    // Fetch agent sessions for this project
    const agentSessions = await db.agentSession.findMany({
      where: { projectId },
      orderBy: { startedAt: 'desc' },
      take: 20,
      select: {
        id: true,
        agentName: true,
        agentType: true,
        status: true,
        startedAt: true,
        completedAt: true,
        tokensUsed: true,
        turnsUsed: true,
      },
    });

    if (!project) {
      return NextResponse.json(
        { error: 'Project not found' },
        { status: 404 }
      );
    }

    // Parse scan data from scan records
    const domainScan = project.scans.find(s => s.scanType === 'domain');
    const seoScan = project.scans.find(s => s.scanType === 'seo');
    const analyticsScan = project.scans.find(s => s.scanType === 'analytics');
    const vercelScan = project.scans.find(s => s.scanType === 'vercel');
    const performanceScan = project.scans.find(s => s.scanType === 'performance');
    const screenshotScan = project.scans.find(s => s.scanType === 'screenshot');
    const securityScan = project.scans.find(s => s.scanType === 'security');

    const scans = {
      domain: domainScan ? {
        status: domainScan.status,
        data: domainScan.domainData,
        scannedAt: domainScan.scannedAt.toISOString(),
      } : null,
      seo: seoScan ? {
        status: seoScan.status,
        data: seoScan.seoDetail,
        scannedAt: seoScan.scannedAt.toISOString(),
      } : null,
      analytics: analyticsScan ? {
        status: analyticsScan.status,
        data: analyticsScan.analyticsData,
        scannedAt: analyticsScan.scannedAt.toISOString(),
      } : null,
      vercel: vercelScan ? {
        status: vercelScan.status,
        data: vercelScan.vercelData,
        scannedAt: vercelScan.scannedAt.toISOString(),
      } : null,
      performance: performanceScan ? {
        status: performanceScan.status,
        data: performanceScan.playwrightMetrics,
        scannedAt: performanceScan.scannedAt.toISOString(),
      } : null,
      screenshot: screenshotScan ? {
        status: screenshotScan.status,
        data: screenshotScan.playwrightMetrics,
        scannedAt: screenshotScan.scannedAt.toISOString(),
      } : null,
      security: securityScan ? {
        status: securityScan.status,
        data: securityScan.securityIssues,
        scannedAt: securityScan.scannedAt.toISOString(),
      } : null,
    };

    // Calculate health score from scan data
    const healthScore = calculateHealthScore(scans);

    // Get launch score from snapshot or calculate from health score
    const latestSnapshot = project.snapshots[0];
    const launchScore = latestSnapshot?.launchScore || healthScore;
    const launchStage = latestSnapshot?.launchStage || getStageFromStatus(project.status);

    // Get last scan time from actual scans
    const lastScanTime = project.scans.length > 0
      ? project.scans[0].scannedAt.toISOString()
      : project.lastScannedAt?.toISOString() || null;

    // Generate description from available data
    const description = generateDescription(project);

    // Generate history from stories, scans, and agent sessions
    const history = generateHistory(project.stories, project.scans, agentSessions);

    return NextResponse.json({
      project: {
        id: project.id,
        name: project.name,
        domain: project.domain,
        repo: project.repo,
        status: launchStage,
        description,
        healthScore,
        launchScore,
        lastScanTime,
        scans,
        stories: project.stories,
        history,
      },
    });
  } catch (error) {
    console.error('Failed to fetch project:', error);
    // Return 200 with error for graceful UI handling
    return NextResponse.json(
      { project: null, error: 'Database connection failed - please try again' },
      { status: 200 }
    );
  }
}

function getStageFromStatus(status: string): string {
  // Map the status field to display-friendly stage names
  const statusLower = status?.toLowerCase() || '';
  if (statusLower.includes('pre-launch') || statusLower.includes('mvp')) return 'Beta';
  if (statusLower.includes('maintenance')) return 'Maintenance';
  if (statusLower.includes('inactive')) return 'Inactive';
  if (statusLower.includes('live') || statusLower.includes('production')) return 'Production';
  return 'Active';
}

function generateDescription(project: {
  name: string;
  domain: string | null;
  repo: string | null;
  hasPosthog: boolean;
  hasResend: boolean;
  vercelProjectId: string | null;
}): string {
  const parts: string[] = [];
  
  if (project.repo) {
    parts.push('Connected to GitHub');
  }
  if (project.vercelProjectId) {
    parts.push('Deployed on Vercel');
  }
  if (project.hasPosthog) {
    parts.push('PostHog Analytics');
  }
  if (project.hasResend) {
    parts.push('Resend Email');
  }
  
  if (parts.length === 0) {
    return project.domain ? `Monitoring ${project.domain}` : 'Project configuration';
  }
  
  return parts.join(' • ');
}

interface HistoryEvent {
  id: string;
  type: 'pr_merged' | 'story_created' | 'scan_completed' | 'priority_updated' | 'story_approved' | 'story_rejected' | 'agent_spawned' | 'agent_completed';
  title: string;
  description: string | null;
  status: string | null;
  timestamp: string;
  metadata?: {
    prUrl?: string;
    storyId?: string;
    scanTypes?: string[];
    scanScores?: { type: string; score: number; maxScore: number }[];
    agentName?: string;
    agentType?: string;
    tokensUsed?: number;
  };
}

function generateHistory(stories: any[], scans: any[], agentSessions: any[] = []): HistoryEvent[] {
  const events: HistoryEvent[] = [];

  // Add events from stories
  stories.forEach((story) => {
    if (story.status === 'completed' && story.prUrl) {
      events.push({
        id: `pr-${story.id}`,
        type: 'pr_merged',
        title: `PR Merged: ${story.title}`,
        description: 'Code Generation Agent completed the implementation.',
        status: 'completed',
        timestamp: story.createdAt.toISOString ? story.createdAt.toISOString() : story.createdAt,
        metadata: { prUrl: story.prUrl, storyId: story.id }
      });
    } else if (story.status === 'approved') {
      events.push({
        id: `approved-${story.id}`,
        type: 'story_approved',
        title: `Story Approved: ${story.title}`,
        description: 'Story has been approved and is ready for execution.',
        status: 'approved',
        timestamp: story.createdAt.toISOString ? story.createdAt.toISOString() : story.createdAt,
        metadata: { storyId: story.id }
      });
    } else {
      events.push({
        id: `story-${story.id}`,
        type: 'story_created',
        title: `Story Created: ${story.title}`,
        description: 'Orchestrator identified this task based on scan results.',
        status: story.status,
        timestamp: story.createdAt.toISOString ? story.createdAt.toISOString() : story.createdAt,
        metadata: { storyId: story.id }
      });
    }
  });

  // Group scans by date to create "Scan Completed" events
  const scansByDay = new Map<string, any[]>();
  scans.forEach((scan) => {
    const day = scan.scannedAt.toISOString().split('T')[0];
    if (!scansByDay.has(day)) {
      scansByDay.set(day, []);
    }
    scansByDay.get(day)!.push(scan);
  });

  // Create a scan event for each day
  scansByDay.forEach((dayScans, day) => {
    const scanTypes = Array.from(new Set(dayScans.map((s) => s.scanType)));
    const scanScores = dayScans
      .filter((s) => s.status === 'success')
      .map((s) => {
        const type = s.scanType.charAt(0).toUpperCase() + s.scanType.slice(1);
        let score = 0;
        let maxScore = 10;
        
        // Calculate rough scores based on scan data
        if (s.scanType === 'domain' && s.domainData) {
          maxScore = 15;
          if (s.domainData.hasSSL) score += 5;
          if (s.domainData.isReachable) score += 5;
          if (s.domainData.statusCode === 200) score += 5;
        } else if (s.scanType === 'seo' && s.seoDetail) {
          score = (s.seoDetail.hasMetaDescription ? 2 : 0) +
                  (s.seoDetail.hasOgTags ? 2 : 0) +
                  (s.seoDetail.hasRobotsTxt ? 2 : 0) +
                  (s.seoDetail.hasSitemap ? 2 : 0) +
                  (s.seoDetail.hasTitle ? 2 : 0);
        } else if (s.scanType === 'analytics' && s.analyticsData) {
          score = s.analyticsData.hasAnalytics ? 10 : 0;
        } else if (s.scanType === 'security') {
          maxScore = 5;
          score = s.status === 'success' ? 5 : 0;
        }
        
        return { type, score, maxScore };
      });

    events.push({
      id: `scan-${day}`,
      type: 'scan_completed',
      title: 'Scan Completed',
      description: null,
      status: 'success',
      timestamp: dayScans[0].scannedAt.toISOString(),
      metadata: {
        scanTypes,
        scanScores: scanScores.length > 0 ? scanScores : undefined
      }
    });
  });

  // Add agent session events
  agentSessions.forEach((session) => {
    const agentIcon = getAgentIcon(session.agentName);
    
    if (session.status === 'running') {
      events.push({
        id: `agent-spawn-${session.id}`,
        type: 'agent_spawned',
        title: `${agentIcon} ${session.agentName} Started`,
        description: `Agent spawned for ${session.agentType} analysis`,
        status: 'running',
        timestamp: session.startedAt.toISOString(),
        metadata: {
          agentName: session.agentName,
          agentType: session.agentType,
        }
      });
    } else if (session.status === 'completed') {
      events.push({
        id: `agent-complete-${session.id}`,
        type: 'agent_completed',
        title: `${agentIcon} ${session.agentName} Completed`,
        description: `Analysis complete. Used ${session.tokensUsed?.toLocaleString() || 0} tokens in ${session.turnsUsed || 0} turns.`,
        status: 'completed',
        timestamp: (session.completedAt || session.startedAt).toISOString(),
        metadata: {
          agentName: session.agentName,
          agentType: session.agentType,
          tokensUsed: session.tokensUsed || 0,
        }
      });
    } else if (session.status === 'failed') {
      events.push({
        id: `agent-fail-${session.id}`,
        type: 'agent_completed',
        title: `${agentIcon} ${session.agentName} Failed`,
        description: 'Agent execution failed',
        status: 'failed',
        timestamp: (session.completedAt || session.startedAt).toISOString(),
        metadata: {
          agentName: session.agentName,
          agentType: session.agentType,
        }
      });
    }
  });

  // Sort by timestamp descending
  return events.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
}

function getAgentIcon(agentName: string): string {
  const name = agentName.toLowerCase();
  if (name.includes('security')) return '🛡️';
  if (name.includes('seo')) return '🔎';
  if (name.includes('analytics')) return '📊';
  if (name.includes('domain')) return '🌐';
  if (name.includes('performance')) return '⚡';
  if (name.includes('deployment')) return '🚀';
  if (name.includes('code')) return '⚙️';
  if (name.includes('head of product') || name.includes('hop')) return '🧠';
  return '🤖';
}

function calculateHealthScore(scans: any): number {
  let totalScore = 100;

  // Domain scan issues
  if (scans.domain?.data) {
    const domainData = scans.domain.data;
    if (!domainData.hasSSL) {
      totalScore -= 15;
    }
    if (!domainData.isReachable) {
      totalScore -= 20;
    }
  }

  // SEO scan issues
  if (scans.seo?.data) {
    const seoData = scans.seo.data;
    if (!seoData.hasMetaDescription) {
      totalScore -= 5;
    }
    if (!seoData.hasOgTags) {
      totalScore -= 5;
    }
    if (!seoData.hasRobotsTxt) {
      totalScore -= 3;
    }
    if (!seoData.hasSitemap) {
      totalScore -= 3;
    }
  }

  // Analytics scan issues
  if (scans.analytics?.data) {
    const analyticsData = scans.analytics.data;
    if (!analyticsData.hasAnalytics) {
      totalScore -= 10;
    }
  }

  // Security scan issues
  if (scans.security?.data) {
    const securityData = scans.security.data;
    if (securityData.vulnerabilities?.length > 0) {
      totalScore -= Math.min(20, securityData.vulnerabilities.length * 5);
    }
  }

  return Math.max(0, totalScore);
}
