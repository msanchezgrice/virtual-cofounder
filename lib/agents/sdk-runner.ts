/**
 * Agent SDK Runner
 * 
 * Uses @anthropic-ai/claude-agent-sdk for running agents with built-in tools.
 * This provides multi-turn agent execution with Read, Write, Edit, Bash, etc.
 * 
 * Feature flag: AGENT_SDK_ENABLED
 */

import { featureFlags } from '@/lib/config/feature-flags';
import { AgentDefinition as AppAgentDefinition, getAgentDefinition, agentRegistry } from './index';
import { prisma } from '@/lib/db';
import Anthropic from '@anthropic-ai/sdk';
import {
  query,
  type Options as SDKOptions,
  type SDKMessage,
  type AgentDefinition as SDKAgentDefinition,
} from '@anthropic-ai/claude-agent-sdk';

// Session types for our database
interface AgentSessionData {
  id: string;
  agent: AppAgentDefinition;
  messages: Array<{ role: string; content: string }>;
  toolCalls: Array<{ tool: string; input: unknown; output: unknown; duration: number }>;
  tokensUsed: number;
  status: 'running' | 'completed' | 'failed' | 'cancelled';
}

interface RunResult {
  success: boolean;
  output: string;
  session: AgentSessionData;
  findings?: AgentFinding[];
}

interface AgentFinding {
  issue: string;
  action: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  effort: 'low' | 'medium' | 'high';
  impact: 'high' | 'medium' | 'low';
  confidence: number;
}

// Standard Anthropic SDK client (for fallback)
const anthropic = new Anthropic();

// Token costs for estimation (per 1K tokens)
const TOKEN_COSTS = {
  'claude-opus-4-5-20251101': { input: 0.015, output: 0.075 },
  'claude-sonnet-4-5-20250929': { input: 0.003, output: 0.015 },
};

// Map our model names to SDK model identifiers
const MODEL_MAP: Record<string, 'opus' | 'sonnet' | 'haiku'> = {
  'claude-opus-4-5-20251101': 'opus',
  'claude-sonnet-4-5-20250929': 'sonnet',
};

// Map our tool names to SDK tool names
const TOOL_MAP: Record<string, string> = {
  'Read': 'Read',
  'Write': 'Write',
  'Edit': 'Edit',
  'Bash': 'Bash',
  'Glob': 'Glob',
  'Grep': 'Grep',
  'WebSearch': 'WebSearch',
  'WebFetch': 'WebFetch',
  'AskUser': 'AskUser',
  'SQL': 'Bash', // SQL runs through bash
};

/**
 * Convert our agent definitions to SDK format for subagent spawning.
 * 
 * All agents except head-of-product can be spawned as subagents.
 * The canSpawnSubagents flag indicates whether an agent can SPAWN others,
 * not whether it CAN BE spawned.
 */
function convertToSDKAgents(): Record<string, SDKAgentDefinition> {
  const sdkAgents: Record<string, SDKAgentDefinition> = {};
  
  // head-of-product is the orchestrator and cannot be spawned as a subagent
  const NON_SPAWNABLE_ROLES = ['head-of-product'];
  
  for (const [role, agent] of Object.entries(agentRegistry)) {
    if (!NON_SPAWNABLE_ROLES.includes(role)) {
      sdkAgents[role] = {
        description: `${agent.name}: ${agent.description || agent.role}`,
        prompt: agent.prompt,
        model: MODEL_MAP[agent.model] || 'sonnet',
        tools: agent.tools.map(t => TOOL_MAP[t] || t).filter(Boolean),
      };
    }
  }
  
  console.log(`[SDK Runner] Converted ${Object.keys(sdkAgents).length} agents to SDK format`);
  
  return sdkAgents;
}

/**
 * Run an agent using the actual Claude Agent SDK
 */
