/**
 * Head of Product Orchestrator - Agent SDK Version
 * 
 * This orchestrator uses the Claude Agent SDK to coordinate specialist agents.
 * Key improvements over legacy:
 * - Multi-turn agent execution with tool use
 * - AUTONOMOUS subagent spawning via SDK's Task tool
 * - Automatic thinking trace capture
 * - Priority signal integration
 * - Cost tracking and estimation
 * 
 * Feature flag: AGENT_SDK_ENABLED
 */

import { featureFlags } from '@/lib/config/feature-flags';
import { prisma } from '@/lib/db';
import { 
  agentRegistry, 
  headOfProductAgent, 
  getAgentDefinition,
  type AgentDefinition 
} from '@/lib/agents/index';
import { runAgentWithSDK, spawnSubagent } from '@/lib/agents/sdk-runner';
import {
  query,
  type Options as SDKOptions,
  type SDKMessage,
  type AgentDefinition as SDKAgentDefinition,
} from '@anthropic-ai/claude-agent-sdk';
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic();

// ============================================================================
// SDK AGENT CONVERSION
// ============================================================================

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
};

/**
 * Convert our agent definitions to SDK format for subagent spawning
 * 
 * Per MASTER-SPEC.md Section 5 - Agent Registry, we have 17 total agents:
 * - 1 meta-agent (Head of Product) - the orchestrator itself
 * - 16 specialist agents that can be spawned
 * 
 * Spawnable agents by type:
 * - Analysis/Ops: state-manager, analytics, research
 * - Infrastructure: security, domain, deployment, performance, accessibility, database
 * - Code: codegen, test, review, api
 * - Content: seo, design, copy, docs
 */
function convertToSDKAgents(): Record<string, SDKAgentDefinition> {
  const sdkAgents: Record<string, SDKAgentDefinition> = {};
  
  // All agents except head-of-product can be spawned as subagents
  const NON_SPAWNABLE_ROLES = ['head-of-product']; 
  
  for (const [role, agent] of Object.entries(agentRegistry)) {
    if (!NON_SPAWNABLE_ROLES.includes(role)) {
      const sdkTools = agent.tools
        .map(t => TOOL_MAP[t])
        .filter(Boolean) as string[];
      
      sdkAgents[role] = {
        description: `${agent.name}: ${agent.description || agent.role}`,
        prompt: agent.prompt,
        model: MODEL_MAP[agent.model] || 'sonnet',
        tools: sdkTools.length > 0 ? sdkTools : ['Read', 'Grep'],
      };
    }
  }
  
  console.log(`[Orchestrator] Registered ${Object.keys(sdkAgents).length} spawnable agents: ${Object.keys(sdkAgents).join(', ')}`);
  
  return sdkAgents;
}

// ============================================================================
// TYPES
// ============================================================================

export interface ScanContext {
  project: {
    id: string;
    name: string;
    domain: string | null;
    status: string;
    repoUrl?: string | null;
  };
  scans: {
    domain?: any;
    seo?: any;
    analytics?: any;
    security?: any;
    performance?: any;
  };
  prioritySignals?: PrioritySignal[];
}

export interface PrioritySignal {
  source: 'slack' | 'linear' | 'dashboard' | 'orchestrator';
  priorityLevel: 'P0' | 'P1' | 'P2' | 'P3';
  rawContent: string;
  metadata?: Record<string, any>;
}

export interface AgentFinding {
  agent: string;
  projectId: string;
  issue: string;
  action: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  effort: 'low' | 'medium' | 'high';
  impact: 'high' | 'medium' | 'low';
  confidence: number;
  rank?: number;
  priorityScore?: number;
  priorityLevel?: 'P0' | 'P1' | 'P2' | 'P3';
}

export interface Story {
  projectId: string;
  title: string;
  rationale: string;
  priority: 'high' | 'medium' | 'low';
  policy: 'auto_safe' | 'approval_required' | 'suggest_only';
  priorityLevel: 'P0' | 'P1' | 'P2' | 'P3';
  priorityScore: number;
  advancesLaunchStage: boolean;
}

