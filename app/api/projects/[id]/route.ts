import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const projectId = params.id;

    const project = await db.project.findUnique({
      where: { id: projectId },
      include: {
        completions: {
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

    // Parse scan data
    const scans = {
      domain: project.domainScanData ? {
        status: 'success',
        data: project.domainScanData,
        scannedAt: project.domainScannedAt?.toISOString() || new Date().toISOString(),
      } : null,
      seo: project.seoScanData ? {
        status: 'success',
        data: project.seoScanData,
        scannedAt: project.seoScannedAt?.toISOString() || new Date().toISOString(),
      } : null,
      analytics: project.analyticsScanData ? {
        status: 'success',
        data: project.analyticsScanData,
        scannedAt: project.analyticsScannedAt?.toISOString() || new Date().toISOString(),
      } : null,
    };

    // Calculate health score from scan data
    const healthScore = calculateHealthScore(scans);

    // Get last scan time
    const scanTimes = [
      project.domainScannedAt,
      project.seoScannedAt,
      project.analyticsScannedAt,
    ].filter(Boolean) as Date[];

    const lastScanTime = scanTimes.length > 0
      ? new Date(Math.max(...scanTimes.map(d => d.getTime()))).toISOString()
      : null;

    return NextResponse.json({
      project: {
        id: project.id,
        name: project.name,
        domain: project.domain,
        repo: project.repo,
        healthScore,
        lastScanTime,
        scans,
        completions: project.completions,
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
