/**
 * Feature Flags for Agent SDK Integration
 * 
 * These flags control the rollout of new Agent SDK features.
 * All new features are disabled by default for safety.
 * 
 * Environment variables:
 * - AGENT_SDK_ENABLED: Enable Agent SDK orchestrator (replaces manual orchestration)
 * - STATE_AGENT_ENABLED: Enable State Manager agent for project snapshots
 * - MULTI_SOURCE_APPROVAL: Enable approval from Linear, Slack, and Dashboard
 * - LAUNCH_READINESS: Enable launch score and Progress page features
 */

export const featureFlags = {
  /**
   * Enable Agent SDK orchestrator
   * When true: Uses Claude Agent SDK for multi-turn agent loops
   * When false: Uses legacy @anthropic-ai/sdk direct calls
   */
  AGENT_SDK_ENABLED: process.env.AGENT_SDK_ENABLED === 'true',

  /**
   * Enable State Manager agent
   * When true: Generates daily project snapshots with AI assessment
   * When false: No project state tracking
   */
  STATE_AGENT_ENABLED: process.env.STATE_AGENT_ENABLED === 'true',

  /**
   * Enable multi-source approval
   * When true: Stories can be approved from Linear status, Slack, or Dashboard
   * When false: Only Slack approval works
   */
  MULTI_SOURCE_APPROVAL: process.env.MULTI_SOURCE_APPROVAL === 'true',

  /**
   * Enable launch readiness features
   * When true: Shows Progress page, launch score, and stage timeline
   * When false: Progress page shows placeholder
   */
  LAUNCH_READINESS: process.env.LAUNCH_READINESS === 'true',

  /**
   * Enable parallel execution
   * When true: Multiple stories can be executed concurrently
   * When false: Stories execute sequentially (safer for testing)
   */
  PARALLEL_EXECUTION_ENABLED: process.env.PARALLEL_EXECUTION_ENABLED === 'true',

  /**
   * Enable native chat
   * When true: In-app chat with orchestrator (future)
   * When false: Slack-only communication
   */
  NATIVE_CHAT_ENABLED: process.env.NATIVE_CHAT_ENABLED === 'true',

  /**
   * Enable priority system
   * When true: Uses P0-P3 priority with scoring
   * When false: Uses legacy high/medium/low
   */
  PRIORITY_SYSTEM_ENABLED: process.env.PRIORITY_SYSTEM_ENABLED === 'true',
} as const;

/**
 * Check if a feature is enabled
 */
export function isFeatureEnabled(feature: keyof typeof featureFlags): boolean {
  return featureFlags[feature];
}

/**
 * Get all feature flag values (for debugging/admin UI)
 */
export function getAllFeatureFlags(): Record<string, boolean> {
  return { ...featureFlags };
}

/**
 * Type-safe feature flag guard
 * Usage: if (withFeatureFlag('AGENT_SDK_ENABLED')) { ... }
 */
export function withFeatureFlag<T>(
  feature: keyof typeof featureFlags,
  enabledValue: T,
  disabledValue: T
): T {
  return featureFlags[feature] ? enabledValue : disabledValue;
}
