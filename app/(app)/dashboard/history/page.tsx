'use client';

import { useState, useEffect } from 'react';

interface SlackMessage {
  id: string;
  text: string;
  userId: string;
  channelId: string;
  messageTs: string;
  isCommand: boolean;
  commandType: string | null;
  createdAt: string;
}

interface OrchestratorRun {
  id: string;
  runId: string;
  status: 'running' | 'completed' | 'failed';
  findingsCount: number;
  storiesCount: number;
  conversation: any;
  startedAt: string;
  completedAt: string | null;
}

export default function HistoryPage() {
  const [runs, setRuns] = useState<OrchestratorRun[]>([]);
  const [messages, setMessages] = useState<SlackMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedRun, setSelectedRun] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'runs' | 'messages' | 'all'>('all');

  useEffect(() => {
    fetchHistory();
  }, []);

  const fetchHistory = async () => {
    try {
      // Fetch orchestrator runs
      const runsRes = await fetch('/api/orchestrator/history');
      const runsData = await runsRes.json();
      setRuns(runsData.runs || []);

      // Fetch Slack messages
      const messagesRes = await fetch('/api/slack/messages');
      const messagesData = await messagesRes.json();
      setMessages(messagesData.messages || []);
    } catch (error) {
      console.error('Failed to fetch history:', error);
      setRuns([]);
      setMessages([]);
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

  const getSlackPermalink = (channelId: string, messageTs: string) => {
    // Convert timestamp to Slack permalink format (remove decimal point)
    const ts = messageTs.replace('.', '');
    return `https://clipcade.slack.com/archives/${channelId}/p${ts}`;
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return 'bg-green-100 text-green-800';
      case 'running': return 'bg-blue-100 text-blue-800';
      case 'failed': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-6 py-8">
        <div className="text-center py-12">
          <div className="text-gray-600">Loading history...</div>
        </div>
      </div>
    );
  }

  // Filter what to show based on view mode
  const displayRuns = viewMode === 'messages' ? [] : runs;
  const displayMessages = viewMode === 'runs' ? [] : messages;

  return (
    <div className="max-w-7xl mx-auto px-6 py-8">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold">Activity History</h2>
        <div className="flex items-center gap-4">
          {/* View mode toggles */}
          <div className="flex bg-gray-100 rounded-lg p-1">
            <button
              onClick={() => setViewMode('all')}
              className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
                viewMode === 'all' ? 'bg-white text-brand-blue shadow-sm' : 'text-gray-600'
              }`}
            >
              All
            </button>
            <button
              onClick={() => setViewMode('messages')}
              className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
                viewMode === 'messages' ? 'bg-white text-brand-blue shadow-sm' : 'text-gray-600'
              }`}
            >
              Messages
            </button>
            <button
              onClick={() => setViewMode('runs')}
              className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
                viewMode === 'runs' ? 'bg-white text-brand-blue shadow-sm' : 'text-gray-600'
              }`}
            >
              Runs
            </button>
          </div>
          <div className="text-sm text-gray-600">
            {messages.length} messages • {runs.length} runs
          </div>
        </div>
      </div>

      <div className="space-y-4">
        {/* Slack Messages */}
        {displayMessages.map((message) => (
          <div key={message.id} className="bg-white rounded-lg p-4 shadow hover:shadow-md transition-shadow border-l-4 border-purple-500">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-2">
                  <span className="text-lg">💬</span>
                  <h3 className="text-sm font-semibold text-gray-900">
                    Slack Message
                  </h3>
                  {message.isCommand && message.commandType && (
                    <span className="px-2 py-1 rounded-full text-xs font-semibold bg-purple-100 text-purple-800">
                      {message.commandType.replace('_', ' ')}
                    </span>
                  )}
                </div>
                <p className="text-gray-700 text-sm mb-2">{message.text}</p>
                <div className="flex items-center gap-3 text-xs text-gray-500">
                  <span>🕐 {formatDate(message.createdAt)}</span>
                  <a
                    href={getSlackPermalink(message.channelId, message.messageTs)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-brand-blue hover:text-blue-700 font-medium"
                  >
                    💬 View in Slack
                  </a>
                </div>
              </div>
            </div>
          </div>
        ))}

        {/* Orchestrator Runs */}
        {displayRuns.map((run) => (
          <div key={run.id} className="bg-white rounded-lg p-6 shadow hover:shadow-md transition-shadow">
            {/* Header */}
            <div className="flex items-start justify-between mb-3">
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-2">
                  <h3 className="text-lg font-semibold text-gray-900">
                    Run {run.runId.substring(0, 8)}
                  </h3>
                  <span className={`px-3 py-1 rounded-full text-xs font-semibold ${getStatusColor(run.status)}`}>
                    {run.status}
                  </span>
                </div>
                <div className="flex items-center gap-4 text-sm text-gray-600">
                  <span>📊 {run.findingsCount} findings</span>
                  <span>✅ {run.storiesCount} stories</span>
                  <span>🕐 {formatDate(run.startedAt)}</span>
                  {run.completedAt && (
                    <span className="text-green-600">
                      Completed {formatDate(run.completedAt)}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Conversation Details */}
            {run.conversation && (
              <div className="mt-4">
                <button
                  onClick={() => setSelectedRun(selectedRun === run.id ? null : run.id)}
                  className="text-sm text-brand-blue hover:underline font-medium"
                >
                  {selectedRun === run.id ? '▼ Hide conversation' : '▶ View conversation'}
                </button>

                {selectedRun === run.id && (
                  <div className="mt-3 p-4 bg-gray-50 rounded-lg max-h-96 overflow-y-auto">
                    <pre className="text-xs whitespace-pre-wrap font-mono">
                      {JSON.stringify(run.conversation, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
