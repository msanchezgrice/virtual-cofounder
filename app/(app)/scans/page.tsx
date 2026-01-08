'use client';

import { useEffect, useState } from 'react';

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

export default function ScansPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProject, setSelectedProject] = useState<string>('all');
  const [loading, setLoading] = useState(true);
  const [lastScanTime, setLastScanTime] = useState<string | null>(null);
  const [scores, setScores] = useState<ScanScores>({
    domain: { score: 0, max: 15 },
    seo: { score: 0, max: 10 },
    analytics: { score: 0, max: 10 },
    security: { score: 0, max: 5 },
    performance: { score: 0, max: 10 },
  });
  const [findings, setFindings] = useState<Finding[]>([]);
  const [triggering, setTriggering] = useState(false);

  useEffect(() => {
    fetchData();
  }, [selectedProject]);

  async function fetchData() {
    setLoading(true);
    try {
      // Fetch projects
      const projectRes = await fetch('/api/projects');
      if (projectRes.ok) {
        const data = await projectRes.json();
        setProjects(data.projects || []);
      }

      // Fetch scans
      const scansUrl = selectedProject !== 'all' 
        ? `/api/scans?projectId=${selectedProject}` 
        : '/api/scans';
      const scansRes = await fetch(scansUrl);
      if (scansRes.ok) {
        const data = await scansRes.json();
        const scans = data.scans || [];
        
        // Process scans into scores and findings
        processScans(scans);
      }
    } catch (err) {
      console.error('Failed to fetch data:', err);
    } finally {
      setLoading(false);
    }
  }

  function processScans(scans: any[]) {
    // Calculate scores and extract findings from scan data
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
          const criticalCount = issues.filter((i: any) => i.severity === 'critical' || i.severity === 'high').length;
          newScores.security.score = Math.max(0, 5 - criticalCount);
          
          issues.forEach((issue: any, idx: number) => {
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

    setScores(newScores);
    setFindings(newFindings);
    setLastScanTime(latestScan ? formatTimeAgo(latestScan) : null);
  }

  function formatTimeAgo(date: Date): string {
    const diff = Date.now() - date.getTime();
    const hours = Math.floor(diff / (1000 * 60 * 60));
    if (hours < 1) return 'Just now';
    if (hours < 24) return `${hours} hour${hours > 1 ? 's' : ''} ago`;
    const days = Math.floor(hours / 24);
    return `${days} day${days > 1 ? 's' : ''} ago`;
  }

  async function handleRunScan() {
    setTriggering(true);
    try {
      const res = await fetch('/api/scans/trigger', { method: 'POST' });
      if (res.ok) {
        alert('✅ Scans triggered successfully!');
        setTimeout(fetchData, 3000);
      } else {
        alert('❌ Failed to trigger scans');
      }
    } catch (error) {
      console.error('Failed to trigger scan:', error);
      alert('❌ Error triggering scans');
    } finally {
      setTriggering(false);
    }
  }

  function getScoreColor(score: number, max: number): string {
    const pct = score / max;
    if (pct >= 0.8) return 'var(--accent-green, #10B981)';
    if (pct >= 0.5) return 'var(--accent-amber, #F59E0B)';
    return 'var(--accent-red, #EF4444)';
  }

  function getBorderColor(score: number, max: number): string {
    const pct = score / max;
    if (pct >= 0.8) return 'var(--accent-green, #10B981)';
    if (pct >= 0.5) return 'var(--accent-amber, #F59E0B)';
    return 'var(--accent-red, #EF4444)';
  }

  if (loading) {
    return (
      <div style={{ padding: '24px' }}>
        <div style={{ animation: 'pulse 2s infinite' }}>
          <div style={{ height: '32px', background: '#E5E7EB', borderRadius: '8px', width: '200px', marginBottom: '24px' }} />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '16px', marginBottom: '24px' }}>
            {[1, 2, 3, 4, 5].map(i => (
              <div key={i} style={{ height: '120px', background: '#E5E7EB', borderRadius: '12px' }} />
            ))}
          </div>
          <div style={{ height: '200px', background: '#E5E7EB', borderRadius: '12px' }} />
        </div>
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

      {/* Scan Score Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '16px', marginBottom: '24px' }}>
        {/* Domain */}
        <div style={{
          background: 'white',
          padding: '20px',
          borderRadius: '12px',
          border: '1px solid var(--border-light, #E7E5E4)',
          borderTop: `3px solid ${getBorderColor(scores.domain.score, scores.domain.max)}`,
          textAlign: 'center',
        }}>
          <div style={{ fontSize: '24px', marginBottom: '8px' }}>🌐</div>
          <div style={{ fontWeight: 600, marginBottom: '4px' }}>Domain</div>
          <div style={{ fontSize: '24px', fontWeight: 700, color: getScoreColor(scores.domain.score, scores.domain.max) }}>
            {scores.domain.score}/{scores.domain.max}
          </div>
        </div>

        {/* SEO */}
        <div style={{
          background: 'white',
          padding: '20px',
          borderRadius: '12px',
          border: '1px solid var(--border-light, #E7E5E4)',
          borderTop: `3px solid ${getBorderColor(scores.seo.score, scores.seo.max)}`,
          textAlign: 'center',
        }}>
          <div style={{ fontSize: '24px', marginBottom: '8px' }}>🔎</div>
          <div style={{ fontWeight: 600, marginBottom: '4px' }}>SEO</div>
          <div style={{ fontSize: '24px', fontWeight: 700, color: getScoreColor(scores.seo.score, scores.seo.max) }}>
            {scores.seo.score}/{scores.seo.max}
          </div>
        </div>

        {/* Analytics */}
        <div style={{
          background: 'white',
          padding: '20px',
          borderRadius: '12px',
          border: '1px solid var(--border-light, #E7E5E4)',
          borderTop: `3px solid ${getBorderColor(scores.analytics.score, scores.analytics.max)}`,
          textAlign: 'center',
        }}>
          <div style={{ fontSize: '24px', marginBottom: '8px' }}>📊</div>
          <div style={{ fontWeight: 600, marginBottom: '4px' }}>Analytics</div>
          <div style={{ fontSize: '24px', fontWeight: 700, color: getScoreColor(scores.analytics.score, scores.analytics.max) }}>
            {scores.analytics.score}/{scores.analytics.max}
          </div>
        </div>

        {/* Security */}
        <div style={{
          background: 'white',
          padding: '20px',
          borderRadius: '12px',
          border: '1px solid var(--border-light, #E7E5E4)',
          borderTop: `3px solid ${getBorderColor(scores.security.score, scores.security.max)}`,
          textAlign: 'center',
        }}>
          <div style={{ fontSize: '24px', marginBottom: '8px' }}>🔒</div>
          <div style={{ fontWeight: 600, marginBottom: '4px' }}>Security</div>
          <div style={{ fontSize: '24px', fontWeight: 700, color: getScoreColor(scores.security.score, scores.security.max) }}>
            {scores.security.score}/{scores.security.max}
          </div>
        </div>

        {/* Performance */}
        <div style={{
          background: 'white',
          padding: '20px',
          borderRadius: '12px',
          border: '1px solid var(--border-light, #E7E5E4)',
          borderTop: `3px solid ${getBorderColor(scores.performance.score, scores.performance.max)}`,
          textAlign: 'center',
        }}>
          <div style={{ fontSize: '24px', marginBottom: '8px' }}>⚡</div>
          <div style={{ fontWeight: 600, marginBottom: '4px' }}>Performance</div>
          <div style={{ fontSize: '24px', fontWeight: 700, color: getScoreColor(scores.performance.score, scores.performance.max) }}>
            {scores.performance.score}/{scores.performance.max}
          </div>
        </div>
      </div>

      {/* Findings */}
      <div style={{
        background: 'white',
        borderRadius: '12px',
        border: '1px solid var(--border-light, #E7E5E4)',
        padding: '20px',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <span style={{ fontSize: '16px', fontWeight: 600 }}>🚨 Findings</span>
          <span style={{ fontSize: '12px', color: 'var(--text-muted, #A8A29E)' }}>
            {lastScanTime ? `Last scan: ${lastScanTime}` : 'No scans yet'}
          </span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {findings.length === 0 ? (
            <div style={{
              padding: '24px',
              textAlign: 'center',
              color: 'var(--text-muted, #A8A29E)',
              background: 'var(--bg-warm, #F9F3ED)',
              borderRadius: '8px',
            }}>
              <p>No findings yet. Run a scan to check your projects.</p>
            </div>
          ) : (
            findings.map((finding) => (
              <div
                key={finding.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  padding: '12px',
                  borderRadius: '8px',
                  background: finding.type === 'critical' ? '#FEE2E2' :
                             finding.type === 'warning' ? '#FEF3C7' :
                             '#D1FAE5',
                }}
              >
                <span style={{ fontSize: '20px' }}>
                  {finding.type === 'critical' ? '🔴' : finding.type === 'warning' ? '🟡' : '🟢'}
                </span>
                <div style={{ flex: 1 }}>
                  <div style={{
                    fontWeight: 600,
                    color: finding.type === 'critical' ? '#991B1B' :
                           finding.type === 'warning' ? '#92400E' :
                           '#065F46',
                  }}>
                    {finding.title}
                  </div>
                  <div style={{
                    fontSize: '12px',
                    color: finding.type === 'critical' ? '#7F1D1D' :
                           finding.type === 'warning' ? '#78350F' :
                           '#047857',
                  }}>
                    {finding.description}
                  </div>
                </div>
                {finding.type !== 'pass' && (
                  <button
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
            ))
          )}
        </div>
      </div>
    </div>
  );
}
