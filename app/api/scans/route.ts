// API route to fetch scan results for dashboard display
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const workspaceId = process.env.WORKSPACE_ID;
    if (!workspaceId) {
      return NextResponse.json({ error: 'WORKSPACE_ID not configured' }, { status: 500 });
    }

    // Get all projects with their latest scans and recent stories
    const projects = await db.project.findMany({
      where: { workspaceId },
      include: {
        scans: {
          orderBy: { scannedAt: 'desc' },
          take: 10, // Get recent scans per project
        },
        stories: {
          orderBy: { createdAt: 'desc' },
          take: 3, // Get 3 most recent stories per project
          select: {
            id: true,
            title: true,
            status: true,
            linearTaskId: true,
            prUrl: true,
            priority: true,
          },
        },
      },
    });

    // Aggregate scan data per project
    const projectsWithScans = projects.map((project) => {
      const domainScan = project.scans.find((s) => s.scanType === 'domain');
      const seoScan = project.scans.find((s) => s.scanType === 'seo');
      const analyticsScan = project.scans.find((s) => s.scanType === 'analytics');

      // Calculate health score based on scan results
      let healthScore = 100;
      const issues: string[] = [];

      // Domain health (30 points)
      if (domainScan) {
        if (domainScan.status === 'error' || domainScan.status === 'timeout') {
          healthScore -= 30;
          issues.push(domainScan.status === 'error' ? 'Domain unreachable' : 'Domain timeout');
        } else {
          const data = domainScan.domainData as any;
          if (data?.ssl === false) {
            healthScore -= 10;
            issues.push('No SSL certificate');
          }
          if (data?.dns === false) {
            healthScore -= 10;
            issues.push('DNS issues');
          }
        }
      } else {
        healthScore -= 5;
        issues.push('No domain scan');
      }

      // SEO health (35 points)
      if (seoScan) {
        const data = seoScan.seoDetail as any;
        if (!data?.title) {
          healthScore -= 10;
          issues.push('Missing title tag');
        }
        if (!data?.metaDescription) {
          healthScore -= 10;
          issues.push('Missing meta description');
        }
        if (!data?.ogImage) {
          healthScore -= 5;
          issues.push('Missing OG image');
        }
        if (!data?.robotsTxt) {
          healthScore -= 5;
          issues.push('Missing robots.txt');
        }
        if (!data?.sitemap) {
          healthScore -= 5;
          issues.push('Missing sitemap');
        }
      } else {
        healthScore -= 5;
        issues.push('No SEO scan');
      }

      // Analytics health (35 points)
      if (analyticsScan) {
        const data = analyticsScan.analyticsData as any;
        const platforms = data?.platforms || [];
        if (platforms.length === 0) {
          healthScore -= 15;
          issues.push('No analytics detected');
        }
      } else {
        healthScore -= 5;
        issues.push('No analytics scan');
      }

      // Determine severity
      let severity: 'critical' | 'high' | 'medium' | 'low' = 'low';
      if (healthScore < 50) severity = 'critical';
      else if (healthScore < 70) severity = 'high';
      else if (healthScore < 85) severity = 'medium';

      return {
        id: project.id,
        name: project.name,
        domain: project.domain,
        healthScore: Math.max(0, healthScore),
        severity,
        issues,
        lastScanTime: project.scans[0]?.scannedAt || null,
        stories: project.stories || [],
        scans: {
          domain: domainScan
            ? {
                status: domainScan.status,
                data: domainScan.domainData,
                scannedAt: domainScan.scannedAt,
              }
            : null,
          seo: seoScan
            ? {
                status: seoScan.status,
                data: seoScan.seoDetail,
                scannedAt: seoScan.scannedAt,
              }
            : null,
          analytics: analyticsScan
            ? {
                status: analyticsScan.status,
                data: analyticsScan.analyticsData,
                scannedAt: analyticsScan.scannedAt,
              }
            : null,
        },
      };
    });

    // Calculate stats
    const stats = {
      total: projectsWithScans.length,
      critical: projectsWithScans.filter((p) => p.severity === 'critical').length,
      high: projectsWithScans.filter((p) => p.severity === 'high').length,
      medium: projectsWithScans.filter((p) => p.severity === 'medium').length,
      healthy: projectsWithScans.filter((p) => p.severity === 'low').length,
      scannedToday: projectsWithScans.filter((p) => {
        if (!p.lastScanTime) return false;
        const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
        return new Date(p.lastScanTime) > dayAgo;
      }).length,
    };

    // Get high priority projects (critical + high severity)
    const highPriority = projectsWithScans
      .filter((p) => p.severity === 'critical' || p.severity === 'high')
      .sort((a, b) => a.healthScore - b.healthScore)
      .slice(0, 10);

    return NextResponse.json({
      stats,
      projects: projectsWithScans,
      highPriority,
    });
  } catch (error) {
    console.error('[API /api/scans] Error fetching scans:', error);
    return NextResponse.json({ error: 'Failed to fetch scans' }, { status: 500 });
  }
}
