/**
 * Priorities Page - Stack-Ranked Story Lists
 * 
 * Shows all stories ranked by priority with:
 * - Global view across all projects
 * - Per-project views
 * - Priority factors breakdown
 * - Quick approval actions
 * 
 * Performance optimized with caching and pagination
 */

'use client';

import { useState, useMemo, useCallback } from 'react';
import { PriorityBadge } from '@/components/priority';
import { useApiCache, invalidateCache } from '@/lib/hooks/useApiCache';

interface RankedStory {
  id: string;
  title: string;
  projectId: string;
  projectName: string;
  status: string;
  priorityLevel: 'P0' | 'P1' | 'P2' | 'P3';
  priorityScore: number;
  compositeScore: number;
  factors: {
    prioritySignal: number;
    launchImpact: number;
    effort: number;
    age: number;
    userFocus: number;
  };
  linearTaskId: string | null;
  createdAt: string;
}

interface PrioritySignal {
  id: string;
  source: string;
  priority: string;
  rawText: string;
  createdAt: string;
  projectId: string | null;
}

interface Project {
  id: string;
  name: string;
}

interface PrioritiesResponse {
  signals: PrioritySignal[];
  stories: Array<{
    id: string;
    title: string;
    projectId: string;
    project?: { id: string; name: string };
    status: string;
    priorityLevel: string | null;
    priorityScore: number | null;
    linearTaskId: string | null;
    createdAt: string;
  }>;
  summary: {
    totalSignals: number;
    totalStories: number;
    p0Count: number;
    p1Count: number;
    p2Count: number;
    p3Count: number;
  };
  error?: string;
}

interface ProjectsResponse {
  projects: Project[];
  error?: string;
}

function FactorsBreakdown({ factors }: { factors: RankedStory['factors'] }) {
  const items = [
    { label: 'Priority Signal', value: factors.prioritySignal, weight: '40%' },
    { label: 'Launch Impact', value: factors.launchImpact, weight: '25%' },
    { label: 'Effort (inverse)', value: factors.effort, weight: '15%' },
    { label: 'Age Boost', value: factors.age, weight: '10%' },
    { label: 'User Focus', value: factors.userFocus, weight: '10%' },
  ];

  return (
    <div className="grid grid-cols-5 gap-2 text-xs">
      {items.map((item) => (
        <div key={item.label} className="text-center">
          <div className="font-medium text-gray-600">{item.value}</div>
          <div className="text-gray-400">{item.label}</div>
        </div>
      ))}
    </div>
  );
}

