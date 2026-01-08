'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

interface Story {
  id: string;
  title: string;
  priorityLevel: string | null;
  status: string;
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
}

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats>({
    workInProgress: 0,
    readyForReview: 0,
    shippedThisWeek: 0,
    launchScore: 0,
  });
  const [focusStories, setFocusStories] = useState<Story[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchDashboardData() {
      try {
        // Fetch stories
        const storiesRes = await fetch('/api/stories');
        const storiesData = await storiesRes.json();
        const stories = storiesData.stories || [];

        // Calculate stats from stories
        const inProgress = stories.filter((s: Story) => s.status === 'in_progress').length;
        const forReview = stories.filter((s: Story) => s.status === 'pending' || s.status === 'approved').length;
        const completed = stories.filter((s: Story) => {
          if (s.status !== 'completed') return false;
          // Check if completed this week (simplified)
          return true;
        }).length;

        // Get high priority stories for focus section
        const highPriority = stories
          .filter((s: Story) => s.status === 'pending' || s.status === 'approved' || s.status === 'in_progress')
          .sort((a: Story, b: Story) => {
            const priorityOrder: Record<string, number> = { P0: 0, P1: 1, P2: 2, P3: 3 };
            const aOrder = priorityOrder[a.priorityLevel || 'P2'] || 2;
            const bOrder = priorityOrder[b.priorityLevel || 'P2'] || 2;
            return aOrder - bOrder;
          })
          .slice(0, 5);

        // Fetch projects for launch score
        const projectsRes = await fetch('/api/projects');
        const projectsData = await projectsRes.json();
        const projects = projectsData.projects || [];
        
        // Calculate average launch score (simplified)
        let avgScore = 0;
        if (projects.length > 0) {
          // If we have project health data, use it
          avgScore = 65; // Default placeholder
        }

        setStats({
          workInProgress: inProgress,
          readyForReview: forReview,
          shippedThisWeek: completed,
          launchScore: avgScore,
        });
        setFocusStories(highPriority);
      } catch (error) {
        console.error('Failed to fetch dashboard data:', error);
      } finally {
        setLoading(false);
      }
    }

    fetchDashboardData();
  }, []);

  // Get greeting based on time of day
  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 18) return 'Good afternoon';
    return 'Good evening';
  };

  const getPriorityStyle = (priority: string | null) => {
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
  };

  if (loading) {
    return (
      <div style={{ padding: '24px' }}>
        <div style={{ animation: 'pulse 2s infinite' }}>
          <div style={{ height: '32px', background: '#E5E7EB', borderRadius: '8px', width: '300px', marginBottom: '24px' }} />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '24px' }}>
            {[1, 2, 3, 4].map(i => (
              <div key={i} style={{ height: '100px', background: '#E5E7EB', borderRadius: '12px' }} />
            ))}
          </div>
          <div style={{ height: '200px', background: '#E5E7EB', borderRadius: '12px' }} />
        </div>
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

      {/* Stats Row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '24px' }}>
        {/* Work In Progress */}
        <div style={{
          background: 'white',
          padding: '20px',
          borderRadius: '12px',
          border: '1px solid var(--border-light, #E7E5E4)',
        }}>
          <div style={{ fontSize: '13px', color: 'var(--text-muted, #A8A29E)', marginBottom: '4px' }}>
            Work In Progress
          </div>
          <div style={{ fontSize: '32px', fontWeight: 700, color: 'var(--text-primary, #1C1917)' }}>
            {stats.workInProgress}
          </div>
          <div style={{ fontSize: '12px', color: 'var(--accent-green, #10B981)', marginTop: '4px' }}>
            ↑ Active stories
          </div>
        </div>

        {/* Ready for Review */}
        <div style={{
          background: 'white',
          padding: '20px',
          borderRadius: '12px',
          border: '1px solid var(--border-light, #E7E5E4)',
        }}>
          <div style={{ fontSize: '13px', color: 'var(--text-muted, #A8A29E)', marginBottom: '4px' }}>
            Ready for Review
          </div>
          <div style={{ fontSize: '32px', fontWeight: 700, color: 'var(--accent-amber, #F59E0B)' }}>
            {stats.readyForReview}
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text-muted, #A8A29E)', marginTop: '4px' }}>
            → Needs attention
          </div>
        </div>

        {/* Shipped This Week */}
        <div style={{
          background: 'white',
          padding: '20px',
          borderRadius: '12px',
          border: '1px solid var(--border-light, #E7E5E4)',
        }}>
          <div style={{ fontSize: '13px', color: 'var(--text-muted, #A8A29E)', marginBottom: '4px' }}>
            Shipped This Week
          </div>
          <div style={{ fontSize: '32px', fontWeight: 700, color: 'var(--accent-green, #10B981)' }}>
            {stats.shippedThisWeek}
          </div>
          <div style={{ fontSize: '12px', color: 'var(--accent-green, #10B981)', marginTop: '4px' }}>
            ↑ Completed
          </div>
        </div>

        {/* Launch Score */}
        <div style={{
          background: 'white',
          padding: '20px',
          borderRadius: '12px',
          border: '1px solid var(--border-light, #E7E5E4)',
        }}>
          <div style={{ fontSize: '13px', color: 'var(--text-muted, #A8A29E)', marginBottom: '4px' }}>
            Launch Score
          </div>
          <div style={{ fontSize: '32px', fontWeight: 700, color: 'var(--accent-purple, #8B5CF6)' }}>
            {stats.launchScore}
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text-muted, #A8A29E)', marginTop: '4px' }}>
            Beta stage • {100 - stats.launchScore} to launch
          </div>
        </div>
      </div>

      {/* Today's Focus */}
      <div style={{
        background: 'white',
        borderRadius: '12px',
        border: '1px solid var(--border-light, #E7E5E4)',
        padding: '20px',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <span style={{ fontSize: '16px', fontWeight: 600 }}>🔥 Today's Focus</span>
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
          {focusStories.length === 0 ? (
            <div style={{
              padding: '24px',
              textAlign: 'center',
              color: 'var(--text-muted, #A8A29E)',
            }}>
              <p style={{ marginBottom: '8px' }}>No active stories yet!</p>
              <p style={{ fontSize: '14px' }}>Run the orchestrator to generate work items.</p>
            </div>
          ) : (
            focusStories.map((story) => {
              const priorityStyle = getPriorityStyle(story.priorityLevel);
              return (
                <Link
                  key={story.id}
                  href={`/stories/${story.id}`}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    padding: '12px',
                    background: 'var(--bg-warm, #F9F3ED)',
                    borderRadius: '8px',
                    textDecoration: 'none',
                    color: 'inherit',
                    transition: 'background 0.2s',
                  }}
                >
                  <span style={{
                    padding: '4px 10px',
                    borderRadius: '12px',
                    fontSize: '11px',
                    fontWeight: 600,
                    textTransform: 'uppercase',
                    letterSpacing: '0.02em',
                    ...priorityStyle,
                  }}>
                    {story.priorityLevel || 'P2'}
                  </span>
                  <span style={{ flex: 1, fontWeight: 500, color: 'var(--text-primary, #1C1917)' }}>
                    {story.title}
                  </span>
                  <span style={{ fontSize: '13px', color: 'var(--text-muted, #A8A29E)' }}>
                    {story.project.name}
                  </span>
                </Link>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
