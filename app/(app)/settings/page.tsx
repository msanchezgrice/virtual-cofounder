'use client';

import { useState } from 'react';
import { featureFlags } from '@/lib/config/feature-flags';

interface FeatureFlag {
  key: string;
  label: string;
  description: string;
  enabled: boolean;
}

export default function SettingsPage() {
  // Mock integrations - in real app, these would come from DB
  const [integrations] = useState([
    { 
      id: 'slack', 
      name: 'Slack', 
      icon: '💬', 
      connected: true, 
      status: 'Connected to #virtual-cofounder' 
    },
    { 
      id: 'linear', 
      name: 'Linear', 
      icon: '📋', 
      connected: true, 
      status: 'Team: VirtualCofounder' 
    },
    { 
      id: 'github', 
      name: 'GitHub', 
      icon: '🐙', 
      connected: true, 
      status: 'Org: msanchezgrice' 
    },
    { 
      id: 'vercel', 
      name: 'Vercel', 
      icon: '▲', 
      connected: true, 
      status: 'Team: miguel-grice' 
    },
    { 
      id: 'posthog', 
      name: 'PostHog', 
      icon: '📊', 
      connected: false, 
      status: 'Not connected' 
    },
    { 
      id: 'stripe', 
      name: 'Stripe', 
      icon: '💳', 
      connected: false, 
      status: 'Not connected' 
    },
  ]);

  // Feature flags from config
  const flags: FeatureFlag[] = [
    {
      key: 'AGENT_SDK_ENABLED',
      label: 'Agent SDK',
      description: 'Use Claude Agent SDK for multi-turn agent execution',
      enabled: featureFlags.AGENT_SDK_ENABLED,
    },
    {
      key: 'PRIORITY_SYSTEM_ENABLED',
      label: 'Priority System',
      description: 'Enable P0-P3 priority classification and stack ranking',
      enabled: featureFlags.PRIORITY_SYSTEM_ENABLED,
    },
    {
      key: 'PARALLEL_EXECUTION_ENABLED',
      label: 'Parallel Execution',
      description: 'Run multiple agent subprocesses concurrently',
      enabled: featureFlags.PARALLEL_EXECUTION_ENABLED,
    },
    {
      key: 'LAUNCH_READINESS',
      label: 'Launch Readiness',
      description: 'Show launch readiness tracking dashboard',
      enabled: featureFlags.LAUNCH_READINESS,
    },
    {
      key: 'STATE_AGENT_ENABLED',
      label: 'State Manager Agent',
      description: 'Use AI to aggregate and analyze project state',
      enabled: featureFlags.STATE_AGENT_ENABLED,
    },
  ];

  const [limits, setLimits] = useState({
    maxConcurrentAgents: 3,
    maxIterationsPerRun: 10,
    dailyTokenBudget: 1000000,
    maxStoriesPerProject: 50,
  });

  return (
    <div className="app-page" style={{ maxWidth: '900px' }}>
      {/* Header */}
      <div className="page-header" style={{ marginBottom: '32px' }}>
        <div>
          <h1 className="page-title">⚙️ Settings</h1>
          <p className="page-subtitle">
            Manage integrations, feature flags, and system limits
          </p>
        </div>
      </div>

      {/* Integrations */}
      <section style={{ marginBottom: '40px' }}>
        <h2 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '16px' }}>Integrations</h2>
        <div className="responsive-grid responsive-grid-2">
          {integrations.map((integration) => (
            <div
              key={integration.id}
              className="bg-white border border-gray-200 rounded-lg p-4 flex items-center justify-between"
            >
              <div className="flex items-center gap-3">
                <span className="text-2xl">{integration.icon}</span>
                <div>
                  <h3 className="font-medium text-gray-900">{integration.name}</h3>
                  <p className="text-sm text-gray-500">{integration.status}</p>
                </div>
              </div>
              <span
                className={`px-2.5 py-1 text-xs font-medium rounded-full ${
                  integration.connected
                    ? 'bg-green-100 text-green-700'
                    : 'bg-gray-100 text-gray-600'
                }`}
              >
                {integration.connected ? 'Connected' : 'Connect'}
              </span>
            </div>
          ))}
        </div>
      </section>

      {/* Feature Flags */}
      <section style={{ marginBottom: '40px' }}>
        <h2 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '16px' }}>Feature Flags</h2>
        <div className="bg-white border border-gray-200 rounded-lg divide-y divide-gray-100">
          {flags.map((flag) => (
            <div key={flag.key} className="p-4 flex items-center justify-between">
              <div>
                <h3 className="font-medium text-gray-900">{flag.label}</h3>
                <p className="text-sm text-gray-500">{flag.description}</p>
              </div>
              <div className="flex items-center gap-3">
                <span
                  className={`text-xs font-mono px-2 py-0.5 rounded ${
                    flag.enabled
                      ? 'bg-green-100 text-green-700'
                      : 'bg-gray-100 text-gray-600'
                  }`}
                >
                  {flag.enabled ? 'ON' : 'OFF'}
                </span>
                <code className="text-xs text-gray-400">{flag.key}</code>
              </div>
            </div>
          ))}
        </div>
        <p className="text-xs text-gray-400 mt-2">
          Feature flags are configured via environment variables. Restart the server to apply changes.
        </p>
      </section>

      {/* Limits & Constraints */}
      <section style={{ marginBottom: '40px' }}>
        <h2 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '16px' }}>Limits & Constraints</h2>
        <div className="card" style={{ padding: '20px' }}>
          <div className="responsive-grid responsive-grid-2" style={{ marginBottom: '20px' }}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Max Concurrent Agents
              </label>
              <input
                type="number"
                value={limits.maxConcurrentAgents}
                onChange={(e) =>
                  setLimits({ ...limits, maxConcurrentAgents: parseInt(e.target.value) })
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                min={1}
                max={10}
              />
              <p className="text-xs text-gray-400 mt-1">
                How many agents can run in parallel
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Max Iterations per Run
              </label>
              <input
                type="number"
                value={limits.maxIterationsPerRun}
                onChange={(e) =>
                  setLimits({ ...limits, maxIterationsPerRun: parseInt(e.target.value) })
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                min={1}
                max={50}
              />
              <p className="text-xs text-gray-400 mt-1">
                Safety limit for agent thinking loops
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Daily Token Budget
              </label>
              <input
                type="number"
                value={limits.dailyTokenBudget}
                onChange={(e) =>
                  setLimits({ ...limits, dailyTokenBudget: parseInt(e.target.value) })
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                min={10000}
                step={100000}
              />
              <p className="text-xs text-gray-400 mt-1">
                Maximum tokens to spend per day
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Max Stories per Project
              </label>
              <input
                type="number"
                value={limits.maxStoriesPerProject}
                onChange={(e) =>
                  setLimits({ ...limits, maxStoriesPerProject: parseInt(e.target.value) })
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                min={10}
                max={500}
              />
              <p className="text-xs text-gray-400 mt-1">
                WIP limit for pending stories
              </p>
            </div>
          </div>
          <div className="pt-4 border-t border-gray-100">
            <button
              onClick={() => alert('Settings saved! (demo)')}
              className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700"
            >
              Save Limits
            </button>
          </div>
        </div>
      </section>

      {/* Danger Zone */}
      <section style={{ marginBottom: '40px' }}>
        <h2 style={{ fontSize: '18px', fontWeight: 600, color: '#DC2626', marginBottom: '16px' }}>Danger Zone</h2>
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-medium text-gray-900">Reset All Data</h3>
              <p className="text-sm text-gray-500">
                Clear all scans, stories, and orchestrator history
              </p>
            </div>
            <button className="px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-md hover:bg-red-700">
              Reset
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