function StoryRow({ 
  story, 
  rank,
  onApprove 
}: { 
  story: RankedStory; 
  rank: number;
  onApprove: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [approving, setApproving] = useState(false);

  const handleApprove = async () => {
    setApproving(true);
    try {
      await onApprove(story.id);
    } finally {
      setApproving(false);
    }
  };

  return (
    <div className="card" style={{ marginBottom: '12px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '16px' }}>
        {/* Rank */}
        <div style={{ 
          flexShrink: 0, 
          width: '40px', 
          height: '40px', 
          borderRadius: '50%', 
          background: rank <= 3 ? 'linear-gradient(135deg, var(--accent-purple), var(--accent-violet))' : 'var(--bg-warm)',
          color: rank <= 3 ? 'white' : 'var(--text-secondary)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontWeight: 700,
          fontSize: '16px'
        }}>
          {rank}
        </div>

        {/* Main content */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
            <PriorityBadge priority={story.priorityLevel} size="sm" />
            <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{story.projectName}</span>
          </div>
          <h3 style={{ fontWeight: 500, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {story.title}
          </h3>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginTop: '8px', fontSize: '12px', color: 'var(--text-muted)' }}>
            <span>Score: <strong>{story.compositeScore}</strong></span>
            <span className={`status-badge status-${story.status}`}>{story.status}</span>
            {story.linearTaskId && (
              <a 
                href={`https://linear.app/issue/${story.linearTaskId}`}
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: 'var(--accent-purple)', textDecoration: 'none' }}
              >
                View in Linear →
              </a>
            )}
          </div>
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button
            onClick={() => setExpanded(!expanded)}
            className="btn btn-secondary btn-sm"
          >
            {expanded ? 'Hide' : 'Details'}
          </button>
          {story.status === 'pending' && (
            <button
              onClick={handleApprove}
              disabled={approving}
              className="btn btn-primary btn-sm"
              style={{ background: 'var(--accent-green)' }}
            >
              {approving ? '⏳' : '✓ Approve'}
            </button>
          )}
        </div>
      </div>

      {/* Expanded details */}
      {expanded && (
        <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px solid var(--border-light)' }}>
          <h4 style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text-muted)', marginBottom: '8px' }}>Priority Factors</h4>
          <FactorsBreakdown factors={story.factors} />
        </div>
      )}
    </div>
  );
}

function SignalCard({ signal }: { signal: PrioritySignal }) {
  return (
    <div className="p-3 bg-gray-50 rounded-lg">
      <div className="flex items-center gap-2 mb-1">
        <PriorityBadge priority={signal.priority as 'P0' | 'P1' | 'P2' | 'P3'} size="sm" />
        <span className="text-xs text-gray-500 capitalize">{signal.source}</span>
      </div>
      <p className="text-sm text-gray-700 truncate">{signal.rawText}</p>
      <p className="text-xs text-gray-400 mt-1">
        {new Date(signal.createdAt).toLocaleString()}
      </p>
    </div>
  );
}

// Skeleton components
function StoryRowSkeleton() {
  return (
    <div className="card animate-pulse" style={{ marginBottom: '12px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '16px' }}>
        <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: '#E5E7EB' }} />
        <div style={{ flex: 1 }}>
          <div style={{ height: '16px', background: '#E5E7EB', borderRadius: '4px', width: '60%', marginBottom: '8px' }} />
          <div style={{ height: '12px', background: '#E5E7EB', borderRadius: '4px', width: '40%' }} />
        </div>
      </div>
    </div>
  );
}

export default function PrioritiesPage() {
  const [selectedProject, setSelectedProject] = useState<string>('');

  // Fetch projects with caching
  const { data: projectsData } = useApiCache<ProjectsResponse>(
    '/api/projects',
    { ttl: 5 * 60 * 1000 }
  );
  const projects = projectsData?.projects ?? [];
  const projectMap = useMemo(() => 
    projects.reduce((acc, p) => ({ ...acc, [p.id]: p.name }), {} as Record<string, string>),
    [projects]
  );

  // Fetch priorities with caching
  const prioritiesUrl = selectedProject 
    ? `/api/priorities?projectId=${selectedProject}`
    : '/api/priorities';
  
  const { data: prioritiesData, loading, refresh } = useApiCache<PrioritiesResponse>(
    prioritiesUrl,
    { ttl: 2 * 60 * 1000, backgroundRefresh: true }
  );

  // Map API response to RankedStory format
  const stories: RankedStory[] = useMemo(() => {
    if (!prioritiesData?.stories) return [];
    return prioritiesData.stories.map((s) => ({
      id: s.id,
      title: s.title,
      projectId: s.projectId,
      projectName: s.project?.name || projectMap[s.projectId] || 'Unknown',
      status: s.status,
      priorityLevel: (s.priorityLevel || 'P2') as 'P0' | 'P1' | 'P2' | 'P3',
      priorityScore: s.priorityScore || 50,
      compositeScore: s.priorityScore || 50,
      factors: {
        prioritySignal: 50,
        launchImpact: 50,
        effort: 50,
        age: 50,
        userFocus: 50,
      },
      linearTaskId: s.linearTaskId,
      createdAt: s.createdAt,
    }));
  }, [prioritiesData?.stories, projectMap]);

  const signals = prioritiesData?.signals ?? [];

  // Filter stories by project
  const filteredStories = selectedProject
    ? stories.filter(s => s.projectId === selectedProject)
    : stories;

  // Group by project for per-project view
  const storiesByProject = useMemo(() => 
    stories.reduce((acc, story) => {
      if (!acc[story.projectId]) {
        acc[story.projectId] = { name: story.projectName, stories: [] };
      }
      acc[story.projectId].stories.push(story);
      return acc;
    }, {} as Record<string, { name: string; stories: RankedStory[] }>),
    [stories]
  );

  // Handle story approval
  const handleApprove = useCallback(async (storyId: string) => {
    try {
      const res = await fetch(`/api/stories/${storyId}/approve`, { method: 'POST' });
      if (res.ok) {
        // Invalidate cache and refresh
        invalidateCache('/api/priorities');
        invalidateCache('/api/dashboard');
        refresh();
      }
    } catch (err) {
      console.error('Failed to approve story:', err);
    }
  }, [refresh]);

  if (loading && !prioritiesData) {
    return (
      <div className="app-page">
        <div className="page-header">
          <div>
            <h1 className="page-title">🎯 Priorities</h1>
            <p className="page-subtitle">Stack-ranked stories by priority score</p>
          </div>
          <div className="h-9 w-48 bg-gray-200 rounded animate-pulse" />
        </div>
        <div className="grid grid-cols-3 gap-6">
          <div className="col-span-2 space-y-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <StoryRowSkeleton key={i} />
            ))}
          </div>
          <div>
            <div className="h-32 bg-gray-200 rounded-lg animate-pulse" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="app-page">
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">🎯 Priorities</h1>
          <p className="page-subtitle">
            Stack-ranked stories by priority score
          </p>
        </div>
        <div className="flex gap-2">
          <button 
            onClick={() => refresh()}
            className="btn btn-secondary"
          >
            ↻
          </button>
          <select
            value={selectedProject}
            onChange={(e) => setSelectedProject(e.target.value)}
            className="btn btn-secondary"
            style={{ minWidth: '200px' }}
          >
            <option value="">All Projects</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>
      </div>

      {prioritiesData?.error && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6 text-yellow-700">
          ⚠️ {prioritiesData.error}
        </div>
      )}

      <div className="grid grid-cols-3 gap-6">
        {/* Main: Ranked Stories */}
        <div className="col-span-2 space-y-3">
          <h2 className="text-sm font-medium text-gray-500 mb-3">
            {filteredStories.length} Stories Ranked
          </h2>
          {filteredStories.length === 0 ? (
            <div className="text-center py-12 bg-gray-50 rounded-lg">
              <p className="text-gray-500">No stories to prioritize</p>
            </div>
          ) : (
            filteredStories.map((story, index) => (
              <StoryRow
                key={story.id}
                story={story}
                rank={index + 1}
                onApprove={handleApprove}
              />
            ))
          )}
        </div>

        {/* Sidebar: Recent Signals */}
        <div>
          <h2 className="text-sm font-medium text-gray-500 mb-3">
            Recent Priority Signals
          </h2>
          {signals.length === 0 ? (
            <div className="text-center py-8 bg-gray-50 rounded-lg">
              <p className="text-sm text-gray-500">No recent signals</p>
              <p className="text-xs text-gray-400 mt-1">
                Signals come from Slack, Linear comments, and scans
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {signals.slice(0, 10).map((signal) => (
                <SignalCard key={signal.id} signal={signal} />
              ))}
            </div>
          )}

          {/* Per-project breakdown */}
          <div className="mt-8">
            <h2 className="text-sm font-medium text-gray-500 mb-3">
              By Project
            </h2>
            <div className="space-y-2">
              {Object.entries(storiesByProject).slice(0, 8).map(([projectId, data]) => (
                <button
                  key={projectId}
                  onClick={() => setSelectedProject(projectId)}
                  className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                    selectedProject === projectId
                      ? 'bg-blue-50 text-blue-700'
                      : 'hover:bg-gray-50 text-gray-700'
                  }`}
                >
                  <span className="font-medium">{data.name}</span>
                  <span className="text-gray-400 ml-2">({data.stories.length})</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
