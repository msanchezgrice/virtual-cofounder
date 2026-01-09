'use client';

import { useState, useEffect } from 'react';

interface Story {
  id: string;
  title: string;
  rationale: string;
  priority: 'high' | 'medium' | 'low';
  priorityLevel: 'P0' | 'P1' | 'P2' | 'P3' | null;
  status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'rejected' | 'approved';
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

export default function ExecutionQueuePage() {
  const [stories, setStories] = useState<Story[]>([]);
  const [loading, setLoading] = useState(true);
  const [workerActive, setWorkerActive] = useState(true);

  useEffect(() => {
    fetchQueue();
    // Poll every 10 seconds for updates
    const interval = setInterval(fetchQueue, 10000);
    return () => clearInterval(interval);
  }, []);

  const fetchQueue = async () => {
    try {
      const res = await fetch('/api/stories?limit=100');
      const data = await res.json();
      // Filter for pending, approved, and in_progress stories
      const queueStories = (data.stories || [])
        .filter((s: Story) => s.status === 'pending' || s.status === 'in_progress' || s.status === 'approved')
        .sort((a: Story, b: Story) => {
          // In progress first, then by priority score, then by created date (FIFO)
          if (a.status === 'in_progress' && b.status !== 'in_progress') return -1;
          if (b.status === 'in_progress' && a.status !== 'in_progress') return 1;
          return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
        });
      setStories(queueStories);
    } catch (error) {
      console.error('Failed to fetch execution queue:', error);
      setStories([]);
    } finally {
      setLoading(false);
    }
  };

  const getTimeAgo = (dateStr: string) => {
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
  };

  const getPriorityBadge = (priorityLevel: string | null) => {
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
  };

  const handlePrioritize = async (storyId: string) => {
    // Move story to top of queue by boosting priority
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
      fetchQueue();
    } catch (error) {
      console.error('Failed to prioritize story:', error);
    }
  };

  const currentlyExecuting = stories.find(s => s.status === 'in_progress');
  const upNext = stories.filter(s => s.status !== 'in_progress');

  if (loading) {
    return (
      <div className="app-page">
        <div className="page-header">
          <h1 className="page-title">Execution Queue</h1>
        </div>
        <div style={{ display: 'flex', justifyContent: 'center', padding: '48px' }}>
          <div style={{ color: 'var(--text-muted)' }}>Loading queue...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="app-page">
      {/* Header */}
      <div className="page-header">
        <h1 className="page-title">Execution Queue</h1>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
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
          }}>
            <span style={{
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              background: workerActive ? '#10B981' : '#EF4444',
            }} />
            {workerActive ? 'WORKER ACTIVE' : 'WORKER PAUSED'}
          </span>
          <button
            onClick={() => setWorkerActive(!workerActive)}
            className="btn btn-secondary"
            style={{ fontSize: '12px', padding: '6px 12px' }}
          >
            {workerActive ? '⏸️ Pause' : '▶️ Resume'}
          </button>
        </div>
      </div>

      {/* Currently Executing */}
      {currentlyExecuting ? (
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
                {getPriorityBadge(currentlyExecuting.priorityLevel)}
                <span style={{ fontWeight: 600 }}>{currentlyExecuting.title}</span>
              </div>
              <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
                {currentlyExecuting.project.name} • Started {getTimeAgo(currentlyExecuting.executedAt || currentlyExecuting.createdAt)}
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
      }}>
        Up Next ({upNext.length})
      </h3>

      {upNext.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '32px' }}>
          <div style={{ fontSize: '24px', marginBottom: '8px' }}>🎉</div>
          <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>Queue is empty</div>
          <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>All stories have been processed!</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {upNext.map((story, index) => (
            <div key={story.id} className="card" style={{ marginBottom: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                <div style={{
                  fontSize: '14px',
                  color: 'var(--text-muted)',
                  fontWeight: 600,
                  width: '24px',
                }}>
                  #{index + 2}
                </div>
                {getPriorityBadge(story.priorityLevel)}
                <span style={{ flex: 1, fontWeight: 500 }}>{story.title}</span>
                <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
                  {story.project.name}
                </span>
                <button
                  onClick={() => handlePrioritize(story.id)}
                  className="btn btn-secondary"
                  style={{ fontSize: '11px', padding: '4px 8px' }}
                >
                  ↑ Prioritize
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
