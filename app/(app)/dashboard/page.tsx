'use client';

import { Suspense, lazy, useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useApiCache, invalidateCache } from '@/lib/hooks/useApiCache';

// Types
interface Story {
  id: string;
  title: string;
  priorityLevel: string | null;
  priorityScore: number;
  status: string;
  linearTaskId: string | null;
  project: {
    id: string;
    name: string;
  };
}

interface DashboardStats {
  workInProgress: number;
  readyForReview: number;
  shippedThisWeek: number;
  launchScore: number;
  totalStories: number;
  completedStories: number;
}

interface DashboardResponse {
  stats: DashboardStats;
  focusStories: Story[];
  activity: {
    newStoriesLast24h: number;
    projectCount: number;
  };
  error?: string;
}

// Skeleton components for loading states
function StatCardSkeleton() {
  return (
    <div
      className="animate-pulse"
      style={{
        background: 'white',
        padding: '20px',
        borderRadius: '12px',
        border: '1px solid var(--border-light, #E7E5E4)',
      }}
    >
      <div style={{ height: '14px', background: '#E5E7EB', borderRadius: '4px', width: '80px', marginBottom: '8px' }} />
      <div style={{ height: '32px', background: '#E5E7EB', borderRadius: '6px', width: '60px', marginBottom: '8px' }} />
      <div style={{ height: '12px', background: '#E5E7EB', borderRadius: '4px', width: '100px' }} />
    </div>
  );
}

function FocusSectionSkeleton() {
  return (
    <div
      style={{
        background: 'white',
        borderRadius: '12px',
        border: '1px solid var(--border-light, #E7E5E4)',
        padding: '20px',
      }}
    >
      <div style={{ height: '20px', background: '#E5E7EB', borderRadius: '4px', width: '150px', marginBottom: '16px' }} />
      {[1, 2, 3].map((i) => (
        <div
          key={i}
          className="animate-pulse"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            padding: '12px',
            background: 'var(--bg-warm, #F9F3ED)',
            borderRadius: '8px',
            marginBottom: '8px',
          }}
        >
          <div style={{ height: '24px', width: '40px', background: '#E5E7EB', borderRadius: '12px' }} />
          <div style={{ flex: 1, height: '16px', background: '#E5E7EB', borderRadius: '4px' }} />
          <div style={{ height: '14px', width: '80px', background: '#E5E7EB', borderRadius: '4px' }} />
        </div>
      ))}
    </div>
  );
}

// Stat Card Component
function StatCard({
  label,
  value,
  subtext,
  color,
  trend,
}: {
  label: string;
  value: number;
  subtext: string;
  color: string;
  trend?: 'up' | 'down' | 'neutral';
}) {
  const trendIcon = trend === 'up' ? '↑' : trend === 'down' ? '↓' : '→';
  const trendColor = trend === 'up' ? 'var(--accent-green, #10B981)' : 
                      trend === 'down' ? 'var(--accent-red, #EF4444)' : 
                      'var(--text-muted, #A8A29E)';

  return (
    <div
      style={{
        background: 'white',
        padding: '20px',
        borderRadius: '12px',
        border: '1px solid var(--border-light, #E7E5E4)',
      }}
    >
      <div style={{ fontSize: '13px', color: 'var(--text-muted, #A8A29E)', marginBottom: '4px' }}>
        {label}
      </div>
      <div style={{ fontSize: '32px', fontWeight: 700, color }}>
        {value}
      </div>
      <div style={{ fontSize: '12px', color: trendColor, marginTop: '4px' }}>
        {trendIcon} {subtext}
      </div>
    </div>
  );
}

// Focus Story Item
function FocusStoryItem({ story }: { story: Story }) {
  const priorityStyle = getPriorityStyle(story.priorityLevel);
  
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        padding: '12px',
        background: 'var(--bg-warm, #F9F3ED)',
        borderRadius: '8px',
        transition: 'background 0.2s',
      }}
    >
      <span
        style={{
          padding: '4px 10px',
          borderRadius: '12px',
          fontSize: '11px',
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: '0.02em',
          ...priorityStyle,
        }}
      >
        {story.priorityLevel || 'P2'}
      </span>
      <Link
        href={`/stories/${story.id}`}
        style={{ 
          flex: 1, 
          fontWeight: 500, 
          color: 'var(--text-primary, #1C1917)', 
          overflow: 'hidden', 
          textOverflow: 'ellipsis', 
          whiteSpace: 'nowrap',
          textDecoration: 'none',
        }}
      >
        {story.title}
      </Link>
      <span style={{ fontSize: '13px', color: 'var(--text-muted, #A8A29E)', flexShrink: 0 }}>
        {story.project.name}
      </span>
      {story.linearTaskId && (
        <a
          href={`https://linear.app/issue/${story.linearTaskId}`}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          style={{
            padding: '4px 8px',
            fontSize: '12px',
            background: 'rgba(0,0,0,0.05)',
            borderRadius: '4px',
            textDecoration: 'none',
            color: 'var(--text-muted)',
            flexShrink: 0,
          }}
          title="View in Linear"
        >
          📋
        </a>
      )}
    </div>
  );
}

function getPriorityStyle(priority: string | null) {
  switch (priority) {
    case 'P0':
      return { background: '#FEE2E2', color: '#991B1B' };
    case 'P1':
      return { background: '#FEF3C7', color: '#92400E' };
    case 'P2':
      return { background: '#DBEAFE', color: '#1E40AF' };
    case 'P3':
      return { background: '#F3F4F6', color: '#6B7280' };
    default:
      return { background: '#F3F4F6', color: '#6B7280' };
  }
}

