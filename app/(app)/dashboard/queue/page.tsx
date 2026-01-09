'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { useApiCache, invalidateCache } from '@/lib/hooks/useApiCache';

interface Project {
  id: string;
  name: string;
}

interface ProjectsResponse {
  projects: Project[];
  count: number;
}

interface Story {
  id: string;
  title: string;
  rationale: string;
  priority: 'high' | 'medium' | 'low';
  priorityLevel: 'P0' | 'P1' | 'P2' | 'P3' | null;
  status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'rejected' | 'approved';
  priorityScore: number | null;
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

interface QueueResponse {
  executing: Story | null;
  upNext: Story[];
  stats: {
    total: number;
    pending: number;
    approved: number;
    inProgress: number;
    upNextTotal: number;
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

export default function ExecutionQueuePage() {
  const [page, setPage] = useState(1);
  const [workerActive, setWorkerActive] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const [selectedProject, setSelectedProject] = useState<string>('');

  // Cache projects for filtering dropdown
  const { data: projectsData } = useApiCache<ProjectsResponse>(
    '/api/projects',
    { ttl: 60 * 60 * 1000 } // 1 hour cache
  );
  const projects = projectsData?.projects || [];

  // Build API URL with project filter
  const apiUrl = useMemo(() => {
    let url = `/api/queue?page=${page}&limit=50`;
    if (selectedProject) {
      url += `&projectId=${selectedProject}`;
    }
    return url;
  }, [page, selectedProject]);

  // Use cached API with short TTL for real-time feel but still benefit from caching
  const { data, loading, refresh } = useApiCache<QueueResponse>(
    apiUrl,
    { ttl: 30 * 1000, backgroundRefresh: true } // 30 second cache with background refresh
  );

  // Auto-refresh every 15 seconds (using cached data in between)
  useEffect(() => {
    const interval = setInterval(() => {
      setRefreshKey(k => k + 1);
      refresh();
    }, 15000);
    return () => clearInterval(interval);
  }, [refresh]);

  // Reset page when project filter changes
  useEffect(() => {
    setPage(1);
  }, [selectedProject]);

  const handlePrioritize = async (storyId: string) => {
    try {
      await fetch('/api/priorities', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storyId,
          priorityLevel: 'P0',
          source: 'dashboard',
        }),
      });
      invalidateCache('/api/queue');
      refresh();
    } catch (error) {
      console.error('Failed to prioritize story:', error);
    }
  };

