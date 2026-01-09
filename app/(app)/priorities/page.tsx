'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import Link from 'next/link';
import { useApiCache, invalidateCache } from '@/lib/hooks/useApiCache';

interface Story {
  id: string;
  title: string;
  rationale: string;
  projectId: string;
  status: string;
  priorityLevel: 'P0' | 'P1' | 'P2' | 'P3' | null;
  priorityScore: number | null;
  linearTaskId: string | null;
  linearIssueUrl: string | null;
  linearIdentifier: string | null;
  prUrl: string | null;
  createdAt: string;
  project?: {
    id: string;
    name: string;
  };
}

interface Project {
  id: string;
  name: string;
}

interface PrioritiesResponse {
  stories: Story[];
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
  error?: string;
}

interface ProjectsResponse {
  projects: Project[];
  count: number;
}

export default function PrioritiesPage() {
  const [selectedProject, setSelectedProject] = useState<string>('');
  const [page, setPage] = useState(1);
  const [reranking, setReranking] = useState(false);
  const [viewMode, setViewMode] = useState<'table' | 'cards'>('table');

  // Cache projects for 1 hour since they don't change often
  const { data: projectsData, loading: projectsLoading } = useApiCache<ProjectsResponse>(
    '/api/projects',
    { ttl: 60 * 60 * 1000 } // 1 hour cache
  );

  // Build priorities URL with project filter and pagination
  const prioritiesUrl = useMemo(() => {
    let url = `/api/priorities?page=${page}&limit=50`;
    if (selectedProject) {
      url += `&projectId=${selectedProject}`;
    }
    return url;
  }, [selectedProject, page]);

  // Cache priorities with short TTL and aggressive polling for real-time feel
  // - 30 second cache TTL (reduced for better responsiveness)
  // - 10 second polling interval
  // - Auto-refresh when tab becomes visible
  const { 
    data: prioritiesData, 
    loading: prioritiesLoading, 
    refresh,
    lastUpdated 
  } = useApiCache<PrioritiesResponse>(
    prioritiesUrl,
    { 
      ttl: 30 * 1000, // 30 second cache
      backgroundRefresh: true,
      refreshOnFocus: true, // Refresh when tab becomes visible
      pollingInterval: 10000, // Poll every 10 seconds
    }
  );

  // Reset page when project filter changes
  useEffect(() => {
    setPage(1);
  }, [selectedProject]);

  const projects = useMemo(() => projectsData?.projects || [], [projectsData]);
  const stories = useMemo(() => prioritiesData?.stories || [], [prioritiesData]);
  const summary = useMemo(() => prioritiesData?.summary || {
    totalStories: 0,
    p0Count: 0,
    p1Count: 0,
    p2Count: 0,
    p3Count: 0,
  }, [prioritiesData]);
  const pagination = useMemo(() => prioritiesData?.pagination || {
    page: 1,
    limit: 50,
    total: 0,
    totalPages: 0,
    hasMore: false,
  }, [prioritiesData]);

  const handleRerank = useCallback(async () => {
    setReranking(true);
    // Simulate re-ranking (in a real app this would call a backend service)
    await new Promise(resolve => setTimeout(resolve, 1500));
    invalidateCache('/api/priorities');
    await refresh();
    setReranking(false);
  }, [refresh]);

  const getTimeAgo = useCallback((date: Date) => {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));

    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins} min ago`;
    return `${diffHours} hour${diffHours !== 1 ? 's' : ''} ago`;
  }, []);

  const getPriorityBadge = useCallback((priorityLevel: string | null) => {
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
  }, []);

  const getImpactDots = useCallback((score: number | null) => {
    const normalizedScore = Math.min(5, Math.max(1, Math.ceil((score || 50) / 20)));
    return (
      <span style={{ color: 'var(--accent-green)' }}>
        {'●'.repeat(normalizedScore)}
        <span style={{ color: 'var(--border-light)' }}>{'○'.repeat(5 - normalizedScore)}</span>
      </span>
    );
  }, []);

  const getConfidenceDots = useCallback((score: number | null) => {
    // Confidence is derived from score variance - higher scores = more confident
    const confidence = Math.min(5, Math.max(1, Math.ceil((score || 50) / 25)));
    return (
      <span style={{ color: 'var(--accent-green)' }}>
        {'●'.repeat(confidence)}
        <span style={{ color: 'var(--border-light)' }}>{'○'.repeat(5 - confidence)}</span>
      </span>
    );
  }, []);

  const loading = prioritiesLoading && !prioritiesData;

  // Skeleton loading state
  if (loading) {
    return (
      <div className="app-page">
        <div className="page-header">
          <h1 className="page-title">Priority Stack</h1>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <div style={{ width: '160px', height: '36px', background: 'var(--bg-warm)', borderRadius: '8px', animation: 'pulse 1.5s infinite' }} />
            <div style={{ width: '80px', height: '36px', background: 'var(--bg-warm)', borderRadius: '8px', animation: 'pulse 1.5s infinite' }} />
          </div>
        </div>
        
        <div className="card">
          <div className="card-header">
            <span className="card-title">🎯 Overall Priority Stack</span>
            <div style={{ width: '100px', height: '12px', background: 'var(--bg-warm)', borderRadius: '4px', animation: 'pulse 1.5s infinite' }} />
          </div>
          
          {/* Skeleton table header */}
          <div style={{ borderBottom: '1px solid var(--border-light)', padding: '12px 0', display: 'flex', gap: '16px' }}>
            {['#', 'Story', 'Project', 'Priority', 'Impact', 'Confidence', 'Score'].map((_, i) => (
              <div key={i} style={{ 
                width: i === 1 ? '200px' : '80px', 
                height: '12px', 
                background: 'var(--bg-warm)', 
                borderRadius: '4px', 
                animation: 'pulse 1.5s infinite' 
              }} />
            ))}
          </div>
          
          {/* Skeleton rows */}
          {[1, 2, 3, 4, 5].map(i => (
            <div key={i} style={{ borderBottom: '1px solid var(--border-light)', padding: '16px 0', display: 'flex', alignItems: 'center', gap: '16px' }}>
              <div style={{ width: '20px', height: '16px', background: 'var(--bg-warm)', borderRadius: '4px', animation: 'pulse 1.5s infinite' }} />
              <div style={{ flex: 1 }}>
                <div style={{ width: '70%', height: '14px', background: 'var(--bg-warm)', borderRadius: '4px', marginBottom: '8px', animation: 'pulse 1.5s infinite' }} />
                <div style={{ width: '40%', height: '10px', background: 'var(--bg-warm)', borderRadius: '4px', animation: 'pulse 1.5s infinite' }} />
              </div>
              <div style={{ width: '80px', height: '14px', background: 'var(--bg-warm)', borderRadius: '4px', animation: 'pulse 1.5s infinite' }} />
              <div style={{ width: '40px', height: '22px', background: 'var(--bg-warm)', borderRadius: '12px', animation: 'pulse 1.5s infinite' }} />
              <div style={{ width: '60px', height: '14px', background: 'var(--bg-warm)', borderRadius: '4px', animation: 'pulse 1.5s infinite' }} />
              <div style={{ width: '60px', height: '14px', background: 'var(--bg-warm)', borderRadius: '4px', animation: 'pulse 1.5s infinite' }} />
              <div style={{ width: '40px', height: '18px', background: 'var(--bg-warm)', borderRadius: '4px', animation: 'pulse 1.5s infinite' }} />
            </div>
          ))}
        </div>
        
        <style jsx>{`
          @keyframes pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.5; }
          }
        `}</style>
      </div>
    );
  }

  return (
    <div className="app-page">
      {/* Header */}
      <div className="page-header">
        <h1 className="page-title">Priority Stack</h1>
        <div className="page-header-actions">
          <select
            value={selectedProject}
            onChange={(e) => setSelectedProject(e.target.value)}
            className="btn btn-secondary touch-target"
            style={{ minWidth: '120px', fontSize: '13px' }}
          >
            <option value="">All Projects</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          
          {/* View Toggle */}
          <div className="view-toggle">
            <button 
              className={`view-toggle-btn ${viewMode === 'table' ? 'active' : ''}`}
              onClick={() => setViewMode('table')}
            >
              ≡
            </button>
            <button 
              className={`view-toggle-btn ${viewMode === 'cards' ? 'active' : ''}`}
              onClick={() => setViewMode('cards')}
            >
              ▦
            </button>
          </div>
          
          <button
            onClick={handleRerank}
            disabled={reranking}
            className="btn btn-secondary touch-target"
            style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <span style={{ 
              display: 'inline-block',
              animation: reranking ? 'spin 1s linear infinite' : 'none',
            }}>🔄</span>
            <span className="hide-mobile">Re-rank</span>
          </button>
        </div>
      </div>

      {/* Priority Summary Cards */}
      <div className="responsive-grid responsive-grid-4" style={{ marginBottom: '24px' }}>
        <div className="card" style={{ padding: '16px', textAlign: 'center' }}>
          <div style={{ fontSize: '24px', fontWeight: 700, color: '#991B1B' }}>{summary.p0Count}</div>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>P0 Critical</div>
        </div>
        <div className="card" style={{ padding: '16px', textAlign: 'center' }}>
          <div style={{ fontSize: '24px', fontWeight: 700, color: '#92400E' }}>{summary.p1Count}</div>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>P1 High</div>
        </div>
        <div className="card" style={{ padding: '16px', textAlign: 'center' }}>
          <div style={{ fontSize: '24px', fontWeight: 700, color: '#1E40AF' }}>{summary.p2Count}</div>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>P2 Medium</div>
        </div>
        <div className="card" style={{ padding: '16px', textAlign: 'center' }}>
          <div style={{ fontSize: '24px', fontWeight: 700, color: '#6B7280' }}>{summary.p3Count}</div>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>P3 Low</div>
        </div>
      </div>

      {/* Overall Priority Stack Card */}
      <div className="card">
        <div className="card-header">
          <span className="card-title">🎯 Overall Priority Stack</span>
          <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
            {summary.totalStories} stories • Page {pagination.page} of {pagination.totalPages || 1}
          </span>
        </div>

        {stories.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '32px' }}>
            <div style={{ fontSize: '24px', marginBottom: '8px' }}>📭</div>
            <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>No stories to prioritize</div>
            <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
              Stories will appear here when they need prioritization
            </div>
          </div>
        ) : (
          <>
            {/* Table View - Hidden on mobile when card view is active */}
            {viewMode === 'table' && (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '700px' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border-light)' }}>
                      <th style={{ padding: '12px 8px', textAlign: 'left', fontSize: '12px', color: 'var(--text-muted)', fontWeight: 500 }}>#</th>
                      <th style={{ padding: '12px 8px', textAlign: 'left', fontSize: '12px', color: 'var(--text-muted)', fontWeight: 500 }}>Story</th>
                      <th style={{ padding: '12px 8px', textAlign: 'left', fontSize: '12px', color: 'var(--text-muted)', fontWeight: 500 }}>Project</th>
                      <th style={{ padding: '12px 8px', textAlign: 'center', fontSize: '12px', color: 'var(--text-muted)', fontWeight: 500 }}>Priority</th>
                      <th style={{ padding: '12px 8px', textAlign: 'center', fontSize: '12px', color: 'var(--text-muted)', fontWeight: 500 }}>Impact</th>
                      <th style={{ padding: '12px 8px', textAlign: 'center', fontSize: '12px', color: 'var(--text-muted)', fontWeight: 500 }}>Score</th>
                      <th style={{ padding: '12px 8px', textAlign: 'center', fontSize: '12px', color: 'var(--text-muted)', fontWeight: 500 }}>Links</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stories.map((story, index) => {
                      const globalIndex = (page - 1) * pagination.limit + index;
                      return (
                        <tr 
                          key={story.id} 
                          style={{ 
                            borderBottom: '1px solid var(--border-light)',
                            cursor: 'pointer',
                            transition: 'background 0.15s',
                          }}
                          onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-warm)'}
                          onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                        >
                          <td style={{ 
                            padding: '16px 8px', 
                            fontWeight: 600, 
                            color: globalIndex === 0 ? 'var(--accent-purple)' : 'var(--text-muted)',
                            fontSize: '14px',
                          }}>
                            {globalIndex + 1}
                          </td>
                          <td style={{ padding: '16px 8px' }}>
                            <Link 
                              href={`/stories/${story.id}`}
                              style={{ textDecoration: 'none', color: 'inherit' }}
                            >
                              <div style={{ fontWeight: 500, color: 'var(--text-primary)' }}>{story.title}</div>
                              <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                                {story.rationale?.slice(0, 50) || 'No description'}
                                {story.rationale && story.rationale.length > 50 ? '...' : ''}
                              </div>
                            </Link>
                          </td>
                          <td style={{ padding: '16px 8px', fontSize: '13px' }}>
                            {story.project?.name || 'Unknown'}
                          </td>
                          <td style={{ padding: '16px 8px', textAlign: 'center' }}>
                            {getPriorityBadge(story.priorityLevel)}
                          </td>
                          <td style={{ padding: '16px 8px', textAlign: 'center' }}>
                            {getImpactDots(story.priorityScore)}
                          </td>
                          <td style={{ 
                            padding: '16px 8px', 
                            textAlign: 'center', 
                            fontWeight: 700, 
                            color: globalIndex === 0 ? 'var(--accent-purple)' : 'var(--text-primary)',
                            fontSize: '16px',
                          }}>
                            {story.priorityScore || 50}
                          </td>
                          <td style={{ padding: '16px 8px', textAlign: 'center' }}>
                            <div style={{ display: 'flex', gap: '4px', justifyContent: 'center' }}>
                              {(story.linearIssueUrl || story.linearTaskId) && (
                                <a
                                  href={story.linearIssueUrl || `https://linear.app/media-maker/issue/${story.linearIdentifier || story.linearTaskId}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  onClick={(e) => e.stopPropagation()}
                                  className="touch-target"
                                  style={{
                                    padding: '4px 8px',
                                    fontSize: '11px',
                                    background: 'var(--bg-warm)',
                                    borderRadius: '4px',
                                    textDecoration: 'none',
                                    color: 'var(--text-muted)',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    minHeight: '32px',
                                  }}
                                  title={story.linearIdentifier ? `View ${story.linearIdentifier} in Linear` : 'View in Linear'}
                                >
                                  📋 {story.linearIdentifier && <span style={{ marginLeft: '4px', fontSize: '10px' }}>{story.linearIdentifier}</span>}
                                </a>
                              )}
                              {story.prUrl && (
                                <a
                                  href={story.prUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  onClick={(e) => e.stopPropagation()}
                                  className="touch-target"
                                  style={{
                                    padding: '4px 8px',
                                    fontSize: '11px',
                                    background: 'var(--bg-warm)',
                                    borderRadius: '4px',
                                    textDecoration: 'none',
                                    color: 'var(--text-muted)',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    minHeight: '32px',
                                  }}
                                  title="View Pull Request"
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
              </div>
            )}

            {/* Card View - Better for mobile */}
            {viewMode === 'cards' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {stories.map((story, index) => {
                  const globalIndex = (page - 1) * pagination.limit + index;
                  return (
                    <Link 
                      key={story.id}
                      href={`/stories/${story.id}`}
                      style={{ textDecoration: 'none', color: 'inherit' }}
                    >
                      <div 
                        className="story-card-mobile"
                        style={{ 
                          background: globalIndex === 0 ? 'linear-gradient(135deg, rgba(139, 92, 246, 0.1), rgba(124, 58, 237, 0.05))' : 'white',
                          borderColor: globalIndex === 0 ? 'var(--accent-purple)' : 'var(--border-light)',
                        }}
                      >
                        <div className="story-card-mobile-header">
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1 }}>
                            <span style={{
                              fontSize: '14px',
                              fontWeight: 700,
                              color: globalIndex === 0 ? 'var(--accent-purple)' : 'var(--text-muted)',
                              minWidth: '24px',
                            }}>
                              #{globalIndex + 1}
                            </span>
                            {getPriorityBadge(story.priorityLevel)}
                            <span style={{ 
                              fontWeight: 700, 
                              fontSize: '18px',
                              color: globalIndex === 0 ? 'var(--accent-purple)' : 'var(--text-primary)',
                              marginLeft: 'auto',
                            }}>
                              {story.priorityScore || 50}
                            </span>
                          </div>
                        </div>
                        
                        <div style={{ fontWeight: 500, color: 'var(--text-primary)', fontSize: '15px' }}>
                          {story.title}
                        </div>
                        
                        {story.rationale && (
                          <div style={{ fontSize: '13px', color: 'var(--text-muted)', lineHeight: 1.4 }}>
                            {story.rationale.slice(0, 100)}{story.rationale.length > 100 ? '...' : ''}
                          </div>
                        )}
                        
                        <div className="story-card-mobile-meta">
                          <span style={{ 
                            fontSize: '12px', 
                            color: 'var(--text-muted)',
                            background: 'var(--bg-warm)',
                            padding: '4px 10px',
                            borderRadius: '6px',
                          }}>
                            {story.project?.name || 'Unknown'}
                          </span>
                          <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                            {getImpactDots(story.priorityScore)} Impact
                          </span>
                          <div style={{ display: 'flex', gap: '6px', marginLeft: 'auto' }}>
                            {(story.linearIssueUrl || story.linearTaskId) && (
                              <span
                                style={{
                                  padding: '4px 8px',
                                  fontSize: '12px',
                                  background: 'var(--bg-warm)',
                                  borderRadius: '4px',
                                }}
                                title={story.linearIdentifier || 'Linear'}
                              >
                                📋 {story.linearIdentifier && <span style={{ fontSize: '10px' }}>{story.linearIdentifier}</span>}
                              </span>
                            )}
                            {story.prUrl && (
                              <span
                                style={{
                                  padding: '4px 8px',
                                  fontSize: '12px',
                                  background: 'var(--bg-warm)',
                                  borderRadius: '4px',
                                }}
                              >
                                🔀
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}

            {/* Pagination controls */}
            {pagination.totalPages > 1 && (
              <div style={{
                display: 'flex',
                justifyContent: 'center',
                gap: '8px',
                marginTop: '24px',
                paddingTop: '16px',
                borderTop: '1px solid var(--border-light)',
              }}>
                <button
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="btn btn-secondary"
                  style={{ fontSize: '12px', opacity: page === 1 ? 0.5 : 1 }}
                >
                  ← Previous
                </button>
                <span style={{
                  display: 'flex',
                  alignItems: 'center',
                  padding: '0 16px',
                  color: 'var(--text-muted)',
                  fontSize: '13px',
                }}>
                  {page} / {pagination.totalPages}
                </span>
                <button
                  onClick={() => setPage(p => Math.min(pagination.totalPages, p + 1))}
                  disabled={!pagination.hasMore}
                  className="btn btn-secondary"
                  style={{ fontSize: '12px', opacity: !pagination.hasMore ? 0.5 : 1 }}
                >
                  Next →
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Scoring Formula */}
      <div className="card" style={{ marginTop: '24px' }}>
        <div className="card-header">
          <span className="card-title">⚡ Scoring Formula</span>
        </div>
        <div className="responsive-grid responsive-grid-5" style={{ fontSize: '13px' }}>
          <div style={{ textAlign: 'center', padding: '12px', background: 'var(--bg-warm)', borderRadius: '8px' }}>
            <div style={{ fontWeight: 600, color: 'var(--accent-purple)', marginBottom: '4px' }}>40%</div>
            <div style={{ color: 'var(--text-muted)', fontSize: '12px' }}>Priority Signal</div>
          </div>
          <div style={{ textAlign: 'center', padding: '12px', background: 'var(--bg-warm)', borderRadius: '8px' }}>
            <div style={{ fontWeight: 600, color: 'var(--accent-purple)', marginBottom: '4px' }}>25%</div>
            <div style={{ color: 'var(--text-muted)', fontSize: '12px' }}>Launch Impact</div>
          </div>
          <div style={{ textAlign: 'center', padding: '12px', background: 'var(--bg-warm)', borderRadius: '8px' }}>
            <div style={{ fontWeight: 600, color: 'var(--accent-purple)', marginBottom: '4px' }}>15%</div>
            <div style={{ color: 'var(--text-muted)', fontSize: '12px' }}>Effort (inv)</div>
          </div>
          <div style={{ textAlign: 'center', padding: '12px', background: 'var(--bg-warm)', borderRadius: '8px' }}>
            <div style={{ fontWeight: 600, color: 'var(--accent-purple)', marginBottom: '4px' }}>10%</div>
            <div style={{ color: 'var(--text-muted)', fontSize: '12px' }}>Age Boost</div>
          </div>
          <div style={{ textAlign: 'center', padding: '12px', background: 'var(--bg-warm)', borderRadius: '8px' }}>
            <div style={{ fontWeight: 600, color: 'var(--accent-purple)', marginBottom: '4px' }}>10%</div>
            <div style={{ color: 'var(--text-muted)', fontSize: '12px' }}>User Focus</div>
          </div>
        </div>
      </div>

      <style jsx>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
