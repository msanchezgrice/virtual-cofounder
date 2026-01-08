/**
 * Scans Page - Project Scan Results
 * 
 * Shows detailed scan results across all projects:
 * - Security, Performance, SEO, Domain, Analytics scans
 * - Issue breakdown by severity
 * - Scan history timeline
 */

'use client';

import { useEffect, useState } from 'react';

interface ScanResult {
  id: string;
  projectId: string;
  projectName: string;
  scanType: string;
  status: string;
  scannedAt: string;
  // Type-specific data
  domainData?: {
    ssl?: { valid: boolean; expiresAt?: string };
    dns?: { resolved: boolean };
  };
  seoDetail?: {
    title?: string;
    metaDesc?: string;
    h1?: string;
    ogTags?: Record<string, string>;
  };
  securityIssues?: Array<{
    severity: string;
    type: string;
    message: string;
  }>;
  playwrightMetrics?: {
    lcp?: number;
    fcp?: number;
    ttfb?: number;
  };
  analyticsData?: {
    hasPosthog?: boolean;
    hasGA?: boolean;
  };
}

interface Project {
  id: string;
  name: string;
}

const SCAN_TYPE_ICONS: Record<string, string> = {
  domain: '🌐',
  seo: '🔍',
  security: '🔒',
  performance: '⚡',
  analytics: '📊',
  vercel: '▲',
};

const SCAN_TYPE_COLORS: Record<string, string> = {
  domain: 'bg-blue-100 text-blue-700 border-blue-200',
  seo: 'bg-purple-100 text-purple-700 border-purple-200',
  security: 'bg-red-100 text-red-700 border-red-200',
  performance: 'bg-yellow-100 text-yellow-700 border-yellow-200',
  analytics: 'bg-green-100 text-green-700 border-green-200',
  vercel: 'bg-gray-100 text-gray-700 border-gray-200',
};

function ScanScore({ scan }: { scan: ScanResult }) {
  let score = 0;
  let details: string[] = [];

  switch (scan.scanType) {
    case 'domain':
      const sslOk = scan.domainData?.ssl?.valid ?? false;
      const dnsOk = scan.domainData?.dns?.resolved ?? true;
      score = (sslOk ? 50 : 0) + (dnsOk ? 50 : 0);
      if (sslOk) details.push('SSL valid');
      if (dnsOk) details.push('DNS resolved');
      if (!sslOk) details.push('SSL invalid');
      break;

    case 'seo':
      const hasTitle = !!scan.seoDetail?.title;
      const hasMeta = !!scan.seoDetail?.metaDesc;
      const hasH1 = !!scan.seoDetail?.h1;
      score = (hasTitle ? 40 : 0) + (hasMeta ? 30 : 0) + (hasH1 ? 30 : 0);
      if (hasTitle) details.push(`Title: ${scan.seoDetail?.title?.substring(0, 30)}...`);
      if (hasMeta) details.push('Meta desc ✓');
      if (hasH1) details.push(`H1: ${scan.seoDetail?.h1?.substring(0, 20)}...`);
      break;

    case 'security':
      const issues = scan.securityIssues || [];
      const criticalCount = issues.filter(i => i.severity === 'critical' || i.severity === 'high').length;
      score = Math.max(0, 100 - (criticalCount * 25));
      details = issues.slice(0, 3).map(i => `${i.severity}: ${i.message}`);
      break;

    case 'performance':
      const lcp = scan.playwrightMetrics?.lcp ?? 5000;
      const fcp = scan.playwrightMetrics?.fcp ?? 3000;
      const lcpScore = lcp < 2500 ? 50 : (lcp < 4000 ? 30 : 10);
      const fcpScore = fcp < 1800 ? 50 : (fcp < 3000 ? 30 : 10);
      score = lcpScore + fcpScore;
      details.push(`LCP: ${(lcp / 1000).toFixed(1)}s`);
      details.push(`FCP: ${(fcp / 1000).toFixed(1)}s`);
      break;

    case 'analytics':
      const hasPosthog = scan.analyticsData?.hasPosthog;
      const hasGA = scan.analyticsData?.hasGA;
      score = (hasPosthog || hasGA) ? 100 : 0;
      if (hasPosthog) details.push('PostHog ✓');
      if (hasGA) details.push('Google Analytics ✓');
      if (!hasPosthog && !hasGA) details.push('No analytics detected');
      break;
  }

  const scoreColor = score >= 80 ? 'text-green-600' : score >= 60 ? 'text-yellow-600' : 'text-red-600';

  return (
    <div className="flex items-center gap-4">
      <div className={`text-2xl font-bold ${scoreColor}`}>{score}</div>
      <div className="text-xs text-gray-500">
        {details.slice(0, 2).map((d, i) => (
          <div key={i} className="truncate max-w-[200px]">{d}</div>
        ))}
      </div>
    </div>
  );
}

