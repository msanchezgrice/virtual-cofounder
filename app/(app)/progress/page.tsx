/**
 * Progress Page - Launch Readiness Dashboard
 * 
 * Shows project progress from idea → paying users:
 * - Launch stage timeline
 * - Launch readiness score (0-100)
 * - Checklist of requirements
 * - AI recommendations
 * 
 * Performance optimized with caching
 */

'use client';

import { useState, useMemo } from 'react';
import { useApiCache } from '@/lib/hooks/useApiCache';

interface StageData {
  id: string;
  name: string;
  complete: boolean;
  current?: boolean;
}

interface ChecklistItem {
  id: string;
  label: string;
  complete: boolean;
  category: string;
}

interface WorkSummary {
  pending: number;
  in_progress: number;
  completed: number;
  total: number;
  completion_rate: number;
}

interface ProgressData {
  projectId: string;
  projectName: string;
  stage: string;
  score: number;
  stages: StageData[];
  checklist: ChecklistItem[];
  recommendations: string[];
  workSummary: WorkSummary;
  updatedAt: string;
}

interface Project {
  id: string;
  name: string;
}

interface ProjectsResponse {
  projects: Project[];
  error?: string;
}

// Placeholder data for when no project is selected or feature is disabled
const PLACEHOLDER_DATA: ProgressData = {
  projectId: '',
  projectName: 'Sample Project',
  stage: 'alpha',
  score: 65,
  stages: [
    { id: 'idea', name: 'Idea', complete: true },
    { id: 'mvp', name: 'MVP', complete: true },
    { id: 'alpha', name: 'Alpha', complete: false, current: true },
    { id: 'beta', name: 'Beta', complete: false },
    { id: 'launch', name: 'Launch', complete: false },
    { id: 'growth', name: 'Growth', complete: false },
  ],
  checklist: [
    { id: 'repo', label: 'Repository exists', complete: true, category: 'core' },
    { id: 'domain', label: 'Domain configured', complete: true, category: 'core' },
    { id: 'ssl', label: 'SSL certificate', complete: true, category: 'core' },
    { id: 'analytics', label: 'Analytics installed', complete: false, category: 'growth' },
    { id: 'auth', label: 'Authentication working', complete: true, category: 'core' },
    { id: 'payments', label: 'Payments configured', complete: false, category: 'growth' },
    { id: 'monitoring', label: 'Error monitoring', complete: false, category: 'quality' },
    { id: 'seo', label: 'SEO optimized', complete: false, category: 'quality' },
    { id: 'performance', label: 'Performance passing', complete: true, category: 'quality' },
    { id: 'security', label: 'Security scan passing', complete: false, category: 'quality' },
  ],
  recommendations: [
    'Set up PostHog or similar analytics to track user behavior',
    'Configure Stripe for payment processing before launch',
    'Add error monitoring with Sentry to catch production issues',
    'Complete security scan and address all critical issues',
  ],
  workSummary: { pending: 5, in_progress: 2, completed: 12, total: 19, completion_rate: 63 },
  updatedAt: new Date().toISOString(),
};

function ProjectSelector({ 
  projects, 
  selectedId, 
  onSelect,
  loading = false,
  error = false
}: { 
  projects: Project[]; 
  selectedId: string; 
  onSelect: (id: string) => void;
  loading?: boolean;
  error?: boolean;
}) {
  if (loading) {
    return (
      <div className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-gray-100 text-gray-500">
        Loading projects...
      </div>
    );
  }

  if (error || projects.length === 0) {
    return (
      <div className="px-3 py-2 border border-yellow-300 rounded-lg text-sm bg-yellow-50 text-yellow-700">
        {error ? 'Failed to load projects' : 'No projects found'}
      </div>
    );
  }

  return (
    <select
      value={selectedId}
      onChange={(e) => onSelect(e.target.value)}
      className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
    >
      <option value="">Select a project...</option>
      {projects.map((p) => (
        <option key={p.id} value={p.id}>
          {p.name}
        </option>
      ))}
    </select>
  );
}

