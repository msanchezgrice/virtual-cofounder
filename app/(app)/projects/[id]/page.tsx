'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';

interface ProjectDetail {
  id: string;
  name: string;
  domain: string | null;
  repo: string | null;
  description: string | null;
  status: string;
  healthScore: number;
  launchScore: number;
  lastScanTime: string | null;
  scans: {
    domain: ScanResult | null;
    seo: ScanResult | null;
    analytics: ScanResult | null;
    vercel: ScanResult | null;
    performance: ScanResult | null;
    screenshot: ScanResult | null;
    security: ScanResult | null;
  };
  stories: Story[];
  history: HistoryEvent[];
}

interface ScanResult {
  status: string;
  data: any;
  scannedAt: string;
}

interface Story {
  id: string;
  title: string;
  status: string;
  priority: string;
  createdAt: string;
  prUrl: string | null;
  linearTaskId: string | null;
  linearIssueUrl: string | null;
  linearIdentifier: string | null;
}

interface HistoryEvent {
  id: string;
  type: 'pr_merged' | 'story_created' | 'scan_completed' | 'priority_updated' | 'story_approved' | 'story_rejected' | 'agent_spawned' | 'agent_completed';
  title: string;
  description: string | null;
  status: string | null;
  timestamp: string;
  metadata?: {
    prUrl?: string;
    storyId?: string;
    scanTypes?: string[];
    scanScores?: { type: string; score: number; maxScore: number }[];
    agentName?: string;
    agentType?: string;
    tokensUsed?: number;
  };
}

type TabType = 'history' | 'priority' | 'stories' | 'scans' | 'agents' | 'settings';

