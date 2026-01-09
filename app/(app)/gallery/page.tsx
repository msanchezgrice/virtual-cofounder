'use client';

import { useState, useEffect, useCallback } from 'react';

interface AgentOutput {
  id: string;
  title: string;
  description: string | null;
  outputType: string;
  contentType: string;
  status: string;
  reviewNotes: string | null;
  storageUrl: string | null;
  content: string | null;
  createdAt: string;
  agentName: string | null;
  agentType: string | null;
  projectId: string | null;
  projectName: string | null;
}

interface FilterOptions {
  outputTypes: Array<{ value: string; count: number }>;
  statuses: Array<{ value: string; count: number }>;
  projects: Array<{ id: string; name: string }>;
}

const OUTPUT_TYPE_LABELS: Record<string, { label: string; color: string; icon: string }> = {
  design: { label: 'Design', color: 'bg-purple-100 text-purple-800', icon: '🎨' },
  document: { label: 'Document', color: 'bg-blue-100 text-blue-800', icon: '📄' },
  research: { label: 'Research', color: 'bg-green-100 text-green-800', icon: '🔬' },
  analysis: { label: 'Analysis', color: 'bg-yellow-100 text-yellow-800', icon: '📊' },
  code_review: { label: 'Code Review', color: 'bg-orange-100 text-orange-800', icon: '👀' },
};

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  pending: { label: 'Pending', color: 'bg-gray-100 text-gray-800' },
  approved: { label: 'Approved', color: 'bg-green-100 text-green-800' },
  rejected: { label: 'Rejected', color: 'bg-red-100 text-red-800' },
  archived: { label: 'Archived', color: 'bg-gray-200 text-gray-600' },
};

