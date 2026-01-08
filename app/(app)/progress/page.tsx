/**
 * Progress Page - Launch Readiness Dashboard
 * 
 * Shows project progress from idea → paying users:
 * - Launch stage timeline
 * - Launch readiness score (0-100)
 * - Checklist of requirements
 * - AI recommendations
 * 
 * Feature flag: LAUNCH_READINESS
 */

'use client';

import { useEffect, useState } from 'react';

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
  onSelect 
}: { 
  projects: Project[]; 
  selectedId: string; 
  onSelect: (id: string) => void;
}) {
  if (projects.length === 0) return null;

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
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
      <h2 className="text-lg font-semibold text-gray-900 mb-6">Launch Timeline</h2>
      <div className="flex items-center justify-between">
        {stages.map((stage, index) => (
          <div key={stage.id} className="flex items-center">
            <div className="flex flex-col items-center">
              <div 
                className={`
                  w-10 h-10 rounded-full flex items-center justify-center text-sm font-medium
                  ${stage.complete 
                    ? 'bg-green-500 text-white' 
                    : stage.current 
                      ? 'bg-blue-500 text-white ring-4 ring-blue-100' 
                      : 'bg-gray-200 text-gray-500'
                  }
                `}
              >
                {stage.complete ? '✓' : index + 1}
              </div>
              <span className={`mt-2 text-xs font-medium ${stage.current ? 'text-blue-600' : 'text-gray-500'}`}>
                {stage.name}
              </span>
            </div>
            {index < stages.length - 1 && (
              <div 
                className={`w-16 h-0.5 mx-2 ${
                  stage.complete ? 'bg-green-500' : 'bg-gray-200'
                }`} 
              />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function LaunchScore({ score }: { score: number }) {
  const getScoreColor = (s: number) => {
    if (s >= 80) return 'text-green-600';
    if (s >= 60) return 'text-yellow-600';
    if (s >= 40) return 'text-orange-600';
    return 'text-red-600';
  };

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
      <h2 className="text-lg font-semibold text-gray-900 mb-4">Launch Readiness Score</h2>
      <div className="flex items-center gap-6">
        <div className={`text-5xl font-bold ${getScoreColor(score)}`}>
          {score}
        </div>
        <div className="flex-1">
          <div className="h-4 bg-gray-200 rounded-full overflow-hidden">
            <div 
              className={`h-full rounded-full transition-all ${
                score >= 80 ? 'bg-green-500' : 
                score >= 60 ? 'bg-yellow-500' : 
                score >= 40 ? 'bg-orange-500' : 'bg-red-500'
              }`}
              style={{ width: `${score}%` }}
            />
          </div>
          <p className="text-sm text-gray-500 mt-2">
            {score >= 80 ? 'Ready for launch!' : 
             score >= 60 ? 'Getting close - a few more items to complete' :
             score >= 40 ? 'Making progress - keep building' :
             'Early stage - focus on core features'}
          </p>
        </div>
      </div>
    </div>
  );
}

function LaunchChecklist({ items }: { items: ChecklistItem[] }) {
  const completedCount = items.filter(i => i.complete).length;
  
  // Group by category
  const categories = {
    core: items.filter(i => i.category === 'core'),
    quality: items.filter(i => i.category === 'quality'),
    growth: items.filter(i => i.category === 'growth'),
  };
  
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-gray-900">Launch Checklist</h2>
        <span className="text-sm text-gray-500">
          {completedCount}/{items.length} complete
        </span>
      </div>
      <div className="space-y-4">
        {Object.entries(categories).map(([category, categoryItems]) => (
          categoryItems.length > 0 && (
            <div key={category}>
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
                {category}
              </h3>
              <div className="grid grid-cols-2 gap-2">
                {categoryItems.map((item) => (
                  <div key={item.id} className="flex items-center gap-2">
                    <span className={`w-5 h-5 rounded flex items-center justify-center text-xs ${
                      item.complete ? 'bg-green-100 text-green-600' : 'bg-gray-100 text-gray-400'
                    }`}>
                      {item.complete ? '✓' : '○'}
                    </span>
                    <span className={`text-sm ${item.complete ? 'text-gray-700' : 'text-gray-500'}`}>
                      {item.label}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )
        ))}
      </div>
    </div>
  );
}

function WorkProgress({ summary }: { summary: WorkSummary }) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
      <h2 className="text-lg font-semibold text-gray-900 mb-4">Work Progress</h2>
      <div className="grid grid-cols-4 gap-4">
        <div className="text-center">
          <div className="text-2xl font-bold text-blue-600">{summary.pending}</div>
          <div className="text-xs text-gray-500">Pending</div>
        </div>
        <div className="text-center">
          <div className="text-2xl font-bold text-yellow-600">{summary.in_progress}</div>
          <div className="text-xs text-gray-500">In Progress</div>
        </div>
        <div className="text-center">
          <div className="text-2xl font-bold text-green-600">{summary.completed}</div>
          <div className="text-xs text-gray-500">Completed</div>
        </div>
        <div className="text-center">
          <div className="text-2xl font-bold text-gray-900">{summary.completion_rate}%</div>
          <div className="text-xs text-gray-500">Done</div>
        </div>
      </div>
      <div className="mt-4 h-2 bg-gray-200 rounded-full overflow-hidden">
        <div className="h-full flex">
          <div 
            className="bg-green-500" 
            style={{ width: `${(summary.completed / Math.max(summary.total, 1)) * 100}%` }} 
          />
          <div 
            className="bg-yellow-500" 
            style={{ width: `${(summary.in_progress / Math.max(summary.total, 1)) * 100}%` }} 
          />
        </div>
      </div>
    </div>
  );
}

function Recommendations({ items }: { items: string[] }) {
  if (items.length === 0) return null;
  
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6">
      <h2 className="text-lg font-semibold text-gray-900 mb-4">
        <span className="mr-2">🤖</span>
        AI Recommendations
      </h2>
      <ul className="space-y-3">
        {items.map((item, index) => (
          <li key={index} className="flex items-start gap-3">
            <span className="w-6 h-6 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-xs font-medium flex-shrink-0 mt-0.5">
              {index + 1}
            </span>
            <span className="text-sm text-gray-700">{item}</span>
          </li>
        ))}
      </ul>
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
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>('');
  const [data, setData] = useState<ProgressData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch projects list
  useEffect(() => {
    async function fetchProjects() {
      try {
        const res = await fetch('/api/projects');
        if (res.ok) {
          const data = await res.json();
          // API returns {projects: [...]} not just an array
          const projectList = Array.isArray(data) ? data : (data.projects || []);
          setProjects(projectList);
          // Auto-select first project if available
          if (projectList.length > 0 && !selectedProjectId) {
            setSelectedProjectId(projectList[0].id);
          }
        }
      } catch {
        console.error('Failed to fetch projects');
      }
    }
    fetchProjects();
  }, [selectedProjectId]);

  // Fetch progress data when project changes
  useEffect(() => {
    async function fetchProgress() {
      if (!selectedProjectId) {
        setData(null);
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const res = await fetch(`/api/projects/${selectedProjectId}/progress`);
        if (res.ok) {
          const progressData = await res.json();
          setData(progressData);
        } else {
          setError('Failed to load progress data');
          setData(PLACEHOLDER_DATA);
        }
      } catch {
        setError('Failed to load progress data');
        setData(PLACEHOLDER_DATA);
      } finally {
        setLoading(false);
      }
    }

    fetchProgress();
  }, [selectedProjectId]);

  return (
    <div className="max-w-4xl mx-auto px-6 py-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Progress</h1>
          <p className="text-gray-600 mt-1">
            Track your journey from idea to paying users
          </p>
        </div>
        <ProjectSelector
          projects={projects}
          selectedId={selectedProjectId}
          onSelect={setSelectedProjectId}
        />
      </div>

      {error && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
          <p className="text-sm text-yellow-800">
            {error} - showing sample data.
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
          <Recommendations items={data.recommendations} />
        </>
      )}
    </div>
  );
}
