'use client';

import { useState, useMemo, useCallback } from 'react';
import { useApiCache, invalidateCache } from '@/lib/hooks/useApiCache';

interface Project {
  id: string;
  name: string;
}

interface ScanScores {
  domain: { score: number; max: number };
  seo: { score: number; max: number };
  analytics: { score: number; max: number };
  security: { score: number; max: number };
  performance: { score: number; max: number };
}

interface Finding {
  id: string;
  type: 'critical' | 'warning' | 'pass';
  title: string;
  description: string;
  scanType: string;
}

interface Scan {
  id: string;
  scanType: string;
  status: string;
  scannedAt: string;
  projectId: string;
  projectName: string;
  domainData?: {
    ssl?: { valid: boolean; expiresAt: string };
    dns?: { resolved: boolean };
  };
  seoDetail?: {
    title?: string;
    metaDesc?: string;
    h1?: string;
  };
  analyticsData?: {
    hasPosthog?: boolean;
    hasGA?: boolean;
  };
  securityIssues?: Array<{
    type: string;
    severity: string;
    message: string;
  }>;
  playwrightMetrics?: {
    lcp?: number;
    fcp?: number;
  };
}

interface ScansResponse {
  scans: Scan[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasMore: boolean;
  };
  error?: string;
}

interface ProjectsResponse {
  projects: Project[];
  error?: string;
}

