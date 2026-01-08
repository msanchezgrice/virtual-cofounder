/**
 * Agent SDK Runner
 * 
 * Wrapper around @anthropic-ai/claude-agent-sdk for running agents.
 * This provides the actual SDK integration for multi-turn agent execution.
 * 
 * Feature flag: AGENT_SDK_ENABLED
 */

import { featureFlags } from '@/lib/config/feature-flags';
import { AgentDefinition, getAgentDefinition } from './index';
import { prisma } from '@/lib/db';
import Anthropic from '@anthropic-ai/sdk';

// SDK types (from @anthropic-ai/claude-agent-sdk)
// Note: Import actual types when SDK typings are available
interface AgentSession {
  id: string;
  agent: AgentDefinition;
  messages: Array<{ role: string; content: string }>;
  toolCalls: Array<{ tool: string; input: unknown; output: unknown; duration: number }>;
  tokensUsed: number;
  status: 'running' | 'completed' | 'failed' | 'cancelled';
}

interface RunResult {
  success: boolean;
  output: string;
  session: AgentSession;
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

/**
 * Run an agent using the Agent SDK
 */
export async function runAgentWithSDK(
  role: string,
  context: string,
  options: {
    projectId?: string;
    storyId?: string;
    orchestratorRunId?: string;
    maxTurns?: number;
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
    // Run agent with SDK
    // Note: This is the actual SDK integration point
    // When SDK is stable, replace with:
    // const result = await AgentSDK.run({ agent, context, maxTurns: options.maxTurns ?? agent.maxTurns });
    
    const result = await runAgentLoop(agent, context, {
      ...options,
      sessionId: session.id,
      maxTurns: options.maxTurns ?? agent.maxTurns,
    });

    // Update session with results
    await prisma.agentSession.update({
      where: { id: session.id },
      data: {
        status: 'completed',
        thinkingTrace: result.thinkingTrace as object[],
        toolCalls: result.toolCalls as object[],
        tokensUsed: result.tokensUsed,
        estimatedCost: estimateCost(agent.model, result.tokensUsed),
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
 * Multi-turn agent loop using standard Anthropic SDK
 * This implements the agentic loop pattern until the official SDK is stable
 */
async function runAgentLoop(
  agent: AgentDefinition,
  context: string,
  options: {
    sessionId: string;
    maxTurns: number;
    projectId?: string;
  }
): Promise<{
  output: string;
  messages: Array<{ role: string; content: string }>;
  thinkingTrace: Array<{ turn: number; thinking: string; action: string }>;
  toolCalls: Array<{ tool: string; input: unknown; output: unknown; duration: number }>;
  tokensUsed: number;
  turnsUsed: number;
  findings?: AgentFinding[];
}> {
  const messages: Array<{ role: 'user' | 'assistant'; content: string }> = [
    { role: 'user', content: context },
  ];
  const thinkingTrace: Array<{ turn: number; thinking: string; action: string }> = [];
  const toolCalls: Array<{ tool: string; input: unknown; output: unknown; duration: number }> = [];
  let tokensUsed = 0;
  let turnsUsed = 0;

  for (let turn = 0; turn < options.maxTurns; turn++) {
    turnsUsed++;

    // Call Claude
    const response = await anthropic.messages.create({
      model: agent.model,
      max_tokens: 4096,
      system: agent.prompt,
      messages,
    });

    // Track tokens
    tokensUsed += response.usage.input_tokens + response.usage.output_tokens;

    // Extract response text
    const textContent = response.content.find(c => c.type === 'text');
    const responseText = textContent?.type === 'text' ? textContent.text : '';

    messages.push({ role: 'assistant', content: responseText });

    // Record thinking
    thinkingTrace.push({
      turn: turn + 1,
      thinking: responseText.slice(0, 500),
      action: response.stop_reason ?? 'continue',
    });

    // Check if agent is done (no tool use, just response)
    if (response.stop_reason === 'end_turn') {
      // Try to parse findings from response
      const findings = parseFindingsFromResponse(responseText);
      
      return {
        output: responseText,
        messages: messages.map(m => ({ role: m.role, content: m.content })),
        thinkingTrace,
        toolCalls,
        tokensUsed,
        turnsUsed,
        findings,
      };
    }

    // Note: Tool execution would happen here when tools are implemented
    // For now, we just complete after the first turn for analysis agents
    if (agent.type === 'ops') {
      const findings = parseFindingsFromResponse(responseText);
      return {
        output: responseText,
        messages: messages.map(m => ({ role: m.role, content: m.content })),
        thinkingTrace,
        toolCalls,
        tokensUsed,
        turnsUsed,
        findings,
      };
    }
  }

  // Max turns reached
  const lastMessage = messages[messages.length - 1];
  return {
    output: lastMessage?.content ?? '',
    messages: messages.map(m => ({ role: m.role, content: m.content })),
    thinkingTrace,
    toolCalls,
    tokensUsed,
    turnsUsed,
  };
}

/**
 * Legacy agent execution (single turn, no tools)
 * Used when AGENT_SDK_ENABLED is false
 */
async function runAgentLegacy(
  agent: AgentDefinition,
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
function estimateCost(model: AgentDefinition['model'], tokens: number): number {
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
