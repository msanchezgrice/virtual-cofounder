'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';

interface ProjectDetail {
  id: string;
  name: string;
  domain: string | null;
  repo: string | null;
  healthScore: number;
  lastScanTime: string | null;
  scans: {
    domain: ScanResult | null;
    seo: ScanResult | null;
    analytics: ScanResult | null;
  };
  completions: Completion[];
}

interface ScanResult {
  status: string;
  data: any;
  scannedAt: string;
}

interface Completion {
  id: string;
  title: string;
  status: string;
  priority: string;
  createdAt: string;
  prUrl: string | null;
  linearTaskId: string | null;
}

type TabType = 'overview' | 'domain' | 'seo' | 'analytics' | 'completions';

export default function ProjectDetailPage() {
  const params = useParams();
  const projectId = params.id as string;

  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabType>('overview');

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

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return 'Never';
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getHealthColor = (score: number) => {
    if (score >= 80) return 'text-green-600';
    if (score >= 60) return 'text-yellow-600';
    return 'text-red-600';
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
          <Link href="/dashboard" className="text-brand-blue hover:underline mt-4 inline-block">
            Back to Dashboard
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-6 py-8">
      {/* Header */}
      <div className="mb-6">
        <Link href="/dashboard" className="text-brand-blue hover:underline text-sm mb-2 inline-block">
          ← Back to Dashboard
        </Link>
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-3xl font-bold mb-2">{project.name}</h1>
            <div className="flex items-center gap-4 text-sm text-gray-600">
              {project.domain && (
                <a href={`https://${project.domain}`} target="_blank" rel="noopener noreferrer" className="hover:text-brand-blue">
                  🌐 {project.domain}
                </a>
              )}
              {project.repo && (
                <a href={`https://github.com/${project.repo}`} target="_blank" rel="noopener noreferrer" className="hover:text-brand-blue">
                  📦 {project.repo}
                </a>
              )}
              {project.lastScanTime && (
                <span>Last scanned: {formatDate(project.lastScanTime)}</span>
              )}
            </div>
          </div>
          <div className="text-right">
            <div className="text-sm text-gray-600 mb-1">Health Score</div>
            <div className={`text-4xl font-bold ${getHealthColor(project.healthScore)}`}>
              {project.healthScore}/100
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6 border-b">
        {[
          { id: 'overview', label: 'Overview' },
          { id: 'domain', label: '🌐 Domain' },
          { id: 'seo', label: '🔍 SEO' },
          { id: 'analytics', label: '📊 Analytics' },
          { id: 'completions', label: '✅ Completions' },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as TabType)}
            className={`px-4 py-2 font-medium transition-colors ${
              activeTab === tab.id
                ? 'text-brand-blue border-b-2 border-brand-blue'
                : 'text-gray-600 hover:text-brand-blue'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="bg-white rounded-lg shadow p-6">
        {activeTab === 'overview' && (
          <OverviewTab project={project} />
        )}
        {activeTab === 'domain' && (
          <ScanTab title="Domain Scan" scan={project.scans.domain} />
        )}
        {activeTab === 'seo' && (
          <ScanTab title="SEO Scan" scan={project.scans.seo} />
        )}
        {activeTab === 'analytics' && (
          <ScanTab title="Analytics Scan" scan={project.scans.analytics} />
        )}
        {activeTab === 'completions' && (
          <CompletionsTab completions={project.completions} />
        )}
      </div>
    </div>
  );
}

function OverviewTab({ project }: { project: ProjectDetail }) {
  const scanTypes = ['domain', 'seo', 'analytics'] as const;

  return (
    <div>
      <h2 className="text-xl font-semibold mb-4">Scan Overview</h2>
      <div className="grid gap-4 md:grid-cols-3">
        {scanTypes.map((type) => {
          const scan = project.scans[type];
          return (
            <div key={type} className="border rounded-lg p-4">
              <h3 className="font-semibold capitalize mb-2">{type} Scan</h3>
              {scan ? (
                <>
                  <div className={`text-sm font-medium mb-1 ${
                    scan.status === 'success' ? 'text-green-600' : 'text-red-600'
                  }`}>
                    {scan.status === 'success' ? '✅ Completed' : '❌ Failed'}
                  </div>
                  <div className="text-xs text-gray-600">
                    {new Date(scan.scannedAt).toLocaleDateString()}
                  </div>
                </>
              ) : (
                <div className="text-sm text-gray-500">Not scanned yet</div>
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-6">
        <h3 className="text-lg font-semibold mb-3">Recent Activity</h3>
        {project.completions.length === 0 ? (
          <div className="text-gray-500 text-sm">No completions yet</div>
        ) : (
          <div className="space-y-2">
            {project.completions.slice(0, 5).map((completion) => (
              <div key={completion.id} className="flex items-center justify-between py-2 border-b last:border-b-0">
                <span className="text-sm">{completion.title}</span>
                <span className={`text-xs px-2 py-1 rounded-full ${
                  completion.status === 'completed' ? 'bg-green-100 text-green-800' :
                  completion.status === 'in_progress' ? 'bg-blue-100 text-blue-800' :
                  'bg-gray-100 text-gray-800'
                }`}>
                  {completion.status}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ScanTab({ title, scan }: { title: string; scan: ScanResult | null }) {
  if (!scan) {
    return (
      <div className="text-center py-12">
        <div className="text-gray-600">No scan data available</div>
        <div className="text-sm text-gray-500 mt-2">Run a scan to see results here</div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold">{title}</h2>
        <span className={`px-3 py-1 rounded-full text-sm font-medium ${
          scan.status === 'success' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
        }`}>
          {scan.status}
        </span>
      </div>

      <div className="text-sm text-gray-600 mb-4">
        Scanned at: {new Date(scan.scannedAt).toLocaleString()}
      </div>

      <div className="bg-gray-50 rounded-lg p-4 overflow-auto">
        <pre className="text-sm">
          {JSON.stringify(scan.data, null, 2)}
        </pre>
      </div>
    </div>
  );
}

function CompletionsTab({ completions }: { completions: Completion[] }) {
  if (completions.length === 0) {
    return (
      <div className="text-center py-12">
        <div className="text-gray-600">No completions for this project</div>
      </div>
    );
  }

  return (
    <div>
      <h2 className="text-xl font-semibold mb-4">Completions ({completions.length})</h2>
      <div className="space-y-4">
        {completions.map((completion) => (
          <div key={completion.id} className="border rounded-lg p-4">
            <div className="flex items-start justify-between mb-2">
              <h3 className="font-semibold">{completion.title}</h3>
              <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                completion.status === 'completed' ? 'bg-green-100 text-green-800' :
                completion.status === 'in_progress' ? 'bg-blue-100 text-blue-800' :
                'bg-gray-100 text-gray-800'
              }`}>
                {completion.status}
              </span>
            </div>
            <div className="flex items-center gap-3 text-sm">
              <span className="text-gray-600">
                {new Date(completion.createdAt).toLocaleDateString()}
              </span>
              {completion.linearTaskId && (
                <a
                  href={`https://linear.app/issue/${completion.linearTaskId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-brand-blue hover:underline"
                >
                  📋 Linear
                </a>
              )}
              {completion.prUrl && (
                <a
                  href={completion.prUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-brand-blue hover:underline"
                >
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
