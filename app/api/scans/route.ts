/**
 * Scans API
 * 
 * GET: Returns all scans with optional filtering
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get('projectId');
    const scanType = searchParams.get('type');
    const limit = parseInt(searchParams.get('limit') || '100');

    // Build where clause
    const where: Record<string, unknown> = {};
    if (projectId) where.projectId = projectId;
    if (scanType) where.scanType = scanType;

    const scans = await prisma.scan.findMany({
      where,
      include: {
        project: {
          select: { id: true, name: true },
        },
      },
      orderBy: { scannedAt: 'desc' },
      take: limit,
    });

    // Format response
    const formattedScans = scans.map((scan) => ({
      id: scan.id,
      projectId: scan.projectId,
      projectName: scan.project.name,
      scanType: scan.scanType,
      status: scan.status,
      scannedAt: scan.scannedAt.toISOString(),
      domainData: scan.domainData,
      seoDetail: scan.seoDetail,
      securityIssues: scan.securityIssues,
      playwrightMetrics: scan.playwrightMetrics,
      analyticsData: scan.analyticsData,
      vercelData: scan.vercelData,
    }));

    return NextResponse.json({ scans: formattedScans });
  } catch (error) {
    console.error('Error fetching scans:', error);
    return NextResponse.json(
      { error: 'Failed to fetch scans' },
      { status: 500 }
    );
  }
}
