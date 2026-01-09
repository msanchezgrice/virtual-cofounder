'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { useApiCache } from '@/lib/hooks/useApiCache';

interface Story {
  id: string;
  title: string;
  rationale: string;
  priority: 'high' | 'medium' | 'low';
  priorityLevel: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'rejected';
  prUrl: string | null;
  linearTaskId: string | null;
  linearIssueUrl: string | null;
  linearIdentifier: string | null;
  commitSha: string | null;
  createdAt: string;
  executedAt: string | null;
  project: {
    id: string;
    name: string;
  };
}

interface StoriesResponse {
  stories: Story[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasMore: boolean;
  };
  error?: string;
}

// Story card skeleton
function StoryCardSkeleton() {
  return (
    <div className="bg-white rounded-lg p-6 shadow animate-pulse">
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1">
          <div className="h-5 bg-gray-200 rounded w-3/4 mb-2" />
          <div className="h-4 bg-gray-200 rounded w-1/4" />
        </div>
        <div className="flex gap-2">
          <div className="h-6 w-16 bg-gray-200 rounded-full" />
          <div className="h-6 w-20 bg-gray-200 rounded-full" />
        </div>
      </div>
      <div className="h-4 bg-gray-200 rounded w-full mb-2" />
      <div className="h-4 bg-gray-200 rounded w-2/3" />
    </div>
  );
}

// Pagination component
function Pagination({
  page,
  totalPages,
  total,
  onPageChange,
}: {
  page: number;
  totalPages: number;
  total: number;
  onPageChange: (page: number) => void;
}) {
  if (totalPages <= 1) return null;

  const pages: (number | string)[] = [];
  if (totalPages <= 7) {
    for (let i = 1; i <= totalPages; i++) pages.push(i);
  } else {
    if (page <= 3) {
      pages.push(1, 2, 3, 4, '...', totalPages);
    } else if (page >= totalPages - 2) {
      pages.push(1, '...', totalPages - 3, totalPages - 2, totalPages - 1, totalPages);
    } else {
      pages.push(1, '...', page - 1, page, page + 1, '...', totalPages);
    }
  }

  return (
    <div className="flex items-center justify-between mt-6 pt-4 border-t">
      <span className="text-sm text-gray-500">
        Showing {(page - 1) * 20 + 1}-{Math.min(page * 20, total)} of {total} stories
      </span>
      <div className="flex items-center gap-1">
        <button
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
          className="px-3 py-1 text-sm rounded border border-gray-200 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
        >
          ←
        </button>
        {pages.map((p, i) => (
          typeof p === 'number' ? (
            <button
              key={i}
              onClick={() => onPageChange(p)}
              className={`px-3 py-1 text-sm rounded border ${
                p === page
                  ? 'bg-purple-600 text-white border-purple-600'
                  : 'border-gray-200 hover:bg-gray-50'
              }`}
            >
              {p}
            </button>
          ) : (
            <span key={i} className="px-2 text-gray-400">...</span>
          )
        ))}
        <button
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages}
          className="px-3 py-1 text-sm rounded border border-gray-200 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
        >
          →
        </button>
      </div>
    </div>
  );
}

