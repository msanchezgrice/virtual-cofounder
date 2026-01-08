// components/priority/StoryCard.tsx
/**
 * Story Card Component
 * 
 * Displays a story with its priority, status, and action buttons.
 * Used in the priority queue and dashboard views.
 */

'use client';

import React, { useState } from 'react';
import { PriorityBadge, PrioritySelect } from './PriorityBadge';

type PriorityLevel = 'P0' | 'P1' | 'P2' | 'P3';

interface Story {
  id: string;
  title: string;
  projectName: string;
  status: string;
  priorityLevel: PriorityLevel | string;
  priorityScore: number;
  linearTaskId?: string | null;
  createdAt: string | Date;
}

interface StoryCardProps {
  story: Story;
  onApprove?: (storyId: string) => Promise<void>;
  onReject?: (storyId: string, reason?: string) => Promise<void>;
  onChangePriority?: (storyId: string, priority: PriorityLevel) => Promise<void>;
  showActions?: boolean;
}

export function StoryCard({
  story,
  onApprove,
  onReject,
  onChangePriority,
  showActions = true,
}: StoryCardProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [showPriorityEdit, setShowPriorityEdit] = useState(false);

  const handleApprove = async () => {
    if (!onApprove) return;
    setIsLoading(true);
    try {
      await onApprove(story.id);
    } finally {
      setIsLoading(false);
    }
  };

  const handleReject = async () => {
    if (!onReject) return;
    const reason = prompt('Reason for rejection (optional):');
    setIsLoading(true);
    try {
      await onReject(story.id, reason || undefined);
    } finally {
      setIsLoading(false);
    }
  };

  const handlePriorityChange = async (newPriority: PriorityLevel) => {
    if (!onChangePriority) return;
    setIsLoading(true);
    try {
      await onChangePriority(story.id, newPriority);
      setShowPriorityEdit(false);
    } finally {
      setIsLoading(false);
    }
  };

  const statusColors: Record<string, string> = {
    pending: 'bg-gray-100 text-gray-800',
    approved: 'bg-blue-100 text-blue-800',
    in_progress: 'bg-purple-100 text-purple-800',
    completed: 'bg-green-100 text-green-800',
    failed: 'bg-red-100 text-red-800',
    rejected: 'bg-red-100 text-red-800',
  };

  const createdDate = typeof story.createdAt === 'string' 
    ? new Date(story.createdAt) 
    : story.createdAt;

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm hover:shadow-md transition-shadow">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <h3 className="font-medium text-gray-900 truncate">{story.title}</h3>
          <p className="text-sm text-gray-500 mt-0.5">{story.projectName}</p>
        </div>
        
        <div className="flex items-center gap-2 flex-shrink-0">
          {showPriorityEdit ? (
            <div className="w-32">
              <PrioritySelect
                value={story.priorityLevel}
                onChange={handlePriorityChange}
                disabled={isLoading}
              />
            </div>
          ) : (
            <button
              onClick={() => setShowPriorityEdit(true)}
              className="hover:opacity-80 transition-opacity"
              disabled={!onChangePriority}
            >
              <PriorityBadge priority={story.priorityLevel} />
            </button>
          )}
        </div>
      </div>

      {/* Meta info */}
      <div className="flex items-center gap-3 mt-3 text-sm text-gray-500">
        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusColors[story.status] || 'bg-gray-100 text-gray-800'}`}>
          {story.status.replace('_', ' ')}
        </span>
        
        <span>Score: {story.priorityScore}</span>
        
        {story.linearTaskId && (
          <a
            href={`https://linear.app/issue/${story.linearTaskId}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 hover:underline"
          >
            Linear →
          </a>
        )}
        
        <span className="text-gray-400">
          {createdDate.toLocaleDateString()}
        </span>
      </div>

      {/* Actions */}
      {showActions && story.status === 'pending' && (
        <div className="flex items-center gap-2 mt-4 pt-3 border-t border-gray-100">
          <button
            onClick={handleApprove}
            disabled={isLoading || !onApprove}
            className="
              flex-1 px-3 py-2 text-sm font-medium text-white
              bg-green-600 hover:bg-green-700
              rounded-md transition-colors
              disabled:opacity-50 disabled:cursor-not-allowed
            "
          >
            {isLoading ? 'Processing...' : '✓ Approve'}
          </button>
          
          <button
            onClick={handleReject}
            disabled={isLoading || !onReject}
            className="
              flex-1 px-3 py-2 text-sm font-medium text-gray-700
              bg-gray-100 hover:bg-gray-200
              rounded-md transition-colors
              disabled:opacity-50 disabled:cursor-not-allowed
            "
          >
            ✗ Reject
          </button>
        </div>
      )}
    </div>
  );
}

export function StoryList({
  stories,
  onApprove,
  onReject,
  onChangePriority,
  emptyMessage = 'No stories found',
}: {
  stories: Story[];
  onApprove?: (storyId: string) => Promise<void>;
  onReject?: (storyId: string, reason?: string) => Promise<void>;
  onChangePriority?: (storyId: string, priority: PriorityLevel) => Promise<void>;
  emptyMessage?: string;
}) {
  if (stories.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">
        {emptyMessage}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {stories.map((story) => (
        <StoryCard
          key={story.id}
          story={story}
          onApprove={onApprove}
          onReject={onReject}
          onChangePriority={onChangePriority}
        />
      ))}
    </div>
  );
}

export default StoryCard;
