'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useApiCache, invalidateCache } from '@/lib/hooks/useApiCache';

interface Story {
  id: string;
  title: string;
  rationale: string;
  priority: 'high' | 'medium' | 'low';
  priorityLevel: string | null;
  priorityScore: number | null;
  status: string;
  prUrl: string | null;
  linearTaskId: string | null;
  linearIssueUrl: string | null;
  linearIdentifier: string | null;
  commitSha: string | null;
  createdAt: string;
  executedAt: string | null;
  userApproved: boolean | null;
  userNotes: string | null;
  policy: string;
  project: {
    id: string;
    name: string;
    repo: string | null;
    linearTeamId: string | null;
  };
}

interface StoryResponse {
  story: Story | null;
  error?: string;
}

function LoadingSkeleton() {
  return (
    <div className="app-page animate-pulse">
      <div className="h-8 bg-gray-200 rounded w-1/3 mb-2" />
      <div className="h-4 bg-gray-200 rounded w-1/4 mb-8" />
      <div className="card">
        <div className="h-6 bg-gray-200 rounded w-3/4 mb-4" />
        <div className="h-4 bg-gray-200 rounded w-full mb-2" />
        <div className="h-4 bg-gray-200 rounded w-2/3 mb-4" />
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, { bg: string; color: string; label: string }> = {
    pending: { bg: '#F3F4F6', color: '#6B7280', label: 'Pending' },
    approved: { bg: '#D1FAE5', color: '#065F46', label: 'Approved' },
    in_progress: { bg: '#DBEAFE', color: '#1E40AF', label: 'In Progress' },
    completed: { bg: '#D1FAE5', color: '#065F46', label: 'Completed' },
    failed: { bg: '#FEE2E2', color: '#991B1B', label: 'Failed' },
    rejected: { bg: '#FEF3C7', color: '#92400E', label: 'Rejected' },
  };
  const style = styles[status] || styles.pending;
  
  return (
    <span
      style={{
        background: style.bg,
        color: style.color,
        padding: '6px 12px',
        borderRadius: '16px',
        fontSize: '12px',
        fontWeight: 600,
        textTransform: 'uppercase',
      }}
    >
      {style.label}
    </span>
  );
}

function PriorityBadge({ priority }: { priority: string | null }) {
  const styles: Record<string, { bg: string; color: string }> = {
    P0: { bg: '#FEE2E2', color: '#991B1B' },
    P1: { bg: '#FEF3C7', color: '#92400E' },
    P2: { bg: '#DBEAFE', color: '#1E40AF' },
    P3: { bg: '#F3F4F6', color: '#6B7280' },
  };
  const style = styles[priority || 'P2'] || styles.P2;
  
  return (
    <span
      style={{
        background: style.bg,
        color: style.color,
        padding: '4px 10px',
        borderRadius: '12px',
        fontSize: '11px',
        fontWeight: 600,
      }}
    >
      {priority || 'P2'}
    </span>
  );
}

export default function StoryDetailPage() {
  const params = useParams();
  const router = useRouter();
  const storyId = params.id as string;
  
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  
  const { data, loading, error, refresh } = useApiCache<StoryResponse>(
    `/api/stories/${storyId}`,
    { 
      ttl: 30 * 1000, // 30 second cache
      backgroundRefresh: true,
      refreshOnFocus: true, // Refresh when tab becomes visible
      pollingInterval: 10000, // Poll every 10 seconds for status updates
    }
  );
  
  const story = data?.story;
  
  const handleApprove = async () => {
    setActionLoading('approve');
    try {
      const res = await fetch(`/api/stories/${storyId}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      if (res.ok) {
        invalidateCache(`/api/stories/${storyId}`);
        refresh();
      }
    } catch (err) {
      console.error('Failed to approve:', err);
    } finally {
      setActionLoading(null);
    }
  };
  
  const handleReject = async () => {
    setActionLoading('reject');
    try {
      const res = await fetch(`/api/stories/${storyId}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      if (res.ok) {
        invalidateCache(`/api/stories/${storyId}`);
        refresh();
      }
    } catch (err) {
      console.error('Failed to reject:', err);
    } finally {
      setActionLoading(null);
    }
  };
  
  const handleSetPriority = async (level: string) => {
    setActionLoading('priority');
    try {
      const res = await fetch('/api/priorities', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storyId,
          priorityLevel: level,
          source: 'dashboard',
        }),
      });
      if (res.ok) {
        invalidateCache(`/api/stories/${storyId}`);
        refresh();
      }
    } catch (err) {
      console.error('Failed to set priority:', err);
    } finally {
      setActionLoading(null);
    }
  };
  
  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };
  
  // Get Linear URL - prefer stored URL, fallback to building from identifier
  const getLinearUrl = (story: Story) => {
    // Use stored URL if available (preferred)
    if (story.linearIssueUrl) return story.linearIssueUrl;
    // No Linear integration
    if (!story.linearTaskId) return null;
    // Fallback: construct URL if we have identifier
    if (story.linearIdentifier) {
      return `https://linear.app/media-maker/issue/${story.linearIdentifier}`;
    }
    // Last resort: use UUID (will redirect in Linear)
    return `https://linear.app/issue/${story.linearTaskId}`;
  };
  
  // Default GitHub owner for repos stored without owner prefix
  const DEFAULT_GITHUB_OWNER = 'msanchezgrice';
  
  // Build GitHub repo URL
  const getGitHubUrl = (repo: string | null) => {
    if (!repo) return null;
    // If it's already a URL, return it
    if (repo.startsWith('http')) return repo;
    // If it's already in owner/repo format, use it
    if (repo.includes('/')) {
      return `https://github.com/${repo}`;
    }
    // Otherwise prepend the default owner
    return `https://github.com/${DEFAULT_GITHUB_OWNER}/${repo}`;
  };
  
  if (loading && !data) {
    return <LoadingSkeleton />;
  }
  
  if (error || !story) {
    return (
      <div className="app-page">
        <div className="card" style={{ textAlign: 'center', padding: '48px' }}>
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>😕</div>
          <h2 style={{ marginBottom: '8px' }}>Story Not Found</h2>
          <p style={{ color: 'var(--text-muted)', marginBottom: '24px' }}>
            {data?.error || 'The story you\'re looking for doesn\'t exist or has been deleted.'}
          </p>
          <Link href="/stories" className="btn btn-primary">
            ← Back to Stories
          </Link>
        </div>
      </div>
    );
  }
  
  const linearUrl = getLinearUrl(story);
  const githubUrl = getGitHubUrl(story.project.repo);
  
  return (
    <div className="app-page">
      {/* Breadcrumb */}
      <div style={{ marginBottom: '16px' }}>
        <Link 
          href="/stories" 
          style={{ color: 'var(--text-muted)', textDecoration: 'none', fontSize: '14px' }}
        >
          ← Back to Stories
        </Link>
      </div>
      
      {/* Header */}
      <div className="page-header" style={{ marginBottom: '24px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
            <PriorityBadge priority={story.priorityLevel} />
            <StatusBadge status={story.status} />
          </div>
          <h1 className="page-title" style={{ marginBottom: '4px' }}>{story.title}</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '14px' }}>
            {story.project.name} • Created {formatDate(story.createdAt)}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={() => refresh()} className="btn btn-secondary">
            ↻ Refresh
          </button>
        </div>
      </div>
      
      {/* Main Content Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '24px' }}>
        {/* Left Column - Details */}
        <div>
          {/* Rationale Card */}
          <div className="card" style={{ marginBottom: '16px' }}>
            <div className="card-header">
              <span className="card-title">📝 Rationale</span>
            </div>
            <p style={{ lineHeight: 1.6, color: 'var(--text-primary)' }}>
              {story.rationale}
            </p>
          </div>
          
          {/* Links Card */}
          <div className="card" style={{ marginBottom: '16px' }}>
            <div className="card-header">
              <span className="card-title">🔗 Links</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {(story.linearTaskId || story.linearIssueUrl) && (
                <a
                  href={linearUrl || '#'}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '12px',
                    background: 'var(--bg-warm)',
                    borderRadius: '8px',
                    textDecoration: 'none',
                    color: 'var(--text-primary)',
                  }}
                >
                  <span style={{ fontSize: '20px' }}>📋</span>
                  <div>
                    <div style={{ fontWeight: 500 }}>View in Linear</div>
                    <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                      {story.linearIdentifier || story.linearTaskId?.substring(0, 8)}
                    </div>
                  </div>
                  <span style={{ marginLeft: 'auto', color: 'var(--text-muted)' }}>↗</span>
                </a>
              )}
              
              {story.prUrl && (
                <a
                  href={story.prUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '12px',
                    background: 'var(--bg-warm)',
                    borderRadius: '8px',
                    textDecoration: 'none',
                    color: 'var(--text-primary)',
                  }}
                >
                  <span style={{ fontSize: '20px' }}>🔀</span>
                  <div>
                    <div style={{ fontWeight: 500 }}>View Pull Request</div>
                    <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                      {story.prUrl.split('/').slice(-1)[0]}
                    </div>
                  </div>
                  <span style={{ marginLeft: 'auto', color: 'var(--text-muted)' }}>↗</span>
                </a>
              )}
              
              {githubUrl && (
                <a
                  href={githubUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '12px',
                    background: 'var(--bg-warm)',
                    borderRadius: '8px',
                    textDecoration: 'none',
                    color: 'var(--text-primary)',
                  }}
                >
                  <span style={{ fontSize: '20px' }}>💻</span>
                  <div>
                    <div style={{ fontWeight: 500 }}>View Repository</div>
                    <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                      {story.project.repo}
                    </div>
                  </div>
                  <span style={{ marginLeft: 'auto', color: 'var(--text-muted)' }}>↗</span>
                </a>
              )}
              
              {!story.linearTaskId && !story.prUrl && !githubUrl && (
                <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)' }}>
                  No external links available
                </div>
              )}
            </div>
          </div>
          
          {/* Execution Details */}
          {(story.commitSha || story.executedAt) && (
            <div className="card">
              <div className="card-header">
                <span className="card-title">⚙️ Execution Details</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {story.executedAt && (
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Executed At</span>
                    <span>{formatDate(story.executedAt)}</span>
                  </div>
                )}
                {story.commitSha && (
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Commit SHA</span>
                    <code style={{ 
                      fontFamily: "'DM Mono', monospace", 
                      background: 'var(--bg-warm)',
                      padding: '2px 8px',
                      borderRadius: '4px',
                      fontSize: '13px',
                    }}>
                      {story.commitSha.substring(0, 7)}
                    </code>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
        
        {/* Right Column - Actions */}
        <div>
          {/* Actions Card */}
          <div className="card" style={{ marginBottom: '16px' }}>
            <div className="card-header">
              <span className="card-title">⚡ Actions</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {story.status === 'pending' && (
                <>
                  <button
                    onClick={handleApprove}
                    disabled={actionLoading === 'approve'}
                    className="btn btn-primary"
                    style={{ width: '100%', justifyContent: 'center' }}
                  >
                    {actionLoading === 'approve' ? '⏳ Approving...' : '✅ Approve & Execute'}
                  </button>
                  <button
                    onClick={handleReject}
                    disabled={actionLoading === 'reject'}
                    className="btn btn-secondary"
                    style={{ width: '100%', justifyContent: 'center' }}
                  >
                    {actionLoading === 'reject' ? '⏳ Rejecting...' : '❌ Reject'}
                  </button>
                </>
              )}
              
              {story.status === 'approved' && (
                <div style={{ 
                  padding: '16px', 
                  background: '#D1FAE5', 
                  borderRadius: '8px',
                  textAlign: 'center',
                  color: '#065F46',
                }}>
                  ✅ Story approved - waiting for execution
                </div>
              )}
              
              {story.status === 'in_progress' && (
                <div style={{ 
                  padding: '16px', 
                  background: '#DBEAFE', 
                  borderRadius: '8px',
                  textAlign: 'center',
                  color: '#1E40AF',
                }}>
                  ⚙️ Story is currently being executed
                </div>
              )}
              
              {story.status === 'completed' && (
                <div style={{ 
                  padding: '16px', 
                  background: '#D1FAE5', 
                  borderRadius: '8px',
                  textAlign: 'center',
                  color: '#065F46',
                }}>
                  🎉 Story completed successfully
                </div>
              )}
              
              {story.status === 'failed' && (
                <div style={{ 
                  padding: '16px', 
                  background: '#FEE2E2', 
                  borderRadius: '8px',
                  textAlign: 'center',
                  color: '#991B1B',
                }}>
                  ❌ Execution failed
                </div>
              )}
            </div>
          </div>
          
          {/* Priority Card */}
          <div className="card" style={{ marginBottom: '16px' }}>
            <div className="card-header">
              <span className="card-title">🎯 Set Priority</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px' }}>
              {['P0', 'P1', 'P2', 'P3'].map((level) => (
                <button
                  key={level}
                  onClick={() => handleSetPriority(level)}
                  disabled={actionLoading === 'priority'}
                  className={`btn ${story.priorityLevel === level ? 'btn-primary' : 'btn-secondary'}`}
                  style={{ 
                    fontSize: '12px',
                    opacity: story.priorityLevel === level ? 1 : 0.8,
                  }}
                >
                  {level}
                </button>
              ))}
            </div>
            <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '12px' }}>
              Current score: <strong>{story.priorityScore || 50}</strong>
            </p>
          </div>
          
          {/* Metadata Card */}
          <div className="card">
            <div className="card-header">
              <span className="card-title">📊 Metadata</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '13px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-muted)' }}>ID</span>
                <code style={{ fontFamily: "'DM Mono', monospace", fontSize: '11px' }}>
                  {story.id.substring(0, 8)}...
                </code>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-muted)' }}>Policy</span>
                <span>{story.policy}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-muted)' }}>Project</span>
                <Link href={`/projects/${story.project.id}`} style={{ color: 'var(--accent-purple)' }}>
                  {story.project.name}
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