export async function runAgentWithSDK(
  role: string,
  context: string,
  options: {
    projectId?: string;
    storyId?: string;
    orchestratorRunId?: string;
    maxTurns?: number;
    workingDirectory?: string;
  } = {}
): Promise<RunResult> {
  const agent = getAgentDefinition(role);
  if (!agent) {
    throw new Error(`Unknown agent role: ${role}`);
  }

  // If SDK is disabled, use legacy fallback
  if (!featureFlags.AGENT_SDK_ENABLED) {
    return runAgentLegacy(agent, context, options);
  }

  // Create agent session record
  const session = await prisma.agentSession.create({
    data: {
      orchestratorRunId: options.orchestratorRunId,
      storyId: options.storyId,
      projectId: options.projectId,
      agentName: agent.name,
      agentType: agent.type,
      status: 'running',
      thinkingTrace: [],
      toolCalls: [],
    },
  });

  try {
    // Build SDK options
    const sdkOptions: SDKOptions = {
      // Allow all tools for this agent
      tools: agent.tools.map(t => TOOL_MAP[t] || t).filter(Boolean) as string[],
      allowedTools: agent.tools.map(t => TOOL_MAP[t] || t).filter(Boolean) as string[],
      
      // Set working directory if provided
      cwd: options.workingDirectory || process.cwd(),
      
      // Max turns
      maxTurns: options.maxTurns ?? agent.maxTurns,
      
      // Define all available subagents
      agents: agent.canSpawnSubagents ? convertToSDKAgents() : undefined,
      
      // Don't persist SDK sessions (we handle our own)
      persistSession: false,
      
      // Include partial messages for streaming
      includePartialMessages: true,
      
      // Environment variables
      env: {
        ...process.env,
        ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
      },
    };

    // Build the full prompt with system instructions and context
    const fullPrompt = `${agent.prompt}\n\n---\n\nContext:\n${context}`;

    // Run the agent using the SDK
    const result = await runAgentWithRealSDK(fullPrompt, sdkOptions, session.id);

    // Update session with results
    await prisma.agentSession.update({
      where: { id: session.id },
      data: {
        status: 'completed',
        thinkingTrace: result.thinkingTrace as object[],
        toolCalls: result.toolCalls as object[],
        tokensUsed: result.tokensUsed,
        estimatedCost: result.costUSD,
        turnsUsed: result.turnsUsed,
        completedAt: new Date(),
      },
    });

    return {
      success: true,
      output: result.output,
      session: {
        id: session.id,
        agent,
        messages: result.messages,
        toolCalls: result.toolCalls,
        tokensUsed: result.tokensUsed,
        status: 'completed',
      },
      findings: result.findings,
    };

  } catch (error) {
    // Update session with error
    await prisma.agentSession.update({
      where: { id: session.id },
      data: {
        status: 'failed',
        completedAt: new Date(),
      },
    });

    throw error;
  }
}

/**
 * Run agent using the actual Claude Agent SDK
 */
async function runAgentWithRealSDK(
  prompt: string,
  options: SDKOptions,
  sessionId: string
): Promise<{
  output: string;
  messages: Array<{ role: string; content: string }>;
  thinkingTrace: Array<{ turn: number; thinking: string; action: string }>;
  toolCalls: Array<{ tool: string; input: unknown; output: unknown; duration: number }>;
  tokensUsed: number;
  turnsUsed: number;
  costUSD: number;
  findings?: AgentFinding[];
}> {
  const messages: Array<{ role: string; content: string }> = [];
  const thinkingTrace: Array<{ turn: number; thinking: string; action: string }> = [];
  const toolCalls: Array<{ tool: string; input: unknown; output: unknown; duration: number }> = [];
  let tokensUsed = 0;
  let turnsUsed = 0;
  let costUSD = 0;
  let finalOutput = '';

  try {
    // Create the query
    const agentQuery = query({
      prompt,
      options,
    });

    // Process all messages from the stream
    for await (const message of agentQuery) {
      processSDKMessage(message, {
        messages,
        thinkingTrace,
        toolCalls,
        turnsUsed,
        onOutput: (text) => { finalOutput = text; },
        onTokens: (tokens, cost) => { tokensUsed += tokens; costUSD += cost; },
        onTurn: () => { turnsUsed++; },
      });
    }

  } catch (error) {
    console.error('[SDK Runner] Error running agent:', error);
    throw error;
  }

  // Parse findings from the final output
  const findings = parseFindingsFromResponse(finalOutput);

  return {
    output: finalOutput,
    messages,
    thinkingTrace,
    toolCalls,
    tokensUsed,
    turnsUsed,
    costUSD,
    findings,
  };
}

/**
 * Process SDK message and update tracking data
 */
function processSDKMessage(
  message: SDKMessage,
  context: {
    messages: Array<{ role: string; content: string }>;
    thinkingTrace: Array<{ turn: number; thinking: string; action: string }>;
    toolCalls: Array<{ tool: string; input: unknown; output: unknown; duration: number }>;
    turnsUsed: number;
    onOutput: (text: string) => void;
    onTokens: (tokens: number, cost: number) => void;
    onTurn: () => void;
  }
) {
  switch (message.type) {
    case 'user':
      // User message - extract content
      const userMsg = message as { type: 'user'; message?: { content?: unknown } };
      context.messages.push({ role: 'user', content: String(userMsg.message?.content || '') });
      break;

    case 'assistant':
      // Assistant message - extract text content
      const assistantMsg = message as { type: 'assistant'; message?: { content?: Array<{ type: string; text?: string }> } };
      const msgContent = assistantMsg.message?.content;
      if (Array.isArray(msgContent)) {
        const textParts = msgContent.filter((c) => c.type === 'text');
        const text = textParts.map((t) => t.text || '').join('');
        context.messages.push({ role: 'assistant', content: text });
        context.onOutput(text);
      }
      break;

    case 'result':
      // Final result with usage stats
      const resultMsg = message as { 
        type: 'result'; 
        subtype?: string;
        usage?: { inputTokens?: number; outputTokens?: number };
        total_cost_usd?: number;
        result?: string;
      };
      if (resultMsg.usage) {
        const usage = resultMsg.usage;
        const tokens = (usage.inputTokens || 0) + (usage.outputTokens || 0);
        context.onTokens(tokens, resultMsg.total_cost_usd || 0);
      }
      // Only SDKResultSuccess has result
      if (resultMsg.subtype === 'success' && resultMsg.result) {
        context.onOutput(String(resultMsg.result));
      }
      break;

    case 'tool_progress':
      // Tool progress - track tool calls
      const toolMsg = message as { 
        type: 'tool_progress'; 
        tool_name?: string;
        tool_input?: unknown;
        tool_output?: unknown;
      };
      if (toolMsg.tool_name) {
        context.toolCalls.push({
          tool: toolMsg.tool_name,
          input: toolMsg.tool_input,
          output: toolMsg.tool_output,
          duration: 0,
        });
        context.thinkingTrace.push({
          turn: context.turnsUsed + 1,
          thinking: `Using tool: ${toolMsg.tool_name}`,
          action: 'tool_use',
        });
      }
      break;

    default:
      // Handle other message types (partial messages, system, etc.)
      break;
  }
}

