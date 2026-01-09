/**
 * Scans API
 * 
 * GET: Returns scans with pagination and optional filtering
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

const SINGLE_USER_WORKSPACE_ID = '00000000-0000-0000-0000-000000000002';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    
    // Pagination params
    const page = parseInt(searchParams.get('page') || '1');
    const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 100); // Max 100
    const skip = (page - 1) * limit;
    
    // Filter params
    const projectId = searchParams.get('projectId');
    const scanType = searchParams.get('type');

    // Build where clause
    const where: Record<string, unknown> = {
      workspaceId: SINGLE_USER_WORKSPACE_ID,
    };
    if (projectId && projectId !== 'all') where.projectId = projectId;
    if (scanType) where.scanType = scanType;

    // Execute count and data queries in parallel
    const [total, scans] = await Promise.all([
      prisma.scan.count({ where }),
      prisma.scan.findMany({
        where,
        include: {
          project: {
            select: { id: true, name: true },
          },
        },
        orderBy: { scannedAt: 'desc' },
        skip,
        take: limit,
      }),
    ]);

    const totalPages = Math.ceil(total / limit);

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

    return NextResponse.json({
      scans: formattedScans,
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasMore: page < totalPages,
      },
      _meta: {
        generatedAt: new Date().toISOString(),
        ttlSeconds: 120,
      },
    });
  } catch (error) {
    console.error('Error fetching scans:', error);
    return NextResponse.json({
      scans: [],
      pagination: {
        page: 1,
        limit: 50,
        total: 0,
        totalPages: 0,
        hasMore: false,
      },
      error: 'Database connection timeout - please refresh'
    });
  }
}
