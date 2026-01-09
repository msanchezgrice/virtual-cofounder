'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { useApiCache } from '@/lib/hooks/useApiCache';

interface ProjectWithStats {
  id: string;
  name: string;
  domain: string | null;
  status: string;
  createdAt: string;
  launchScore: number;
  stage: string;
  healthScore: number;
  inProgress: number;
  forReview: number;
  totalStories: number;
  completedStories: number;
  hasPosthog: boolean;
  hasResend: boolean;
  lastScannedAt: string | null;
}

interface ProjectsResponse {
  projects: ProjectWithStats[];
  count: number;
  error?: string;
}

type SortOption = 'alphabetical' | 'launch-score' | 'health' | 'recent';

// Get emoji for project based on name
function getProjectEmoji(name: string): string {
  const lowerName = name.toLowerCase();
  if (lowerName.includes('warm') || lowerName.includes('fire')) return '🔥';
  if (lowerName.includes('virtual') || lowerName.includes('cofounder')) return '⚡';
  if (lowerName.includes('snack')) return '🍿';
  if (lowerName.includes('podcast')) return '🎧';
  if (lowerName.includes('ship')) return '🚀';
  return '📁';
}

// Get gradient color based on project name
function getProjectGradient(name: string): string {
  const lowerName = name.toLowerCase();
  if (lowerName.includes('warm')) return 'from-amber-500 to-orange-600';
  if (lowerName.includes('virtual')) return 'from-purple-500 to-violet-600';
  if (lowerName.includes('snack')) return 'from-pink-500 to-rose-600';
  if (lowerName.includes('podcast')) return 'from-blue-500 to-indigo-600';
  return 'from-gray-500 to-gray-600';
}

// Get status badge style
function getStatusStyle(stage: string): { bg: string; text: string } {
  switch (stage) {
    case 'growth':
      return { bg: 'bg-green-100', text: 'text-green-800' };
    case 'launch':
      return { bg: 'bg-emerald-100', text: 'text-emerald-800' };
    case 'beta':
      return { bg: 'bg-green-100', text: 'text-green-700' };
    case 'alpha':
      return { bg: 'bg-amber-100', text: 'text-amber-700' };
    case 'mvp':
      return { bg: 'bg-orange-100', text: 'text-orange-700' };
    case 'idea':
      return { bg: 'bg-gray-100', text: 'text-gray-700' };
    default:
      return { bg: 'bg-blue-100', text: 'text-blue-700' };
  }
}

// Get health color
function getHealthColor(health: number): string {
  if (health >= 90) return 'text-green-600';
  if (health >= 70) return 'text-amber-600';
  return 'text-red-600';
}

