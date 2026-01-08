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
    vercel: ScanResult | null;
    performance: ScanResult | null;
    screenshot: ScanResult | null;
    security: ScanResult | null;
  };
  stories: Completion[];
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

type TabType = 'overview' | 'domain' | 'seo' | 'analytics' | 'vercel' | 'performance' | 'screenshot' | 'security' | 'stories';

export default function ProjectDetailPage() {
  const params = useParams();
  const projectId = params.id as string;

  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const [scanning, setScanning] = useState(false);

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

  const handleScan = async () => {
    setScanning(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/scan`, {
        method: 'POST'
      });
      const data = await res.json();
      if (data.success) {
        alert(`✅ Queued ${data.scans.length} scans. Refresh the page in a few minutes to see updated results.`);
        // Optionally refresh project data after a delay
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
          <div className="flex items-center gap-4">
            <button
              onClick={handleScan}
              disabled={scanning}
              className="px-4 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {scanning ? '⏳ Scanning...' : '🔄 Run Scan'}
            </button>
            <div className="text-right">
              <div className="text-sm text-gray-600 mb-1">Health Score</div>
              <div className={`text-4xl font-bold ${getHealthColor(project.healthScore)}`}>
                {project.healthScore}/100
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6 border-b overflow-x-auto">
        {[
          { id: 'overview', label: 'Overview' },
          { id: 'domain', label: '🌐 Domain' },
          { id: 'seo', label: '🔍 SEO' },
          { id: 'analytics', label: '📊 Analytics' },
          { id: 'vercel', label: '🚀 Vercel' },
          { id: 'performance', label: '⚡ Performance' },
          { id: 'screenshot', label: '📸 Screenshot' },
          { id: 'security', label: '🔒 Security' },
          { id: 'stories', label: '✅ Stories' },
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
        {activeTab === 'vercel' && (
          <VercelTab scan={project.scans.vercel} />
        )}
        {activeTab === 'performance' && (
          <PerformanceTab scan={project.scans.performance} />
        )}
        {activeTab === 'screenshot' && (
          <ScreenshotTab scan={project.scans.screenshot} />
        )}
        {activeTab === 'security' && (
          <SecurityTab scan={project.scans.security} />
        )}
        {activeTab === 'stories' && (
          <StoriesTab stories={project.stories} />
        )}
      </div>
    </div>
  );
}

function OverviewTab({ project }: { project: ProjectDetail }) {
  const scanTypes = ['domain', 'seo', 'analytics', 'vercel', 'performance', 'screenshot', 'security'] as const;

  return (
    <div>
      <h2 className="text-xl font-semibold mb-4">Scan Overview</h2>
      <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-4">
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
        {project.stories.length === 0 ? (
          <div className="text-gray-500 text-sm">No stories yet</div>
        ) : (
          <div className="space-y-2">
            {project.stories.slice(0, 5).map((completion) => (
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

function VercelTab({ scan }: { scan: ScanResult | null }) {
  if (!scan || !scan.data) {
    return (
      <div className="text-center py-12">
        <div className="text-gray-600">No Vercel deployment data available</div>
        <div className="text-sm text-gray-500 mt-2">Run a Vercel scan to see deployment status</div>
      </div>
    );
  }

  const deployment = scan.data;

  return (
    <div>
      <h2 className="text-xl font-semibold mb-4">🚀 Vercel Deployment</h2>

      <div className="grid gap-4 md:grid-cols-2 mb-6">
        <div className="border rounded-lg p-4">
          <div className="text-sm text-gray-600 mb-1">Status</div>
          <div className={`text-lg font-semibold ${
            deployment.state === 'READY' ? 'text-green-600' :
            deployment.state === 'BUILDING' ? 'text-blue-600' :
            'text-red-600'
          }`}>
            {deployment.state || 'Unknown'}
          </div>
        </div>

        <div className="border rounded-lg p-4">
          <div className="text-sm text-gray-600 mb-1">Build Duration</div>
          <div className="text-lg font-semibold">
            {deployment.buildDurationMs ? `${(deployment.buildDurationMs / 1000).toFixed(1)}s` : 'N/A'}
          </div>
        </div>

        <div className="border rounded-lg p-4 md:col-span-2">
          <div className="text-sm text-gray-600 mb-1">Deployment URL</div>
          <a
            href={`https://${deployment.url}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-brand-blue hover:underline"
          >
            {deployment.url}
          </a>
        </div>
      </div>

      <div className="text-sm text-gray-600 mb-2">
        Scanned at: {new Date(scan.scannedAt).toLocaleString()}
      </div>
    </div>
  );
}

function PerformanceTab({ scan }: { scan: ScanResult | null }) {
  if (!scan || !scan.data) {
    return (
      <div className="text-center py-12">
        <div className="text-gray-600">No performance data available</div>
        <div className="text-sm text-gray-500 mt-2">Run a performance scan to see Core Web Vitals</div>
      </div>
    );
  }

  const metrics = scan.data;

  const getMetricColor = (value: number, thresholds: { good: number; needs: number }) => {
    if (value <= thresholds.good) return 'text-green-600';
    if (value <= thresholds.needs) return 'text-yellow-600';
    return 'text-red-600';
  };

  return (
    <div>
      <h2 className="text-xl font-semibold mb-4">⚡ Core Web Vitals</h2>

      <div className="grid gap-4 md:grid-cols-3 mb-6">
        <div className="border rounded-lg p-4">
          <div className="text-sm text-gray-600 mb-1">LCP (Largest Contentful Paint)</div>
          <div className={`text-2xl font-bold ${getMetricColor(metrics.lcp || 0, { good: 2500, needs: 4000 })}`}>
            {metrics.lcp ? `${(metrics.lcp / 1000).toFixed(2)}s` : 'N/A'}
          </div>
          <div className="text-xs text-gray-500 mt-1">Good: &lt; 2.5s</div>
        </div>

        <div className="border rounded-lg p-4">
          <div className="text-sm text-gray-600 mb-1">FCP (First Contentful Paint)</div>
          <div className={`text-2xl font-bold ${getMetricColor(metrics.fcp || 0, { good: 1800, needs: 3000 })}`}>
            {metrics.fcp ? `${(metrics.fcp / 1000).toFixed(2)}s` : 'N/A'}
          </div>
          <div className="text-xs text-gray-500 mt-1">Good: &lt; 1.8s</div>
        </div>

        <div className="border rounded-lg p-4">
          <div className="text-sm text-gray-600 mb-1">CLS (Cumulative Layout Shift)</div>
          <div className={`text-2xl font-bold ${
            (metrics.cls || 0) <= 0.1 ? 'text-green-600' :
            (metrics.cls || 0) <= 0.25 ? 'text-yellow-600' :
            'text-red-600'
          }`}>
            {metrics.cls !== undefined ? metrics.cls.toFixed(3) : 'N/A'}
          </div>
          <div className="text-xs text-gray-500 mt-1">Good: &lt; 0.1</div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 mb-6">
        <div className="border rounded-lg p-4">
          <div className="text-sm text-gray-600 mb-1">TTFB (Time to First Byte)</div>
          <div className="text-lg font-semibold">
            {metrics.ttfb ? `${metrics.ttfb.toFixed(0)}ms` : 'N/A'}
          </div>
        </div>

        <div className="border rounded-lg p-4">
          <div className="text-sm text-gray-600 mb-1">DCL (DOMContentLoaded)</div>
          <div className="text-lg font-semibold">
            {metrics.dcl ? `${(metrics.dcl / 1000).toFixed(2)}s` : 'N/A'}
          </div>
        </div>
      </div>

      <div className="text-sm text-gray-600">
        Scanned at: {new Date(scan.scannedAt).toLocaleString()}
      </div>
    </div>
  );
}

function ScreenshotTab({ scan }: { scan: ScanResult | null }) {
  if (!scan || !scan.data) {
    return (
      <div className="text-center py-12">
        <div className="text-gray-600">No screenshot available</div>
        <div className="text-sm text-gray-500 mt-2">Run a screenshot scan to capture the page</div>
      </div>
    );
  }

  const data = scan.data;

  return (
    <div>
      <h2 className="text-xl font-semibold mb-4">📸 Screenshot</h2>

      <div className="mb-4">
        <div className="text-sm text-gray-600 mb-2">
          Viewport: {data.viewport?.width || 1920} × {data.viewport?.height || 1080}
        </div>
        <div className="text-sm text-gray-600 mb-4">
          Captured at: {new Date(scan.scannedAt).toLocaleString()}
        </div>
      </div>

      {data.screenshotUrl && (
        <div className="border rounded-lg overflow-hidden">
          <img
            src={data.screenshotUrl}
            alt="Page screenshot"
            className="w-full h-auto"
          />
        </div>
      )}

      {data.screenshotPath && !data.screenshotUrl && (
        <div className="text-sm text-gray-600">
          Screenshot saved to: {data.screenshotPath}
        </div>
      )}
    </div>
  );
}

function SecurityTab({ scan }: { scan: ScanResult | null }) {
  if (!scan || !scan.data) {
    return (
      <div className="text-center py-12">
        <div className="text-gray-600">No security scan data available</div>
        <div className="text-sm text-gray-500 mt-2">Run a security scan to see vulnerabilities and secrets</div>
      </div>
    );
  }

  const data = scan.data;
  const vulnerabilities = data.vulnerabilities || [];
  const findings = data.findings || [];

  return (
    <div>
      <h2 className="text-xl font-semibold mb-4">🔒 Security Findings</h2>

      {/* NPM Vulnerabilities */}
      <div className="mb-6">
        <h3 className="text-lg font-semibold mb-3">NPM Vulnerabilities</h3>
        {vulnerabilities.length === 0 ? (
          <div className="text-sm text-green-600 bg-green-50 rounded-lg p-4">
            ✅ No critical or high severity vulnerabilities found
          </div>
        ) : (
          <div className="space-y-3">
            {vulnerabilities.map((vuln: any, idx: number) => (
              <div key={idx} className="border rounded-lg p-4">
                <div className="flex items-start justify-between mb-2">
                  <div className="font-semibold">{vuln.name}</div>
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                    vuln.severity === 'critical' ? 'bg-red-100 text-red-800' :
                    vuln.severity === 'high' ? 'bg-orange-100 text-orange-800' :
                    'bg-yellow-100 text-yellow-800'
                  }`}>
                    {vuln.severity}
                  </span>
                </div>
                <div className="text-sm text-gray-600 mb-2">{vuln.title}</div>
                <div className="text-xs text-gray-500">
                  Range: {vuln.range} | Recommendation: {vuln.fixAvailable ? 'Update available' : 'No fix available'}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Secrets Detection */}
      <div className="mb-6">
        <h3 className="text-lg font-semibold mb-3">Secrets Detection</h3>
        {findings.length === 0 ? (
          <div className="text-sm text-green-600 bg-green-50 rounded-lg p-4">
            ✅ No exposed secrets detected
          </div>
        ) : (
          <div className="space-y-3">
            {findings.map((finding: any, idx: number) => (
              <div key={idx} className="border rounded-lg p-4 bg-red-50">
                <div className="flex items-start justify-between mb-2">
                  <div className="font-semibold text-red-800">{finding.type}</div>
                  <span className="text-xs text-gray-600">Line {finding.line}</span>
                </div>
                <div className="text-sm text-gray-700 font-mono bg-white rounded p-2">
                  {finding.content}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="text-sm text-gray-600">
        Scanned at: {new Date(scan.scannedAt).toLocaleString()}
      </div>
    </div>
  );
}

function StoriesTab({ stories }: { stories: Completion[] }) {
  if (stories.length === 0) {
    return (
      <div className="text-center py-12">
        <div className="text-gray-600">No stories for this project</div>
      </div>
    );
  }

  return (
    <div>
      <h2 className="text-xl font-semibold mb-4">Stories ({stories.length})</h2>
      <div className="space-y-4">
        {stories.map((completion) => (
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