export interface OrchestratorResult {
  runId: string;
  findings: AgentFinding[];
  stories: Story[];
  conversation: string[];
  agentsSpawned: string[];
  totalTokens: number;
  estimatedCost: number;
}

// ============================================================================
// PRIORITY SCORING
// ============================================================================

const PRIORITY_WEIGHTS = {
  // Factor weights (must sum to 100)
  impact: 40,      // How much does this affect users/revenue?
  urgency: 30,     // Time-sensitive (security, downtime)?
  effort: 20,      // Prefer quick wins
  confidence: 10,  // How sure are we?
};

const SEVERITY_SCORES: Record<string, number> = {
  critical: 100,
  high: 75,
  medium: 50,
  low: 25,
};

const IMPACT_SCORES: Record<string, number> = {
  high: 100,
  medium: 60,
  low: 30,
};

const EFFORT_SCORES: Record<string, number> = {
  low: 100,    // Quick wins get bonus
  medium: 50,
  high: 25,
};

/**
 * Calculate priority score (0-100) for a finding
 */
function calculatePriorityScore(finding: AgentFinding, userPriority?: PrioritySignal): number {
  // User priorities always override
  if (userPriority) {
    const userScores: Record<string, number> = {
      'P0': 100,
      'P1': 85,
      'P2': 60,
      'P3': 35,
    };
    return userScores[userPriority.priorityLevel] ?? 50;
  }

  // Calculate score from finding attributes
  const urgencyScore = SEVERITY_SCORES[finding.severity] ?? 50;
  const impactScore = IMPACT_SCORES[finding.impact] ?? 50;
  const effortScore = EFFORT_SCORES[finding.effort] ?? 50;
  const confidenceScore = (finding.confidence ?? 0.8) * 100;

  const weightedScore = 
    (impactScore * PRIORITY_WEIGHTS.impact / 100) +
    (urgencyScore * PRIORITY_WEIGHTS.urgency / 100) +
    (effortScore * PRIORITY_WEIGHTS.effort / 100) +
    (confidenceScore * PRIORITY_WEIGHTS.confidence / 100);

  return Math.round(weightedScore);
}

/**
 * Convert score to priority level
 */
function scoreToPriorityLevel(score: number): 'P0' | 'P1' | 'P2' | 'P3' {
  if (score >= 85) return 'P0';
  if (score >= 65) return 'P1';
  if (score >= 40) return 'P2';
  return 'P3';
}

// ============================================================================
// AGENT SELECTION LOGIC
// ============================================================================

/**
 * Determine which agents should analyze a project based on scan data and project state.
 * Per MASTER-SPEC.md, we have 16 spawnable agents. Select relevant ones based on project state.
 */
function getRelevantAgents(scanContext: ScanContext): string[] {
  const agents: string[] = [];
  const { project } = scanContext;
  const isActive = project.status.includes('ACTIVE');
  const isPreLaunch = project.status.includes('Pre-Launch');
  const hasDomain = !!project.domain;
  const hasRepo = !!project.repoUrl;

  // INFRASTRUCTURE AGENTS
  
  // Security - always run for projects with repos or active
  if (hasRepo || isActive) {
    agents.push('security');
  }

  // Domain - run if project has a domain
  if (hasDomain) {
    agents.push('domain');
  }

  // Deployment - run for deployed projects
  if (hasDomain) {
    agents.push('deployment');
  }

  // Performance - run for active deployed projects
  if (hasDomain && isActive) {
    agents.push('performance');
  }

  // Accessibility - run for active deployed projects
  if (hasDomain && isActive) {
    agents.push('accessibility');
  }

  // Database - run if project has repo (likely has db)
  if (hasRepo && isActive) {
    agents.push('database');
  }

  // ANALYSIS & OPS AGENTS
  
  // Analytics - critical for pre-launch and active
  if (isActive || isPreLaunch) {
    agents.push('analytics');
  }

  // Research - run periodically for growth projects
  if (project.status.includes('Growth')) {
    agents.push('research');
  }

  // CONTENT AGENTS
  
  // SEO - run if project has domain
  if (hasDomain) {
    agents.push('seo');
  }

  // Docs - run for repos that need documentation
  if (hasRepo && isActive) {
    agents.push('docs');
  }

  // CODE AGENTS (typically triggered on-demand, not in regular scans)
  // codegen, test, review, api - usually spawned for specific tasks
  
  // Design, copy - usually spawned on-demand for creative work

  return agents;
}