/**
 * Legacy agent execution (single turn, no tools)
 * Used when AGENT_SDK_ENABLED is false
 */
async function runAgentLegacy(
  agent: AppAgentDefinition,
  context: string,
  options: {
    projectId?: string;
    storyId?: string;
    orchestratorRunId?: string;
  }
): Promise<RunResult> {
  const response = await anthropic.messages.create({
    model: agent.model,
    max_tokens: 2048,
    system: agent.prompt,
    messages: [{ role: 'user', content: context }],
  });

  const textContent = response.content.find(c => c.type === 'text');
  const output = textContent?.type === 'text' ? textContent.text : '';
  const tokensUsed = response.usage.input_tokens + response.usage.output_tokens;

  return {
    success: true,
    output,
    session: {
      id: 'legacy-' + Date.now(),
      agent,
      messages: [
        { role: 'user', content: context },
        { role: 'assistant', content: output },
      ],
      toolCalls: [],
      tokensUsed,
      status: 'completed',
    },
    findings: parseFindingsFromResponse(output),
  };
}

/**
 * Parse agent findings from response text
 */
function parseFindingsFromResponse(text: string): AgentFinding[] | undefined {
  try {
    // Try to find JSON in the response
    const jsonMatch = text.match(/\{[\s\S]*"findings"[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      if (Array.isArray(parsed.findings)) {
        return parsed.findings;
      }
    }
    return undefined;
  } catch {
    return undefined;
  }
}

/**
 * Estimate cost based on tokens and model
 */
function estimateCost(model: AppAgentDefinition['model'], tokens: number): number {
  const costs = TOKEN_COSTS[model];
  // Rough split: 70% input, 30% output
  const inputTokens = tokens * 0.7;
  const outputTokens = tokens * 0.3;
  return (inputTokens / 1000 * costs.input) + (outputTokens / 1000 * costs.output);
}

/**
 * Spawn a subagent from a parent agent
 */
export async function spawnSubagent(
  parentSessionId: string,
  role: string,
  context: string,
  options: {
    projectId?: string;
    storyId?: string;
    orchestratorRunId?: string;
    workingDirectory?: string;
  } = {}
): Promise<RunResult> {
  // Get parent session to link
  const parentSession = await prisma.agentSession.findUnique({
    where: { id: parentSessionId },
  });

  if (!parentSession) {
    throw new Error(`Parent session not found: ${parentSessionId}`);
  }

  // Run the subagent
  return runAgentWithSDK(role, context, {
    ...options,
    orchestratorRunId: parentSession.orchestratorRunId ?? options.orchestratorRunId,
    projectId: parentSession.projectId ?? options.projectId,
  });
}

/**
 * Run a one-shot prompt using the SDK (for simple queries)
 */
export async function runPrompt(
  prompt: string,
  options: {
    tools?: string[];
    maxTurns?: number;
    workingDirectory?: string;
  } = {}
): Promise<string> {
  if (!featureFlags.AGENT_SDK_ENABLED) {
    // Fallback to standard API
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 2048,
      messages: [{ role: 'user', content: prompt }],
    });
    const textContent = response.content.find(c => c.type === 'text');
    return textContent?.type === 'text' ? textContent.text : '';
  }

  const sdkOptions: SDKOptions = {
    tools: options.tools || ['Read', 'Grep', 'Glob'],
    allowedTools: options.tools || ['Read', 'Grep', 'Glob'],
    cwd: options.workingDirectory || process.cwd(),
    maxTurns: options.maxTurns || 5,
    persistSession: false,
  };

  let output = '';
  const agentQuery = query({ prompt, options: sdkOptions });

  for await (const message of agentQuery) {
    if (message.type === 'result') {
      const resultMsg = message as { type: 'result'; subtype?: string; result?: string };
      if (resultMsg.subtype === 'success' && resultMsg.result) {
        output = String(resultMsg.result);
      }
    } else if (message.type === 'assistant') {
      const assistantMsg = message as { type: 'assistant'; message?: { content?: Array<{ type: string; text?: string }> } };
      const assistantContent = assistantMsg.message?.content;
      if (Array.isArray(assistantContent)) {
        const textParts = assistantContent.filter((c) => c.type === 'text');
        output = textParts.map((t) => t.text || '').join('');
      }
    }
  }

  return output;
}
