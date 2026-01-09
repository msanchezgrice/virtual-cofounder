/**
 * @deprecated This file is deprecated. Use lib/agents/index.ts instead.
 * 
 * The new agent registry at lib/agents/index.ts includes:
 * - 17 agents (vs 5 here)
 * - Tool definitions for Agent SDK
 * - Subagent spawning capability
 * - Type-safe definitions
 * 
 * Import from '@/lib/agents/index' instead.
 */

// Re-export from new location for backwards compatibility
export { 
  agentRegistry as newAgents,
  getAgentDefinition,
  getAllAgentRoles,
  type AgentDefinition as AgentConfig,
} from './agents/index';

// Legacy interface - kept for backwards compatibility
export interface LegacyAgentConfig {
  name: string;
  role: string;
  model: 'claude-opus-4-5-20251101' | 'claude-sonnet-4-5-20250929';
  instructions: string;
}

// Legacy exports removed - now using lib/agents/index.ts
// See the re-exports above for backwards compatibility
