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

import { featureFlags } from '@/lib/config/feature-flags';

// Placeholder data until state aggregation is implemented
const PLACEHOLDER_DATA = {
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
    { id: 'repo', label: 'Repository exists', complete: true },
    { id: 'domain', label: 'Domain configured', complete: true },
    { id: 'ssl', label: 'SSL certificate', complete: true },
    { id: 'analytics', label: 'Analytics installed', complete: false },
    { id: 'auth', label: 'Authentication working', complete: true },
    { id: 'payments', label: 'Payments configured', complete: false },
    { id: 'monitoring', label: 'Error monitoring', complete: false },
    { id: 'seo', label: 'SEO optimized', complete: false },
    { id: 'performance', label: 'Performance passing', complete: true },
    { id: 'security', label: 'Security scan passing', complete: false },
    { id: 'docs', label: 'Documentation complete', complete: false },
    { id: 'launch_plan', label: 'Launch plan defined', complete: false },
  ],
  recommendations: [
    'Set up PostHog or similar analytics to track user behavior',
    'Configure Stripe for payment processing before launch',
    'Add error monitoring with Sentry to catch production issues',
    'Complete security scan and address all critical issues',
  ],
};

function PlaceholderState() {
  return (
    <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6 mb-8">
      <div className="flex items-start gap-3">
        <span className="text-2xl">🚧</span>
        <div>
          <h3 className="font-semibold text-yellow-800">Feature Coming Soon</h3>
          <p className="text-sm text-yellow-700 mt-1">
            Launch Readiness tracking is being implemented. Enable the <code className="bg-yellow-100 px-1 rounded">LAUNCH_READINESS</code> feature flag to see live data.
          </p>
        </div>
      </div>
    </div>
  );
}

function StageTimeline({ stages }: { stages: typeof PLACEHOLDER_DATA.stages }) {
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

function LaunchChecklist({ items }: { items: typeof PLACEHOLDER_DATA.checklist }) {
  const completedCount = items.filter(i => i.complete).length;
  
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-gray-900">Launch Checklist</h2>
        <span className="text-sm text-gray-500">
          {completedCount}/{items.length} complete
        </span>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {items.map((item) => (
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
  );
}

function Recommendations({ items }: { items: string[] }) {
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

export default function ProgressPage() {
  const isEnabled = featureFlags.LAUNCH_READINESS;
  const data = PLACEHOLDER_DATA;

  return (
    <div className="max-w-4xl mx-auto px-6 py-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Progress</h1>
        <p className="text-gray-600 mt-1">
          Track your journey from idea to paying users
        </p>
      </div>

      {!isEnabled && <PlaceholderState />}

      <StageTimeline stages={data.stages} />
      <LaunchScore score={data.score} />
      <LaunchChecklist items={data.checklist} />
      <Recommendations items={data.recommendations} />
    </div>
  );
}