export default function StoriesPage() {
  const [filter, setFilter] = useState<'all' | 'pending' | 'in_progress' | 'completed'>('all');
  const [page, setPage] = useState(1);

  // Build API URL with filters and pagination
  const apiUrl = useMemo(() => {
    const params = new URLSearchParams();
    params.set('page', page.toString());
    params.set('limit', '20');
    if (filter !== 'all') params.set('status', filter);
    return `/api/stories?${params.toString()}`;
  }, [page, filter]);

  // Fetch stories with responsive caching
  const { data, loading, refresh } = useApiCache<StoriesResponse>(apiUrl, {
    ttl: 30 * 1000, // 30 second cache (reduced from 2 minutes)
    backgroundRefresh: true,
    refreshOnFocus: true, // Refresh when tab becomes visible
    pollingInterval: 15000, // Poll every 15 seconds
  });

  const stories = data?.stories ?? [];
  const pagination = data?.pagination ?? { page: 1, totalPages: 0, total: 0, limit: 20, hasMore: false };

  // Get filter counts from first page load
  const filterCounts = useMemo(() => {
    // When on first page with no filter, we can compute counts
    // Otherwise just show current counts
    return {
      all: pagination.total,
      pending: stories.filter(s => s.status === 'pending').length,
      in_progress: stories.filter(s => s.status === 'in_progress').length,
      completed: stories.filter(s => s.status === 'completed').length,
    };
  }, [stories, pagination.total]);

  const handleFilterChange = (newFilter: typeof filter) => {
    setFilter(newFilter);
    setPage(1); // Reset to first page
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high':
      case 'P0':
        return 'bg-red-100 text-red-800';
      case 'medium':
      case 'P1':
        return 'bg-yellow-100 text-yellow-800';
      case 'low':
      case 'P2':
      case 'P3':
        return 'bg-blue-100 text-blue-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'bg-green-100 text-green-800';
      case 'in_progress':
        return 'bg-blue-100 text-blue-800';
      case 'pending':
        return 'bg-gray-100 text-gray-800';
      case 'failed':
        return 'bg-red-100 text-red-800';
      case 'rejected':
        return 'bg-orange-100 text-orange-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-6 py-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold">Stories</h1>
        <button
          onClick={() => refresh()}
          className="px-4 py-2 text-sm rounded-lg border border-gray-300 hover:bg-gray-50"
        >
          ↻ Refresh
        </button>
      </div>

      {/* Filter Buttons */}
      <div className="flex gap-2 mb-6">
        <button
          onClick={() => handleFilterChange('all')}
          className={`px-4 py-2 rounded-lg font-medium transition-colors ${
            filter === 'all'
              ? 'bg-purple-600 text-white'
              : 'bg-white text-gray-700 border border-gray-300 hover:border-purple-600'
          }`}
        >
          All ({pagination.total || '...'})
        </button>
        <button
          onClick={() => handleFilterChange('pending')}
          className={`px-4 py-2 rounded-lg font-medium transition-colors ${
            filter === 'pending'
              ? 'bg-purple-600 text-white'
              : 'bg-white text-gray-700 border border-gray-300 hover:border-purple-600'
          }`}
        >
          Pending
        </button>
        <button
          onClick={() => handleFilterChange('in_progress')}
          className={`px-4 py-2 rounded-lg font-medium transition-colors ${
            filter === 'in_progress'
              ? 'bg-purple-600 text-white'
              : 'bg-white text-gray-700 border border-gray-300 hover:border-purple-600'
          }`}
        >
          In Progress
        </button>
        <button
          onClick={() => handleFilterChange('completed')}
          className={`px-4 py-2 rounded-lg font-medium transition-colors ${
            filter === 'completed'
              ? 'bg-purple-600 text-white'
              : 'bg-white text-gray-700 border border-gray-300 hover:border-purple-600'
          }`}
        >
          Completed
        </button>
      </div>

      {data?.error && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6 text-yellow-700">
          ⚠️ {data.error}
        </div>
      )}

      {/* Stories List */}
      {loading && !data ? (
        <div className="space-y-4">
          {[1, 2, 3, 4, 5].map((i) => (
            <StoryCardSkeleton key={i} />
          ))}
        </div>
      ) : stories.length === 0 ? (
        <div className="bg-white rounded-lg p-8 shadow text-center">
          <div className="text-gray-600">No stories found</div>
        </div>
      ) : (
        <>
          <div className="space-y-4">
            {stories.map((story) => (
              <Link 
                key={story.id} 
                href={`/stories/${story.id}`}
                className="block bg-white rounded-lg p-6 shadow hover:shadow-md transition-shadow cursor-pointer"
              >
                {/* Header */}
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold text-gray-900 mb-1">
                      {story.title}
                    </h3>
                    <p className="text-sm text-gray-600 mb-2">
                      {story.project.name}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <span className={`px-3 py-1 rounded-full text-xs font-semibold ${getPriorityColor(story.priorityLevel || story.priority)}`}>
                      {story.priorityLevel || story.priority}
                    </span>
                    <span className={`px-3 py-1 rounded-full text-xs font-semibold ${getStatusColor(story.status)}`}>
                      {story.status}
                    </span>
                  </div>
                </div>

                {/* Rationale */}
                <p className="text-sm text-gray-700 mb-4 line-clamp-2">
                  {story.rationale}
                </p>

                {/* Links and Actions */}
                <div className="flex items-center gap-4 text-sm">
                  <span className="text-gray-500">
                    {formatDate(story.createdAt)}
                  </span>

                  {(story.linearIssueUrl || story.linearTaskId) && (
                    <a
                      href={story.linearIssueUrl || `https://linear.app/media-maker/issue/${story.linearIdentifier || story.linearTaskId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 text-purple-600 hover:text-purple-700 font-medium"
                      onClick={(e) => e.stopPropagation()}
                    >
                      📋 {story.linearIdentifier || 'Linear'}
                    </a>
                  )}

                  {story.prUrl && (
                    <a
                      href={story.prUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 text-purple-600 hover:text-purple-700 font-medium"
                      onClick={(e) => e.stopPropagation()}
                    >
                      🔀 View PR
                    </a>
                  )}

                  {story.commitSha && (
                    <span className="text-gray-500 font-mono text-xs">
                      {story.commitSha.substring(0, 7)}
                    </span>
                  )}

                  {story.executedAt && (
                    <span className="text-gray-500">
                      Executed {formatDate(story.executedAt)}
                    </span>
                  )}
                </div>
              </Link>
            ))}
          </div>
          
          <Pagination
            page={pagination.page}
            totalPages={pagination.totalPages}
            total={pagination.total}
            onPageChange={setPage}
          />
        </>
      )}
    </div>
  );
}