// ============================================================================
// SDK-BASED ORCHESTRATOR - AUTONOMOUS SUBAGENT SPAWNING
// ============================================================================

/**
 * Build Head of Product prompt with project context
 */
function buildHoPPrompt(scanContexts: ScanContext[]): string {
  let prompt = `You are the Head of Product for a portfolio of web products.

CRITICAL: You MUST use the Task tool to spawn specialist agents. This is how you analyze projects.

Your workflow:
1. Review scan results for each project
2. Use Task tool to spawn relevant specialist agents for each project
3. Wait for each agent's findings
4. Compile all findings and create prioritized work items

HOW TO SPAWN AGENTS - You have 16 specialist agents available via the Task tool:

INFRASTRUCTURE AGENTS:
- Task(agentName="security", prompt="...") - Security vulnerabilities, exposed secrets, npm audit
- Task(agentName="domain", prompt="...") - SSL/DNS health, domain configuration
- Task(agentName="deployment", prompt="...") - Build status, Vercel deployment health
- Task(agentName="performance", prompt="...") - Core Web Vitals, bundle sizes, optimization
- Task(agentName="accessibility", prompt="...") - WCAG compliance, a11y issues
- Task(agentName="database", prompt="...") - Schema optimization, query performance, migrations

ANALYSIS & OPS AGENTS:
- Task(agentName="analytics", prompt="...") - Tracking setup, event instrumentation, PostHog/GA
- Task(agentName="research", prompt="...") - Market research, competitor analysis

CODE AGENTS:
- Task(agentName="codegen", prompt="...") - Write/modify code to fix issues
- Task(agentName="test", prompt="...") - Generate tests for code changes
- Task(agentName="review", prompt="...") - Code review for quality/security
- Task(agentName="api", prompt="...") - Build/maintain API endpoints

CONTENT AGENTS:
- Task(agentName="seo", prompt="...") - SEO optimization, meta tags, sitemaps
- Task(agentName="design", prompt="...") - UI/UX design, mockups
- Task(agentName="copy", prompt="...") - Marketing copy, content writing
- Task(agentName="docs", prompt="...") - Technical documentation

For EACH project, spawn 2-5 relevant agents based on its state and needs.
Prioritize using: Impact (40%), Urgency (30%), Effort (20%), Confidence (10%).

User priorities always override: P0 = Critical, P1 = High, P2 = Medium, P3 = Low.

After spawning agents and reviewing their findings, output a JSON summary:
{
  "findings": [
    {
      "projectId": "...",
      "agent": "security|analytics|codegen|design|etc",
      "issue": "Description",
      "action": "Fix recommendation",
      "severity": "critical|high|medium|low",
      "effort": "low|medium|high",
      "impact": "high|medium|low",
      "confidence": 0.95
    }
  ]
}

---

PROJECTS TO ANALYZE:

`;

  for (const ctx of scanContexts) {
    prompt += `
## PROJECT: ${ctx.project.name}
- ID: ${ctx.project.id}
- Domain: ${ctx.project.domain || 'Not configured'}
- Status: ${ctx.project.status}
- Repository: ${ctx.project.repoUrl || 'Not connected'}

SCAN DATA:
${JSON.stringify(ctx.scans, null, 2)}

${ctx.prioritySignals && ctx.prioritySignals.length > 0 ? `
USER PRIORITY SIGNALS:
${ctx.prioritySignals.map(s => `- ${s.priorityLevel}: "${s.rawContent}" (via ${s.source})`).join('\n')}
` : ''}

---
`;
  }

  prompt += `
Now analyze each project. For each one:
1. Spawn the appropriate specialist agents using Task tool
2. Collect their findings
3. At the end, output your combined findings JSON.
`;

  return prompt;
}

/**
 * Run orchestrator using Agent SDK with AUTONOMOUS subagent spawning
 * 
 * Head of Product agent decides which specialists to spawn via Task tool
 */
