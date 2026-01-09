'use client';

import { useState, useEffect, useMemo } from 'react';

interface Story {
  id: string;
  title: string;
  rationale: string;
  projectId: string;
  status: string;
  priorityLevel: 'P0' | 'P1' | 'P2' | 'P3' | null;
  priorityScore: number | null;
  linearTaskId: string | null;
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
  error?: string;
}

export default function PrioritiesPage() {
  const [stories, setStories] = useState<Story[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProject, setSelectedProject] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [lastRanked, setLastRanked] = useState<Date | null>(null);
  const [reranking, setReranking] = useState(false);

  useEffect(() => {
    fetchData();
  }, [selectedProject]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [prioritiesRes, projectsRes] = await Promise.all([
        fetch(selectedProject ? `/api/priorities?projectId=${selectedProject}` : '/api/priorities'),
        fetch('/api/projects'),
      ]);
      
      const prioritiesData: PrioritiesResponse = await prioritiesRes.json();
      const projectsData = await projectsRes.json();
      
      setStories(prioritiesData.stories || []);
      setProjects(projectsData.projects || []);
      setLastRanked(new Date());
    } catch (error) {
      console.error('Failed to fetch priorities:', error);
      setStories([]);
    } finally {
      setLoading(false);
    }
  };

  const handleRerank = async () => {
    setReranking(true);
    // Simulate re-ranking (in a real app this would call a backend service)
    await new Promise(resolve => setTimeout(resolve, 1500));
    await fetchData();
    setReranking(false);
  };

  const getTimeAgo = (date: Date) => {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));

    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins} min ago`;
    return `${diffHours} hour${diffHours !== 1 ? 's' : ''} ago`;
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
        padding: '4px 10px',
        borderRadius: '12px',
        fontSize: '11px',
        fontWeight: 600,
      }}>
        {priorityLevel || 'P2'}
      </span>
    );
  };

  const getImpactDots = (score: number | null) => {
    const normalizedScore = Math.min(5, Math.max(1, Math.ceil((score || 50) / 20)));
    return (
      <span style={{ color: 'var(--accent-green)' }}>
        {'●'.repeat(normalizedScore)}
        <span style={{ color: 'var(--border-light)' }}>{'○'.repeat(5 - normalizedScore)}</span>
      </span>
    );
  };

  const getConfidenceDots = (score: number | null) => {
    // Confidence is derived from score variance - higher scores = more confident
    const confidence = Math.min(5, Math.max(1, Math.ceil((score || 50) / 25)));
    return (
      <span style={{ color: 'var(--accent-green)' }}>
        {'●'.repeat(confidence)}
        <span style={{ color: 'var(--border-light)' }}>{'○'.repeat(5 - confidence)}</span>
      </span>
    );
  };

  const filteredStories = selectedProject
    ? stories.filter(s => s.projectId === selectedProject)
    : stories;

  if (loading) {
    return (
      <div className="app-page">
        <div className="page-header">
          <h1 className="page-title">Priority Stack</h1>
        </div>
        <div style={{ display: 'flex', justifyContent: 'center', padding: '48px' }}>
          <div style={{ color: 'var(--text-muted)' }}>Loading priorities...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="app-page">
      {/* Header */}
      <div className="page-header">
        <h1 className="page-title">Priority Stack</h1>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <select
            value={selectedProject}
            onChange={(e) => setSelectedProject(e.target.value)}
            style={{
              padding: '8px 16px',
              border: '1px solid var(--border-light)',
              borderRadius: '8px',
              fontSize: '13px',
              background: 'white',
              cursor: 'pointer',
              minWidth: '160px',
            }}
          >
            <option value="">All Projects</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          <button
            onClick={handleRerank}
            disabled={reranking}
            className="btn btn-secondary"
            style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <span style={{ 
              display: 'inline-block',
              animation: reranking ? 'spin 1s linear infinite' : 'none',
            }}>🔄</span>
            Re-rank
          </button>
        </div>
      </div>

      {/* Overall Priority Stack Card */}
      <div className="card">
        <div className="card-header">
          <span className="card-title">🎯 Overall Priority Stack</span>
          <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
            Last ranked: {lastRanked ? getTimeAgo(lastRanked) : 'never'}
          </span>
        </div>

        {filteredStories.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '32px' }}>
            <div style={{ fontSize: '24px', marginBottom: '8px' }}>📭</div>
            <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>No stories to prioritize</div>
            <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
              Stories will appear here when they need prioritization
            </div>
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border-light)' }}>
                <th style={{ padding: '12px 8px', textAlign: 'left', fontSize: '12px', color: 'var(--text-muted)', fontWeight: 500 }}>#</th>
                <th style={{ padding: '12px 8px', textAlign: 'left', fontSize: '12px', color: 'var(--text-muted)', fontWeight: 500 }}>Story</th>
                <th style={{ padding: '12px 8px', textAlign: 'left', fontSize: '12px', color: 'var(--text-muted)', fontWeight: 500 }}>Project</th>
                <th style={{ padding: '12px 8px', textAlign: 'center', fontSize: '12px', color: 'var(--text-muted)', fontWeight: 500 }}>Priority</th>
                <th style={{ padding: '12px 8px', textAlign: 'center', fontSize: '12px', color: 'var(--text-muted)', fontWeight: 500 }}>Impact</th>
                <th style={{ padding: '12px 8px', textAlign: 'center', fontSize: '12px', color: 'var(--text-muted)', fontWeight: 500 }}>Confidence</th>
                <th style={{ padding: '12px 8px', textAlign: 'center', fontSize: '12px', color: 'var(--text-muted)', fontWeight: 500 }}>Score</th>
              </tr>
            </thead>
            <tbody>
              {filteredStories.map((story, index) => (
                <tr key={story.id} style={{ borderBottom: '1px solid var(--border-light)' }}>
                  <td style={{ 
                    padding: '16px 8px', 
                    fontWeight: 600, 
                    color: index === 0 ? 'var(--accent-purple)' : 'var(--text-muted)',
                    fontSize: '14px',
                  }}>
                    {index + 1}
                  </td>
                  <td style={{ padding: '16px 8px' }}>
                    <div style={{ fontWeight: 500 }}>{story.title}</div>
                    <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                      {story.rationale?.slice(0, 50) || 'No description'}
                      {story.rationale && story.rationale.length > 50 ? '...' : ''}
                    </div>
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
                  <td style={{ padding: '16px 8px', textAlign: 'center' }}>
                    {getConfidenceDots(story.priorityScore)}
                  </td>
                  <td style={{ 
                    padding: '16px 8px', 
                    textAlign: 'center', 
                    fontWeight: 700, 
                    color: index === 0 ? 'var(--accent-purple)' : 'var(--text-primary)',
                    fontSize: '16px',
                  }}>
                    {story.priorityScore || 50}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Scoring Formula */}
      <div className="card" style={{ marginTop: '24px' }}>
        <div className="card-header">
          <span className="card-title">⚡ Scoring Formula</span>
        </div>
        <div style={{ 
          display: 'grid', 
          gridTemplateColumns: 'repeat(5, 1fr)', 
          gap: '16px',
          fontSize: '13px',
        }}>
          <div style={{ textAlign: 'center', padding: '12px', background: 'var(--bg-warm)', borderRadius: '8px' }}>
            <div style={{ fontWeight: 600, color: 'var(--accent-purple)', marginBottom: '4px' }}>40%</div>
            <div style={{ color: 'var(--text-muted)' }}>Priority Signal</div>
          </div>
          <div style={{ textAlign: 'center', padding: '12px', background: 'var(--bg-warm)', borderRadius: '8px' }}>
            <div style={{ fontWeight: 600, color: 'var(--accent-purple)', marginBottom: '4px' }}>25%</div>
            <div style={{ color: 'var(--text-muted)' }}>Launch Impact</div>
          </div>
          <div style={{ textAlign: 'center', padding: '12px', background: 'var(--bg-warm)', borderRadius: '8px' }}>
            <div style={{ fontWeight: 600, color: 'var(--accent-purple)', marginBottom: '4px' }}>15%</div>
            <div style={{ color: 'var(--text-muted)' }}>Effort (inverse)</div>
          </div>
          <div style={{ textAlign: 'center', padding: '12px', background: 'var(--bg-warm)', borderRadius: '8px' }}>
            <div style={{ fontWeight: 600, color: 'var(--accent-purple)', marginBottom: '4px' }}>10%</div>
            <div style={{ color: 'var(--text-muted)' }}>Age Boost</div>
          </div>
          <div style={{ textAlign: 'center', padding: '12px', background: 'var(--bg-warm)', borderRadius: '8px' }}>
            <div style={{ fontWeight: 600, color: 'var(--accent-purple)', marginBottom: '4px' }}>10%</div>
            <div style={{ color: 'var(--text-muted)' }}>User Focus</div>
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
