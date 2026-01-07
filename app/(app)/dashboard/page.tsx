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
        setScanData(data);
      } catch (error) {
        console.error('Failed to fetch scans:', error);
      } finally {
        setLoading(false);
      }
    }
    fetchScans();
  }, []);

  const handleTrigger = async (endpoint: string, name: string) => {
    setTriggering(name);
    try {
      const res = await fetch(endpoint, { method: 'POST' });
      if (res.ok) {
        alert(`✅ ${name} triggered successfully!`);
        // Refresh scan data after a short delay
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
      setScanData(data);
    } catch (error) {
      console.error('Failed to fetch scans:', error);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-6 py-8">
      {/* View Toggle */}
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

        {/* Manual Trigger Buttons */}
        <div className="ml-auto flex gap-2">
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
            onClick={() => handleTrigger('/api/slack/test-message', 'Slack Test')}
            disabled={triggering !== null}
            className="px-4 py-2 rounded-lg font-medium bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {triggering === 'Slack Test' ? '⏳ Sending...' : '💬 Test Slack'}
          </button>
        </div>
      </div>

      {/* Conditional Rendering */}
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

function OverviewView({ scanData }: { scanData: ScanData }) {
  const { stats, highPriority } = scanData;

  // Calculate portfolio health score (average of all projects)
  const avgHealth = Math.round(
    scanData.projects.reduce((sum, p) => sum + p.healthScore, 0) / scanData.projects.length
  );

  // Format time ago
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
              />
            ))
          )}
        </div>
      </div>

      {/* Recent Activity - Show recently scanned projects */}
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

  // Filter projects
  let filteredProjects = scanData.projects;
  if (filter === 'critical') {
    filteredProjects = scanData.projects.filter((p) => p.severity === 'critical');
  } else if (filter === 'high') {
    filteredProjects = scanData.projects.filter((p) => p.severity === 'high' || p.severity === 'critical');
  } else if (filter === 'healthy') {
    filteredProjects = scanData.projects.filter((p) => p.severity === 'low');
  }

  // Sort projects
  const sortedProjects = [...filteredProjects].sort((a, b) => {
    if (sort === 'health') {
      return a.healthScore - b.healthScore; // Lowest health first
    } else if (sort === 'name') {
      return a.name.localeCompare(b.name);
    } else if (sort === 'lastScan') {
      const aTime = a.lastScanTime ? new Date(a.lastScanTime).getTime() : 0;
      const bTime = b.lastScanTime ? new Date(b.lastScanTime).getTime() : 0;
      return bTime - aTime; // Most recent first
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

      {/* Project Grid */}
      <div className="grid grid-cols-4 gap-4">
        {sortedProjects.map((project) => (
          <ProjectCard key={project.id} project={project} />
        ))}
      </div>

      {sortedProjects.length === 0 && (
        <div className="text-center py-12">
          <div className="text-gray-600">No projects match the selected filter</div>
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

function IssueCard({ projectId, project, issue, severity, lastScan, healthScore }: any) {
  const severityColors: Record<string, string> = {
    critical: 'border-l-critical-red',
    high: 'border-l-high-yellow',
    medium: 'border-l-brand-blue',
    low: 'border-l-healthy-green',
  };

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
      <div className="text-sm text-gray-600 mb-3">
        {project.issues.length} issue{project.issues.length !== 1 ? 's' : ''}
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
