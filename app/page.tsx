'use client';

import { useState, useEffect } from 'react';

type ViewMode = 'overview' | 'portfolio';

interface Project {
  id: string;
  name: string;
  domain: string | null;
  status: string;
  hasPosthog: boolean;
  hasResend: boolean;
}

export default function DashboardPage() {
  const [view, setView] = useState<ViewMode>('overview');
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchProjects() {
      try {
        const res = await fetch('/api/projects');
        const data = await res.json();
        setProjects(data.projects || []);
      } catch (error) {
        console.error('Failed to fetch projects:', error);
      } finally {
        setLoading(false);
      }
    }
    fetchProjects();
  }, []);

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
      </div>

      {/* Conditional Rendering */}
      {loading ? (
        <div className="text-center py-12">
          <div className="text-gray-600">Loading projects...</div>
        </div>
      ) : view === 'overview' ? (
        <OverviewView projectCount={projects.length} />
      ) : (
        <PortfolioView projects={projects} />
      )}
    </div>
  );
}

function OverviewView({ projectCount }: { projectCount: number }) {
  return (
    <div>
      <h2 className="text-2xl font-semibold mb-6">Portfolio Health Score: 87/100</h2>

      {/* Stats Cards */}
      <div className="grid grid-cols-4 gap-4 mb-8">
        <StatCard title="Critical" value="3" subtitle="projects" color="bg-critical-red" />
        <StatCard title="Needs Attention" value="12" subtitle="projects" color="bg-high-yellow" />
        <StatCard title="Healthy" value="58" subtitle="projects" color="bg-healthy-green" />
        <StatCard title="Scanned Today" value="73" subtitle="projects" color="bg-brand-blue" />
      </div>

      {/* High Priority Section */}
      <div className="mb-8">
        <h3 className="text-xl font-semibold mb-4">🚨 High Priority (3)</h3>
        <div className="space-y-4">
          <IssueCard
            project="StartupMachine"
            issue="DNS failing - site unreachable"
            severity="critical"
            lastScan="2 hours ago"
          />
          <IssueCard
            project="Warmstart"
            issue="Missing analytics - launch this week"
            severity="high"
            lastScan="2 hours ago"
            priority="User-specified (2.0x weight)"
          />
          <IssueCard
            project="TalkingObject"
            issue="Exposed Stripe key detected"
            severity="high"
            lastScan="30 minutes ago"
            action="Rotate immediately"
          />
        </div>
      </div>

      {/* Recent Activity */}
      <div>
        <h3 className="text-xl font-semibold mb-4">📋 Recent Activity (Last 24h)</h3>
        <div className="bg-white rounded-lg p-4 shadow">
          <ul className="space-y-2 text-sm">
            <li className="text-healthy-green">✅ SurgeryViz: SEO meta tags added (auto-committed)</li>
            <li className="text-healthy-green">✅ Doodad: Vercel deployment fixed (PR merged)</li>
            <li className="text-gray-600">🔧 ShipShow: Resend integration PR created (needs review)</li>
            <li className="text-gray-600">🔍 LaunchReady: Security scan in progress (3/6 complete)</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

function PortfolioView({ projects }: { projects: Project[] }) {
  // Map real projects to display format (mock health scores for now)
  const displayProjects = projects.slice(0, 8).map((p, i) => ({
    name: p.name,
    health: 85 - (i * 5), // Mock health scores
    status: p.status,
    issues: Math.floor(Math.random() * 3) // Mock issue count
  }));

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-semibold">All Projects ({projects.length})</h2>
        <div className="flex gap-2">
          <select className="px-4 py-2 border border-gray-300 rounded-lg">
            <option>Filter: All</option>
            <option>Critical</option>
            <option>Needs Attention</option>
            <option>Healthy</option>
          </select>
          <select className="px-4 py-2 border border-gray-300 rounded-lg">
            <option>Sort by: Health</option>
            <option>Last Scanned</option>
            <option>Project Name</option>
          </select>
        </div>
      </div>

      {/* Project Grid */}
      <div className="grid grid-cols-4 gap-4">
        {displayProjects.map((project) => (
          <ProjectCard key={project.name} project={project} />
        ))}
      </div>

      {projects.length > 8 && (
        <div className="mt-6 text-center">
          <button className="text-brand-blue hover:underline">
            Load More ({projects.length - 8} remaining)
          </button>
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

function IssueCard({ project, issue, severity, lastScan, priority, action }: any) {
  const severityColors: Record<string, string> = {
    critical: 'border-l-critical-red',
    high: 'border-l-high-yellow',
    medium: 'border-l-brand-blue',
  };

  return (
    <div className={`bg-white rounded-lg p-4 shadow border-l-4 ${severityColors[severity] || 'border-l-gray-300'}`}>
      <div className="flex items-start justify-between">
        <div>
          <h4 className="font-semibold text-lg">{project}</h4>
          <p className="text-gray-600 mt-1">{issue}</p>
          <div className="flex gap-4 mt-2 text-sm text-gray-500">
            <span>Last scan: {lastScan}</span>
            {priority && <span>{priority}</span>}
            {action && <span className="text-critical-red">{action}</span>}
          </div>
        </div>
        <div className="flex gap-2">
          <button className="px-3 py-1 text-sm bg-brand-blue text-white rounded hover:bg-blue-600">
            View Details
          </button>
        </div>
      </div>
    </div>
  );
}

function ProjectCard({ project }: any) {
  const getHealthColor = (health: number) => {
    if (health < 70) return 'text-critical-red';
    if (health < 85) return 'text-high-yellow';
    return 'text-healthy-green';
  };

  const getHealthEmoji = (health: number) => {
    if (health < 70) return '🔴';
    if (health < 85) return '🟡';
    return '✅';
  };

  return (
    <div className="bg-white rounded-lg p-4 shadow hover:shadow-lg transition-shadow">
      <div className="flex items-center justify-between mb-2">
        <h3 className="font-semibold">{project.name}</h3>
        <span className={`text-2xl ${getHealthColor(project.health)}`}>
          {getHealthEmoji(project.health)}
        </span>
      </div>
      <div className={`text-2xl font-bold ${getHealthColor(project.health)} mb-1`}>
        {project.health}/100
      </div>
      <div className="text-sm text-gray-600 mb-3">
        {project.issues} issue{project.issues !== 1 ? 's' : ''}
      </div>
      <button className="w-full px-3 py-2 text-sm bg-light-gray text-gray-700 rounded hover:bg-gray-200">
        View
      </button>
    </div>
  );
}