function processScans(scans: Scan[]): { scores: ScanScores; findings: Finding[]; lastScanTime: string | null } {
  const newScores: ScanScores = {
    domain: { score: 0, max: 15 },
    seo: { score: 0, max: 10 },
    analytics: { score: 0, max: 10 },
    security: { score: 0, max: 5 },
    performance: { score: 0, max: 10 },
  };

  const newFindings: Finding[] = [];
  let latestScan: Date | null = null;

  for (const scan of scans) {
    const scanDate = new Date(scan.scannedAt);
    if (!latestScan || scanDate > latestScan) {
      latestScan = scanDate;
    }

    switch (scan.scanType) {
      case 'domain':
        const sslValid = scan.domainData?.ssl?.valid;
        const dnsOk = scan.domainData?.dns?.resolved ?? true;
        newScores.domain.score = (sslValid ? 10 : 0) + (dnsOk ? 5 : 0);
        
        if (sslValid) {
          const expiresAt = scan.domainData?.ssl?.expiresAt;
          const daysLeft = expiresAt ? Math.floor((new Date(expiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24)) : 0;
          newFindings.push({
            id: `ssl-${scan.id}`,
            type: 'pass',
            title: 'Pass: SSL certificate valid',
            description: `Certificate expires in ${daysLeft} days`,
            scanType: 'domain',
          });
        } else if (sslValid === false) {
          newFindings.push({
            id: `ssl-${scan.id}`,
            type: 'critical',
            title: 'Critical: SSL certificate invalid',
            description: 'SSL certificate is expired or misconfigured',
            scanType: 'domain',
          });
        }
        break;

      case 'seo':
        const hasTitle = !!scan.seoDetail?.title;
        const hasMeta = !!scan.seoDetail?.metaDesc;
        const hasH1 = !!scan.seoDetail?.h1;
        newScores.seo.score = (hasTitle ? 4 : 0) + (hasMeta ? 3 : 0) + (hasH1 ? 3 : 0);
        
        if (!hasMeta) {
          newFindings.push({
            id: `meta-${scan.id}`,
            type: 'warning',
            title: 'Warning: Missing meta description',
            description: 'Homepage lacks meta description tag',
            scanType: 'seo',
          });
        }
        break;

      case 'analytics':
        const hasPosthog = scan.analyticsData?.hasPosthog;
        const hasGA = scan.analyticsData?.hasGA;
        newScores.analytics.score = (hasPosthog || hasGA) ? 10 : 0;
        break;

      case 'security':
        const issues = scan.securityIssues || [];
        const criticalCount = issues.filter((i) => i.severity === 'critical' || i.severity === 'high').length;
        newScores.security.score = Math.max(0, 5 - criticalCount);
        
        issues.forEach((issue, idx) => {
          if (issue.severity === 'critical' || issue.severity === 'high') {
            newFindings.push({
              id: `sec-${scan.id}-${idx}`,
              type: 'critical',
              title: `Critical: ${issue.type || 'Security vulnerability'}`,
              description: issue.message || 'Security issue detected',
              scanType: 'security',
            });
          }
        });
        break;

      case 'performance':
        const lcp = scan.playwrightMetrics?.lcp ?? 5000;
        const fcp = scan.playwrightMetrics?.fcp ?? 3000;
        const lcpScore = lcp < 2500 ? 5 : (lcp < 4000 ? 3 : 1);
        const fcpScore = fcp < 1800 ? 5 : (fcp < 3000 ? 3 : 1);
        newScores.performance.score = lcpScore + fcpScore;
        break;
    }
  }

  // Sort findings: critical first, then warning, then pass
  const typeOrder = { critical: 0, warning: 1, pass: 2 };
  newFindings.sort((a, b) => typeOrder[a.type] - typeOrder[b.type]);

  return {
    scores: newScores,
    findings: newFindings,
    lastScanTime: latestScan ? formatTimeAgo(latestScan) : null,
  };
}

function formatTimeAgo(date: Date): string {
  const diff = Date.now() - date.getTime();
  const hours = Math.floor(diff / (1000 * 60 * 60));
  if (hours < 1) return 'Just now';
  if (hours < 24) return `${hours} hour${hours > 1 ? 's' : ''} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days > 1 ? 's' : ''} ago`;
}

// Score card skeleton
function ScoreCardSkeleton() {
  return (
    <div
      className="animate-pulse"
      style={{
        background: 'white',
        padding: '20px',
        borderRadius: '12px',
        border: '1px solid var(--border-light, #E7E5E4)',
        textAlign: 'center',
      }}
    >
      <div style={{ height: '24px', background: '#E5E7EB', borderRadius: '4px', width: '24px', margin: '0 auto 8px' }} />
      <div style={{ height: '14px', background: '#E5E7EB', borderRadius: '4px', width: '60px', margin: '0 auto 8px' }} />
      <div style={{ height: '28px', background: '#E5E7EB', borderRadius: '4px', width: '40px', margin: '0 auto' }} />
    </div>
  );
}

// Score card component
function ScoreCard({
  icon,
  label,
  score,
  max,
}: {
  icon: string;
  label: string;
  score: number;
  max: number;
}) {
  const pct = score / max;
  const color = pct >= 0.8 ? 'var(--accent-green, #10B981)' : pct >= 0.5 ? 'var(--accent-amber, #F59E0B)' : 'var(--accent-red, #EF4444)';

  return (
    <div
      style={{
        background: 'white',
        padding: '20px',
        borderRadius: '12px',
        border: '1px solid var(--border-light, #E7E5E4)',
        borderTop: `3px solid ${color}`,
        textAlign: 'center',
      }}
    >
      <div style={{ fontSize: '24px', marginBottom: '8px' }}>{icon}</div>
      <div style={{ fontWeight: 600, marginBottom: '4px' }}>{label}</div>
      <div style={{ fontSize: '24px', fontWeight: 700, color }}>
        {score}/{max}
      </div>
    </div>
  );
}

// Finding row component
function FindingRow({
  finding,
  onCreateStory,
}: {
  finding: Finding;
  onCreateStory?: () => void;
}) {
  const bgColor = finding.type === 'critical' ? '#FEE2E2' : finding.type === 'warning' ? '#FEF3C7' : '#D1FAE5';
  const titleColor = finding.type === 'critical' ? '#991B1B' : finding.type === 'warning' ? '#92400E' : '#065F46';
  const descColor = finding.type === 'critical' ? '#7F1D1D' : finding.type === 'warning' ? '#78350F' : '#047857';
  const icon = finding.type === 'critical' ? '🔴' : finding.type === 'warning' ? '🟡' : '🟢';

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        padding: '12px',
        borderRadius: '8px',
        background: bgColor,
      }}
    >
      <span style={{ fontSize: '20px' }}>{icon}</span>
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 600, color: titleColor }}>{finding.title}</div>
        <div style={{ fontSize: '12px', color: descColor }}>{finding.description}</div>
      </div>
      {finding.type !== 'pass' && onCreateStory && (
        <button
          onClick={onCreateStory}
          style={{
            padding: '6px 12px',
            borderRadius: '6px',
            fontSize: '11px',
            fontWeight: 500,
            background: 'white',
            color: 'var(--text-primary, #1C1917)',
            border: '1px solid var(--border-light, #E7E5E4)',
            cursor: 'pointer',
          }}
        >
          Create Story
        </button>
      )}
    </div>
  );
}