// Project card skeleton
function ProjectCardSkeleton() {
  return (
    <div className="animate-pulse block bg-white border border-gray-200 rounded-xl p-5">
      <div className="flex items-center gap-5">
        <div className="w-16 h-16 rounded-xl bg-gray-200" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 mb-2">
            <div className="h-5 bg-gray-200 rounded w-32" />
            <div className="h-5 bg-gray-200 rounded w-16" />
          </div>
          <div className="h-4 bg-gray-200 rounded w-48" />
        </div>
        <div className="hidden md:grid grid-cols-4 gap-6">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="text-center">
              <div className="h-7 bg-gray-200 rounded w-10 mx-auto mb-1" />
              <div className="h-3 bg-gray-200 rounded w-14 mx-auto" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// Project card component
function ProjectCard({ project }: { project: ProjectWithStats }) {
  const statusStyle = getStatusStyle(project.stage);
  
  return (
    <Link
      href={`/projects/${project.id}`}
      className="block bg-white border border-gray-200 rounded-xl p-4 md:p-5 hover:shadow-md transition-all group touch-target"
    >
      <div className="flex items-center gap-4">
        {/* Project Icon */}
        <div
          className={`w-12 h-12 md:w-16 md:h-16 rounded-xl bg-gradient-to-br ${getProjectGradient(project.name)} flex items-center justify-center flex-shrink-0`}
        >
          <span className="text-2xl md:text-3xl">{getProjectEmoji(project.name)}</span>
        </div>

        {/* Project Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <h3 className="text-base md:text-lg font-semibold text-gray-900 truncate">
              {project.name}
            </h3>
            <span
              className={`px-2 py-0.5 rounded-full text-xs font-semibold uppercase ${statusStyle.bg} ${statusStyle.text}`}
            >
              {project.stage}
            </span>
            {/* Mobile score badge */}
            <span className="md:hidden ml-auto text-lg font-bold text-purple-600">
              {project.launchScore}
            </span>
          </div>
          <p className="text-sm text-gray-500 truncate">
            {project.domain || 'No domain'}
          </p>
          {/* Mobile stats row */}
          <div className="flex gap-4 mt-2 md:hidden text-xs text-gray-500">
            <span>{project.inProgress} in progress</span>
            <span>{project.forReview} for review</span>
          </div>
        </div>

        {/* Stats - Desktop only */}
        <div className="hidden md:grid grid-cols-4 gap-4 text-center flex-shrink-0">
          <div>
            <div className="text-xl font-bold text-purple-600">
              {project.launchScore}
            </div>
            <div className="text-xs text-gray-500">Launch</div>
          </div>
          <div>
            <div className="text-xl font-bold text-gray-900">
              {project.inProgress}
            </div>
            <div className="text-xs text-gray-500">WIP</div>
          </div>
          <div>
            <div className="text-xl font-bold text-amber-600">
              {project.forReview}
            </div>
            <div className="text-xs text-gray-500">Review</div>
          </div>
          <div>
            <div className={`text-xl font-bold ${getHealthColor(project.healthScore)}`}>
              {project.healthScore}%
            </div>
            <div className="text-xs text-gray-500">Health</div>
          </div>
        </div>

        {/* Arrow */}
        <span className="text-gray-400 group-hover:text-purple-600 transition-colors hidden md:block">
          →
        </span>
      </div>
    </Link>
  );
}

export default function ProjectsPage() {
  const [sortBy, setSortBy] = useState<SortOption>('launch-score');
  
  // Use cached API with the new aggregated endpoint
  // This eliminates N+1 queries - was fetching progress for each project
  const { data, loading, error, refresh } = useApiCache<ProjectsResponse>(
    '/api/projects/with-stats',
    {
      ttl: 5 * 60 * 1000, // 5 minutes
      backgroundRefresh: true,
    }
  );

  const rawProjects = data?.projects ?? [];
  
  // Sort projects based on selected option
  const projects = useMemo(() => {
    const sorted = [...rawProjects];
    switch (sortBy) {
      case 'alphabetical':
        return sorted.sort((a, b) => a.name.localeCompare(b.name));
      case 'launch-score':
        return sorted.sort((a, b) => b.launchScore - a.launchScore);
      case 'health':
        return sorted.sort((a, b) => b.healthScore - a.healthScore);
      case 'recent':
        return sorted.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      default:
        return sorted;
    }
  }, [rawProjects, sortBy]);

  if (loading && !data) {
    return (
      <div className="app-page">
        <div className="page-header">
          <div>
            <h1 className="page-title">📁 Projects</h1>
            <p className="page-subtitle">Manage all your projects</p>
          </div>
          <div className="h-10 w-32 bg-gray-200 rounded animate-pulse" />
        </div>
        <div className="space-y-4">
          <ProjectCardSkeleton />
          <ProjectCardSkeleton />
          <ProjectCardSkeleton />
        </div>
      </div>
    );
  }

  return (
    <div className="app-page">
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">📁 Projects</h1>
          <p className="page-subtitle">Manage all your projects</p>
        </div>
        <div className="page-header-actions">
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortOption)}
            className="btn btn-secondary touch-target"
            style={{ minWidth: '120px', fontSize: '13px' }}
          >
            <option value="launch-score">Launch Score</option>
            <option value="health">Health</option>
            <option value="alphabetical">A-Z</option>
            <option value="recent">Recent</option>
          </select>
          <button 
            onClick={() => refresh()}
            className="btn btn-secondary touch-target"
          >
            ↻
          </button>
          <button className="btn btn-primary touch-target">
            ➕<span className="hide-mobile" style={{ marginLeft: '4px' }}>Add Project</span>
          </button>
        </div>
      </div>

      {data?.error && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6 text-yellow-700">
          ⚠️ {data.error} - Showing cached data
        </div>
      )}

      {/* Projects Grid */}
      <div className="space-y-4">
        {projects.length === 0 ? (
          <div className="text-center py-12 bg-gray-50 rounded-lg">
            <p className="text-gray-500">No projects yet</p>
            <p className="text-sm text-gray-400 mt-1">Add a project to get started</p>
          </div>
        ) : (
          projects.map((project) => (
            <ProjectCard key={project.id} project={project} />
          ))
        )}
      </div>
    </div>
  );
}
