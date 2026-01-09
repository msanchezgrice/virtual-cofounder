'use client';

import { useState, useMemo } from 'react';
import { useApiCache } from '@/lib/hooks/useApiCache';

interface ActivityItem {
  id: string;
  type: 'pr_merged' | 'scan' | 'story' | 'message' | 'orchestrator' | 'completion';
  title: string;
  description: string;
  project?: string;
  projectId?: string;
  timestamp: string;
  metadata?: Record<string, unknown>;
}

interface Project {
  id: string;
  name: string;
}

interface ActivityResponse {
  activities: ActivityItem[];
  projects: Project[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasMore: boolean;
  };
  error?: string;
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

// Activity item skeleton
function ActivitySkeleton() {
  return (
    <div className="flex items-center gap-4 px-5 py-4 animate-pulse">
      <div className="w-10 h-10 rounded-xl bg-gray-200" />
      <div className="flex-1 min-w-0">
        <div className="h-4 bg-gray-200 rounded w-32 mb-2" />
        <div className="h-3 bg-gray-200 rounded w-48" />
      </div>
      <div className="h-3 bg-gray-200 rounded w-20" />
    </div>
  );
}

// Activity item component
function ActivityItemRow({ activity }: { activity: ActivityItem }) {
  const style = getActivityStyle(activity.type);
  
  return (
    <div className="flex items-center gap-4 px-5 py-4 hover:bg-gray-50 transition-colors">
      <div className={`w-10 h-10 rounded-xl ${style.bg} flex items-center justify-center text-lg`}>
        {style.icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-medium text-gray-900">{activity.title}</div>
        <div className="text-sm text-gray-500 truncate">{activity.description}</div>
      </div>
      {activity.project && (
        <span className="text-xs text-purple-600 bg-purple-50 px-2 py-1 rounded-full whitespace-nowrap">
          {activity.project}
        </span>
      )}
      <span className="text-xs text-gray-400 whitespace-nowrap">
        {formatRelativeTime(activity.timestamp)}
      </span>
    </div>
  );
}

// Pagination component
function Pagination({
  page,
  totalPages,
  onPageChange,
}: {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}) {
  if (totalPages <= 1) return null;

  return (
    <div className="flex items-center justify-center gap-2 mt-6 pt-4 border-t border-gray-100">
      <button
        onClick={() => onPageChange(page - 1)}
        disabled={page <= 1}
        className="px-3 py-1 text-sm rounded border border-gray-200 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
      >
        ← Previous
      </button>
      <span className="text-sm text-gray-500">
        Page {page} of {totalPages}
      </span>
      <button
        onClick={() => onPageChange(page + 1)}
        disabled={page >= totalPages}
        className="px-3 py-1 text-sm rounded border border-gray-200 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
      >
        Next →
      </button>
    </div>
  );
}

export default function HistoryPage() {
  const [activityFilter, setActivityFilter] = useState('all');
  const [projectFilter, setProjectFilter] = useState('all');
  const [page, setPage] = useState(1);

  // Build API URL with filters
  const apiUrl = useMemo(() => {
    const params = new URLSearchParams();
    params.set('page', page.toString());
    params.set('limit', '30');
    if (activityFilter !== 'all') params.set('type', activityFilter);
    if (projectFilter !== 'all') params.set('projectId', projectFilter);
    return `/api/activity?${params.toString()}`;
  }, [page, activityFilter, projectFilter]);

  // Use single cached API call with responsive caching
  const { data, loading, refresh } = useApiCache<ActivityResponse>(apiUrl, {
    ttl: 30 * 1000, // 30 second cache (reduced from 2 minutes)
    backgroundRefresh: true,
    refreshOnFocus: true, // Refresh when tab becomes visible
    pollingInterval: 15000, // Poll every 15 seconds
  });

  const activities = data?.activities ?? [];
  const projects = data?.projects ?? [];
  const pagination = data?.pagination ?? { page: 1, totalPages: 0, total: 0, limit: 30, hasMore: false };

  // Reset page when filters change
  const handleFilterChange = (type: 'activity' | 'project', value: string) => {
    if (type === 'activity') {
      setActivityFilter(value);
    } else {
      setProjectFilter(value);
    }
    setPage(1); // Reset to first page
  };

  if (loading && !data) {
    return (
      <div className="app-page">
        <div className="page-header">
          <div>
            <h1 className="page-title">📜 Activity History</h1>
            <p className="page-subtitle">Track all system activity and events</p>
          </div>
          <div className="flex gap-2">
            <div className="h-9 w-32 bg-gray-200 rounded animate-pulse" />
            <div className="h-9 w-32 bg-gray-200 rounded animate-pulse" />
          </div>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="divide-y divide-gray-100">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <ActivitySkeleton key={i} />
            ))}
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
          <h1 className="page-title">📜 Activity History</h1>
          <p className="page-subtitle">
            Track all system activity and events
            {pagination.total > 0 && (
              <span className="text-gray-400 ml-2">({pagination.total} items)</span>
            )}
          </p>
        </div>
        <div className="page-header-actions">
          <button
            onClick={() => refresh()}
            className="btn btn-secondary touch-target"
            style={{ padding: '8px 12px' }}
          >
            ↻
          </button>
          <select
            value={activityFilter}
            onChange={(e) => handleFilterChange('activity', e.target.value)}
            className="btn btn-secondary touch-target"
            style={{ minWidth: '100px', fontSize: '13px' }}
          >
            <option value="all">All Activity</option>
            <option value="scan">Scans</option>
            <option value="orchestrator">Orchestrator</option>
            <option value="pr_merged">PRs</option>
            <option value="completion">Completions</option>
          </select>
          <select
            value={projectFilter}
            onChange={(e) => handleFilterChange('project', e.target.value)}
            className="btn btn-secondary touch-target"
            style={{ minWidth: '100px', fontSize: '13px' }}
          >
            <option value="all">All Projects</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {data?.error && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6 text-yellow-700">
          ⚠️ {data.error}
        </div>
      )}

      {/* Activity List */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        {activities.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            <p>No activity found</p>
            <p className="text-sm text-gray-400 mt-1">
              Activity from scans, orchestrator runs, and completions will appear here
            </p>
          </div>
        ) : (
          <>
            <div className="divide-y divide-gray-100">
              {activities.map((activity) => (
                <ActivityItemRow key={activity.id} activity={activity} />
              ))}
            </div>
            <Pagination
              page={pagination.page}
              totalPages={pagination.totalPages}
              onPageChange={setPage}
            />
          </>
        )}
      </div>
    </div>
  );
}