// Get greeting based on time of day
function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

// Today's Focus Section (lazy loadable)
function TodaysFocus({ stories, loading }: { stories: Story[]; loading: boolean }) {
  if (loading) {
    return <FocusSectionSkeleton />;
  }

  return (
    <div
      style={{
        background: 'white',
        borderRadius: '12px',
        border: '1px solid var(--border-light, #E7E5E4)',
        padding: '20px',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <span style={{ fontSize: '16px', fontWeight: 600 }}>🔥 Today&apos;s Focus</span>
        <Link
          href="/priorities"
          style={{
            padding: '6px 12px',
            borderRadius: '6px',
            fontSize: '12px',
            fontWeight: 500,
            background: 'white',
            color: 'var(--text-primary, #1C1917)',
            border: '1px solid var(--border-light, #E7E5E4)',
            textDecoration: 'none',
          }}
        >
          View All
        </Link>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {stories.length === 0 ? (
          <div
            style={{
              padding: '24px',
              textAlign: 'center',
              color: 'var(--text-muted, #A8A29E)',
            }}
          >
            <p style={{ marginBottom: '8px' }}>No active stories yet!</p>
            <p style={{ fontSize: '14px' }}>Run the orchestrator to generate work items.</p>
          </div>
        ) : (
          stories.map((story) => (
            <FocusStoryItem key={story.id} story={story} />
          ))
        )}
      </div>
    </div>
  );
}

export default function DashboardPage() {
  // Use cached API hook - caches for 5 minutes, with background refresh
  const { data, loading, refresh } = useApiCache<DashboardResponse>(
    '/api/dashboard/stats',
    {
      ttl: 5 * 60 * 1000, // 5 minutes
      backgroundRefresh: true,
    }
  );

  // Extract data with defaults
  const stats = data?.stats ?? {
    workInProgress: 0,
    readyForReview: 0,
    shippedThisWeek: 0,
    launchScore: 0,
    totalStories: 0,
    completedStories: 0,
  };
  const focusStories = data?.focusStories ?? [];

  // Show skeleton loading on initial load
  if (loading && !data) {
    return (
      <div style={{ padding: '24px', background: 'var(--bg-cream, #FDF8F3)', minHeight: '100%' }}>
        {/* Header skeleton */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
          <div className="animate-pulse" style={{ height: '32px', background: '#E5E7EB', borderRadius: '8px', width: '300px' }} />
          <div className="animate-pulse" style={{ height: '40px', background: '#E5E7EB', borderRadius: '8px', width: '140px' }} />
        </div>
        
        {/* Stats skeleton */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '24px' }}>
          <StatCardSkeleton />
          <StatCardSkeleton />
          <StatCardSkeleton />
          <StatCardSkeleton />
        </div>
        
        {/* Focus section skeleton */}
        <FocusSectionSkeleton />
      </div>
    );
  }

  return (
    <div style={{ padding: '24px', background: 'var(--bg-cream, #FDF8F3)', minHeight: '100%' }}>
      {/* Page Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <h1 style={{ fontSize: '24px', fontWeight: 700, color: 'var(--text-primary, #1C1917)' }}>
          {getGreeting()}, Miguel 👋
        </h1>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={() => refresh()}
            style={{
              padding: '10px 16px',
              borderRadius: '8px',
              fontSize: '14px',
              fontWeight: 500,
              background: 'white',
              color: 'var(--text-primary, #1C1917)',
              border: '1px solid var(--border-light, #E7E5E4)',
              cursor: 'pointer',
            }}
          >
            ↻ Refresh
          </button>
          <Link
            href="/priorities"
            style={{
              padding: '10px 20px',
              borderRadius: '8px',
              fontSize: '14px',
              fontWeight: 600,
              background: 'var(--accent-purple, #8B5CF6)',
              color: 'white',
              textDecoration: 'none',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            ➕ New Priority
          </Link>
        </div>
      </div>

      {/* Error banner if any */}
      {data?.error && (
        <div
          style={{
            background: '#FEF3C7',
            border: '1px solid #FCD34D',
            borderRadius: '8px',
            padding: '12px 16px',
            marginBottom: '16px',
            color: '#92400E',
            fontSize: '14px',
          }}
        >
          ⚠️ {data.error} - Showing cached data
        </div>
      )}

      {/* Stats Row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '24px' }}>
        <StatCard
          label="Work In Progress"
          value={stats.workInProgress}
          subtext="Active stories"
          color="var(--text-primary, #1C1917)"
          trend="up"
        />
        <StatCard
          label="Ready for Review"
          value={stats.readyForReview}
          subtext="Needs attention"
          color="var(--accent-amber, #F59E0B)"
          trend="neutral"
        />
        <StatCard
          label="Shipped This Week"
          value={stats.shippedThisWeek}
          subtext="Completed"
          color="var(--accent-green, #10B981)"
          trend={stats.shippedThisWeek > 0 ? 'up' : 'neutral'}
        />
        <StatCard
          label="Launch Score"
          value={stats.launchScore}
          subtext={`${100 - stats.launchScore} to launch`}
          color="var(--accent-purple, #8B5CF6)"
          trend={stats.launchScore > 60 ? 'up' : 'neutral'}
        />
      </div>

      {/* Today's Focus */}
      <TodaysFocus stories={focusStories} loading={false} />
    </div>
  );
}
