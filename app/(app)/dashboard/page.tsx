'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

type ViewMode = 'overview' | 'portfolio';

interface ScanData {
  stats: {
    total: number;
    critical: number;
    high: number;
    medium: number;
    healthy: number;
    scannedToday: number;
  };
  projects: ProjectWithScans[];
  highPriority: ProjectWithScans[];
}

interface ProjectWithScans {
  id: string;
  name: string;
  domain: string | null;
  healthScore: number;
  severity: 'critical' | 'high' | 'medium' | 'low';
  issues: string[];
  lastScanTime: string | null;
  stories: {
    id: string;
    title: string;
    status: string;
    linearTaskId: string | null;
    prUrl: string | null;
    priority: string;
  }[];
  scans: {
    domain: ScanResult | null;
    seo: ScanResult | null;
    analytics: ScanResult | null;
  };
}

interface ScanResult {
  status: string;
  data: any;
  scannedAt: string;
}

interface Story {
  id: string;
  title: string;
  rationale: string;
  priority: 'high' | 'medium' | 'low';
  status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'rejected';
  prUrl: string | null;
  linearTaskId: string | null;
  commitSha: string | null;
  createdAt: string;
  executedAt: string | null;
  project: {
    id: string;
    name: string;
  };
}

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

interface OrchestratorRun {
  id: string;
  runId: string;
  status: 'running' | 'completed' | 'failed';
  findingsCount: number;
  storiesCount: number;
  conversation: any;
  startedAt: string;
  completedAt: string | null;
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

export default function DashboardPage() {
  const [view, setView] = useState<ViewMode>('overview');
  const [scanData, setScanData] = useState<ScanData | null>(null);
  const [loading, setLoading] = useState(true);
  const [triggering, setTriggering] = useState<string | null>(null);

  useEffect(() => {
    async function fetchScans() {
      try {
        const res = await fetch('/api/scans');
        const data = await res.json();
        
        // Process raw scans into dashboard format
        const processedData = processScansForDashboard(data.scans || []);
        setScanData(processedData);
      } catch (error) {
        console.error('Failed to fetch scans:', error);
      } finally {
        setLoading(false);
      }
    }
    fetchScans();
  }, []);
  
  // Process raw scans data into dashboard format
  function processScansForDashboard(scans: any[]): ScanData {
    // Group scans by project
    const projectMap = new Map<string, any>();
    
    for (const scan of scans) {
      if (!projectMap.has(scan.projectId)) {
        projectMap.set(scan.projectId, {
          id: scan.projectId,
          name: scan.projectName,
          domain: null,
          healthScore: 70, // Default health score
          severity: 'low' as const,
          issues: [] as string[],
          lastScanTime: scan.scannedAt,
          stories: [],
          scans: { domain: null, seo: null, analytics: null },
        });
      }
      
      const project = projectMap.get(scan.projectId)!;
      
      // Update last scan time
      if (new Date(scan.scannedAt) > new Date(project.lastScanTime || 0)) {
        project.lastScanTime = scan.scannedAt;
      }
      
      // Store scan results
      if (scan.scanType === 'domain') {
        project.scans.domain = { status: scan.status, data: scan.domainData, scannedAt: scan.scannedAt };
        project.domain = scan.domainData?.protocol ? `${scan.domainData.protocol}://...` : null;
      } else if (scan.scanType === 'seo') {
        project.scans.seo = { status: scan.status, data: scan.seoDetail, scannedAt: scan.scannedAt };
      } else if (scan.scanType === 'analytics') {
        project.scans.analytics = { status: scan.status, data: scan.analyticsData, scannedAt: scan.scannedAt };
      }
      
      // Track issues
      if (scan.status === 'error' || scan.status === 'failed') {
        project.issues.push(`${scan.scanType} scan failed`);
      }
      if (scan.securityIssues?.findings?.length > 0) {
        project.issues.push(`${scan.securityIssues.findings.length} security findings`);
      }
    }
    
    // Calculate health scores and severities
    const projects: ProjectWithScans[] = Array.from(projectMap.values()).map(project => {
      let healthScore = 100;
      
      // Deduct points for issues
      healthScore -= project.issues.length * 10;
      
      // Deduct for missing scans
      if (!project.scans.domain) healthScore -= 10;
      if (!project.scans.seo) healthScore -= 5;
      if (!project.scans.analytics) healthScore -= 5;
      
      // Check domain scan
      if (project.scans.domain?.data) {
        if (!project.scans.domain.data.sslValid) healthScore -= 20;
      }
      
      // Check analytics
      if (project.scans.analytics?.data) {
        const analytics = project.scans.analytics.data;
        const hasAnyAnalytics = analytics.posthog || analytics.googleAnalytics || analytics.fathom || analytics.plausible;
        if (!hasAnyAnalytics) healthScore -= 10;
      }
      
      healthScore = Math.max(0, Math.min(100, healthScore));
      
      // Determine severity
      let severity: 'critical' | 'high' | 'medium' | 'low' = 'low';
      if (healthScore < 40) severity = 'critical';
      else if (healthScore < 60) severity = 'high';
      else if (healthScore < 80) severity = 'medium';
      
      return { ...project, healthScore, severity };
    });
    
    // Calculate stats
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const stats = {
      total: projects.length,
      critical: projects.filter(p => p.severity === 'critical').length,
      high: projects.filter(p => p.severity === 'high').length,
      medium: projects.filter(p => p.severity === 'medium').length,
      healthy: projects.filter(p => p.severity === 'low').length,
      scannedToday: projects.filter(p => p.lastScanTime && new Date(p.lastScanTime) >= today).length,
    };
    
    // High priority projects
    const highPriority = projects.filter(p => p.severity === 'critical' || p.severity === 'high');
    
    return { stats, projects, highPriority };
  }

  const handleTrigger = async (endpoint: string, name: string) => {
    setTriggering(name);
    try {
      const res = await fetch(endpoint, { method: 'POST' });
      if (res.ok) {
        alert(`✅ ${name} triggered successfully!`);
        setTimeout(() => {
          fetchScans();
        }, 2000);
      } else {
        alert(`❌ Failed to trigger ${name}`);
      }
    } catch (error) {
      console.error(`Failed to trigger ${name}:`, error);
      alert(`❌ Error triggering ${name}`);
    } finally {
      setTriggering(null);
    }
  };

  const fetchScans = async () => {
    try {
      const res = await fetch('/api/scans');
      const data = await res.json();
      const processedData = processScansForDashboard(data.scans || []);
      setScanData(processedData);
    } catch (error) {
      console.error('Failed to fetch scans:', error);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-6 py-8">
      {/* Manual Trigger Buttons */}
      <div className="flex gap-2 mb-6 justify-end">
        <button
          onClick={() => handleTrigger('/api/scans/trigger', 'Scans')}
          disabled={triggering !== null}
          className="px-4 py-2 rounded-lg font-medium bg-green-600 text-white hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {triggering === 'Scans' ? '⏳ Running...' : '🔄 Run Scans'}
        </button>
        <button
          onClick={() => handleTrigger('/api/orchestrator/run', 'Orchestrator')}
          disabled={triggering !== null}
          className="px-4 py-2 rounded-lg font-medium bg-purple-600 text-white hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {triggering === 'Orchestrator' ? '⏳ Running...' : '🤖 Run Orchestrator'}
        </button>
        <button
          onClick={() => handleTrigger('/api/slack/check-in', 'Check-in')}
          disabled={triggering !== null}
          className="px-4 py-2 rounded-lg font-medium bg-orange-600 text-white hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {triggering === 'Check-in' ? '⏳ Sending...' : '☀️ Daily Check-in'}
        </button>
        <button
          onClick={() => handleTrigger('/api/slack/test-message', 'Slack Test')}
          disabled={triggering !== null}
          className="px-4 py-2 rounded-lg font-medium bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {triggering === 'Slack Test' ? '⏳ Sending...' : '💬 Test Slack'}
        </button>
      </div>

      {/* Dashboard View Toggle */}
      <div className="flex gap-2 mb-6">
        <button
          onClick={() => setView('overview')}
          className={`px-4 py-2 rounded-lg font-medium transition-colors ${
            view === 'overview'
              ? 'bg-brand-blue text-white'
              : 'bg-white text-gray-700 border border-gray-300 hover:border-brand-blue'
          }`}
        >
          Overview
        </button>
        <button
          onClick={() => setView('portfolio')}
          className={`px-4 py-2 rounded-lg font-medium transition-colors ${
            view === 'portfolio'
              ? 'bg-brand-blue text-white'
              : 'bg-white text-gray-700 border border-gray-300 hover:border-brand-blue'
          }`}
        >
          Portfolio
        </button>
      </div>

      {loading ? (
        <div className="text-center py-12">
          <div className="text-gray-600">Loading scan data...</div>
        </div>
      ) : !scanData ? (
        <div className="text-center py-12">
          <div className="text-gray-600">No scan data available</div>
        </div>
      ) : view === 'overview' ? (
        <OverviewView scanData={scanData} />
      ) : (
        <PortfolioView scanData={scanData} />
      )}
    </div>
  );
}

// Execution Queue View
function ExecutionQueueView() {
  const [stories, setStories] = useState<Story[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchQueue();
  }, []);

  const fetchQueue = async () => {
    try {
      const res = await fetch('/api/stories');
      const data = await res.json();
      // Filter for pending and in_progress stories, sorted by created date (FIFO)
      const queueStories = (data.stories || [])
        .filter((s: Story) => s.status === 'pending' || s.status === 'in_progress')
        .sort((a: Story, b: Story) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
      setStories(queueStories);
    } catch (error) {
      console.error('Failed to fetch execution queue:', error);
      setStories([]);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high': return 'bg-red-100 text-red-800';
      case 'medium': return 'bg-yellow-100 text-yellow-800';
      case 'low': return 'bg-blue-100 text-blue-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'in_progress': return 'bg-blue-100 text-blue-800';
      case 'pending': return 'bg-gray-100 text-gray-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getQueuePosition = (index: number) => {
    return index + 1;
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-semibold">
          Execution Queue ({stories.length} {stories.length === 1 ? 'story' : 'stories'})
        </h2>
        <div className="text-sm text-gray-600">
          Showing pending and in-progress stories in FIFO order
        </div>
      </div>

      {loading ? (
        <div className="text-center py-12">
          <div className="text-gray-600">Loading execution queue...</div>
        </div>
      ) : stories.length === 0 ? (
        <div className="bg-white rounded-lg p-8 shadow text-center">
          <div className="text-gray-600">No stories in execution queue</div>
          <p className="text-sm text-gray-500 mt-2">All stories have been processed! 🎉</p>
        </div>
      ) : (
        <div className="space-y-4">
          {stories.map((story, index) => (
            <div key={story.id} className="bg-white rounded-lg p-6 shadow hover:shadow-md transition-shadow">
              {/* Header */}
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-start gap-4 flex-1">
                  {/* Queue Position */}
                  <div className="flex-shrink-0 w-10 h-10 rounded-full bg-brand-blue text-white flex items-center justify-center font-bold">
                    {getQueuePosition(index)}
                  </div>

                  <div className="flex-1">
                    <h3 className="text-lg font-semibold text-gray-900 mb-1">
                      {story.title}
                    </h3>
                    <p className="text-sm text-gray-600 mb-2">
                      {story.project.name}
                    </p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <span className={`px-3 py-1 rounded-full text-xs font-semibold ${getPriorityColor(story.priority)}`}>
                    {story.priority}
                  </span>
                  <span className={`px-3 py-1 rounded-full text-xs font-semibold ${getStatusColor(story.status)}`}>
                    {story.status === 'in_progress' ? '⏳ executing' : '⏸️ pending'}
                  </span>
                </div>
              </div>

              {/* Rationale */}
              <p className="text-sm text-gray-700 mb-4 pl-14 line-clamp-2">
                {story.rationale}
              </p>

              {/* Metadata */}
              <div className="flex items-center gap-4 text-sm pl-14">
                <span className="text-gray-500">
                  Queued {formatDate(story.createdAt)}
                </span>

                {story.linearTaskId && (
                  <a
                    href={`https://linear.app/issue/${story.linearTaskId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 text-brand-blue hover:text-blue-700 font-medium"
                  >
                    📋 View in Linear
                  </a>
                )}

                {story.status === 'in_progress' && (
                  <span className="text-blue-600 font-medium animate-pulse">
                    🔄 Currently executing...
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Stories View (embedded from completions page)
function StoriesView() {
  const [stories, setStories] = useState<Story[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'pending' | 'in_progress' | 'completed'>('all');

  useEffect(() => {
    fetchStories();
  }, []);

  const fetchStories = async () => {
    try {
      const res = await fetch('/api/stories');
      const data = await res.json();
      setStories(data.stories || []);
    } catch (error) {
      console.error('Failed to fetch stories:', error);
      setStories([]);
    } finally {
      setLoading(false);
    }
  };

  const filteredStories = (stories || []).filter(s => {
    if (filter === 'all') return true;
    return s.status === filter;
  });

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high': return 'bg-red-100 text-red-800';
      case 'medium': return 'bg-yellow-100 text-yellow-800';
      case 'low': return 'bg-blue-100 text-blue-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return 'bg-green-100 text-green-800';
      case 'in_progress': return 'bg-blue-100 text-blue-800';
      case 'pending': return 'bg-gray-100 text-gray-800';
      case 'failed': return 'bg-red-100 text-red-800';
      case 'rejected': return 'bg-orange-100 text-orange-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <div>
      <h2 className="text-2xl font-semibold mb-6">Stories</h2>

      {/* Filter Buttons */}
      <div className="flex gap-2 mb-6">
        <button
          onClick={() => setFilter('all')}
          className={`px-4 py-2 rounded-lg font-medium transition-colors ${
            filter === 'all'
              ? 'bg-brand-blue text-white'
              : 'bg-white text-gray-700 border border-gray-300 hover:border-brand-blue'
          }`}
        >
          All ({(stories || []).length})
        </button>
        <button
          onClick={() => setFilter('pending')}
          className={`px-4 py-2 rounded-lg font-medium transition-colors ${
            filter === 'pending'
              ? 'bg-brand-blue text-white'
              : 'bg-white text-gray-700 border border-gray-300 hover:border-brand-blue'
          }`}
        >
          Pending ({(stories || []).filter(s => s.status === 'pending').length})
        </button>
        <button
          onClick={() => setFilter('in_progress')}
          className={`px-4 py-2 rounded-lg font-medium transition-colors ${
            filter === 'in_progress'
              ? 'bg-brand-blue text-white'
              : 'bg-white text-gray-700 border border-gray-300 hover:border-brand-blue'
          }`}
        >
          In Progress ({(stories || []).filter(s => s.status === 'in_progress').length})
        </button>
        <button
          onClick={() => setFilter('completed')}
          className={`px-4 py-2 rounded-lg font-medium transition-colors ${
            filter === 'completed'
              ? 'bg-brand-blue text-white'
              : 'bg-white text-gray-700 border border-gray-300 hover:border-brand-blue'
          }`}
        >
          Completed ({(stories || []).filter(s => s.status === 'completed').length})
        </button>
      </div>

      {/* Stories List */}
      {loading ? (
        <div className="text-center py-12">
          <div className="text-gray-600">Loading stories...</div>
        </div>
      ) : filteredStories.length === 0 ? (
        <div className="bg-white rounded-lg p-8 shadow text-center">
          <div className="text-gray-600">No stories found</div>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredStories.map((story) => (
            <div key={story.id} className="bg-white rounded-lg p-6 shadow hover:shadow-md transition-shadow">
              {/* Header */}
              <div className="flex items-start justify-between mb-3">
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-gray-900 mb-1">
                    {story.title}
                  </h3>
                  <p className="text-sm text-gray-600 mb-2">
                    {story.project.name}
                  </p>
                </div>
                <div className="flex gap-2">
                  <span className={`px-3 py-1 rounded-full text-xs font-semibold ${getPriorityColor(story.priority)}`}>
                    {story.priority}
                  </span>
                  <span className={`px-3 py-1 rounded-full text-xs font-semibold ${getStatusColor(story.status)}`}>
                    {story.status}
                  </span>
                </div>
              </div>

              {/* Rationale */}
              <p className="text-sm text-gray-700 mb-4 line-clamp-2">
                {story.rationale}
              </p>

              {/* Links and Actions */}
              <div className="flex items-center gap-4 text-sm">
                <span className="text-gray-500">
                  {formatDate(story.createdAt)}
                </span>

                {story.linearTaskId && (
                  <a
                    href={`https://linear.app/issue/${story.linearTaskId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 text-brand-blue hover:text-blue-700 font-medium"
                  >
                    📋 View in Linear
                  </a>
                )}

                {story.prUrl && (
                  <a
                    href={story.prUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 text-brand-blue hover:text-blue-700 font-medium"
                  >
                    🔀 View PR
                  </a>
                )}

                {story.commitSha && (
                  <span className="text-gray-500 font-mono text-xs">
                    {story.commitSha.substring(0, 7)}
                  </span>
                )}

                {story.executedAt && (
                  <span className="text-gray-500">
                    Executed {formatDate(story.executedAt)}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Agents View (embedded from agents page)
function AgentsView() {
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
    <div>
      <h2 className="text-2xl font-semibold mb-6">Agents</h2>

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
    </div>
  );
}

// Overview and Portfolio views remain the same
function OverviewView({ scanData }: { scanData: ScanData }) {
  const stats = scanData.stats || { total: 0, critical: 0, high: 0, medium: 0, healthy: 0, scannedToday: 0 };
  const highPriority = scanData.highPriority || [];

  const avgHealth = scanData.projects?.length 
    ? Math.round(
        scanData.projects.reduce((sum, p) => sum + p.healthScore, 0) / scanData.projects.length
      )
    : 0;

  const formatTimeAgo = (dateStr: string | null) => {
    if (!dateStr) return 'Never';
    const date = new Date(dateStr);
    const diff = Date.now() - date.getTime();
    const hours = Math.floor(diff / (1000 * 60 * 60));
    if (hours < 1) return 'Just now';
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  };

  return (
    <div>
      <h2 className="text-2xl font-semibold mb-6">Portfolio Health Score: {avgHealth}/100</h2>

      {/* Stats Cards */}
      <div className="grid grid-cols-4 gap-4 mb-8">
        <StatCard title="Critical" value={stats.critical.toString()} subtitle="projects" color="bg-critical-red" />
        <StatCard
          title="Needs Attention"
          value={(stats.high + stats.medium).toString()}
          subtitle="projects"
          color="bg-high-yellow"
        />
        <StatCard title="Healthy" value={stats.healthy.toString()} subtitle="projects" color="bg-healthy-green" />
        <StatCard title="Scanned Today" value={stats.scannedToday.toString()} subtitle="projects" color="bg-brand-blue" />
      </div>

      {/* High Priority Section */}
      <div className="mb-8">
        <h3 className="text-xl font-semibold mb-4">🚨 High Priority ({highPriority.length})</h3>
        <div className="space-y-4">
          {highPriority.length === 0 ? (
            <div className="bg-white rounded-lg p-6 shadow text-center text-gray-600">
              No high priority issues found! 🎉
            </div>
          ) : (
            highPriority.map((project) => (
              <IssueCard
                key={project.id}
                projectId={project.id}
                project={project.name}
                issue={project.issues.join(', ')}
                severity={project.severity}
                lastScan={formatTimeAgo(project.lastScanTime)}
                healthScore={project.healthScore}
                stories={project.stories}
              />
            ))
          )}
        </div>
      </div>

      {/* Recent Activity */}
      <div>
        <h3 className="text-xl font-semibold mb-4">📋 Recent Scans (Last 24h)</h3>
        <div className="bg-white rounded-lg p-4 shadow">
          <ul className="space-y-2 text-sm">
            {scanData.projects
              .filter((p) => {
                if (!p.lastScanTime) return false;
                const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
                return new Date(p.lastScanTime) > dayAgo;
              })
              .slice(0, 10)
              .map((p) => (
                <li key={p.id} className={p.severity === 'critical' || p.severity === 'high' ? 'text-critical-red' : 'text-healthy-green'}>
                  {p.severity === 'critical' || p.severity === 'high' ? '🔴' : '✅'} {p.name}: {p.healthScore}/100 ({formatTimeAgo(p.lastScanTime)})
                </li>
              ))}
            {stats.scannedToday === 0 && <li className="text-gray-600">No scans in the last 24 hours</li>}
          </ul>
        </div>
      </div>
    </div>
  );
}

function PortfolioView({ scanData }: { scanData: ScanData }) {
  const [filter, setFilter] = useState<string>('all');
  const [sort, setSort] = useState<string>('health');

  let filteredProjects = scanData.projects;
  if (filter === 'critical') {
    filteredProjects = scanData.projects.filter((p) => p.severity === 'critical');
  } else if (filter === 'high') {
    filteredProjects = scanData.projects.filter((p) => p.severity === 'high' || p.severity === 'critical');
  } else if (filter === 'healthy') {
    filteredProjects = scanData.projects.filter((p) => p.severity === 'low');
  }

  const sortedProjects = [...filteredProjects].sort((a, b) => {
    if (sort === 'health') {
      return a.healthScore - b.healthScore;
    } else if (sort === 'name') {
      return a.name.localeCompare(b.name);
    } else if (sort === 'lastScan') {
      const aTime = a.lastScanTime ? new Date(a.lastScanTime).getTime() : 0;
      const bTime = b.lastScanTime ? new Date(b.lastScanTime).getTime() : 0;
      return bTime - aTime;
    }
    return 0;
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-semibold">All Projects ({filteredProjects.length})</h2>
        <div className="flex gap-2">
          <select
            className="px-4 py-2 border border-gray-300 rounded-lg"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          >
            <option value="all">Filter: All</option>
            <option value="critical">Critical</option>
            <option value="high">Needs Attention</option>
            <option value="healthy">Healthy</option>
          </select>
          <select
            className="px-4 py-2 border border-gray-300 rounded-lg"
            value={sort}
            onChange={(e) => setSort(e.target.value)}
          >
            <option value="health">Sort by: Health</option>
            <option value="lastScan">Last Scanned</option>
            <option value="name">Project Name</option>
          </select>
        </div>
      </div>

      {/* Project Rows */}
      {sortedProjects.length === 0 ? (
        <div className="text-center py-12">
          <div className="text-gray-600">No projects match the selected filter</div>
        </div>
      ) : (
        <div className="space-y-3">
          {sortedProjects.map((project) => (
            <ProjectRow key={project.id} project={project} />
          ))}
        </div>
      )}
    </div>
  );
}

function StatCard({ title, value, subtitle, color }: any) {
  return (
    <div className={`${color} text-white rounded-lg p-6 shadow`}>
      <div className="text-sm font-medium opacity-90">{title}</div>
      <div className="text-3xl font-bold my-2">{value}</div>
      <div className="text-sm opacity-75">{subtitle}</div>
    </div>
  );
}

function IssueCard({ projectId, project, issue, severity, lastScan, healthScore, stories }: any) {
  const severityColors: Record<string, string> = {
    critical: 'border-l-critical-red',
    high: 'border-l-high-yellow',
    medium: 'border-l-brand-blue',
    low: 'border-l-healthy-green',
  };

  const recentStory = stories?.find((s: any) => s.linearTaskId || s.prUrl);

  return (
    <div className={`bg-white rounded-lg p-4 shadow border-l-4 ${severityColors[severity] || 'border-l-gray-300'}`}>
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <Link href={`/projects/${projectId}`} className="font-semibold text-lg hover:text-brand-blue transition-colors">
              {project}
            </Link>
            <span className={`text-sm font-medium ${severity === 'critical' ? 'text-critical-red' : severity === 'high' ? 'text-high-yellow' : 'text-brand-blue'}`}>
              Health: {healthScore}/100
            </span>
          </div>
          <p className="text-gray-600 mt-1">{issue}</p>
          <div className="flex gap-4 mt-2 text-sm text-gray-500">
            <span>Last scan: {lastScan}</span>
            {recentStory?.linearTaskId && (
              <a
                href={`https://linear.app/issue/${recentStory.linearTaskId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-brand-blue hover:text-blue-700 font-medium"
              >
                📋 View in Linear
              </a>
            )}
            {recentStory?.prUrl && (
              <a
                href={recentStory.prUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-brand-blue hover:text-blue-700 font-medium"
              >
                🔀 View PR
              </a>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function ProjectCard({ project }: { project: ProjectWithScans }) {
  const getHealthColor = (health: number) => {
    if (health < 50) return 'text-critical-red';
    if (health < 70) return 'text-high-yellow';
    if (health < 85) return 'text-brand-blue';
    return 'text-healthy-green';
  };

  const getHealthEmoji = (health: number) => {
    if (health < 50) return '🔴';
    if (health < 70) return '🟡';
    if (health < 85) return '🔵';
    return '✅';
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return 'Never';
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric'
    });
  };

  return (
    <div className="bg-white rounded-lg p-4 shadow hover:shadow-lg transition-shadow">
      <div className="flex items-center justify-between mb-2">
        <h3 className="font-semibold truncate" title={project.name}>
          {project.name}
        </h3>
        <span className={`text-2xl ${getHealthColor(project.healthScore)}`}>
          {getHealthEmoji(project.healthScore)}
        </span>
      </div>
      <div className={`text-2xl font-bold ${getHealthColor(project.healthScore)} mb-1`}>
        {project.healthScore}/100
      </div>
      <div className="text-sm text-gray-600 mb-2">
        {project.issues.length} issue{project.issues.length !== 1 ? 's' : ''}
      </div>
      <div className="text-xs text-gray-500 mb-3">
        Scanned: {formatDate(project.lastScanTime)}
      </div>
      <div className="flex gap-2">
        <Link
          href={`/projects/${project.id}`}
          className="flex-1 px-3 py-2 text-sm text-center bg-brand-blue text-white rounded hover:bg-blue-700 transition-colors"
        >
          View Details
        </Link>
        {project.domain && (
          <a
            href={`https://${project.domain}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 px-3 py-2 text-sm text-center bg-light-gray text-gray-700 rounded hover:bg-gray-200 transition-colors"
          >
            View Site
          </a>
        )}
      </div>
    </div>
  );
}

function ProjectRow({ project }: { project: ProjectWithScans }) {
  const [scanning, setScanning] = useState(false);

  const handleScan = async () => {
    setScanning(true);
    try {
      const res = await fetch(`/api/projects/${project.id}/scan`, {
        method: 'POST'
      });
      const data = await res.json();
      if (data.success) {
        alert(`✅ Queued ${data.scans.length} scans for ${project.name}`);
      } else {
        alert('❌ Failed to trigger scans');
      }
    } catch (error) {
      console.error('Error triggering scan:', error);
      alert('❌ Failed to trigger scans');
    } finally {
      setScanning(false);
    }
  };

  const getHealthColor = (health: number) => {
    if (health < 50) return 'text-critical-red';
    if (health < 70) return 'text-high-yellow';
    if (health < 85) return 'text-brand-blue';
    return 'text-healthy-green';
  };

  const getHealthBg = (health: number) => {
    if (health < 50) return 'bg-red-50';
    if (health < 70) return 'bg-yellow-50';
    if (health < 85) return 'bg-blue-50';
    return 'bg-green-50';
  };

  const getHealthEmoji = (health: number) => {
    if (health < 50) return '🔴';
    if (health < 70) return '🟡';
    if (health < 85) return '🔵';
    return '✅';
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return 'Never';
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <div className={`bg-white rounded-lg p-4 shadow hover:shadow-md transition-shadow border-l-4 ${
      project.severity === 'critical' ? 'border-l-critical-red' :
      project.severity === 'high' ? 'border-l-high-yellow' :
      project.severity === 'medium' ? 'border-l-brand-blue' :
      'border-l-healthy-green'
    }`}>
      <div className="flex items-center justify-between">
        {/* Project Name & Health */}
        <div className="flex items-center gap-4 flex-1">
          <span className="text-2xl">{getHealthEmoji(project.healthScore)}</span>
          <div>
            <Link
              href={`/projects/${project.id}`}
              className="font-semibold text-lg hover:text-brand-blue transition-colors"
            >
              {project.name}
            </Link>
            <div className="flex items-center gap-3 text-sm text-gray-600 mt-1">
              <span className={`font-medium ${getHealthColor(project.healthScore)}`}>
                Health: {project.healthScore}/100
              </span>
              <span>•</span>
              <span>{project.issues.length} issue{project.issues.length !== 1 ? 's' : ''}</span>
              {project.domain && (
                <>
                  <span>•</span>
                  <a
                    href={`https://${project.domain}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-brand-blue hover:underline"
                  >
                    {project.domain}
                  </a>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Last Scanned & Stories */}
        <div className="flex items-center gap-6">
          <div className="text-right">
            <div className="text-xs text-gray-500">Last Scanned</div>
            <div className="text-sm font-medium text-gray-700">
              {formatDate(project.lastScanTime)}
            </div>
          </div>

          {project.stories && project.stories.length > 0 && (
            <div className="text-right">
              <div className="text-xs text-gray-500">Recent Stories</div>
              <div className="text-sm font-medium text-gray-700">
                {project.stories.length} active
              </div>
            </div>
          )}

          <button
            onClick={handleScan}
            disabled={scanning}
            className="px-4 py-2 text-sm bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {scanning ? '⏳ Scanning...' : '🔄 Run Scan'}
          </button>

          <Link
            href={`/projects/${project.id}`}
            className="px-4 py-2 text-sm bg-brand-blue text-white rounded hover:bg-blue-700 transition-colors"
          >
            View Details
          </Link>
        </div>
      </div>
    </div>
  );
}

interface SlackMessage {
  id: string;
  text: string;
  userId: string;
  channelId: string;
  isCommand: boolean;
  commandType: string | null;
  createdAt: string;
}

function HistoryView() {
  const [runs, setRuns] = useState<OrchestratorRun[]>([]);
  const [messages, setMessages] = useState<SlackMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedRun, setSelectedRun] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'runs' | 'messages' | 'all'>('all');

  useEffect(() => {
    fetchHistory();
  }, []);

  const fetchHistory = async () => {
    try {
      // Fetch orchestrator runs
      const runsRes = await fetch('/api/orchestrator/history');
      const runsData = await runsRes.json();
      setRuns(runsData.runs || []);

      // Fetch Slack messages
      const messagesRes = await fetch('/api/slack/messages');
      const messagesData = await messagesRes.json();
      setMessages(messagesData.messages || []);
    } catch (error) {
      console.error('Failed to fetch history:', error);
      setRuns([]);
      setMessages([]);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return 'bg-green-100 text-green-800';
      case 'running': return 'bg-blue-100 text-blue-800';
      case 'failed': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  if (loading) {
    return (
      <div className="text-center py-12">
        <div className="text-gray-600">Loading history...</div>
      </div>
    );
  }

  // Filter what to show based on view mode
  const displayRuns = viewMode === 'messages' ? [] : runs;
  const displayMessages = viewMode === 'runs' ? [] : messages;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold">Activity History</h2>
        <div className="flex items-center gap-4">
          {/* View mode toggles */}
          <div className="flex bg-gray-100 rounded-lg p-1">
            <button
              onClick={() => setViewMode('all')}
              className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
                viewMode === 'all' ? 'bg-white text-brand-blue shadow-sm' : 'text-gray-600'
              }`}
            >
              All
            </button>
            <button
              onClick={() => setViewMode('messages')}
              className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
                viewMode === 'messages' ? 'bg-white text-brand-blue shadow-sm' : 'text-gray-600'
              }`}
            >
              Messages
            </button>
            <button
              onClick={() => setViewMode('runs')}
              className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
                viewMode === 'runs' ? 'bg-white text-brand-blue shadow-sm' : 'text-gray-600'
              }`}
            >
              Runs
            </button>
          </div>
          <div className="text-sm text-gray-600">
            {messages.length} messages • {runs.length} runs
          </div>
        </div>
      </div>

      <div className="space-y-4">
        {/* Slack Messages */}
        {displayMessages.map((message) => (
          <div key={message.id} className="bg-white rounded-lg p-4 shadow hover:shadow-md transition-shadow border-l-4 border-purple-500">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-2">
                  <span className="text-lg">💬</span>
                  <h3 className="text-sm font-semibold text-gray-900">
                    Slack Message
                  </h3>
                  {message.isCommand && message.commandType && (
                    <span className="px-2 py-1 rounded-full text-xs font-semibold bg-purple-100 text-purple-800">
                      {message.commandType.replace('_', ' ')}
                    </span>
                  )}
                </div>
                <p className="text-gray-700 text-sm mb-2">{message.text}</p>
                <div className="flex items-center gap-3 text-xs text-gray-500">
                  <span>🕐 {formatDate(message.createdAt)}</span>
                </div>
              </div>
            </div>
          </div>
        ))}

        {/* Orchestrator Runs */}
        {displayRuns.map((run) => (
          <div key={run.id} className="bg-white rounded-lg p-6 shadow hover:shadow-md transition-shadow">
            {/* Header */}
            <div className="flex items-start justify-between mb-3">
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-2">
                  <h3 className="text-lg font-semibold text-gray-900">
                    Run {run.runId.substring(0, 8)}
                  </h3>
                  <span className={`px-3 py-1 rounded-full text-xs font-semibold ${getStatusColor(run.status)}`}>
                    {run.status}
                  </span>
                </div>
                <div className="flex items-center gap-4 text-sm text-gray-600">
                  <span>📊 {run.findingsCount} findings</span>
                  <span>✅ {run.storiesCount} stories</span>
                  <span>🕐 {formatDate(run.startedAt)}</span>
                  {run.completedAt && (
                    <span className="text-green-600">
                      Completed {formatDate(run.completedAt)}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Conversation Details */}
            {run.conversation && (
              <div className="mt-4">
                <button
                  onClick={() => setSelectedRun(selectedRun === run.id ? null : run.id)}
                  className="text-sm text-brand-blue hover:underline font-medium"
                >
                  {selectedRun === run.id ? '▼ Hide conversation' : '▶ View conversation'}
                </button>

                {selectedRun === run.id && (
                  <div className="mt-3 p-4 bg-gray-50 rounded-lg max-h-96 overflow-y-auto">
                    <pre className="text-xs whitespace-pre-wrap font-mono">
                      {JSON.stringify(run.conversation, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
