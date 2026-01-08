'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

interface Project {
  id: string;
  name: string;
  domain: string | null;
  status: string;
  createdAt: string;
}

interface ProjectWithStats extends Project {
  launchScore: number;
  inProgress: number;
  forReview: number;
  healthScore: number;
  stage: string;
}

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

export default function ProjectsPage() {
  const [projects, setProjects] = useState<ProjectWithStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchProjects() {
      try {
        const res = await fetch('/api/projects');
        const data = await res.json();
        const projectList: Project[] = data.projects || [];

        // Fetch progress data for each project to get launch score
        const projectsWithStats = await Promise.all(
          projectList.map(async (project) => {
            try {
              const progressRes = await fetch(`/api/projects/${project.id}/progress`);
              if (progressRes.ok) {
                const progress = await progressRes.json();
                return {
                  ...project,
                  launchScore: progress.score || 0,
                  stage: progress.stage || 'idea',
                  inProgress: progress.workSummary?.inProgress || 0,
                  forReview: progress.workSummary?.pending || 0,
                  healthScore: Math.round((progress.score || 0) * 1.2) % 100 + 50, // Derive from score
                };
              }
            } catch (e) {
              console.error(`Failed to fetch progress for ${project.id}:`, e);
            }
            return {
              ...project,
              launchScore: 0,
              stage: 'idea',
              inProgress: 0,
              forReview: 0,
              healthScore: 80,
            };
          })
        );

        setProjects(projectsWithStats);
      } catch (err) {
        setError('Failed to load projects');
        console.error(err);
      } finally {
        setLoading(false);
      }
    }

    fetchProjects();
  }, []);

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto px-6 py-8">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 rounded w-1/4" />
          <div className="h-32 bg-gray-200 rounded" />
          <div className="h-32 bg-gray-200 rounded" />
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-6 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Projects</h1>
        <button className="px-4 py-2 bg-purple-600 text-white rounded-lg font-medium hover:bg-purple-700 transition-colors">
          + Add Project
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6 text-red-700">
          {error}
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
          projects.map((project) => {
            const statusStyle = getStatusStyle(project.stage);
            return (
              <Link
                key={project.id}
                href={`/projects/${project.id}`}
                className="block bg-white border border-gray-200 rounded-xl p-5 hover:shadow-md transition-all group"
              >
                <div className="flex items-center gap-5">
                  {/* Project Icon */}
                  <div
                    className={`w-16 h-16 rounded-xl bg-gradient-to-br ${getProjectGradient(
                      project.name
                    )} flex items-center justify-center`}
                  >
                    <span className="text-3xl">{getProjectEmoji(project.name)}</span>
                  </div>

                  {/* Project Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-1">
                      <h3 className="text-lg font-semibold text-gray-900 truncate">
                        {project.name}
                      </h3>
                      <span
                        className={`px-2.5 py-0.5 rounded-full text-xs font-semibold uppercase ${statusStyle.bg} ${statusStyle.text}`}
                      >
                        {project.stage}
                      </span>
                    </div>
                    <p className="text-sm text-gray-500 truncate">
                      {project.domain || 'No domain configured'}
                    </p>
                  </div>

                  {/* Stats */}
                  <div className="hidden md:grid grid-cols-4 gap-6 text-center">
                    <div>
                      <div className="text-2xl font-bold text-purple-600">
                        {project.launchScore}
                      </div>
                      <div className="text-xs text-gray-500">Launch Score</div>
                    </div>
                    <div>
                      <div className="text-2xl font-bold text-gray-900">
                        {project.inProgress}
                      </div>
                      <div className="text-xs text-gray-500">In Progress</div>
                    </div>
                    <div>
                      <div className="text-2xl font-bold text-amber-600">
                        {project.forReview}
                      </div>
                      <div className="text-xs text-gray-500">For Review</div>
                    </div>
                    <div>
                      <div className={`text-2xl font-bold ${getHealthColor(project.healthScore)}`}>
                        {project.healthScore}%
                      </div>
                      <div className="text-xs text-gray-500">Health</div>
                    </div>
                  </div>

                  {/* Arrow */}
                  <span className="text-gray-400 group-hover:text-purple-600 transition-colors">
                    →
                  </span>
                </div>
              </Link>
            );
          })
        )}
      </div>
    </div>
  );
}
