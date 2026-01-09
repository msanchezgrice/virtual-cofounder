'use client';

import { useState, useEffect } from 'react';

interface ThinkingStep {
  turn: number;
  thinking: string;
  action: string;
}

interface ToolCall {
  tool: string;
  input: unknown;
  output: unknown;
  duration: number;
}

interface ActiveAgent {
  id: string;
  agentName: string;
  role: string;
  icon: string;
  gradient: string;
  status: string;
  projectId: string | null;
  storyId: string | null;
  startedAt: string;
  tokensUsed: number;
  turnsUsed: number;
  thinkingTrace: ThinkingStep[];
  toolCalls: ToolCall[];
}

interface RegistryAgent {
  role: string;
  name: string;
  type: string;
  model: string;
  icon: string;
  gradient: string;
  description: string;
  tools: string[];
  canSpawnSubagents: boolean;
  status: string;
  lastRun: string | null;
  sessionsCount: number;
}

interface RecentSession {
  id: string;
  agentName: string;
  role: string;
  icon: string;
  status: string;
  startedAt: string;
  completedAt: string | null;
  tokensUsed: number;
  turnsUsed: number;
}

interface AgentData {
  activeAgents: ActiveAgent[];
  registry: RegistryAgent[];
  recentSessions: RecentSession[];
  stats: {
    activeCount: number;
    totalAgents: number;
    sessionsToday: number;
  };
}

