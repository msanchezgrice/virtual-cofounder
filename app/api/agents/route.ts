import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { agentRegistry, type AgentDefinition } from '@/lib/agents/index';

export const dynamic = 'force-dynamic';

// Agent display info
const AGENT_DISPLAY = {
  'head-of-product': { icon: '🧠', gradient: 'from-purple-500 to-indigo-600' },
  'security': { icon: '🛡️', gradient: 'from-red-500 to-rose-600' },
  'analytics': { icon: '📊', gradient: 'from-blue-500 to-cyan-600' },
  'domain': { icon: '🌐', gradient: 'from-green-500 to-emerald-600' },
  'seo': { icon: '🔎', gradient: 'from-purple-500 to-violet-600' },
  'deployment': { icon: '🚀', gradient: 'from-orange-500 to-amber-600' },
  'codegen': { icon: '⚙️', gradient: 'from-emerald-500 to-green-600' },
  'test': { icon: '🧪', gradient: 'from-cyan-500 to-teal-600' },
  'review': { icon: '👁️', gradient: 'from-slate-500 to-gray-600' },
  'design': { icon: '🎨', gradient: 'from-pink-500 to-rose-600' },
  'copy': { icon: '📝', gradient: 'from-amber-500 to-yellow-600' },
  'docs': { icon: '📚', gradient: 'from-indigo-500 to-blue-600' },
  'research': { icon: '🔬', gradient: 'from-violet-500 to-purple-600' },
  'performance': { icon: '⚡', gradient: 'from-yellow-500 to-orange-600' },
  'accessibility': { icon: '♿', gradient: 'from-teal-500 to-cyan-600' },
  'database': { icon: '🗃️', gradient: 'from-slate-600 to-zinc-700' },
  'api': { icon: '🔌', gradient: 'from-blue-600 to-indigo-700' },
} as const;

export async function GET() {
  try {
    // Get active agent sessions (running or recent)
    const activeSessions = await prisma.agentSession.findMany({
      where: {
        OR: [
          { status: 'running' },
          { 
            status: 'completed',
            completedAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } // Last 24 hours
          }
        ]
      },
      orderBy: { startedAt: 'desc' },
      take: 20,
      include: {
        orchestratorRun: {
          select: { id: true, runId: true }
        }
      }
    });

    // Get recent findings from stories
    const recentStories = await prisma.story.findMany({
      take: 50,
      orderBy: { createdAt: 'desc' },
      include: {
        project: { select: { name: true } }
      }
    });

    // Build registry with all 17 agents
    const registry = Object.entries(agentRegistry).map(([role, agent]: [string, AgentDefinition]) => {
      const display = AGENT_DISPLAY[role as keyof typeof AGENT_DISPLAY] || { icon: '🤖', gradient: 'from-gray-500 to-gray-600' };
      const modelShort = agent.model.includes('opus') ? 'Opus' : 'Sonnet';
      
      // Find sessions for this agent
      const agentSessions = activeSessions.filter(s => s.agentName === agent.name || s.agentName.toLowerCase().includes(role));
      const runningSessions = agentSessions.filter(s => s.status === 'running');
      const lastSession = agentSessions[0];
      
      return {
        role,
        name: agent.name,
        type: agent.type,
        model: modelShort,
        icon: display.icon,
        gradient: display.gradient,
        description: agent.description || '',
        tools: agent.tools.slice(0, 4), // First 4 tools
        canSpawnSubagents: agent.canSpawnSubagents,
        status: runningSessions.length > 0 ? 'running' : (lastSession ? 'idle' : 'ready'),
        lastRun: lastSession?.startedAt || null,
        sessionsCount: agentSessions.length,
      };
    });

    // Process active sessions with thinking traces
    const activeAgents = activeSessions
      .filter(s => s.status === 'running')
      .map(session => {
        const agentInfo = (Object.entries(agentRegistry) as [string, AgentDefinition][]).find(([_, a]) => a.name === session.agentName);
        const role = agentInfo?.[0] || 'unknown';
        const display = AGENT_DISPLAY[role as keyof typeof AGENT_DISPLAY] || { icon: '🤖', gradient: 'from-gray-500 to-gray-600' };
        
        // Parse thinking trace
        const thinkingTrace = Array.isArray(session.thinkingTrace) 
          ? session.thinkingTrace as Array<{ turn: number; thinking: string; action: string }>
          : [];
        
        // Parse tool calls
        const toolCalls = Array.isArray(session.toolCalls)
          ? session.toolCalls as Array<{ tool: string; input: unknown; output: unknown; duration: number }>
          : [];

        return {
          id: session.id,
          agentName: session.agentName,
          role,
          icon: display.icon,
          gradient: display.gradient,
          status: session.status,
          projectId: session.projectId,
          storyId: session.storyId,
          startedAt: session.startedAt,
          tokensUsed: session.tokensUsed || 0,
          turnsUsed: session.turnsUsed,
          thinkingTrace,
          toolCalls: toolCalls.slice(-5), // Last 5 tool calls
        };
      });

    // Get recent completed sessions for activity feed
    const recentSessions = activeSessions
      .filter(s => s.status === 'completed')
      .slice(0, 10)
      .map(session => {
        const agentInfo = (Object.entries(agentRegistry) as [string, AgentDefinition][]).find(([_, a]) => a.name === session.agentName);
        const role = agentInfo?.[0] || 'unknown';
        const display = AGENT_DISPLAY[role as keyof typeof AGENT_DISPLAY] || { icon: '🤖', gradient: 'from-gray-500 to-gray-600' };
        
        return {
          id: session.id,
          agentName: session.agentName,
          role,
          icon: display.icon,
          status: 'completed',
          startedAt: session.startedAt,
          completedAt: session.completedAt,
          tokensUsed: session.tokensUsed || 0,
          turnsUsed: session.turnsUsed,
        };
      });

    return NextResponse.json({
      activeAgents,
      registry,
      recentSessions,
      stats: {
        activeCount: activeAgents.length,
        totalAgents: registry.length,
        sessionsToday: activeSessions.length,
      }
    });
  } catch (error) {
    console.error('Failed to fetch agents:', error);
    // Return graceful response with empty data for UI to handle
    return NextResponse.json({
      activeAgents: [],
      registry: [],
      recentSessions: [],
      stats: {
        activeCount: 0,
        totalAgents: 0,
        sessionsToday: 0,
      },
      error: 'Database connection timeout - please refresh'
    });
  }
}