function StageTimeline({ stages }: { stages: StageData[] }) {
  const stageIcons = ['💡', '🔧', '🧪', '🎯', '🚀', '📈'];
  
  return (
    <div className="card" style={{ padding: '24px', marginBottom: '20px' }}>
      <h2 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '20px' }}>Journey to Paying Customers</h2>
      <div className="stage-timeline-container">
        {stages.map((stage, index) => (
          <div 
            key={stage.id} 
            className="stage-timeline-item"
          >
            <div 
              className={`stage-icon ${stage.complete ? 'completed' : stage.current ? 'current' : 'upcoming'}`}
            >
              {stageIcons[index] || '⭐'}
            </div>
            <div className="stage-name">{stage.name}</div>
            <div className={`stage-status ${stage.current ? 'active' : ''}`}>
              {stage.complete ? '✓' : stage.current ? 'NOW' : `${76 + index * 5}+`}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function LaunchScore({ score }: { score: number }) {
  const scoreDeg = (score / 100) * 360;
  
  return (
    <div className="card" style={{ 
      display: 'flex', 
      flexDirection: 'row',
      flexWrap: 'wrap',
      justifyContent: 'space-between', 
      alignItems: 'center',
      gap: '20px',
      marginBottom: '20px',
    }}>
      <div style={{ flex: '1 1 200px', minWidth: '200px' }}>
        <h2 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '8px' }}>Launch Readiness Score</h2>
        <p style={{ fontSize: '14px', color: 'var(--text-muted)' }}>
          {score >= 76 ? 'Ready for launch!' : 
           score >= 60 ? `${76 - score} points to Launch` :
           score >= 40 ? 'Making progress - keep building' :
           'Early stage - focus on core features'}
        </p>
      </div>
      <div 
        className="score-circle"
        style={{ 
          '--score-deg': `${scoreDeg}deg`,
          width: '120px',
          height: '120px',
          flexShrink: 0,
        } as React.CSSProperties}
      >
        <div className="score-inner" style={{ width: '90px', height: '90px' }}>
          <span className="score-value" style={{ fontSize: '28px' }}>{score}</span>
          <span className="score-max" style={{ fontSize: '12px' }}>/ 100</span>
        </div>
      </div>
    </div>
  );
}

function LaunchChecklist({ items }: { items: ChecklistItem[] }) {
  const completedCount = items.filter(i => i.complete).length;
  
  return (
    <div className="card">
      <div className="card-header">
        <span className="card-title">✅ Launch Checklist</span>
        <span style={{ fontSize: '14px', color: 'var(--text-muted)' }}>
          {completedCount}/{items.length} complete
        </span>
      </div>
      <div className="checklist">
        {items.map((item) => (
          <div key={item.id} className="checklist-item">
            <div className={`checklist-icon ${item.complete ? 'done' : 'pending'}`}>
              {item.complete ? '✓' : '⏳'}
            </div>
            <div className="checklist-text">
              <div className="checklist-label">{item.label}</div>
              <div className="checklist-desc">{item.category}</div>
            </div>
            <span style={{ 
              color: item.complete ? 'var(--accent-green)' : 'var(--text-muted)', 
              fontWeight: 600 
            }}>
              {item.complete ? '+5' : ''}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function WorkProgress({ summary }: { summary: WorkSummary }) {
  return (
    <div className="card" style={{ marginBottom: '20px' }}>
      <h2 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '16px' }}>Work Progress</h2>
      <div className="responsive-grid responsive-grid-4">
        <div style={{ textAlign: 'center', padding: '12px', background: 'var(--bg-warm)', borderRadius: '8px' }}>
          <div style={{ fontSize: '24px', fontWeight: 700, color: '#3B82F6' }}>{summary.pending}</div>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Pending</div>
        </div>
        <div style={{ textAlign: 'center', padding: '12px', background: 'var(--bg-warm)', borderRadius: '8px' }}>
          <div style={{ fontSize: '24px', fontWeight: 700, color: '#F59E0B' }}>{summary.in_progress}</div>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>In Progress</div>
        </div>
        <div style={{ textAlign: 'center', padding: '12px', background: 'var(--bg-warm)', borderRadius: '8px' }}>
          <div style={{ fontSize: '24px', fontWeight: 700, color: '#10B981' }}>{summary.completed}</div>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Completed</div>
        </div>
        <div style={{ textAlign: 'center', padding: '12px', background: 'var(--bg-warm)', borderRadius: '8px' }}>
          <div style={{ fontSize: '24px', fontWeight: 700, color: 'var(--text-primary)' }}>{summary.completion_rate}%</div>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Done</div>
        </div>
      </div>
      <div style={{ marginTop: '16px', height: '8px', background: '#E5E7EB', borderRadius: '999px', overflow: 'hidden' }}>
        <div style={{ height: '100%', display: 'flex' }}>
          <div 
            style={{ 
              background: '#10B981',
              width: `${(summary.completed / Math.max(summary.total, 1)) * 100}%`,
            }} 
          />
          <div 
            style={{ 
              background: '#F59E0B',
              width: `${(summary.in_progress / Math.max(summary.total, 1)) * 100}%`,
            }} 
          />
        </div>
      </div>
    </div>
  );
}

function Recommendations({ items, projectId, onActionStarted }: { items: string[], projectId?: string, onActionStarted?: () => void }) {
  const [startingIndex, setStartingIndex] = useState<number | null>(null);
  const [startedItems, setStartedItems] = useState<Set<number>>(new Set());
  
  if (items.length === 0) return null;
  
  const handleStart = async (item: string, index: number) => {
    setStartingIndex(index);
    try {
      // Create a priority signal for this recommended action
      const response = await fetch('/api/priorities', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId,
          priorityLevel: index === 0 ? 'P0' : 'P1',
          source: 'dashboard',
          rawContent: `[P${index === 0 ? '0' : '1'}] ${item}`,
        }),
      });
      
      if (response.ok) {
        setStartedItems(prev => new Set(prev).add(index));
        onActionStarted?.();
      }
    } catch (error) {
      console.error('Failed to start action:', error);
    } finally {
      setStartingIndex(null);
    }
  };
  
  return (
    <div className="card" style={{ background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.1), rgba(124, 58, 237, 0.05))' }}>
      <div className="card-header">
        <span className="card-title">⚡ AI Recommended Next Actions</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {items.map((item, index) => (
          <div 
            key={index} 
            style={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: '12px', 
              padding: '12px', 
              background: 'var(--bg-card)', 
              borderRadius: '8px' 
            }}
          >
            <span style={{ fontSize: '20px' }}>
              {index === 0 ? '🔒' : index === 1 ? '💳' : index === 2 ? '📊' : '🚀'}
            </span>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 500 }}>{item}</div>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>+5 pts • {index === 0 ? 'Critical for launch' : 'Recommended'}</div>
            </div>
            {startedItems.has(index) ? (
              <span style={{ 
                padding: '4px 12px', 
                background: '#D1FAE5', 
                color: '#065F46', 
                borderRadius: '4px',
                fontSize: '12px',
                fontWeight: 600,
              }}>
                ✓ Added
              </span>
            ) : (
              <button 
                className="btn btn-primary btn-sm"
                onClick={() => handleStart(item, index)}
                disabled={startingIndex !== null}
              >
                {startingIndex === index ? '...' : 'Start'}
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function LoadingState() {
  return (
    <div className="animate-pulse space-y-6">
      <div className="bg-gray-200 h-32 rounded-lg" />
      <div className="bg-gray-200 h-24 rounded-lg" />
      <div className="bg-gray-200 h-48 rounded-lg" />
      <div className="bg-gray-200 h-32 rounded-lg" />
    </div>
  );
}

function EmptyState() {
  return (
    <div className="bg-gray-50 border border-gray-200 rounded-lg p-12 text-center">
      <div className="text-4xl mb-4">📊</div>
      <h3 className="font-semibold text-gray-900 mb-2">Select a Project</h3>
      <p className="text-sm text-gray-600">
        Choose a project from the dropdown above to view its launch readiness progress.
      </p>
    </div>
  );
}

export default function ProgressPage() {
  const [selectedProjectId, setSelectedProjectId] = useState<string>('');

  // Fetch projects with caching
  const { data: projectsData, loading: projectsLoading } = useApiCache<ProjectsResponse>(
    '/api/projects',
    { ttl: 5 * 60 * 1000 }
  );
  
  const projects = projectsData?.projects ?? [];
  const projectsError = !!projectsData?.error;

  // Auto-select first project if none selected
  const effectiveProjectId = useMemo(() => {
    if (selectedProjectId) return selectedProjectId;
    return projects.length > 0 ? projects[0].id : '';
  }, [selectedProjectId, projects]);

  // Fetch progress data for selected project with responsive caching
  const { data: progressData, loading: progressLoading, error: progressError, refresh } = useApiCache<ProgressData>(
    effectiveProjectId ? `/api/projects/${effectiveProjectId}/progress` : null,
    { 
      ttl: 60 * 1000, // 1 minute cache (reduced from 3 minutes)
      backgroundRefresh: true,
      refreshOnFocus: true, // Refresh when tab becomes visible
      pollingInterval: 30000, // Poll every 30 seconds
    }
  );

  const data = progressData || (effectiveProjectId ? PLACEHOLDER_DATA : null);
  const loading = projectsLoading || (effectiveProjectId && progressLoading && !progressData);

  return (
    <div className="app-page">
      <div className="page-header">
        <div>
          <h1 className="page-title">🚀 Progress</h1>
          <p className="page-subtitle">
            Track your journey from idea to paying users
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
          <ProjectSelector
            projects={projects}
            selectedId={effectiveProjectId}
            onSelect={setSelectedProjectId}
            loading={projectsLoading}
            error={projectsError}
          />
        </div>
      </div>

      {progressError && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
          <p className="text-sm text-yellow-800">
            Failed to load progress data - showing sample data.
          </p>
        </div>
      )}

      {loading ? (
        <LoadingState />
      ) : !data ? (
        <EmptyState />
      ) : (
        <>
          {data.projectName && (
            <div className="mb-6">
              <h2 className="text-lg font-medium text-gray-700">{data.projectName}</h2>
              <p className="text-sm text-gray-500">
                Last updated: {new Date(data.updatedAt).toLocaleString()}
              </p>
            </div>
          )}
          <StageTimeline stages={data.stages} />
          <LaunchScore score={data.score} />
          <WorkProgress summary={data.workSummary} />
          <LaunchChecklist items={data.checklist} />
          <Recommendations 
            items={data.recommendations} 
            projectId={effectiveProjectId}
            onActionStarted={() => refresh()}
          />
        </>
      )}
    </div>
  );
}
