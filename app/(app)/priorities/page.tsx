/**
 * Priorities Page - Stack-Ranked Story Lists
 * 
 * Shows all stories ranked by priority with:
 * - Global view across all projects
 * - Per-project views
 * - Priority factors breakdown
 * - Quick approval actions
 */

'use client';

import { useEffect, useState } from 'react';
import { PriorityBadge } from '@/components/priority';

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
    <div className="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-sm transition-shadow">
      <div className="flex items-start gap-4">
        {/* Rank */}
        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center font-bold text-gray-600">
          {rank}
        </div>

        {/* Main content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <PriorityBadge priority={story.priorityLevel} size="sm" />
            <span className="text-xs text-gray-500">{story.projectName}</span>
          </div>
          <h3 className="font-medium text-gray-900 truncate">{story.title}</h3>
          <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
            <span>Score: {story.compositeScore}</span>
            <span>Status: {story.status}</span>
            {story.linearTaskId && (
              <a 
                href={`https://linear.app/issue/${story.linearTaskId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 hover:underline"
              >
                View in Linear →
              </a>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setExpanded(!expanded)}
            className="px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-100 rounded"
          >
            {expanded ? 'Hide' : 'Details'}
          </button>
          {story.status === 'pending' && (
            <button
              onClick={handleApprove}
              disabled={approving}
              className="px-3 py-1.5 text-xs bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
            >
              {approving ? 'Approving...' : 'Approve'}
            </button>
          )}
        </div>
      </div>

      {/* Expanded details */}
      {expanded && (
        <div className="mt-4 pt-4 border-t border-gray-100">
          <h4 className="text-xs font-medium text-gray-500 mb-2">Priority Factors</h4>
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

export default function PrioritiesPage() {
  const [stories, setStories] = useState<RankedStory[]>([]);
  const [signals, setSignals] = useState<PrioritySignal[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProject, setSelectedProject] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch data
  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      try {
        // Fetch projects first
        const projectRes = await fetch('/api/projects');
        let projectMap: Record<string, string> = {};
        if (projectRes.ok) {
          const data = await projectRes.json();
          const projectList = Array.isArray(data) ? data : (data.projects || []);
          setProjects(projectList);
          projectMap = projectList.reduce((acc: Record<string, string>, p: Project) => {
            acc[p.id] = p.name;
            return acc;
          }, {});
        }

        // Fetch priorities
        const priorityRes = await fetch('/api/priorities');
        if (priorityRes.ok) {
          const data = await priorityRes.json();
          // Map API response to our RankedStory format
          const mappedStories: RankedStory[] = (data.stories || []).map((s: {
            id: string;
            title: string;
            projectId: string;
            project?: { id: string; name: string };
            status: string;
            priorityLevel: string | null;
            priorityScore: number | null;
            linearTaskId: string | null;
            createdAt: string;
          }) => ({
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
          setStories(mappedStories);
          setSignals(data.signals || []);
        }
      } catch (err) {
        setError('Failed to load priorities');
        console.error(err);
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, []);

  // Handle story approval
  const handleApprove = async (storyId: string) => {
    try {
      const res = await fetch(`/api/stories/${storyId}/approve`, { method: 'POST' });
      if (res.ok) {
        // Update local state
        setStories(stories.map(s => 
          s.id === storyId ? { ...s, status: 'approved' } : s
        ));
      }
    } catch (err) {
      console.error('Failed to approve story:', err);
    }
  };

  // Filter stories by project
  const filteredStories = selectedProject
    ? stories.filter(s => s.projectId === selectedProject)
    : stories;

  // Group by project for per-project view
  const storiesByProject = stories.reduce((acc, story) => {
    if (!acc[story.projectId]) {
      acc[story.projectId] = { name: story.projectName, stories: [] };
    }
    acc[story.projectId].stories.push(story);
    return acc;
  }, {} as Record<string, { name: string; stories: RankedStory[] }>);

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
          <h1 className="text-2xl font-bold text-gray-900">Priorities</h1>
          <p className="text-gray-600 mt-1">
            Stack-ranked stories by priority score
          </p>
        </div>
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

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6 text-red-700">
          {error}
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
