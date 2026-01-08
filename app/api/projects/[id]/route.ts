import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const projectId = params.id;

    const project = await db.project.findUnique({
      where: { id: projectId },
      select: {
        id: true,
        name: true,
        domain: true,
        repo: true,
        lastScannedAt: true,
        scans: {
          orderBy: { scannedAt: 'desc' },
          take: 10,
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
    };

    // Calculate health score from scan data
    const healthScore = calculateHealthScore(scans);

    // Get last scan time from actual scans
    const lastScanTime = project.scans.length > 0
      ? project.scans[0].scannedAt.toISOString()
      : project.lastScannedAt?.toISOString() || null;

    return NextResponse.json({
      project: {
        id: project.id,
        name: project.name,
        domain: project.domain,
        repo: project.repo,
        healthScore,
        lastScanTime,
        scans,
        stories: project.stories,
      },
    });
  } catch (error) {
    console.error('Failed to fetch project:', error);
    return NextResponse.json(
      { error: 'Failed to fetch project' },
      { status: 500 }
    );
  }
}

function calculateHealthScore(scans: any): number {
  let totalScore = 100;
  let issueCount = 0;

  // Domain scan issues
  if (scans.domain?.data) {
    const domainData = scans.domain.data;
    if (!domainData.hasSSL) {
      totalScore -= 15;
      issueCount++;
    }
    if (!domainData.isReachable) {
      totalScore -= 20;
      issueCount++;
    }
  }

  // SEO scan issues
  if (scans.seo?.data) {
    const seoData = scans.seo.data;
    if (!seoData.hasMetaDescription) {
      totalScore -= 5;
      issueCount++;
    }
    if (!seoData.hasOgTags) {
      totalScore -= 5;
      issueCount++;
    }
    if (!seoData.hasRobotsTxt) {
      totalScore -= 3;
      issueCount++;
    }
    if (!seoData.hasSitemap) {
      totalScore -= 3;
      issueCount++;
    }
  }

  // Analytics scan issues
  if (scans.analytics?.data) {
    const analyticsData = scans.analytics.data;
    if (!analyticsData.hasAnalytics) {
      totalScore -= 10;
      issueCount++;
    }
  }

  return Math.max(0, totalScore);
}