async function runOrchestratorSDK(
  scanContexts: ScanContext[],
  options: { workspaceId?: string; orchestratorRunId: string }
): Promise<OrchestratorResult> {
  const runId = options.orchestratorRunId;
  const allFindings: AgentFinding[] = [];
  const conversation: string[] = [];
  const agentsSpawned: string[] = [];
  let totalTokens = 0;
  let estimatedCost = 0;

  conversation.push(`[${new Date().toISOString()}] Orchestrator started (SDK autonomous mode) - analyzing ${scanContexts.length} projects`);

  // Build HoP prompt with all project contexts
  const hopPrompt = buildHoPPrompt(scanContexts);
  
  // Get all spawnable subagents
  const subagents = convertToSDKAgents();
  
  console.log('[Orchestrator] Starting Head of Product agent with Task tool');
  console.log('[Orchestrator] Available subagents:', Object.keys(subagents).join(', '));

  try {
    // Create SDK options with subagents defined
    const sdkOptions: SDKOptions = {
      // HoP can use Task to spawn subagents, plus basic analysis tools
      allowedTools: ['Task', 'Read', 'Grep', 'Glob'],
      tools: ['Task', 'Read', 'Grep', 'Glob'],
      
      // Define all specialist agents that HoP can spawn
      agents: subagents,
      
      // Max turns for HoP conversation
      maxTurns: 15,
      
      // Don't persist - we handle our own sessions
      persistSession: false,
      
      // Include partial for streaming
      includePartialMessages: true,
      
      // Environment
      env: {
        ...process.env,
        ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
      },
    };

    // Run Head of Product agent - it autonomously spawns subagents
    const agentQuery = query({
      prompt: hopPrompt,
      options: sdkOptions,
    });

    let finalOutput = '';
    let messageCount = 0;

    console.log('[Orchestrator] Starting SDK message stream...');

    for await (const message of agentQuery) {
      messageCount++;
      console.log(`[Orchestrator] Message ${messageCount}: type=${message.type}`);
      
      // Handle different message types
      switch (message.type) {
        case 'assistant':
          // Assistant message - might be thinking or final output
          const assistantMsg = message as { type: 'assistant'; message?: { content?: Array<{ type: string; text?: string }> } };
          const content = assistantMsg.message?.content;
          if (Array.isArray(content)) {
            const textParts = content.filter((c) => c.type === 'text');
            finalOutput = textParts.map((t) => t.text || '').join('');
            console.log(`[Orchestrator] Assistant output length: ${finalOutput.length} chars`);
          }
          break;

        case 'tool_progress':
          // Track when HoP spawns a subagent via Task
          const toolMsg = message as { 
            type: 'tool_progress'; 
            tool_name?: string;
            name?: string;
            tool_input?: { agentName?: string; prompt?: string };
            input?: { agentName?: string; prompt?: string };
          };
          const toolName = toolMsg.tool_name || toolMsg.name;
          const toolInput = toolMsg.tool_input || toolMsg.input;
          console.log(`[Orchestrator] Tool event: ${message.type}, tool=${toolName}`);
          if ((toolName === 'Task' || toolName === 'task') && toolInput?.agentName) {
            const agentName = toolInput.agentName;
            agentsSpawned.push(agentName);
            conversation.push(`[HoP] Spawned ${agentName} agent`);
            console.log(`[Orchestrator] HoP spawned: ${agentName}`);
            
            // Create agent session record for the spawned subagent
            const agentDef = agentRegistry[agentName];
            if (agentDef) {
              // Find the project ID from the prompt context
              const projectIdMatch = toolInput.prompt?.match(/ID:\s*([a-f0-9-]+)/i);
              const projectId = projectIdMatch?.[1] || scanContexts[0]?.project.id;
              
              prisma.agentSession.create({
                data: {
                  orchestratorRunId: options.orchestratorRunId,
                  projectId,
                  agentName: agentDef.name,
                  agentType: 'specialist',
                  status: 'running',
                  thinkingTrace: [{ turn: 1, thinking: `Spawned by Head of Product agent`, action: 'spawn' }],
                  toolCalls: [],
                },
              }).then(session => {
                console.log(`[Orchestrator] Created session ${session.id} for ${agentName}`);
              }).catch(err => {
                console.error(`[Orchestrator] Failed to create session for ${agentName}:`, err);
              });
            }
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
            totalTokens += (resultMsg.usage.inputTokens || 0) + (resultMsg.usage.outputTokens || 0);
          }
          if (resultMsg.total_cost_usd) {
            estimatedCost += resultMsg.total_cost_usd;
          }
          if (resultMsg.subtype === 'success' && resultMsg.result) {
            finalOutput = String(resultMsg.result);
          }
          console.log(`[Orchestrator] Result: subtype=${resultMsg.subtype}, tokens=${totalTokens}, cost=$${estimatedCost.toFixed(4)}`);
          break;
          
        default:
          console.log(`[Orchestrator] Unhandled message type: ${message.type}`, JSON.stringify(message).substring(0, 200));
          break;
      }
    }

    console.log(`[Orchestrator] Stream complete. Messages: ${messageCount}, Agents spawned: ${agentsSpawned.length}`);
    conversation.push(`[HoP] Completed analysis`);

    // Parse findings from HoP's final output
    const parsedFindings = parseFindingsFromOutput(finalOutput, scanContexts);
    allFindings.push(...parsedFindings);

    conversation.push(`Total findings from agents: ${allFindings.length}`);

  } catch (error) {
    console.error('[Orchestrator] Error running HoP agent:', error);
    conversation.push(`[HoP] Error: ${(error as Error).message}`);
    
    // Fallback: run agents manually if SDK fails
    conversation.push(`[Fallback] Running agents manually...`);
    const fallbackResult = await runAgentsManually(scanContexts, runId);
    allFindings.push(...fallbackResult.findings);
    agentsSpawned.push(...fallbackResult.agentsSpawned);
    totalTokens += fallbackResult.totalTokens;
    estimatedCost += fallbackResult.estimatedCost;
  }

  // Apply priority scoring to all findings
  const scoredFindings = scoreAndRankFindings(allFindings, scanContexts);
  conversation.push(`Findings scored and ranked`);

  // Create stories from top findings
  const stories = createStoriesFromFindings(scoredFindings);
  conversation.push(`Created ${stories.length} stories for user review`);

  conversation.push(`\nTotal tokens used: ${totalTokens}`);
  conversation.push(`Estimated cost: $${estimatedCost.toFixed(4)}`);
  conversation.push(`[${new Date().toISOString()}] Orchestrator completed`);

  return {
    runId,
    findings: scoredFindings,
    stories,
    conversation,
    agentsSpawned: Array.from(new Set(agentsSpawned)),
    totalTokens,
    estimatedCost,
  };
}

