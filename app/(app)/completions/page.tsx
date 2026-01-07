'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

interface Completion {
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

export default function CompletionsPage() {
  const [completions, setCompletions] = useState<Completion[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'pending' | 'in_progress' | 'completed'>('all');

  useEffect(() => {
    fetchCompletions();
  }, []);

  const fetchCompletions = async () => {
    try {
      const res = await fetch('/api/completions');
      const data = await res.json();
      setCompletions(data.completions || []);
    } catch (error) {
      console.error('Failed to fetch completions:', error);
      setCompletions([]);
    } finally {
      setLoading(false);
    }
  };

  const filteredCompletions = (completions || []).filter(c => {
    if (filter === 'all') return true;
    return c.status === filter;
  });

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
      case 'completed': return 'bg-green-100 text-green-800';
      case 'in_progress': return 'bg-blue-100 text-blue-800';
      case 'pending': return 'bg-gray-100 text-gray-800';
      case 'failed': return 'bg-red-100 text-red-800';
      case 'rejected': return 'bg-orange-100 text-orange-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-6 py-8">
      <h1 className="text-3xl font-bold mb-6">Completions</h1>

      {/* Filter Buttons */}
      <div className="flex gap-2 mb-6">
        <button
          onClick={() => setFilter('all')}
          className={`px-4 py-2 rounded-lg font-medium transition-colors ${
            filter === 'all'
              ? 'bg-brand-blue text-white'
              : 'bg-white text-gray-700 border border-gray-300 hover:border-brand-blue'
          }`}
        >
          All ({(completions || []).length})
        </button>
        <button
          onClick={() => setFilter('pending')}
          className={`px-4 py-2 rounded-lg font-medium transition-colors ${
            filter === 'pending'
              ? 'bg-brand-blue text-white'
              : 'bg-white text-gray-700 border border-gray-300 hover:border-brand-blue'
          }`}
        >
          Pending ({(completions || []).filter(c => c.status === 'pending').length})
        </button>
        <button
          onClick={() => setFilter('in_progress')}
          className={`px-4 py-2 rounded-lg font-medium transition-colors ${
            filter === 'in_progress'
              ? 'bg-brand-blue text-white'
              : 'bg-white text-gray-700 border border-gray-300 hover:border-brand-blue'
          }`}
        >
          In Progress ({(completions || []).filter(c => c.status === 'in_progress').length})
        </button>
        <button
          onClick={() => setFilter('completed')}
          className={`px-4 py-2 rounded-lg font-medium transition-colors ${
            filter === 'completed'
              ? 'bg-brand-blue text-white'
              : 'bg-white text-gray-700 border border-gray-300 hover:border-brand-blue'
          }`}
        >
          Completed ({(completions || []).filter(c => c.status === 'completed').length})
        </button>
      </div>

      {/* Completions List */}
      {loading ? (
        <div className="text-center py-12">
          <div className="text-gray-600">Loading completions...</div>
        </div>
      ) : filteredCompletions.length === 0 ? (
        <div className="bg-white rounded-lg p-8 shadow text-center">
          <div className="text-gray-600">No completions found</div>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredCompletions.map((completion) => (
            <div key={completion.id} className="bg-white rounded-lg p-6 shadow hover:shadow-md transition-shadow">
              {/* Header */}
              <div className="flex items-start justify-between mb-3">
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-gray-900 mb-1">
                    {completion.title}
                  </h3>
                  <p className="text-sm text-gray-600 mb-2">
                    {completion.project.name}
                  </p>
                </div>
                <div className="flex gap-2">
                  <span className={`px-3 py-1 rounded-full text-xs font-semibold ${getPriorityColor(completion.priority)}`}>
                    {completion.priority}
                  </span>
                  <span className={`px-3 py-1 rounded-full text-xs font-semibold ${getStatusColor(completion.status)}`}>
                    {completion.status}
                  </span>
                </div>
              </div>

              {/* Rationale */}
              <p className="text-sm text-gray-700 mb-4 line-clamp-2">
                {completion.rationale}
              </p>

              {/* Links and Actions */}
              <div className="flex items-center gap-4 text-sm">
                <span className="text-gray-500">
                  {formatDate(completion.createdAt)}
                </span>

                {completion.linearTaskId && (
                  <a
                    href={`https://linear.app/issue/${completion.linearTaskId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 text-brand-blue hover:text-blue-700 font-medium"
                  >
                    📋 View in Linear
                  </a>
                )}

                {completion.prUrl && (
                  <a
                    href={completion.prUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 text-brand-blue hover:text-blue-700 font-medium"
                  >
                    🔀 View PR
                  </a>
                )}

                {completion.commitSha && (
                  <span className="text-gray-500 font-mono text-xs">
                    {completion.commitSha.substring(0, 7)}
                  </span>
                )}

                {completion.executedAt && (
                  <span className="text-gray-500">
                    Executed {formatDate(completion.executedAt)}
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