export default function GalleryPage() {
  const [outputs, setOutputs] = useState<AgentOutput[]>([]);
  const [filters, setFilters] = useState<FilterOptions | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedOutput, setSelectedOutput] = useState<AgentOutput | null>(null);

  // Filter state
  const [search, setSearch] = useState('');
  const [outputType, setOutputType] = useState('all');
  const [status, setStatus] = useState('all');
  const [projectId, setProjectId] = useState('all');

  const fetchOutputs = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      if (outputType !== 'all') params.set('outputType', outputType);
      if (status !== 'all') params.set('status', status);
      if (projectId !== 'all') params.set('projectId', projectId);

      const res = await fetch(`/api/agent-outputs?${params.toString()}`);
      const data = await res.json();

      setOutputs(data.outputs || []);
      setFilters(data.filters || null);
    } catch (error) {
      console.error('Failed to fetch outputs:', error);
    } finally {
      setLoading(false);
    }
  }, [search, outputType, status, projectId]);

  useEffect(() => {
    fetchOutputs();
  }, [fetchOutputs]);

  const handleStatusUpdate = async (outputId: string, newStatus: string) => {
    try {
      await fetch('/api/agent-outputs', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ outputId, status: newStatus }),
      });
      fetchOutputs();
      setSelectedOutput(null);
    } catch (error) {
      console.error('Failed to update status:', error);
    }
  };

  const getTypeInfo = (type: string) =>
    OUTPUT_TYPE_LABELS[type] || { label: type, color: 'bg-gray-100 text-gray-800', icon: '📁' };

  const getStatusInfo = (s: string) =>
    STATUS_LABELS[s] || { label: s, color: 'bg-gray-100 text-gray-800' };

  return (
    <div className="app-page">
      {/* Header */}
      <div className="page-header" style={{ marginBottom: '24px' }}>
        <div>
          <h1 className="page-title">🎨 Gallery</h1>
          <p className="page-subtitle">
            Browse and review agent outputs
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="card" style={{ padding: '16px', marginBottom: '24px' }}>
        <div className="responsive-grid responsive-grid-4">
          {/* Search */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Search</label>
            <input
              type="text"
              placeholder="Search by title or description..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-brand-blue focus:border-brand-blue"
            />
          </div>

          {/* Output Type */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
            <select
              value={outputType}
              onChange={(e) => setOutputType(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-brand-blue focus:border-brand-blue"
            >
              <option value="all">All Types</option>
              {filters?.outputTypes.map((t) => (
                <option key={t.value} value={t.value}>
                  {getTypeInfo(t.value).label} ({t.count})
                </option>
              ))}
            </select>
          </div>

          {/* Status */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-brand-blue focus:border-brand-blue"
            >
              <option value="all">All Statuses</option>
              {filters?.statuses.map((s) => (
                <option key={s.value} value={s.value}>
                  {getStatusInfo(s.value).label} ({s.count})
                </option>
              ))}
            </select>
          </div>

          {/* Project */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Project</label>
            <select
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-brand-blue focus:border-brand-blue"
            >
              <option value="all">All Projects</option>
              {filters?.projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="responsive-grid responsive-grid-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="card animate-pulse" style={{ padding: '16px' }}>
              <div style={{ height: '140px', background: 'var(--bg-warm)', borderRadius: '8px', marginBottom: '16px' }} />
              <div style={{ height: '16px', background: 'var(--bg-warm)', borderRadius: '4px', width: '75%', marginBottom: '8px' }} />
              <div style={{ height: '12px', background: 'var(--bg-warm)', borderRadius: '4px', width: '50%' }} />
            </div>
          ))}
        </div>
      ) : outputs.length === 0 ? (
        <div className="card" style={{ padding: '48px', textAlign: 'center' }}>
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>📭</div>
          <h3 style={{ fontSize: '18px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '8px' }}>No outputs yet</h3>
          <p style={{ color: 'var(--text-muted)' }}>
            Agent outputs will appear here when agents create designs, documents, or research.
          </p>
        </div>
      ) : (
        <div className="responsive-grid responsive-grid-3">
          {outputs.map((output) => {
            const typeInfo = getTypeInfo(output.outputType);
            const statusInfo = getStatusInfo(output.status);

            return (
              <div
                key={output.id}
                onClick={() => setSelectedOutput(output)}
                className="bg-white border border-gray-200 rounded-xl overflow-hidden hover:shadow-lg transition-shadow cursor-pointer group"
              >
                {/* Preview area */}
                <div className="h-40 bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center text-5xl group-hover:scale-105 transition-transform">
                  {typeInfo.icon}
                </div>

                {/* Content */}
                <div className="p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${typeInfo.color}`}>
                      {typeInfo.label}
                    </span>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusInfo.color}`}>
                      {statusInfo.label}
                    </span>
                  </div>

                  <h3 className="font-medium text-gray-900 truncate mb-1">{output.title}</h3>
                  <p className="text-sm text-gray-500 line-clamp-2 mb-3">
                    {output.description || 'No description'}
                  </p>

                  <div className="flex items-center justify-between text-xs text-gray-400">
                    <span>{output.agentName || 'Unknown Agent'}</span>
                    <span>{new Date(output.createdAt).toLocaleDateString()}</span>
                  </div>

                  {output.projectName && (
                    <div className="mt-2 text-xs text-gray-400">
                      Project: {output.projectName}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Detail Modal */}
      {selectedOutput && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
          onClick={() => setSelectedOutput(null)}
        >
          <div
            className="bg-white rounded-2xl max-w-3xl w-full max-h-[90vh] overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="p-6 border-b border-gray-200">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${getTypeInfo(selectedOutput.outputType).color}`}>
                      {getTypeInfo(selectedOutput.outputType).label}
                    </span>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${getStatusInfo(selectedOutput.status).color}`}>
                      {getStatusInfo(selectedOutput.status).label}
                    </span>
                  </div>
                  <h2 className="text-xl font-semibold text-gray-900">{selectedOutput.title}</h2>
                  <p className="text-sm text-gray-500 mt-1">{selectedOutput.description}</p>
                </div>
                <button
                  onClick={() => setSelectedOutput(null)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto max-h-[50vh]">
              {selectedOutput.content ? (
                <div className="prose prose-sm max-w-none">
                  {selectedOutput.contentType === 'markdown' ? (
                    <pre className="whitespace-pre-wrap bg-gray-50 p-4 rounded-lg text-sm">
                      {selectedOutput.content}
                    </pre>
                  ) : selectedOutput.contentType === 'html' ? (
                    <div
                      dangerouslySetInnerHTML={{ __html: selectedOutput.content }}
                      className="border border-gray-200 rounded-lg p-4"
                    />
                  ) : (
                    <pre className="whitespace-pre-wrap bg-gray-50 p-4 rounded-lg text-sm">
                      {selectedOutput.content}
                    </pre>
                  )}
                </div>
              ) : selectedOutput.storageUrl ? (
                <div className="text-center py-8">
                  <a
                    href={selectedOutput.storageUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 px-4 py-2 bg-brand-blue text-white rounded-lg hover:bg-brand-blue/90"
                  >
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                    Open in New Tab
                  </a>
                </div>
              ) : (
                <div className="text-center py-8 text-gray-500">
                  No preview available
                </div>
              )}

              {/* Metadata */}
              <div className="mt-6 pt-6 border-t border-gray-200 grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-gray-500">Agent:</span>
                  <span className="ml-2 text-gray-900">{selectedOutput.agentName || 'Unknown'}</span>
                </div>
                <div>
                  <span className="text-gray-500">Created:</span>
                  <span className="ml-2 text-gray-900">
                    {new Date(selectedOutput.createdAt).toLocaleString()}
                  </span>
                </div>
                {selectedOutput.projectName && (
                  <div>
                    <span className="text-gray-500">Project:</span>
                    <span className="ml-2 text-gray-900">{selectedOutput.projectName}</span>
                  </div>
                )}
                <div>
                  <span className="text-gray-500">Content Type:</span>
                  <span className="ml-2 text-gray-900">{selectedOutput.contentType}</span>
                </div>
              </div>
            </div>

            {/* Modal Footer - Actions */}
            {selectedOutput.status === 'pending' && (
              <div className="p-6 border-t border-gray-200 bg-gray-50 flex items-center justify-end gap-3">
                <button
                  onClick={() => handleStatusUpdate(selectedOutput.id, 'rejected')}
                  className="px-4 py-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                >
                  Reject
                </button>
                <button
                  onClick={() => handleStatusUpdate(selectedOutput.id, 'approved')}
                  className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                >
                  Approve
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