/**
 * Parse findings from HoP agent output
 */
function parseFindingsFromOutput(output: string, scanContexts: ScanContext[]): AgentFinding[] {
  try {
    // Try to find JSON in the output
    const jsonMatch = output.match(/\{[\s\S]*"findings"[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      if (Array.isArray(parsed.findings)) {
        return parsed.findings.map((f: any) => ({
          agent: f.agent || 'unknown',
          projectId: f.projectId || scanContexts[0]?.project.id || '',
          issue: f.issue || '',
          action: f.action || '',
          severity: f.severity || 'medium',
          effort: f.effort || 'medium',
          impact: f.impact || 'medium',
          confidence: f.confidence || 0.8,
        }));
      }
    }
    return [];
  } catch {
    console.warn('[Orchestrator] Failed to parse findings from HoP output');
    return [];
  }
}

/**
 * Fallback: Run agents manually if SDK autonomous mode fails
 */
async function runAgentsManually(
  scanContexts: ScanContext[],
  runId: string
): Promise<{
  findings: AgentFinding[];
  agentsSpawned: string[];
  totalTokens: number;
  estimatedCost: number;
}> {
  const findings: AgentFinding[] = [];
  const agentsSpawned: string[] = [];
  let totalTokens = 0;
  let estimatedCost = 0;

  for (const scanContext of scanContexts) {
    const relevantAgentRoles = getRelevantAgents(scanContext);

    for (const role of relevantAgentRoles) {
      try {
        const agentContext = buildAgentContext(role, scanContext);
        
        const result = await runAgentWithSDK(role, agentContext, {
          projectId: scanContext.project.id,
          orchestratorRunId: runId,
        });

        agentsSpawned.push(role);
        totalTokens += result.session.tokensUsed;
        estimatedCost += estimateCostFromTokens(result.session.tokensUsed);

        if (result.findings && result.findings.length > 0) {
          const enhancedFindings = result.findings.map(f => ({
            ...f,
            agent: role,
            projectId: scanContext.project.id,
          }));
          findings.push(...enhancedFindings);
        }
      } catch (error) {
        console.error(`[Fallback] Error running ${role}:`, error);
      }
    }
  }

  return { findings, agentsSpawned, totalTokens, estimatedCost };
}

/**
 * Build context string for an agent based on role and scan data
 */
function buildAgentContext(role: string, scanContext: ScanContext): string {
  const project = scanContext.project;
  const scans = scanContext.scans;

  let context = `Analyze this project and identify ${role}-related issues or opportunities.

PROJECT: ${project.name}
STATUS: ${project.status}
DOMAIN: ${project.domain || 'Not configured'}
REPOSITORY: ${project.repoUrl || 'Not connected'}

`;

  // Add relevant scan data based on role
  switch (role) {
    case 'security':
      context += `SECURITY SCAN RESULTS:\n${JSON.stringify(scans.security || {}, null, 2)}\n\n`;
      break;
    case 'seo':
      context += `SEO SCAN RESULTS:\n${JSON.stringify(scans.seo || {}, null, 2)}\n\n`;
      break;
    case 'domain':
      context += `DOMAIN SCAN RESULTS:\n${JSON.stringify(scans.domain || {}, null, 2)}\n\n`;
      break;
    case 'analytics':
      context += `ANALYTICS SCAN RESULTS:\n${JSON.stringify(scans.analytics || {}, null, 2)}\n\n`;
      break;
    case 'performance':
      context += `PERFORMANCE SCAN RESULTS:\n${JSON.stringify(scans.performance || {}, null, 2)}\n\n`;
      break;
    default:
      context += `ALL SCAN RESULTS:\n${JSON.stringify(scans, null, 2)}\n\n`;
  }

  // Add priority signals if any
  if (scanContext.prioritySignals && scanContext.prioritySignals.length > 0) {
    context += `USER PRIORITY SIGNALS:\n`;
    for (const signal of scanContext.prioritySignals) {
      context += `- ${signal.priorityLevel}: "${signal.rawContent}" (via ${signal.source})\n`;
    }
    context += '\n';
  }

  context += `Return findings as JSON with structure:
{
  "findings": [
    {
      "issue": "Description of the issue",
      "action": "Recommended action to fix",
      "severity": "critical|high|medium|low",
      "effort": "low|medium|high",
      "impact": "high|medium|low",
      "confidence": 0.0-1.0
    }
  ]
}

If no issues found, return: {"findings": []}`;

  return context;
}

/**
 * Score and rank findings by priority
 */
function scoreAndRankFindings(findings: AgentFinding[], scanContexts: ScanContext[]): AgentFinding[] {
  // Build map of priority signals by project
  const signalsByProject = new Map<string, PrioritySignal[]>();
  for (const ctx of scanContexts) {
    if (ctx.prioritySignals) {
      signalsByProject.set(ctx.project.id, ctx.prioritySignals);
    }
  }

  return findings
    .map(finding => {
      // Check for user priority signals for this project
      const projectSignals = signalsByProject.get(finding.projectId) || [];
      const relevantSignal = projectSignals.find(s => 
        s.rawContent.toLowerCase().includes(finding.issue.toLowerCase().slice(0, 20))
      );

      const priorityScore = calculatePriorityScore(finding, relevantSignal);
      const priorityLevel = scoreToPriorityLevel(priorityScore);

      return {
        ...finding,
        priorityScore,
        priorityLevel,
        rank: priorityScore, // rank equals priorityScore for simplicity
      };
    })
    .sort((a, b) => (b.priorityScore ?? 0) - (a.priorityScore ?? 0));
}

/**
 * Create stories from ranked findings
 */
function createStoriesFromFindings(findings: AgentFinding[]): Story[] {
  const stories: Story[] = [];

  // Group by project, take top 5 per project
  const byProject = findings.reduce((acc, f) => {
    acc[f.projectId] = acc[f.projectId] || [];
    acc[f.projectId].push(f);
    return acc;
  }, {} as Record<string, AgentFinding[]>);

  for (const [projectId, projectFindings] of Object.entries(byProject)) {
    const topFindings = projectFindings.slice(0, 5);

    for (const finding of topFindings) {
      // Determine policy
      let policy: Story['policy'] = 'approval_required';
      if (finding.severity === 'low' && finding.effort === 'low') {
        policy = 'auto_safe';
      } else if (finding.severity === 'critical') {
        policy = 'approval_required';
      } else if (finding.agent === 'security') {
        policy = 'approval_required';
      } else if (finding.priorityLevel === 'P3') {
        policy = 'suggest_only';
      }

      // Map to story priority
      const priorityMap: Record<string, Story['priority']> = {
        critical: 'high',
        high: 'high',
        medium: 'medium',
        low: 'low',
      };

      // Check if this advances launch stage (fixes blocking issues)
      const advancesLaunchStage = 
        finding.severity === 'critical' ||
        (finding.severity === 'high' && finding.impact === 'high') ||
        finding.issue.toLowerCase().includes('launch') ||
        finding.issue.toLowerCase().includes('deploy');

      stories.push({
        projectId,
        title: finding.issue,
        rationale: `${finding.agent.toUpperCase()}: ${finding.action}\n\n` +
          `Severity: ${finding.severity} | Effort: ${finding.effort} | Impact: ${finding.impact}\n` +
          `Confidence: ${Math.round((finding.confidence ?? 0.8) * 100)}%`,
        priority: priorityMap[finding.severity] ?? 'medium',
        policy,
        priorityLevel: finding.priorityLevel ?? 'P2',
        priorityScore: finding.priorityScore ?? 50,
        advancesLaunchStage,
      });
    }
  }

  return stories;
}

/**
 * Estimate cost from token count
 */
function estimateCostFromTokens(tokens: number): number {
  // Rough estimate: $0.003/1K input, $0.015/1K output (sonnet average)
  // Assume 70% input, 30% output
  const inputTokens = tokens * 0.7;
  const outputTokens = tokens * 0.3;
  return (inputTokens / 1000 * 0.003) + (outputTokens / 1000 * 0.015);
}

// ============================================================================
// LEGACY ORCHESTRATOR (Fallback when SDK disabled)
// ============================================================================

async function runOrchestratorLegacy(
  scanContexts: ScanContext[]
): Promise<OrchestratorResult> {
  // Use new agent registry (consolidated)
  const runId = `orch_${Date.now()}_${Math.random().toString(36).substring(7)}`;
  const allFindings: AgentFinding[] = [];
  const conversation: string[] = [];
  const agentsSpawned: string[] = [];

  conversation.push(`[${new Date().toISOString()}] Orchestrator started (legacy mode)`);

  for (const scanContext of scanContexts) {
    const relevantRoles = getRelevantAgents(scanContext);
    
    for (const role of relevantRoles) {
      // Use new agent registry from lib/agents/index.ts
      const agent = agentRegistry[role];
      if (!agent) continue;

      agentsSpawned.push(role);

      try {
        const response = await anthropic.messages.create({
          model: agent.model,
          max_tokens: 2048,
          system: agent.prompt, // New registry uses 'prompt' not 'instructions'
          messages: [{
            role: 'user',
            content: buildAgentContext(role, scanContext),
          }],
        });

        const textContent = response.content.find(c => c.type === 'text');
        if (textContent && textContent.type === 'text') {
          let jsonText = textContent.text.trim();
          if (jsonText.startsWith('```')) {
            const match = jsonText.match(/```(?:json)?\n?([\s\S]*?)\n?```/);
            if (match) jsonText = match[1].trim();
          }
          const result = JSON.parse(jsonText);
          if (result.findings) {
            allFindings.push(...result.findings.map((f: any) => ({
              ...f,
              agent: role,
              projectId: scanContext.project.id,
            })));
          }
        }
      } catch (error) {
        console.error(`Error running ${role}:`, error);
      }
    }
  }

  const scoredFindings = scoreAndRankFindings(allFindings, scanContexts);
  const stories = createStoriesFromFindings(scoredFindings);

  conversation.push(`[${new Date().toISOString()}] Orchestrator completed (legacy mode)`);

  return {
    runId,
    findings: scoredFindings,
    stories,
    conversation,
    agentsSpawned,
    totalTokens: 0,
    estimatedCost: 0,
  };
}

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Main orchestrator entry point
 * Chooses SDK or legacy based on feature flag
 */
export async function runOrchestrator(
  scanContexts: ScanContext[],
  options?: { workspaceId?: string }
): Promise<OrchestratorResult> {
  // Generate a unique run ID
  const generatedRunId = `orch_${Date.now()}_${Math.random().toString(36).substring(7)}`;
  
  // Create orchestrator run record
  const runRecord = await prisma.orchestratorRun.create({
    data: {
      runId: generatedRunId,
      status: 'running',
      conversation: [],
    },
  });

  try {
    let result: OrchestratorResult;

    if (featureFlags.AGENT_SDK_ENABLED) {
      result = await runOrchestratorSDK(scanContexts, {
        workspaceId: options?.workspaceId,
        orchestratorRunId: runRecord.id,
      });
    } else {
      result = await runOrchestratorLegacy(scanContexts);
    }

    // Update run record with results
    await prisma.orchestratorRun.update({
      where: { id: runRecord.id },
      data: {
        status: 'completed',
        findingsCount: result.findings.length,
        storiesCount: result.stories.length,
        conversation: result.conversation,
        totalTokens: result.totalTokens,
        estimatedCost: result.estimatedCost,
        agentsSpawned: result.agentsSpawned,
        completedAt: new Date(),
      },
    });

    return { ...result, runId: runRecord.id };

  } catch (error) {
    // Update run record with failure
    await prisma.orchestratorRun.update({
      where: { id: runRecord.id },
      data: {
        status: 'failed',
        completedAt: new Date(),
      },
    });
    throw error;
  }
}

/**
 * Trigger a priority re-run for a specific project
 * Called when user sets priority via Slack/Linear
 */
export async function triggerPriorityRerun(
  projectId: string,
  prioritySignal: PrioritySignal,
  options?: { workspaceId?: string }
): Promise<OrchestratorResult> {
  // Get project with latest scans
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: {
      scans: {
        orderBy: { scannedAt: 'desc' },
        take: 5,
      },
    },
  });

  if (!project) {
    throw new Error(`Project not found: ${projectId}`);
  }

  // Build scan context with priority signal
  // Aggregate scan results by type
  const scanResults: Record<string, unknown> = {};
  for (const scan of project.scans) {
    const scanType = scan.scanType.toLowerCase();
    // Use the appropriate result field based on scan type
    if (scan.seoDetail) scanResults[scanType] = scan.seoDetail;
    else if (scan.domainData) scanResults[scanType] = scan.domainData;
    else if (scan.securityIssues) scanResults[scanType] = scan.securityIssues;
    else if (scan.analyticsData) scanResults[scanType] = scan.analyticsData;
    else if (scan.vercelData) scanResults[scanType] = scan.vercelData;
    else if (scan.playwrightMetrics) scanResults[scanType] = scan.playwrightMetrics;
  }

  const scanContext: ScanContext = {
    project: {
      id: project.id,
      name: project.name,
      domain: project.domain,
      status: project.status,
      repoUrl: project.repo, // Use 'repo' field from schema
    },
    scans: scanResults,
    prioritySignals: [prioritySignal],
  };

  return runOrchestrator([scanContext], options);
}

// Note: Types AgentFinding, Story, OrchestratorResult, ScanContext are already exported above as interfaces
