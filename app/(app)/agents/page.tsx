'use client';

import { useState, useEffect } from 'react';

interface Agent {
  name: string;
  role: string;
  model: string;
  status: 'active' | 'idle';
  lastRun: string | null;
  findingsCount: number;
  recentFindings: Finding[];
}

interface Finding {
  id: string;
  issue: string;
  action: string;
  severity: 'high' | 'medium' | 'low';
  projectName: string;
  createdAt: string;
}

const AGENT_INFO = {
  security: {
    name: 'Security Agent',
    icon: '🔒',
    color: 'bg-red-100 text-red-800',
    description: 'Finds exposed secrets, vulnerabilities, outdated dependencies',
  },
  analytics: {
    name: 'Analytics Agent',
    icon: '📊',
    color: 'bg-blue-100 text-blue-800',
    description: 'Ensures proper tracking and instrumentation',
  },
  domain: {
    name: 'Domain Agent',
    icon: '🌐',
    color: 'bg-green-100 text-green-800',
    description: 'Monitors domain health, SSL, and availability',
  },
  seo: {
    name: 'SEO Agent',
    icon: '🔍',
    color: 'bg-purple-100 text-purple-800',
    description: 'Optimizes search engine visibility',
  },
  deployment: {
    name: 'Deployment Agent',
    icon: '🚀',
    color: 'bg-orange-100 text-orange-800',
    description: 'Monitors deployment health and build status',
  },
};

export default function AgentsPage() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);

  useEffect(() => {
    fetchAgents();
  }, []);

  const fetchAgents = async () => {
    try {
      const res = await fetch('/api/agents');
      const data = await res.json();
      setAgents(data.agents);
    } catch (error) {
      console.error('Failed to fetch agents:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return 'Never';
    const date = new Date(dateStr);
    const diff = Date.now() - date.getTime();
    const hours = Math.floor(diff / (1000 * 60 * 60));
    if (hours < 1) return 'Just now';
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'high': return 'bg-red-100 text-red-800';
      case 'medium': return 'bg-yellow-100 text-yellow-800';
      case 'low': return 'bg-blue-100 text-blue-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const filteredAgents = selectedAgent
    ? agents.filter(a => a.role === selectedAgent)
    : agents;

  return (
    <div className="max-w-7xl mx-auto px-6 py-8">
      <h1 className="text-3xl font-bold mb-6">Agents</h1>

      {/* Agent Filter */}
      <div className="flex gap-2 mb-6 overflow-x-auto">
        <button
          onClick={() => setSelectedAgent(null)}
          className={`px-4 py-2 rounded-lg font-medium whitespace-nowrap transition-colors ${
            selectedAgent === null
              ? 'bg-brand-blue text-white'
              : 'bg-white text-gray-700 border border-gray-300 hover:border-brand-blue'
          }`}
        >
          All Agents ({agents.length})
        </button>
        {Object.entries(AGENT_INFO).map(([role, info]) => (
          <button
            key={role}
            onClick={() => setSelectedAgent(role)}
            className={`px-4 py-2 rounded-lg font-medium whitespace-nowrap transition-colors ${
              selectedAgent === role
                ? 'bg-brand-blue text-white'
                : 'bg-white text-gray-700 border border-gray-300 hover:border-brand-blue'
            }`}
          >
            {info.icon} {info.name}
          </button>
        ))}
      </div>

      {/* Agents Grid */}
      {loading ? (
        <div className="text-center py-12">
          <div className="text-gray-600">Loading agents...</div>
        </div>
      ) : filteredAgents.length === 0 ? (
        <div className="bg-white rounded-lg p-8 shadow text-center">
          <div className="text-gray-600">No agent activity found</div>
        </div>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {filteredAgents.map((agent) => {
            const info = AGENT_INFO[agent.role as keyof typeof AGENT_INFO];
            return (
              <div key={agent.role} className="bg-white rounded-lg p-6 shadow hover:shadow-md transition-shadow">
                {/* Agent Header */}
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <span className="text-3xl">{info.icon}</span>
                    <div>
                      <h3 className="font-semibold text-gray-900">{info.name}</h3>
                      <p className="text-xs text-gray-500">{agent.model}</p>
                    </div>
                  </div>
                  <span className={`px-2 py-1 rounded-full text-xs font-semibold ${
                    agent.status === 'active' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'
                  }`}>
                    {agent.status}
                  </span>
                </div>

                {/* Agent Description */}
                <p className="text-sm text-gray-600 mb-4">{info.description}</p>

                {/* Agent Stats */}
                <div className="flex items-center justify-between text-sm mb-4">
                  <span className="text-gray-600">
                    Last run: {formatDate(agent.lastRun)}
                  </span>
                  <span className="font-semibold text-gray-900">
                    {agent.findingsCount} findings
                  </span>
                </div>

                {/* Recent Findings */}
                {agent.recentFindings.length > 0 && (
                  <div className="border-t pt-4">
                    <h4 className="text-xs font-semibold text-gray-700 mb-2">Recent Findings</h4>
                    <div className="space-y-2">
                      {agent.recentFindings.slice(0, 3).map((finding) => (
                        <div key={finding.id} className="text-xs">
                          <div className="flex items-start gap-2">
                            <span className={`px-2 py-0.5 rounded text-xs font-medium ${getSeverityColor(finding.severity)}`}>
                              {finding.severity}
                            </span>
                            <span className="text-gray-600 flex-1 line-clamp-2">
                              {finding.issue}
                            </span>
                          </div>
                          <div className="text-gray-500 mt-1">
                            {finding.projectName} • {formatDate(finding.createdAt)}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Activity Timeline */}
      <div className="mt-8">
        <h2 className="text-xl font-semibold mb-4">Recent Activity</h2>
        <div className="bg-white rounded-lg shadow">
          {agents.flatMap(agent =>
            agent.recentFindings.map(finding => ({
              ...finding,
              agentRole: agent.role,
              agentName: agent.name,
            }))
          )
          .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
          .slice(0, 10)
          .map((finding, idx) => {
            const info = AGENT_INFO[finding.agentRole as keyof typeof AGENT_INFO];
            return (
              <div key={finding.id} className={`p-4 ${idx !== 0 ? 'border-t' : ''}`}>
                <div className="flex items-start gap-3">
                  <span className="text-2xl">{info.icon}</span>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-medium text-gray-900">{info.name}</span>
                      <span className={`px-2 py-0.5 rounded text-xs font-semibold ${getSeverityColor(finding.severity)}`}>
                        {finding.severity}
                      </span>
                      <span className="text-sm text-gray-500">{formatDate(finding.createdAt)}</span>
                    </div>
                    <p className="text-sm text-gray-700 mb-1">{finding.issue}</p>
                    <p className="text-sm text-gray-600 mb-2">{finding.action}</p>
                    <span className="text-xs text-gray-500">{finding.projectName}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