export default function ScansPage() {
  const [selectedProject, setSelectedProject] = useState<string>('all');
  const [triggering, setTriggering] = useState(false);

  // Build API URL
  const scansUrl = useMemo(() => {
    const params = new URLSearchParams();
    params.set('limit', '100'); // Get enough scans to calculate scores
    if (selectedProject !== 'all') params.set('projectId', selectedProject);
    return `/api/scans?${params.toString()}`;
  }, [selectedProject]);

  // Fetch data with caching
  const { data: projectsData } = useApiCache<ProjectsResponse>(
    '/api/projects',
    { ttl: 5 * 60 * 1000 }
  );

  const { data: scansData, loading, refresh } = useApiCache<ScansResponse>(
    scansUrl,
    { ttl: 2 * 60 * 1000, backgroundRefresh: true }
  );

  const projects = projectsData?.projects ?? [];
  const scans = scansData?.scans ?? [];

  // Process scans into scores and findings
  const { scores, findings, lastScanTime } = useMemo(() => processScans(scans), [scans]);

  // Handle scan trigger
  const handleRunScan = useCallback(async () => {
    setTriggering(true);
    try {
      const res = await fetch('/api/scans/trigger', { method: 'POST' });
      if (res.ok) {
        alert('✅ Scans triggered successfully!');
        // Invalidate cache and refresh after delay
        setTimeout(() => {
          invalidateCache('/api/scans');
          refresh();
        }, 3000);
      } else {
        alert('❌ Failed to trigger scans');
      }
    } catch (error) {
      console.error('Failed to trigger scan:', error);
      alert('❌ Error triggering scans');
    } finally {
      setTriggering(false);
    }
  }, [refresh]);

  if (loading && !scansData) {
    return (
      <div style={{ padding: '24px', background: 'var(--bg-cream, #FDF8F3)', minHeight: '100%' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
          <div className="animate-pulse" style={{ height: '28px', background: '#E5E7EB', borderRadius: '8px', width: '150px' }} />
          <div className="flex gap-2">
            <div className="animate-pulse" style={{ height: '36px', background: '#E5E7EB', borderRadius: '8px', width: '120px' }} />
            <div className="animate-pulse" style={{ height: '36px', background: '#E5E7EB', borderRadius: '8px', width: '100px' }} />
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '16px', marginBottom: '24px' }}>
          {[1, 2, 3, 4, 5].map((i) => (
            <ScoreCardSkeleton key={i} />
          ))}
        </div>
        <div className="animate-pulse" style={{ height: '200px', background: '#E5E7EB', borderRadius: '12px' }} />
      </div>
    );
  }

  return (
    <div style={{ padding: '24px', background: 'var(--bg-cream, #FDF8F3)', minHeight: '100%' }}>
      {/* Page Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <h1 style={{ fontSize: '24px', fontWeight: 700, color: 'var(--text-primary, #1C1917)' }}>
          Scan Results
        </h1>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={() => refresh()}
            style={{
              padding: '8px 12px',
              borderRadius: '8px',
              fontSize: '13px',
              background: 'white',
              border: '1px solid var(--border-light, #E7E5E4)',
              cursor: 'pointer',
            }}
          >
            ↻
          </button>
          <select
            value={selectedProject}
            onChange={(e) => setSelectedProject(e.target.value)}
            style={{
              padding: '8px 16px',
              border: '1px solid var(--border-light, #E7E5E4)',
              borderRadius: '8px',
              fontSize: '13px',
              background: 'white',
            }}
          >
            <option value="all">All Projects</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          <button
            onClick={handleRunScan}
            disabled={triggering}
            style={{
              padding: '8px 16px',
              borderRadius: '8px',
              fontSize: '14px',
              fontWeight: 600,
              background: 'var(--accent-purple, #8B5CF6)',
              color: 'white',
              border: 'none',
              cursor: triggering ? 'not-allowed' : 'pointer',
              opacity: triggering ? 0.7 : 1,
            }}
          >
            {triggering ? '⏳ Running...' : '🔍 Run Scan'}
          </button>
        </div>
      </div>

      {scansData?.error && (
        <div
          style={{
            background: '#FEF3C7',
            border: '1px solid #FCD34D',
            borderRadius: '8px',
            padding: '12px 16px',
            marginBottom: '16px',
            color: '#92400E',
          }}
        >
          ⚠️ {scansData.error}
        </div>
      )}

      {/* Scan Score Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '16px', marginBottom: '24px' }}>
        <ScoreCard icon="🌐" label="Domain" score={scores.domain.score} max={scores.domain.max} />
        <ScoreCard icon="🔎" label="SEO" score={scores.seo.score} max={scores.seo.max} />
        <ScoreCard icon="📊" label="Analytics" score={scores.analytics.score} max={scores.analytics.max} />
        <ScoreCard icon="🔒" label="Security" score={scores.security.score} max={scores.security.max} />
        <ScoreCard icon="⚡" label="Performance" score={scores.performance.score} max={scores.performance.max} />
      </div>

      {/* Findings */}
      <div
        style={{
          background: 'white',
          borderRadius: '12px',
          border: '1px solid var(--border-light, #E7E5E4)',
          padding: '20px',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <span style={{ fontSize: '16px', fontWeight: 600 }}>🚨 Findings</span>
          <span style={{ fontSize: '12px', color: 'var(--text-muted, #A8A29E)' }}>
            {lastScanTime ? `Last scan: ${lastScanTime}` : 'No scans yet'}
          </span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {findings.length === 0 ? (
            <div
              style={{
                padding: '24px',
                textAlign: 'center',
                color: 'var(--text-muted, #A8A29E)',
                background: 'var(--bg-warm, #F9F3ED)',
                borderRadius: '8px',
              }}
            >
              <p>No findings yet. Run a scan to check your projects.</p>
            </div>
          ) : (
            findings.map((finding) => (
              <FindingRow key={finding.id} finding={finding} />
            ))
          )}
        </div>
      </div>
    </div>
  );
}
