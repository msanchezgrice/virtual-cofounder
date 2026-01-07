'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

interface Story {
  id: string;
  title: string;
  rationale: string;
  priority: 'high' | 'medium' | 'low';
  status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'rejected';
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

  useEffect(() => {
    fetchQueue();
  }, []);

  const fetchQueue = async () => {
    try {
      const res = await fetch('/api/stories');
      const data = await res.json();
      // Filter for pending and in_progress stories, sorted by created date (FIFO)
      const queueStories = (data.stories || [])
        .filter((s: Story) => s.status === 'pending' || s.status === 'in_progress')
        .sort((a: Story, b: Story) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
      setStories(queueStories);
    } catch (error) {
      console.error('Failed to fetch execution queue:', error);
      setStories([]);
    } finally {
      setLoading(false);
    }
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
      case 'high': return 'bg-red-100 text-red-800';
      case 'medium': return 'bg-yellow-100 text-yellow-800';
      case 'low': return 'bg-blue-100 text-blue-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'in_progress': return 'bg-blue-100 text-blue-800';
      case 'pending': return 'bg-gray-100 text-gray-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getQueuePosition = (index: number) => {
    return index + 1;
  };

  return (
    <div className="max-w-7xl mx-auto px-6 py-8">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-semibold">
          Execution Queue ({stories.length} {stories.length === 1 ? 'story' : 'stories'})
        </h2>
        <div className="text-sm text-gray-600">
          Showing pending and in-progress stories in FIFO order
        </div>
      </div>

      {loading ? (
        <div className="text-center py-12">
          <div className="text-gray-600">Loading execution queue...</div>
        </div>
      ) : stories.length === 0 ? (
        <div className="bg-white rounded-lg p-8 shadow text-center">
          <div className="text-gray-600">No stories in execution queue</div>
          <p className="text-sm text-gray-500 mt-2">All stories have been processed! 🎉</p>
        </div>
      ) : (
        <div className="space-y-4">
          {stories.map((story, index) => (
            <div key={story.id} className="bg-white rounded-lg p-6 shadow hover:shadow-md transition-shadow">
              {/* Header */}
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-start gap-4 flex-1">
                  {/* Queue Position */}
                  <div className="flex-shrink-0 w-10 h-10 rounded-full bg-brand-blue text-white flex items-center justify-center font-bold">
                    {getQueuePosition(index)}
                  </div>

                  <div className="flex-1">
                    <h3 className="text-lg font-semibold text-gray-900 mb-1">
                      {story.title}
                    </h3>
                    <p className="text-sm text-gray-600 mb-2">
                      {story.project.name}
                    </p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <span className={`px-3 py-1 rounded-full text-xs font-semibold ${getPriorityColor(story.priority)}`}>
                    {story.priority}
                  </span>
                  <span className={`px-3 py-1 rounded-full text-xs font-semibold ${getStatusColor(story.status)}`}>
                    {story.status === 'in_progress' ? '⏳ executing' : '⏸️ pending'}
                  </span>
                </div>
              </div>

              {/* Rationale */}
              <p className="text-sm text-gray-700 mb-4 pl-14 line-clamp-2">
                {story.rationale}
              </p>

              {/* Metadata */}
              <div className="flex items-center gap-4 text-sm pl-14">
                <span className="text-gray-500">
                  Queued {formatDate(story.createdAt)}
                </span>

                {story.linearTaskId && (
                  <a
                    href={`https://linear.app/issue/${story.linearTaskId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 text-brand-blue hover:text-blue-700 font-medium"
                  >
                    📋 View in Linear
                  </a>
                )}

                {story.status === 'in_progress' && (
                  <span className="text-blue-600 font-medium animate-pulse">
                    🔄 Currently executing...
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