export default function AgentsPage() {
  const [data, setData] = useState<AgentData | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>('all');

  useEffect(() => {
    fetchAgents();
    // Poll for updates every 5 seconds when there are active agents
    const interval = setInterval(fetchAgents, 5000);
    return () => clearInterval(interval);
  }, []);

  const fetchAgents = async () => {
    try {
      const res = await fetch('/api/agents');
      const result = await res.json();
      setData(result);
    } catch (error) {
      console.error('Failed to fetch agents:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatTime = (dateStr: string | null) => {
    if (!dateStr) return 'Never';
    const date = new Date(dateStr);
    const diff = Date.now() - date.getTime();
    const mins = Math.floor(diff / (1000 * 60));
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins} min ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  };

  const filteredRegistry = data?.registry.filter(agent => {
    if (filter === 'all') return true;
    if (filter === 'code') return agent.type === 'code';
    if (filter === 'ops') return agent.type === 'ops';
    if (filter === 'content') return agent.type === 'content';
    if (filter === 'infra') return agent.type === 'infra';
    return true;
  }) || [];

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-6 py-8">
        <h1 className="text-3xl font-bold mb-6">Agent Activity</h1>
        <div className="animate-pulse space-y-4">
          <div className="h-32 bg-gray-200 rounded-lg"></div>
          <div className="h-32 bg-gray-200 rounded-lg"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-6 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold">Agent Activity</h1>
        <div className="flex items-center gap-3">
          {data && data.stats.activeCount > 0 && (
            <span className="px-3 py-1.5 bg-green-100 text-green-800 rounded-full text-sm font-semibold flex items-center gap-1.5">
              <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
              {data.stats.activeCount} Active
            </span>
          )}
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white"
          >
            <option value="all">All Agents</option>
            <option value="code">Code Agents</option>
            <option value="ops">Analysis Agents</option>
            <option value="content">Content Agents</option>
            <option value="infra">Infrastructure Agents</option>
          </select>
        </div>
      </div>

      {/* Currently Active Agents */}
      {data && data.activeAgents.length > 0 && (
        <div className="mb-8">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
            Currently Active
          </h2>
          <div className="space-y-4">
            {data.activeAgents.map((agent) => (
              <div
                key={agent.id}
                className="bg-white rounded-xl shadow-sm border-l-4 border-green-500 p-5"
              >
                <div className="flex items-start gap-4">
                  {/* Agent Icon */}
                  <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${agent.gradient} flex items-center justify-center flex-shrink-0`}>
                    <span className="text-2xl">{agent.icon}</span>
                  </div>

                  {/* Main Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-semibold text-gray-900">{agent.agentName}</span>
                      <span className="px-2 py-0.5 bg-green-100 text-green-800 rounded text-xs font-medium">
                        Running
                      </span>
                    </div>
                    
                    {agent.storyId && (
                      <p className="text-sm text-gray-600 mb-3">
                        Working on story...
                      </p>
                    )}

                    {/* Thinking Trace */}
                    <div className="bg-stone-900 rounded-lg p-3 font-mono text-xs">
                      <div className="text-stone-500 mb-2">{`// Thinking trace`}</div>
                      {agent.toolCalls.map((call, idx) => (
                        <div key={idx} className="text-emerald-400 mb-1">
                          ✓ {call.tool}: {typeof call.input === 'string' ? call.input.slice(0, 50) : 'completed'}
                        </div>
                      ))}
                      {agent.thinkingTrace.slice(-2).map((step, idx) => (
                        <div key={idx} className={idx === agent.thinkingTrace.length - 1 ? 'text-violet-400 animate-pulse' : 'text-emerald-400'}>
                          {idx === agent.thinkingTrace.length - 1 ? '→' : '✓'} {step.thinking.slice(0, 60)}...
                        </div>
                      ))}
                      {agent.thinkingTrace.length === 0 && agent.toolCalls.length === 0 && (
                        <div className="text-violet-400 animate-pulse">→ Initializing agent...</div>
                      )}
                    </div>
                  </div>

                  {/* Stats */}
                  <div className="text-right text-xs text-gray-500 flex-shrink-0">
                    <div>Started {formatTime(agent.startedAt)}</div>
                    <div className="mt-1">~{agent.tokensUsed.toLocaleString()} tokens</div>
                    <div className="mt-1">{agent.turnsUsed} turns</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* No Active Agents Message */}
      {data && data.activeAgents.length === 0 && (
        <div className="mb-8 bg-stone-50 border border-stone-200 rounded-xl p-6 text-center">
          <div className="text-4xl mb-3">🤖</div>
          <h3 className="font-semibold text-gray-900 mb-1">No agents currently running</h3>
          <p className="text-sm text-gray-600">
            Agents will appear here when they&apos;re actively working on tasks.
            <br />
            Trigger a scan or approve a story to see agents in action.
          </p>
        </div>
      )}

      {/* Agent Registry */}
      <div className="mb-8">
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
          Agent Registry ({filteredRegistry.length})
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
          {filteredRegistry.map((agent) => (
            <div
              key={agent.role}
              className="bg-white rounded-xl p-4 shadow-sm hover:shadow-md transition-shadow text-center group cursor-pointer"
            >
              <div className={`w-12 h-12 mx-auto rounded-xl bg-gradient-to-br ${agent.gradient} flex items-center justify-center mb-3 group-hover:scale-110 transition-transform`}>
                <span className="text-2xl">{agent.icon}</span>
              </div>
              <div className="font-semibold text-sm text-gray-900 mb-0.5">
                {agent.name.replace(' Agent', '')}
              </div>
              <div className="text-xs text-gray-500">{agent.model}</div>
              {agent.status === 'running' && (
                <div className="mt-2 inline-flex items-center gap-1 px-2 py-0.5 bg-green-100 text-green-700 rounded text-xs">
                  <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse"></span>
                  Running
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Recent Activity */}
      {data && data.recentSessions.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
            Recent Activity
          </h2>
          <div className="bg-white rounded-xl shadow-sm divide-y">
            {data.recentSessions.map((session) => (
              <div key={session.id} className="p-4 flex items-center gap-4">
                <span className="text-2xl">{session.icon}</span>
                <div className="flex-1">
                  <div className="font-medium text-gray-900">{session.agentName}</div>
                  <div className="text-sm text-gray-500">
                    Completed {formatTime(session.completedAt)} • {session.tokensUsed.toLocaleString()} tokens • {session.turnsUsed} turns
                  </div>
                </div>
                <span className="px-2 py-1 bg-gray-100 text-gray-700 rounded text-xs font-medium">
                  Completed
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Empty state for recent activity */}
      {data && data.recentSessions.length === 0 && data.activeAgents.length === 0 && (
        <div className="bg-white rounded-xl shadow-sm p-8 text-center">
          <div className="text-gray-500 mb-4">No recent agent activity</div>
          <p className="text-sm text-gray-400">
            Agent sessions will appear here after scans or story executions.
          </p>
        </div>
      )}
    </div>
  );
}
