import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { agentRegistry, type AgentDefinition } from '@/lib/agents/index';

export const dynamic = 'force-dynamic';

// Agent display info
const AGENT_DISPLAY: Record<string, { icon: string; gradient: string }> = {
  'head-of-product': { icon: '🧠', gradient: 'from-purple-500 to-indigo-600' },
  'security': { icon: '🛡️', gradient: 'from-red-500 to-rose-600' },
  'analytics': { icon: '📊', gradient: 'from-blue-500 to-cyan-600' },
  'domain': { icon: '🌐', gradient: 'from-green-500 to-emerald-600' },
  'seo': { icon: '🔎', gradient: 'from-purple-500 to-violet-600' },
  'deployment': { icon: '🚀', gradient: 'from-orange-500 to-amber-600' },
  'codegen': { icon: '⚙️', gradient: 'from-emerald-500 to-green-600' },
  'performance': { icon: '⚡', gradient: 'from-yellow-500 to-orange-600' },
};

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: projectId } = await params;
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '20');
    const includeCompleted = searchParams.get('includeCompleted') !== 'false';

    // Get agent sessions for this project
    const sessions = await prisma.agentSession.findMany({
      where: {
        projectId,
        ...(includeCompleted ? {} : { status: 'running' }),
      },
      orderBy: { startedAt: 'desc' },
      take: limit,
      include: {
        orchestratorRun: {
          select: { id: true, runId: true, status: true },
        },
      },
    });

    // Get agent findings for this project
    const findings = await prisma.agentFinding.findMany({
      where: { projectId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    // Get orchestrator runs that analyzed this project
    const orchestratorRuns = await prisma.orchestratorRun.findMany({
      where: {
        agentSessions: {
          some: { projectId },
        },
      },
      orderBy: { startedAt: 'desc' },
      take: 10,
      select: {
        id: true,
        runId: true,
        status: true,
        findingsCount: true,
        storiesCount: true,
        agentsSpawned: true,
        totalTokens: true,
        estimatedCost: true,
        startedAt: true,
        completedAt: true,
      },
    });

    // Process sessions with display info
    const processedSessions = sessions.map(session => {
      // Find matching agent in registry
      const agentEntry = Object.entries(agentRegistry).find(
        ([key, a]) => (a as AgentDefinition).name === session.agentName || session.agentName.toLowerCase().includes(key.toLowerCase())
      );
      const role = agentEntry?.[0] || 'unknown';
      const display = AGENT_DISPLAY[role] || { icon: '🤖', gradient: 'from-gray-500 to-gray-600' };

      return {
        id: session.id,
        agentName: session.agentName,
        agentType: session.agentType,
        role,
        icon: display.icon,
        gradient: display.gradient,
        status: session.status,
        startedAt: session.startedAt,
        completedAt: session.completedAt,
        tokensUsed: session.tokensUsed || 0,
        turnsUsed: session.turnsUsed,
        thinkingTrace: session.thinkingTrace,
        toolCalls: session.toolCalls,
        orchestratorRunId: session.orchestratorRunId,
      };
    });

    // Process findings by agent
    type ProcessedFinding = {
      id: string;
      issue: string;
      action: string;
      severity: string;
      effort: string;
      impact: string;
      confidence: number;
      createdAt: Date;
    };
    const findingsByAgent = findings.reduce((acc, f) => {
      acc[f.agent] = acc[f.agent] || [];
      acc[f.agent].push({
        id: f.id,
        issue: f.issue,
        action: f.action,
        severity: f.severity,
        effort: f.effort,
        impact: f.impact,
        confidence: f.confidence,
        createdAt: f.createdAt,
      });
      return acc;
    }, {} as Record<string, ProcessedFinding[]>);

    // Calculate stats
    const stats = {
      totalSessions: sessions.length,
      runningSessions: sessions.filter(s => s.status === 'running').length,
      completedSessions: sessions.filter(s => s.status === 'completed').length,
      failedSessions: sessions.filter(s => s.status === 'failed').length,
      totalFindings: findings.length,
      totalTokensUsed: sessions.reduce((sum, s) => sum + (s.tokensUsed || 0), 0),
    };

    return NextResponse.json({
      sessions: processedSessions,
      findings: findingsByAgent,
      orchestratorRuns,
      stats,
    });
  } catch (error) {
    console.error('Failed to fetch project agents:', error);
    return NextResponse.json({
      sessions: [],
      findings: {},
      orchestratorRuns: [],
      stats: {
        totalSessions: 0,
        runningSessions: 0,
        completedSessions: 0,
        failedSessions: 0,
        totalFindings: 0,
        totalTokensUsed: 0,
      },
      error: 'Failed to fetch agent data',
    });
  }
}
