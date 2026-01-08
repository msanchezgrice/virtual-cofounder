'use client';

import { useEffect, useState } from 'react';

interface ActivityItem {
  id: string;
  type: 'pr_merged' | 'scan' | 'story' | 'message' | 'orchestrator' | 'completion';
  title: string;
  description: string;
  project?: string;
  timestamp: string;
}

// Get icon and background for activity type
function getActivityStyle(type: ActivityItem['type']): { icon: string; bg: string } {
  switch (type) {
    case 'pr_merged':
    case 'completion':
      return { icon: '✓', bg: 'bg-green-100' };
    case 'scan':
      return { icon: '🔍', bg: 'bg-blue-100' };
    case 'story':
      return { icon: '📝', bg: 'bg-purple-100' };
    case 'message':
      return { icon: '💬', bg: 'bg-amber-100' };
    case 'orchestrator':
      return { icon: '🤖', bg: 'bg-purple-100' };
    default:
      return { icon: '📋', bg: 'bg-gray-100' };
  }
}

// Format relative time
function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 60) {
    return diffMins <= 1 ? 'Just now' : `${diffMins} minutes ago`;
  }
  if (diffHours < 24) {
    return diffHours === 1 ? '1 hour ago' : `${diffHours} hours ago`;
  }
  if (diffDays === 1) {
    return 'Yesterday';
  }
  if (diffDays < 7) {
    return `${diffDays} days ago`;
  }
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
  });
}

export default function HistoryPage() {
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [activityFilter, setActivityFilter] = useState('all');
  const [projectFilter, setProjectFilter] = useState('all');

  useEffect(() => {
    async function fetchData() {
      try {
        // Fetch projects
        const projectsRes = await fetch('/api/projects');
        const projectsData = await projectsRes.json();
        const projectList = projectsData.projects || [];
        setProjects(projectList);

        // Fetch activity from multiple sources
        const activityItems: ActivityItem[] = [];

        // Fetch orchestrator runs
        try {
          const runsRes = await fetch('/api/orchestrator/runs');
          if (runsRes.ok) {
            const runsData = await runsRes.json();
            const runs = runsData.runs || runsData || [];
            if (Array.isArray(runs)) {
              runs.forEach((run: { id: string; createdAt: string; storiesCount?: number; findingsCount?: number }) => {
                activityItems.push({
                  id: `run-${run.id}`,
                  type: 'orchestrator',
                  title: 'Orchestrator Run',
                  description: `${run.storiesCount || 0} stories created, ${run.findingsCount || 0} findings`,
                  timestamp: run.createdAt,
                });
              });
            }
          }
        } catch (e) {
          console.error('Failed to fetch orchestrator runs:', e);
        }

        // Fetch scans
        try {
          const scansRes = await fetch('/api/scans');
          if (scansRes.ok) {
            const scansData = await scansRes.json();
            const scans = scansData.scans || [];
            scans.slice(0, 20).forEach((scan: { id: string; scanType: string; scannedAt: string; project?: { name: string } }) => {
              activityItems.push({
                id: `scan-${scan.id}`,
                type: 'scan',
                title: `${scan.scanType.charAt(0).toUpperCase() + scan.scanType.slice(1)} Scan`,
                description: scan.project?.name || 'Unknown project',
                project: scan.project?.name,
                timestamp: scan.scannedAt,
              });
            });
          }
        } catch (e) {
          console.error('Failed to fetch scans:', e);
        }

        // Fetch completions
        try {
          const completionsRes = await fetch('/api/completions');
          if (completionsRes.ok) {
            const completionsData = await completionsRes.json();
            const completions = completionsData.completions || [];
            completions.slice(0, 20).forEach((completion: { id: string; prUrl?: string; createdAt: string; story?: { title: string; project?: { name: string } } }) => {
              activityItems.push({
                id: `completion-${completion.id}`,
                type: 'pr_merged',
                title: completion.prUrl ? 'PR Created' : 'Work Completed',
                description: completion.story?.title || 'Unknown story',
                project: completion.story?.project?.name,
                timestamp: completion.createdAt,
              });
            });
          }
        } catch (e) {
          console.error('Failed to fetch completions:', e);
        }

        // Sort by timestamp (newest first)
        activityItems.sort((a, b) => 
          new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
        );

        setActivities(activityItems);
      } catch (err) {
        console.error('Failed to load history:', err);
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, []);

  // Filter activities
  const filteredActivities = activities.filter((activity) => {
    if (activityFilter !== 'all' && activity.type !== activityFilter) {
      return false;
    }
    if (projectFilter !== 'all' && activity.project !== projectFilter) {
      return false;
    }
    return true;
  });

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
        <h1 className="text-2xl font-bold text-gray-900">Activity History</h1>
        <div className="flex gap-2">
          <select
            value={activityFilter}
            onChange={(e) => setActivityFilter(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white"
          >
            <option value="all">All Activity</option>
            <option value="scan">Scans</option>
            <option value="orchestrator">Orchestrator</option>
            <option value="pr_merged">PRs</option>
            <option value="message">Messages</option>
          </select>
          <select
            value={projectFilter}
            onChange={(e) => setProjectFilter(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white"
          >
            <option value="all">All Projects</option>
            {projects.map((p) => (
              <option key={p.id} value={p.name}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Activity List */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        {filteredActivities.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            <p>No activity found</p>
            <p className="text-sm text-gray-400 mt-1">
              Activity from scans, orchestrator runs, and completions will appear here
            </p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {filteredActivities.map((activity) => {
              const style = getActivityStyle(activity.type);
              return (
                <div
                  key={activity.id}
                  className="flex items-center gap-4 px-5 py-4 hover:bg-gray-50 transition-colors"
                >
                  <div
                    className={`w-10 h-10 rounded-xl ${style.bg} flex items-center justify-center text-lg`}
                  >
                    {style.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-gray-900">{activity.title}</div>
                    <div className="text-sm text-gray-500 truncate">{activity.description}</div>
                  </div>
                  <span className="text-xs text-gray-400 whitespace-nowrap">
                    {formatRelativeTime(activity.timestamp)}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