export default function ProjectDetailPage() {
  const params = useParams();
  const projectId = params.id as string;

  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabType>('history');
  const [scanning, setScanning] = useState(false);
  const [timeRange, setTimeRange] = useState('7days');

  useEffect(() => {
    if (projectId) {
      fetchProject();
    }
  }, [projectId]);

  const fetchProject = async () => {
    try {
      const res = await fetch(`/api/projects/${projectId}`);
      const data = await res.json();
      setProject(data.project);
    } catch (error) {
      console.error('Failed to fetch project:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatRelativeTime = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins} min ago`;
    if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const handleScan = async () => {
    setScanning(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/scan`, {
        method: 'POST'
      });
      const data = await res.json();
      if (data.success) {
        alert(`✅ Queued ${data.scans.length} scans. Refresh the page in a few minutes to see updated results.`);
        setTimeout(() => {
          fetchProject();
        }, 3000);
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

  const getStatusBadgeStyle = (status: string) => {
    switch (status?.toLowerCase()) {
      case 'beta':
        return 'bg-green-100 text-green-800';
      case 'alpha':
        return 'bg-yellow-100 text-yellow-800';
      case 'production':
      case 'live':
        return 'bg-purple-100 text-purple-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getProjectIcon = (name: string) => {
    // Generate a consistent icon based on project name
    const icons = ['🔥', '⚡', '🚀', '💎', '🌟', '🎯', '💡', '🎨'];
    const index = name.charCodeAt(0) % icons.length;
    return icons[index];
  };

  const getProjectGradient = (name: string) => {
    const gradients = [
      'from-amber-400 to-orange-600',
      'from-purple-400 to-purple-600',
      'from-blue-400 to-blue-600',
      'from-green-400 to-green-600',
      'from-pink-400 to-pink-600',
      'from-indigo-400 to-indigo-600',
    ];
    const index = name.charCodeAt(0) % gradients.length;
    return gradients[index];
  };

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-6 py-8">
        <div className="text-center py-12">
          <div className="text-gray-600">Loading project details...</div>
        </div>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="max-w-7xl mx-auto px-6 py-8">
        <div className="text-center py-12">
          <div className="text-gray-600">Project not found</div>
          <Link href="/projects" className="text-purple-600 hover:underline mt-4 inline-block">
            Back to Projects
          </Link>
        </div>
      </div>
    );
  }

  // Generate mock history if not provided by API
  const history = project.history || generateMockHistory(project);

  return (
    <div className="max-w-7xl mx-auto px-6 py-8">
      {/* Breadcrumb */}
      <div className="mb-4">
        <Link href="/projects" className="text-gray-500 hover:text-gray-700 text-sm">
          ← Back to Projects
        </Link>
      </div>

      {/* Project Header */}
      <div className="flex items-center gap-5 mb-6">
        {/* Project Icon */}
        <div className={`w-[72px] h-[72px] rounded-2xl bg-gradient-to-br ${getProjectGradient(project.name)} flex items-center justify-center shadow-lg`}>
          <span className="text-4xl">{getProjectIcon(project.name)}</span>
        </div>

        {/* Project Info */}
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-gray-900">
              {project.domain || project.name}
            </h1>
            <span className={`px-3 py-1 rounded-full text-xs font-semibold ${getStatusBadgeStyle(project.status)}`}>
              {project.status || 'Active'}
            </span>
            <span className="text-sm text-gray-500">
              Launch Score: <strong className="text-purple-600">{project.launchScore || project.healthScore}/100</strong>
            </span>
          </div>
          <p className="text-gray-500 text-sm mt-1">
            {project.description || `${project.repo ? `${project.repo} • ` : ''}Connected to GitHub`}
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-2">
          <button
            onClick={handleScan}
            disabled={scanning}
            className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
          >
            {scanning ? '⏳' : '🔍'} Run Scan
          </button>
          <Link
            href={`/stories?projectId=${projectId}`}
            className="px-4 py-2 text-sm bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors flex items-center gap-2"
          >
            + New Story
          </Link>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b border-gray-200">
        {[
          { id: 'history', label: 'History' },
          { id: 'priority', label: 'Priority' },
          { id: 'stories', label: 'Stories' },
          { id: 'scans', label: 'Scans' },
          { id: 'agents', label: 'Agents' },
          { id: 'settings', label: 'Settings' },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as TabType)}
            className={`px-5 py-3 text-sm font-medium transition-colors border-b-2 -mb-[1px] ${
              activeTab === tab.id
                ? 'text-purple-600 border-purple-600'
                : 'text-gray-500 border-transparent hover:text-gray-700'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === 'history' && (
        <HistoryTab 
          history={history} 
          timeRange={timeRange} 
          setTimeRange={setTimeRange}
          formatRelativeTime={formatRelativeTime}
        />
      )}
      {activeTab === 'priority' && (
        <PriorityTab projectId={projectId} projectName={project.name} />
      )}
      {activeTab === 'stories' && (
        <StoriesTab stories={project.stories} />
      )}
      {activeTab === 'scans' && (
        <ScansTab scans={project.scans} lastScanTime={project.lastScanTime} />
      )}
      {activeTab === 'agents' && (
        <AgentsTab projectId={projectId} />
      )}
      {activeTab === 'settings' && (
        <SettingsTab project={project} />
      )}
    </div>
  );
}

// Generate mock history based on project data
function generateMockHistory(project: ProjectDetail): HistoryEvent[] {
  const events: HistoryEvent[] = [];
  const now = new Date();

  // Add events from stories
  project.stories.forEach((story, idx) => {
    if (story.status === 'completed' && story.prUrl) {
      events.push({
        id: `pr-${story.id}`,
        type: 'pr_merged',
        title: `PR Merged: ${story.title}`,
        description: 'Code Generation Agent completed the implementation.',
        status: 'completed',
        timestamp: story.createdAt,
        metadata: { prUrl: story.prUrl, storyId: story.id }
      });
    } else {
      events.push({
        id: `story-${story.id}`,
        type: 'story_created',
        title: `Story Created: ${story.title}`,
        description: 'Orchestrator identified this task based on scan results.',
        status: story.status,
        timestamp: story.createdAt,
        metadata: { storyId: story.id }
      });
    }
  });

  // Add scan completed event if there's a lastScanTime
  if (project.lastScanTime) {
    const scanScores: { type: string; score: number; maxScore: number }[] = [];
    
    if (project.scans.domain) scanScores.push({ type: 'Domain', score: 15, maxScore: 15 });
    if (project.scans.seo) scanScores.push({ type: 'SEO', score: 7, maxScore: 10 });
    if (project.scans.analytics) scanScores.push({ type: 'Analytics', score: 10, maxScore: 10 });
    if (project.scans.security) scanScores.push({ type: 'Security', score: 0, maxScore: 5 });

    events.push({
      id: `scan-${project.lastScanTime}`,
      type: 'scan_completed',
      title: 'Scan Completed',
      description: null,
      status: 'success',
      timestamp: project.lastScanTime,
      metadata: {
        scanTypes: ['Domain', 'SEO', 'Analytics', 'Security'],
        scanScores
      }
    });
  }

  // Sort by timestamp descending
  return events.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
}

function HistoryTab({ 
  history, 
  timeRange, 
  setTimeRange,
  formatRelativeTime
}: { 
  history: HistoryEvent[]; 
  timeRange: string;
  setTimeRange: (value: string) => void;
  formatRelativeTime: (date: string) => string;
}) {
  const getEventIcon = (type: string) => {
    switch (type) {
      case 'pr_merged': return { icon: '✓', bg: 'bg-green-500' };
      case 'story_created': return { icon: '⚙', bg: 'bg-purple-500' };
      case 'scan_completed': return { icon: '🔍', bg: 'bg-blue-500' };
      case 'priority_updated': return { icon: '💬', bg: 'bg-gray-400' };
      case 'story_approved': return { icon: '✓', bg: 'bg-green-500' };
      case 'story_rejected': return { icon: '✕', bg: 'bg-red-500' };
      case 'agent_spawned': return { icon: '🤖', bg: 'bg-indigo-500' };
      case 'agent_completed': return { icon: '✨', bg: 'bg-emerald-500' };
      default: return { icon: '•', bg: 'bg-gray-400' };
    }
  };

  const getStatusBadge = (status: string | null) => {
    if (!status) return null;
    switch (status.toLowerCase()) {
      case 'completed':
        return <span className="ml-2 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">Completed</span>;
      case 'in_progress':
      case 'in progress':
        return <span className="ml-2 px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">In Progress</span>;
      case 'pending':
        return <span className="ml-2 px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">Pending</span>;
      case 'approved':
        return <span className="ml-2 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">Approved</span>;
      default:
        return <span className="ml-2 px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">{status}</span>;
    }
  };

  const getScoreColor = (score: number, maxScore: number) => {
    const ratio = score / maxScore;
    if (ratio >= 0.8) return 'text-green-500';
    if (ratio >= 0.5) return 'text-amber-500';
    return 'text-red-500';
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <span>📅</span> Project History
        </h2>
        <select
          value={timeRange}
          onChange={(e) => setTimeRange(e.target.value)}
          className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm bg-white"
        >
          <option value="7days">Last 7 days</option>
          <option value="30days">Last 30 days</option>
          <option value="all">All time</option>
        </select>
      </div>

      {history.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          No activity yet. Run a scan to get started!
        </div>
      ) : (
        <div className="relative pl-8">
          {/* Timeline line */}
          <div className="absolute left-[11px] top-2 bottom-2 w-0.5 bg-gray-200"></div>

          {/* Timeline items */}
          {history.map((event, idx) => {
            const { icon, bg } = getEventIcon(event.type);
            return (
              <div key={event.id} className={`relative ${idx !== history.length - 1 ? 'pb-6' : ''}`}>
                {/* Icon */}
                <div className={`absolute -left-[21px] w-6 h-6 rounded-full ${bg} flex items-center justify-center text-xs text-white font-medium`}>
                  {icon}
                </div>
                
                {/* Content */}
                <div className="bg-amber-50/50 rounded-xl p-4">
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <span className="font-semibold text-gray-900">{event.title}</span>
                      {getStatusBadge(event.status)}
                      {event.type === 'scan_completed' && event.metadata?.scanTypes && (
                        <span className="ml-2 text-xs text-gray-500">
                          {event.metadata.scanTypes.join(', ')}
                        </span>
                      )}
                    </div>
                    <span className="text-xs text-gray-500">{formatRelativeTime(event.timestamp)}</span>
                  </div>
                  
                  {event.description && (
                    <p className="text-sm text-gray-600 mb-2">{event.description}</p>
                  )}

                  {/* Scan scores */}
                  {event.type === 'scan_completed' && event.metadata?.scanScores && (
                    <div className="flex gap-4 mt-2">
                      {event.metadata.scanScores.map((scan) => (
                        <span key={scan.type} className="text-xs">
                          <span className={getScoreColor(scan.score, scan.maxScore)}>●</span>
                          {' '}{scan.type}: {scan.score}/{scan.maxScore}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Links */}
                  {(event.metadata?.prUrl || event.metadata?.storyId) && (
                    <div className="flex gap-3 mt-2">
                      {event.metadata.prUrl && (
                        <a href={event.metadata.prUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-purple-600 hover:underline">
                          View PR →
                        </a>
                      )}
                      {event.metadata.storyId && (
                        <Link href={`/stories?id=${event.metadata.storyId}`} className="text-xs text-purple-600 hover:underline">
                          View Story →
                        </Link>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function StoriesTab({ stories }: { stories: Story[] }) {
  if (stories.length === 0) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="text-center py-12">
          <div className="text-gray-500">No stories for this project yet</div>
          <p className="text-sm text-gray-400 mt-2">Stories will appear here when created from scan findings</p>
        </div>
      </div>
    );
  }

  const getStatusStyle = (status: string) => {
    switch (status.toLowerCase()) {
      case 'completed': return 'bg-green-100 text-green-800';
      case 'in_progress': return 'bg-blue-100 text-blue-800';
      case 'pending': return 'bg-yellow-100 text-yellow-800';
      case 'approved': return 'bg-green-100 text-green-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getPriorityStyle = (priority: string) => {
    switch (priority?.toUpperCase()) {
      case 'P0': return 'bg-red-100 text-red-800';
      case 'P1': return 'bg-orange-100 text-orange-800';
      case 'P2': return 'bg-yellow-100 text-yellow-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
      <h2 className="text-lg font-semibold mb-4">Stories ({stories.length})</h2>
      <div className="space-y-3">
        {stories.map((story) => (
          <div key={story.id} className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50 transition-colors">
            <div className="flex items-start justify-between mb-2">
              <h3 className="font-medium text-gray-900">{story.title}</h3>
              <div className="flex gap-2">
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${getPriorityStyle(story.priority)}`}>
                  {story.priority || 'P2'}
                </span>
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${getStatusStyle(story.status)}`}>
                  {story.status}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-3 text-sm text-gray-500">
              <span>{new Date(story.createdAt).toLocaleDateString()}</span>
              {(story.linearIssueUrl || story.linearTaskId) && (
                <a href={story.linearIssueUrl || `https://linear.app/media-maker/issue/${story.linearIdentifier || story.linearTaskId}`} target="_blank" rel="noopener noreferrer" className="text-purple-600 hover:underline">
                  📋 {story.linearIdentifier || 'Linear'}
                </a>
              )}
              {story.prUrl && (
                <a href={story.prUrl} target="_blank" rel="noopener noreferrer" className="text-purple-600 hover:underline">
                  🔀 PR
                </a>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ScansTab({ scans, lastScanTime }: { scans: ProjectDetail['scans']; lastScanTime: string | null }) {
  const scanTypes = [
    { key: 'domain', label: 'Domain', icon: '🌐' },
    { key: 'seo', label: 'SEO', icon: '🔍' },
    { key: 'analytics', label: 'Analytics', icon: '📊' },
    { key: 'performance', label: 'Performance', icon: '⚡' },
    { key: 'security', label: 'Security', icon: '🔒' },
    { key: 'vercel', label: 'Vercel', icon: '🚀' },
    { key: 'screenshot', label: 'Screenshot', icon: '📸' },
  ] as const;

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-semibold">Scan Results</h2>
        {lastScanTime && (
          <span className="text-sm text-gray-500">Last scan: {new Date(lastScanTime).toLocaleDateString()}</span>
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-4">
        {scanTypes.map(({ key, label, icon }) => {
          const scan = scans[key];
          return (
            <div key={key} className="border border-gray-200 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <span>{icon}</span>
                <h3 className="font-medium text-gray-900">{label}</h3>
              </div>
              {scan ? (
                <>
                  <div className={`text-sm font-medium mb-1 ${
                    scan.status === 'success' ? 'text-green-600' : 'text-red-600'
                  }`}>
                    {scan.status === 'success' ? '✅ Completed' : '❌ Failed'}
                  </div>
                  <div className="text-xs text-gray-500">
                    {new Date(scan.scannedAt).toLocaleDateString()}
                  </div>
                </>
              ) : (
                <div className="text-sm text-gray-400">Not scanned yet</div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

interface AgentSession {
  id: string;
  agentName: string;
  agentType: string;
  role: string;
  icon: string;
  gradient: string;
  status: string;
  startedAt: string;
  completedAt: string | null;
  tokensUsed: number;
  turnsUsed: number;
  thinkingTrace: Array<{ turn: number; thinking: string; action: string }>;
  toolCalls: Array<{ tool: string; input: unknown; output: unknown; duration: number }>;
}

interface AgentFinding {
  id: string;
  issue: string;
  action: string;
  severity: string;
  effort: string;
  impact: string;
  confidence: number;
  createdAt: string;
}

interface OrchestratorRun {
  id: string;
  runId: string;
  status: string;
  findingsCount: number;
  storiesCount: number;
  agentsSpawned: string[];
  totalTokens: number;
  estimatedCost: number;
  startedAt: string;
  completedAt: string | null;
}

interface AgentsData {
  sessions: AgentSession[];
  findings: Record<string, AgentFinding[]>;
  orchestratorRuns: OrchestratorRun[];
  stats: {
    totalSessions: number;
    runningSessions: number;
    completedSessions: number;
    failedSessions: number;
    totalFindings: number;
    totalTokensUsed: number;
  };
}

function AgentsTab({ projectId }: { projectId: string }) {
  const [data, setData] = useState<AgentsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedSession, setExpandedSession] = useState<string | null>(null);

  useEffect(() => {
    const fetchAgents = async () => {
      try {
        const res = await fetch(`/api/projects/${projectId}/agents`);
        const agentsData = await res.json();
        setData(agentsData);
      } catch (error) {
        console.error('Failed to fetch agents:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchAgents();

    // Poll for updates every 10 seconds
    const interval = setInterval(fetchAgents, 10000);
    return () => clearInterval(interval);
  }, [projectId]);

  const formatDuration = (start: string, end: string | null) => {
    const startTime = new Date(start).getTime();
    const endTime = end ? new Date(end).getTime() : Date.now();
    const durationMs = endTime - startTime;
    
    if (durationMs < 1000) return `${durationMs}ms`;
    if (durationMs < 60000) return `${Math.round(durationMs / 1000)}s`;
    return `${Math.round(durationMs / 60000)}m`;
  };

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  };

  const getStatusStyle = (status: string) => {
    switch (status) {
      case 'running': return 'bg-blue-100 text-blue-800 animate-pulse';
      case 'completed': return 'bg-green-100 text-green-800';
      case 'failed': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getSeverityStyle = (severity: string) => {
    switch (severity) {
      case 'critical': return 'bg-red-100 text-red-800';
      case 'high': return 'bg-orange-100 text-orange-800';
      case 'medium': return 'bg-yellow-100 text-yellow-800';
      case 'low': return 'bg-green-100 text-green-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  if (loading) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="text-center py-12 text-gray-500">
          <div className="animate-spin text-4xl mb-4">⚙️</div>
          <p>Loading agent activity...</p>
        </div>
      </div>
    );
  }

  if (!data || (data.stats.totalSessions === 0 && Object.keys(data.findings).length === 0)) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <h2 className="text-lg font-semibold mb-4">Agent Activity</h2>
        <div className="text-center py-12 text-gray-500">
          <div className="text-4xl mb-4">🤖</div>
          <p>No agent activity yet for this project</p>
          <p className="text-sm text-gray-400 mt-2">Run the orchestrator to analyze this project with AI agents</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-4 gap-3">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 text-center">
          <div className="text-2xl font-bold text-blue-600">{data.stats.runningSessions}</div>
          <div className="text-xs text-gray-500">Running</div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 text-center">
          <div className="text-2xl font-bold text-green-600">{data.stats.completedSessions}</div>
          <div className="text-xs text-gray-500">Completed</div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 text-center">
          <div className="text-2xl font-bold text-purple-600">{data.stats.totalFindings}</div>
          <div className="text-xs text-gray-500">Findings</div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 text-center">
          <div className="text-2xl font-bold text-gray-600">{(data.stats.totalTokensUsed / 1000).toFixed(1)}k</div>
          <div className="text-xs text-gray-500">Tokens Used</div>
        </div>
      </div>

      {/* Active Sessions */}
      {data.sessions.filter(s => s.status === 'running').length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <span className="animate-pulse">🔴</span> Active Agents
          </h3>
          <div className="space-y-3">
            {data.sessions.filter(s => s.status === 'running').map(session => (
              <div key={session.id} className="border border-blue-200 bg-blue-50 rounded-lg p-4">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-lg bg-gradient-to-br ${session.gradient} flex items-center justify-center text-xl`}>
                    {session.icon}
                  </div>
                  <div className="flex-1">
                    <div className="font-medium">{session.agentName}</div>
                    <div className="text-sm text-gray-500">Running for {formatDuration(session.startedAt, null)}</div>
                  </div>
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusStyle(session.status)}`}>
                    {session.status}
                  </span>
                </div>
                {session.thinkingTrace.length > 0 && (
                  <div className="mt-3 text-sm text-gray-600 bg-white rounded p-2">
                    <span className="font-medium">Latest:</span> {session.thinkingTrace[session.thinkingTrace.length - 1]?.thinking}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent Sessions */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <h3 className="text-lg font-semibold mb-4">Recent Agent Sessions</h3>
        {data.sessions.length === 0 ? (
          <p className="text-gray-500 text-center py-4">No sessions yet</p>
        ) : (
          <div className="space-y-2">
            {data.sessions.slice(0, 10).map(session => (
              <div 
                key={session.id} 
                className="border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
              >
                <button
                  onClick={() => setExpandedSession(expandedSession === session.id ? null : session.id)}
                  className="w-full p-4 text-left"
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${session.gradient} flex items-center justify-center text-lg`}>
                      {session.icon}
                    </div>
                    <div className="flex-1">
                      <div className="font-medium text-sm">{session.agentName}</div>
                      <div className="text-xs text-gray-500">
                        {formatTime(session.startedAt)} • {formatDuration(session.startedAt, session.completedAt)} • {session.tokensUsed.toLocaleString()} tokens
                      </div>
                    </div>
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusStyle(session.status)}`}>
                      {session.status}
                    </span>
                    <span className="text-gray-400">{expandedSession === session.id ? '▼' : '▶'}</span>
                  </div>
                </button>
                
                {expandedSession === session.id && (
                  <div className="px-4 pb-4 border-t border-gray-100 mt-2 pt-3">
                    {session.thinkingTrace.length > 0 && (
                      <div className="mb-3">
                        <div className="text-xs font-medium text-gray-500 mb-2">Thinking Trace</div>
                        <div className="space-y-1 text-sm">
                          {session.thinkingTrace.map((trace, idx) => (
                            <div key={idx} className="bg-gray-50 rounded p-2">
                              <span className="text-gray-400 mr-2">Turn {trace.turn}:</span>
                              {trace.thinking}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    {session.toolCalls.length > 0 && (
                      <div>
                        <div className="text-xs font-medium text-gray-500 mb-2">Tool Calls</div>
                        <div className="flex flex-wrap gap-1">
                          {session.toolCalls.map((call, idx) => (
                            <span key={idx} className="px-2 py-1 bg-gray-100 rounded text-xs">
                              {call.tool}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Findings by Agent */}
      {Object.keys(data.findings).length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h3 className="text-lg font-semibold mb-4">Findings by Agent</h3>
          <div className="space-y-4">
            {Object.entries(data.findings).map(([agent, agentFindings]) => (
              <div key={agent} className="border border-gray-200 rounded-lg p-4">
                <div className="font-medium mb-3 capitalize">{agent} Agent ({agentFindings.length} findings)</div>
                <div className="space-y-2">
                  {agentFindings.slice(0, 3).map(finding => (
                    <div key={finding.id} className="bg-gray-50 rounded p-3 text-sm">
                      <div className="flex items-start justify-between gap-2 mb-1">
                        <span className="font-medium">{finding.issue}</span>
                        <span className={`px-2 py-0.5 rounded text-xs ${getSeverityStyle(finding.severity)}`}>
                          {finding.severity}
                        </span>
                      </div>
                      <div className="text-gray-600">{finding.action}</div>
                    </div>
                  ))}
                  {agentFindings.length > 3 && (
                    <div className="text-xs text-gray-500 text-center">
                      +{agentFindings.length - 3} more findings
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

interface PriorityStory {
  id: string;
  title: string;
  rationale: string;
  priorityLevel: string | null;
  priorityScore: number | null;
  status: string;
  linearTaskId: string | null;
  linearIssueUrl: string | null;
  linearIdentifier: string | null;
  prUrl: string | null;
  createdAt: string;
}

interface PriorityResponse {
  stories: PriorityStory[];
  summary: {
    totalStories: number;
    p0Count: number;
    p1Count: number;
    p2Count: number;
    p3Count: number;
  };
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasMore: boolean;
  };
}

function PriorityTab({ projectId, projectName }: { projectId: string; projectName: string }) {
  const [stories, setStories] = useState<PriorityStory[]>([]);
  const [summary, setSummary] = useState({ totalStories: 0, p0Count: 0, p1Count: 0, p2Count: 0, p3Count: 0 });
  const [pagination, setPagination] = useState({ page: 1, limit: 50, total: 0, totalPages: 0, hasMore: false });
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);

  useEffect(() => {
    const fetchPriorities = async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/priorities?projectId=${projectId}&page=${page}&limit=50`);
        const data: PriorityResponse = await res.json();
        setStories(data.stories || []);
        setSummary(data.summary || { totalStories: 0, p0Count: 0, p1Count: 0, p2Count: 0, p3Count: 0 });
        setPagination(data.pagination || { page: 1, limit: 50, total: 0, totalPages: 0, hasMore: false });
      } catch (error) {
        console.error('Failed to fetch priorities:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchPriorities();
  }, [projectId, page]);

  const getPriorityBadge = (priorityLevel: string | null) => {
    const styles: Record<string, { bg: string; color: string }> = {
      'P0': { bg: '#FEE2E2', color: '#991B1B' },
      'P1': { bg: '#FEF3C7', color: '#92400E' },
      'P2': { bg: '#DBEAFE', color: '#1E40AF' },
      'P3': { bg: '#F3F4F6', color: '#6B7280' },
    };
    const style = styles[priorityLevel || 'P2'] || styles['P2'];
    return (
      <span style={{
        background: style.bg,
        color: style.color,
        padding: '4px 10px',
        borderRadius: '12px',
        fontSize: '11px',
        fontWeight: 600,
      }}>
        {priorityLevel || 'P2'}
      </span>
    );
  };

  const getImpactDots = (score: number | null) => {
    const normalizedScore = Math.min(5, Math.max(1, Math.ceil((score || 50) / 20)));
    return (
      <span style={{ color: '#10B981' }}>
        {'●'.repeat(normalizedScore)}
        <span style={{ color: '#E5E7EB' }}>{'○'.repeat(5 - normalizedScore)}</span>
      </span>
    );
  };

  if (loading) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="text-center py-12 text-gray-500">
          Loading priorities...
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Priority Summary Cards */}
      <div className="grid grid-cols-4 gap-3">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 text-center">
          <div className="text-2xl font-bold text-red-700">{summary.p0Count}</div>
          <div className="text-xs text-gray-500">P0 Critical</div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 text-center">
          <div className="text-2xl font-bold text-amber-700">{summary.p1Count}</div>
          <div className="text-xs text-gray-500">P1 High</div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 text-center">
          <div className="text-2xl font-bold text-blue-700">{summary.p2Count}</div>
          <div className="text-xs text-gray-500">P2 Medium</div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 text-center">
          <div className="text-2xl font-bold text-gray-500">{summary.p3Count}</div>
          <div className="text-xs text-gray-500">P3 Low</div>
        </div>
      </div>

      {/* Priority Stack Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">🎯 Priority Stack for {projectName}</h2>
          <span className="text-sm text-gray-500">
            {summary.totalStories} stories • Page {pagination.page} of {pagination.totalPages || 1}
          </span>
        </div>

        {stories.length === 0 ? (
          <div className="text-center py-12">
            <div className="text-4xl mb-4">📭</div>
            <p className="text-gray-500">No stories to prioritize for this project</p>
            <p className="text-sm text-gray-400 mt-2">Stories will appear here when they need prioritization</p>
          </div>
        ) : (
          <>
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="py-3 px-2 text-left text-xs font-medium text-gray-500">#</th>
                  <th className="py-3 px-2 text-left text-xs font-medium text-gray-500">Story</th>
                  <th className="py-3 px-2 text-center text-xs font-medium text-gray-500">Priority</th>
                  <th className="py-3 px-2 text-center text-xs font-medium text-gray-500">Impact</th>
                  <th className="py-3 px-2 text-center text-xs font-medium text-gray-500">Score</th>
                  <th className="py-3 px-2 text-center text-xs font-medium text-gray-500">Links</th>
                </tr>
              </thead>
              <tbody>
                {stories.map((story, index) => {
                  const globalIndex = (page - 1) * pagination.limit + index;
                  return (
                    <tr 
                      key={story.id}
                      className="border-b border-gray-100 hover:bg-gray-50 transition-colors"
                    >
                      <td className="py-4 px-2 text-sm font-semibold text-gray-500">
                        {globalIndex + 1}
                      </td>
                      <td className="py-4 px-2">
                        <Link href={`/stories/${story.id}`} className="block">
                          <div className="font-medium text-gray-900 hover:text-purple-600">{story.title}</div>
                          <div className="text-xs text-gray-500 truncate max-w-md">
                            {story.rationale?.slice(0, 80) || 'No description'}
                            {story.rationale && story.rationale.length > 80 ? '...' : ''}
                          </div>
                        </Link>
                      </td>
                      <td className="py-4 px-2 text-center">
                        {getPriorityBadge(story.priorityLevel)}
                      </td>
                      <td className="py-4 px-2 text-center text-sm">
                        {getImpactDots(story.priorityScore)}
                      </td>
                      <td className="py-4 px-2 text-center font-bold text-purple-600">
                        {story.priorityScore || 50}
                      </td>
                      <td className="py-4 px-2 text-center">
                        <div className="flex gap-2 justify-center">
                          {(story.linearIssueUrl || story.linearTaskId) && (
                            <a
                              href={story.linearIssueUrl || `https://linear.app/media-maker/issue/${story.linearIdentifier || story.linearTaskId}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="px-2 py-1 text-xs bg-gray-100 rounded text-gray-600 hover:bg-gray-200"
                              title={story.linearIdentifier ? `View ${story.linearIdentifier} in Linear` : 'View in Linear'}
                            >
                              📋 {story.linearIdentifier && <span className="text-[10px]">{story.linearIdentifier}</span>}
                            </a>
                          )}
                          {story.prUrl && (
                            <a
                              href={story.prUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="px-2 py-1 text-xs bg-gray-100 rounded text-gray-600 hover:bg-gray-200"
                              title="View PR"
                            >
                              🔀
                            </a>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {/* Pagination */}
            {pagination.totalPages > 1 && (
              <div className="flex justify-center gap-2 mt-6 pt-4 border-t border-gray-200">
                <button
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="px-3 py-1 text-sm border border-gray-200 rounded disabled:opacity-50 hover:bg-gray-50"
                >
                  ← Previous
                </button>
                <span className="px-4 py-1 text-sm text-gray-500">
                  {page} / {pagination.totalPages}
                </span>
                <button
                  onClick={() => setPage(p => Math.min(pagination.totalPages, p + 1))}
                  disabled={!pagination.hasMore}
                  className="px-3 py-1 text-sm border border-gray-200 rounded disabled:opacity-50 hover:bg-gray-50"
                >
                  Next →
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function SettingsTab({ project }: { project: ProjectDetail }) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
      <h2 className="text-lg font-semibold mb-6">Project Settings</h2>
      
      <div className="space-y-6 max-w-lg">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Project Name</label>
          <input
            type="text"
            value={project.name}
            disabled
            className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-50 text-gray-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Domain</label>
          <input
            type="text"
            value={project.domain || ''}
            disabled
            className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-50 text-gray-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Repository</label>
          <input
            type="text"
            value={project.repo || ''}
            disabled
            className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-50 text-gray-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
          <select
            value={project.status || 'active'}
            disabled
            className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-50 text-gray-500"
          >
            <option value="active">Active</option>
            <option value="beta">Beta</option>
            <option value="alpha">Alpha</option>
            <option value="production">Production</option>
          </select>
        </div>

        <div className="pt-4 border-t border-gray-200">
          <p className="text-sm text-gray-500">
            Project settings can be edited in the database directly for now.
          </p>
        </div>
      </div>
    </div>
  );
}