function ScanCard({ scan }: { scan: ScanResult }) {
  const [expanded, setExpanded] = useState(false);
  const icon = SCAN_TYPE_ICONS[scan.scanType] || '📋';
  const colorClass = SCAN_TYPE_COLORS[scan.scanType] || 'bg-gray-100 text-gray-700 border-gray-200';

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4 hover:shadow-sm transition-shadow">
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-3">
          <div className={`px-3 py-2 rounded-lg border ${colorClass}`}>
            <span className="text-lg">{icon}</span>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-medium text-gray-900 capitalize">{scan.scanType}</h3>
              <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                scan.status === 'ok' ? 'bg-green-100 text-green-700' : 
                scan.status === 'error' ? 'bg-red-100 text-red-700' : 
                'bg-gray-100 text-gray-700'
              }`}>
                {scan.status}
              </span>
            </div>
            <p className="text-sm text-gray-500">{scan.projectName}</p>
            <p className="text-xs text-gray-400 mt-1">
              {new Date(scan.scannedAt).toLocaleString()}
            </p>
          </div>
        </div>
        <ScanScore scan={scan} />
      </div>

      {/* Expandable details */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="mt-3 text-xs text-blue-600 hover:underline"
      >
        {expanded ? 'Hide details' : 'Show details'}
      </button>

      {expanded && (
        <div className="mt-3 pt-3 border-t border-gray-100">
          <pre className="text-xs bg-gray-50 p-3 rounded overflow-auto max-h-48">
            {JSON.stringify(
              scan.domainData || scan.seoDetail || scan.securityIssues || 
              scan.playwrightMetrics || scan.analyticsData || {},
              null,
              2
            )}
          </pre>
        </div>
      )}
    </div>
  );
}

export default function ScansPage() {
  const [scans, setScans] = useState<ScanResult[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProject, setSelectedProject] = useState<string>('');
  const [selectedType, setSelectedType] = useState<string>('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      try {
        // Fetch scans
        const scansRes = await fetch('/api/scans');
        if (scansRes.ok) {
          const data = await scansRes.json();
          setScans(data.scans || []);
        }

        // Fetch projects
        const projectRes = await fetch('/api/projects');
        if (projectRes.ok) {
          const data = await projectRes.json();
          const projectList = Array.isArray(data) ? data : (data.projects || []);
          setProjects(projectList);
        }
      } catch (err) {
        console.error('Failed to fetch scans:', err);
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, []);

  // Filter scans
  const filteredScans = scans.filter(scan => {
    if (selectedProject && scan.projectId !== selectedProject) return false;
    if (selectedType && scan.scanType !== selectedType) return false;
    return true;
  });

  // Group by type for stats
  const scansByType = scans.reduce((acc, scan) => {
    acc[scan.scanType] = (acc[scan.scanType] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto px-6 py-8">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 rounded w-1/4" />
          <div className="h-64 bg-gray-200 rounded" />
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-6 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Scans</h1>
          <p className="text-gray-600 mt-1">
            Automated project health checks
          </p>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={selectedType}
            onChange={(e) => setSelectedType(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white"
          >
            <option value="">All Types</option>
            {Object.keys(SCAN_TYPE_ICONS).map((type) => (
              <option key={type} value={type}>{type}</option>
            ))}
          </select>
          <select
            value={selectedProject}
            onChange={(e) => setSelectedProject(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white"
          >
            <option value="">All Projects</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-6 gap-3 mb-6">
        {Object.entries(SCAN_TYPE_ICONS).map(([type, icon]) => (
          <button
            key={type}
            onClick={() => setSelectedType(selectedType === type ? '' : type)}
            className={`p-3 rounded-lg border text-center transition-colors ${
              selectedType === type 
                ? 'bg-blue-50 border-blue-300' 
                : 'bg-white border-gray-200 hover:bg-gray-50'
            }`}
          >
            <div className="text-2xl mb-1">{icon}</div>
            <div className="text-sm font-medium capitalize">{type}</div>
            <div className="text-xs text-gray-500">{scansByType[type] || 0} scans</div>
          </button>
        ))}
      </div>

      {/* Scan list */}
      <div className="space-y-3">
        <h2 className="text-sm font-medium text-gray-500">
          {filteredScans.length} Scans
        </h2>
        {filteredScans.length === 0 ? (
          <div className="text-center py-12 bg-gray-50 rounded-lg">
            <p className="text-gray-500">No scans found</p>
            <p className="text-sm text-gray-400 mt-1">
              Run a scan from the dashboard or wait for the scheduled daily scan
            </p>
          </div>
        ) : (
          filteredScans.map((scan) => (
            <ScanCard key={scan.id} scan={scan} />
          ))
        )}
      </div>
    </div>
  );
}
