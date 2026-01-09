import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

// The hardcoded workspace ID for single-user mode
const SINGLE_USER_WORKSPACE_ID = '00000000-0000-0000-0000-000000000001';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get('projectId');
    const outputType = searchParams.get('outputType');
    const status = searchParams.get('status');
    const search = searchParams.get('search');
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = parseInt(searchParams.get('offset') || '0');

    // Build the where clause
    const where: {
      projectId?: string;
      outputType?: string;
      status?: string;
      OR?: Array<{
        title?: { contains: string; mode: 'insensitive' };
        description?: { contains: string; mode: 'insensitive' };
      }>;
    } = {};

    if (projectId) {
      where.projectId = projectId;
    }

    if (outputType && outputType !== 'all') {
      where.outputType = outputType;
    }

    if (status && status !== 'all') {
      where.status = status;
    }

    if (search) {
      where.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
      ];
    }

    // Fetch outputs with related data
    const [outputs, total] = await Promise.all([
      prisma.agentOutput.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: offset,
        take: limit,
      }),
      prisma.agentOutput.count({ where }),
    ]);

    // Fetch related agent sessions
    const sessionIds = Array.from(new Set(outputs.map(o => o.agentSessionId)));
    const sessions = await prisma.agentSession.findMany({
      where: { id: { in: sessionIds } },
      select: {
        id: true,
        agentName: true,
        agentType: true,
        projectId: true,
      },
    });
    const sessionMap = new Map(sessions.map(s => [s.id, s]));

    // Fetch related projects
    const projectIds = Array.from(new Set(outputs.map(o => o.projectId).filter(Boolean) as string[]));
    const projectsData = await prisma.project.findMany({
      where: { id: { in: projectIds } },
      select: { id: true, name: true },
    });
    const projectMap = new Map(projectsData.map(p => [p.id, p]));

    // Get available filter options
    const outputTypes = await prisma.agentOutput.groupBy({
      by: ['outputType'],
      _count: { outputType: true },
    });

    const statuses = await prisma.agentOutput.groupBy({
      by: ['status'],
      _count: { status: true },
    });

    // Get projects that have outputs
    const projects = await prisma.project.findMany({
      where: { workspaceId: SINGLE_USER_WORKSPACE_ID },
      select: {
        id: true,
        name: true,
      },
    });

    return NextResponse.json({
      outputs: outputs.map((output) => {
        const session = sessionMap.get(output.agentSessionId);
        const project = output.projectId ? projectMap.get(output.projectId) : null;
        return {
          id: output.id,
          title: output.title,
          description: output.description,
          outputType: output.outputType,
          contentType: output.contentType,
          status: output.status,
          reviewNotes: output.reviewNotes,
          storageUrl: output.storageUrl,
          content: output.content,
          createdAt: output.createdAt.toISOString(),
          agentName: session?.agentName || null,
          agentType: session?.agentType || null,
          projectId: output.projectId,
          projectName: project?.name || null,
        };
      }),
      pagination: {
        total,
        limit,
        offset,
        hasMore: offset + outputs.length < total,
      },
      filters: {
        outputTypes: outputTypes.map((t) => ({
          value: t.outputType,
          count: t._count.outputType,
        })),
        statuses: statuses.map((s) => ({
          value: s.status,
          count: s._count.status,
        })),
        projects: projects.map((p) => ({
          id: p.id,
          name: p.name,
        })),
      },
    });
  } catch (error) {
    console.error('Error fetching agent outputs:', error);
    // Return graceful response with empty data for UI to handle
    return NextResponse.json({
      outputs: [],
      pagination: { total: 0, limit: 50, offset: 0, hasMore: false },
      filters: { outputTypes: [], statuses: [], projects: [] },
      error: 'Database connection timeout - please refresh'
    });
  }
}

// Update the status of an output (approve/reject)
export async function PATCH(request: Request) {
  try {
    const body = await request.json();
    const { outputId, status, reviewNotes } = body;

    if (!outputId || !status) {
      return NextResponse.json(
        { error: 'outputId and status are required' },
        { status: 400 }
      );
    }

    const validStatuses = ['pending', 'approved', 'rejected', 'archived'];
    if (!validStatuses.includes(status)) {
      return NextResponse.json(
        { error: `Status must be one of: ${validStatuses.join(', ')}` },
        { status: 400 }
      );
    }

    const updated = await prisma.agentOutput.update({
      where: { id: outputId },
      data: {
        status,
        reviewNotes: reviewNotes || null,
      },
    });

    return NextResponse.json({ success: true, output: updated });
  } catch (error) {
    console.error('Error updating agent output:', error);
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}