  const getTimeAgo = useCallback((dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins} min ago`;
    if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
    return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
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
        padding: '2px 8px',
        borderRadius: '8px',
        fontSize: '10px',
        fontWeight: 600,
      }}>
        {priorityLevel || 'P2'}
      </span>
    );
  }, []);

  // Memoize derived values
  const { executing, upNext, stats, pagination } = useMemo(() => {
    if (!data) {
      return {
        executing: null,
        upNext: [],
        stats: { total: 0, pending: 0, approved: 0, inProgress: 0, upNextTotal: 0 },
        pagination: { page: 1, limit: 50, total: 0, totalPages: 0, hasMore: false },
      };
    }
    return {
      executing: data.executing,
      upNext: data.upNext || [],
      stats: data.stats,
      pagination: data.pagination,
    };
  }, [data]);

  // Skeleton loading state
  if (loading && !data) {
    return (
      <div className="app-page">
        <div className="page-header">
          <h1 className="page-title">Execution Queue</h1>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <div style={{ width: '120px', height: '28px', background: 'var(--bg-warm)', borderRadius: '8px', animation: 'pulse 1.5s infinite' }} />
            <div style={{ width: '80px', height: '28px', background: 'var(--bg-warm)', borderRadius: '8px', animation: 'pulse 1.5s infinite' }} />
          </div>
        </div>
        {/* Skeleton for executing */}
        <div className="card" style={{ marginBottom: '24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: 'var(--bg-warm)', animation: 'pulse 1.5s infinite' }} />
            <div style={{ flex: 1 }}>
              <div style={{ width: '60%', height: '16px', background: 'var(--bg-warm)', borderRadius: '4px', marginBottom: '8px', animation: 'pulse 1.5s infinite' }} />
              <div style={{ width: '40%', height: '12px', background: 'var(--bg-warm)', borderRadius: '4px', animation: 'pulse 1.5s infinite' }} />
            </div>
          </div>
        </div>
        {/* Skeleton for up next */}
        <div style={{ width: '120px', height: '14px', background: 'var(--bg-warm)', borderRadius: '4px', margin: '24px 0 12px', animation: 'pulse 1.5s infinite' }} />
        {[1, 2, 3].map(i => (
          <div key={i} className="card" style={{ marginBottom: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              <div style={{ width: '24px', height: '14px', background: 'var(--bg-warm)', borderRadius: '4px', animation: 'pulse 1.5s infinite' }} />
              <div style={{ width: '40px', height: '18px', background: 'var(--bg-warm)', borderRadius: '8px', animation: 'pulse 1.5s infinite' }} />
              <div style={{ flex: 1, height: '14px', background: 'var(--bg-warm)', borderRadius: '4px', animation: 'pulse 1.5s infinite' }} />
              <div style={{ width: '80px', height: '14px', background: 'var(--bg-warm)', borderRadius: '4px', animation: 'pulse 1.5s infinite' }} />
              <div style={{ width: '70px', height: '24px', background: 'var(--bg-warm)', borderRadius: '4px', animation: 'pulse 1.5s infinite' }} />
            </div>
          </div>
        ))}
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
        <h1 className="page-title">
          Execution Queue
          <span style={{
            marginLeft: '8px',
            fontSize: '14px',
            fontWeight: 400,
            color: 'var(--text-muted)',
          }}>
            ({stats.total})
          </span>
        </h1>
        <div className="page-header-actions">
          <select
            value={selectedProject}
            onChange={(e) => setSelectedProject(e.target.value)}
            className="btn btn-secondary touch-target"
            style={{
              minWidth: '120px',
              fontSize: '13px',
            }}
          >
            <option value="">All Projects</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          <span style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            background: workerActive ? '#D1FAE5' : '#FEE2E2',
            color: workerActive ? '#065F46' : '#991B1B',
            padding: '6px 12px',
            borderRadius: '8px',
            fontSize: '12px',
            fontWeight: 600,
            whiteSpace: 'nowrap',
          }}>
            <span style={{
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              background: workerActive ? '#10B981' : '#EF4444',
              flexShrink: 0,
            }} />
            <span className="hide-mobile">{workerActive ? 'WORKER ACTIVE' : 'WORKER PAUSED'}</span>
            <span className="show-mobile" style={{ display: 'none' }}>{workerActive ? 'ON' : 'OFF'}</span>
          </span>
          <button
            onClick={() => setWorkerActive(!workerActive)}
            className="btn btn-secondary touch-target"
            style={{ fontSize: '12px', padding: '6px 12px' }}
          >
            {workerActive ? '⏸️' : '▶️'}
            <span className="hide-mobile" style={{ marginLeft: '4px' }}>{workerActive ? 'Pause' : 'Resume'}</span>
          </button>
        </div>
      </div>

      {/* Currently Executing */}
      {executing ? (
        <div className="card" style={{
          borderLeft: '4px solid var(--accent-green)',
          background: 'linear-gradient(90deg, rgba(16, 185, 129, 0.05), transparent)',
          marginBottom: '24px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <div style={{
              width: '48px',
              height: '48px',
              borderRadius: '12px',
              background: '#D1FAE5',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}>
              <span style={{ fontSize: '24px' }}>⚙️</span>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                {getPriorityBadge(executing.priorityLevel)}
                <span style={{ fontWeight: 600 }}>{executing.title}</span>
              </div>
              <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
                {executing.project.name} • Started {getTimeAgo(executing.executedAt || executing.createdAt)}
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: '12px', color: 'var(--accent-green)', fontWeight: 600 }}>EXECUTING</div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Code Generation Agent</div>
            </div>
          </div>

          {/* Terminal-like output */}
          <div style={{
            marginTop: '16px',
            padding: '12px',
            background: 'var(--bg-dark)',
            borderRadius: '8px',
            fontFamily: "'DM Mono', monospace",
            fontSize: '12px',
            color: 'var(--accent-green)',
          }}>
            <div>→ Analyzing codebase context...</div>
            <div>→ Reading relevant files...</div>
            <div style={{ opacity: 0.6 }}>→ Generating implementation...</div>
          </div>
        </div>
      ) : (
        <div className="card" style={{
          borderLeft: '4px solid var(--border-light)',
          background: 'var(--bg-warm)',
          marginBottom: '24px',
          textAlign: 'center',
          padding: '32px',
        }}>
          <div style={{ fontSize: '24px', marginBottom: '8px' }}>✨</div>
          <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>Queue is idle</div>
          <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>No stories currently executing</div>
        </div>
      )}

      {/* Up Next */}
      <h3 style={{
        fontSize: '14px',
        color: 'var(--text-muted)',
        margin: '24px 0 12px',
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}>
        <span>Up Next ({stats.upNextTotal})</span>
        {pagination.totalPages > 1 && (
          <span style={{ fontSize: '12px', textTransform: 'none', letterSpacing: 'normal' }}>
            Page {pagination.page} of {pagination.totalPages}
          </span>
        )}
      </h3>

      {upNext.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '32px' }}>
          <div style={{ fontSize: '24px', marginBottom: '8px' }}>🎉</div>
          <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>Queue is empty</div>
          <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>All stories have been processed!</div>
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {upNext.map((story, index) => (
              <div key={story.id} className="story-card-mobile card" style={{ marginBottom: 0, padding: '16px' }}>
                {/* Mobile-first layout: stacks on mobile, row on desktop */}
                <div className="story-card-mobile-header">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', flex: 1 }}>
                    <span style={{
                      fontSize: '13px',
                      color: 'var(--text-muted)',
                      fontWeight: 600,
                      minWidth: '28px',
                    }}>
                      #{(page - 1) * pagination.limit + index + (executing ? 2 : 1)}
                    </span>
                    {getPriorityBadge(story.priorityLevel)}
                    <Link 
                      href={`/stories/${story.id}`}
                      style={{ 
                        fontWeight: 500, 
                        textDecoration: 'none', 
                        color: 'var(--text-primary)',
                        flex: 1,
                        minWidth: '150px',
                      }}
                    >
                      {story.title}
                    </Link>
                  </div>
                </div>
                
                <div className="story-card-mobile-meta">
                  <span style={{ 
                    fontSize: '12px', 
                    color: 'var(--text-muted)',
                    background: 'var(--bg-warm)',
                    padding: '2px 8px',
                    borderRadius: '4px',
                  }}>
                    {story.project.name}
                  </span>
                  {story.priorityScore && (
                    <span style={{ 
                      fontSize: '11px', 
                      color: 'var(--text-muted)', 
                      fontFamily: "'DM Mono', monospace",
                      background: 'var(--bg-warm)',
                      padding: '2px 8px',
                      borderRadius: '4px',
                    }}>
                      {story.priorityScore}pts
                    </span>
                  )}
                  {story.linearTaskId && (
                    <a
                      href={`https://linear.app/issue/${story.linearTaskId}`}
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
                        minHeight: '28px',
                      }}
                      title="View in Linear"
                    >
                      📋
                    </a>
                  )}
                  <button
                    onClick={() => handlePrioritize(story.id)}
                    className="btn btn-secondary touch-target"
                    style={{ fontSize: '11px', padding: '6px 12px', marginLeft: 'auto' }}
                  >
                    ↑ Prioritize
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Pagination controls */}
          {pagination.totalPages > 1 && (
            <div style={{
              display: 'flex',
              justifyContent: 'center',
              gap: '8px',
              marginTop: '24px',
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
  );
}
