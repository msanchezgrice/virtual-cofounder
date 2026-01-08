/**
 * Head of Product Orchestrator - Agent SDK Version
 * 
 * This orchestrator uses the Claude Agent SDK to coordinate specialist agents.
 * Key improvements over legacy:
 * - Multi-turn agent execution with tool use
 * - Automatic thinking trace capture
 * - Subagent spawning capability
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
} from '@/lib/agents';
import { runAgentWithSDK, spawnSubagent } from '@/lib/agents/sdk-runner';
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic();

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
 * Determine which agents should analyze a project based on scan data and project state
 */
function getRelevantAgents(scanContext: ScanContext): string[] {
  const agents: string[] = [];

  // Domain agent - run if project has a domain
  if (scanContext.project.domain) {
    agents.push('domain');
    agents.push('seo');
  }

  // Security agent - always run for active projects
  if (scanContext.project.status.includes('ACTIVE') || scanContext.project.repoUrl) {
    agents.push('security');
  }

  // Analytics agent - run if project is active or pre-launch
  if (scanContext.project.status.includes('ACTIVE') || scanContext.project.status.includes('Pre-Launch')) {
    agents.push('analytics');
  }

  // Deployment agent - run if project has domain (deployed)
  if (scanContext.project.domain) {
    agents.push('deployment');
  }

  // Performance agent - run for active deployed projects
  if (scanContext.project.domain && scanContext.project.status.includes('ACTIVE')) {
    agents.push('performance');
  }

  return agents;
}

// ============================================================================
// SDK-BASED ORCHESTRATOR
// ============================================================================

/**
 * Run orchestrator using Agent SDK (multi-turn with subagent spawning)
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

  conversation.push(`[${new Date().toISOString()}] Orchestrator started (SDK mode) - analyzing ${scanContexts.length} projects`);

  // Process each project with Head of Product coordinating
  for (const scanContext of scanContexts) {
    const projectName = scanContext.project.name;
    conversation.push(`\n[${projectName}] Head of Product analyzing project...`);

    // Determine relevant agents
    const relevantAgentRoles = getRelevantAgents(scanContext);
    conversation.push(`[${projectName}] Spawning agents: ${relevantAgentRoles.join(', ')}`);

    // Run each specialist agent via SDK
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
          allFindings.push(...enhancedFindings);
          conversation.push(`[${projectName}] ${role} found ${result.findings.length} issue(s)`);
        }

      } catch (error) {
        console.error(`[${projectName}] Error running ${role}:`, error);
        conversation.push(`[${projectName}] ${role} failed: ${(error as Error).message}`);
      }
    }
  }

  conversation.push(`\nTotal findings: ${allFindings.length}`);

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
    agentsSpawned: [...new Set(agentsSpawned)],
    totalTokens,
    estimatedCost,
  };
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
  // Import legacy implementation
  const { agents } = await import('./agents');
  
  const runId = `orch_${Date.now()}_${Math.random().toString(36).substring(7)}`;
  const allFindings: AgentFinding[] = [];
  const conversation: string[] = [];
  const agentsSpawned: string[] = [];

  conversation.push(`[${new Date().toISOString()}] Orchestrator started (legacy mode)`);

  for (const scanContext of scanContexts) {
    const relevantRoles = getRelevantAgents(scanContext);
    
    for (const role of relevantRoles) {
      const agent = (agents as any)[role];
      if (!agent) continue;

      agentsSpawned.push(role);

      try {
        const response = await anthropic.messages.create({
          model: agent.model,
          max_tokens: 2048,
          system: agent.instructions,
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
  // Create orchestrator run record
  const runRecord = await prisma.orchestratorRun.create({
    data: {
      workspaceId: options?.workspaceId,
      status: 'running',
      projectsAnalyzed: scanContexts.length,
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
        storiesCreated: result.stories.length,
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
        orderBy: { createdAt: 'desc' },
        take: 5,
      },
    },
  });

  if (!project) {
    throw new Error(`Project not found: ${projectId}`);
  }

  // Build scan context with priority signal
  const scanContext: ScanContext = {
    project: {
      id: project.id,
      name: project.name,
      domain: project.domain,
      status: project.status,
      repoUrl: project.repoUrl,
    },
    scans: project.scans.reduce((acc, scan) => {
      acc[scan.type.toLowerCase()] = scan.result;
      return acc;
    }, {} as Record<string, any>),
    prioritySignals: [prioritySignal],
  };

  return runOrchestrator([scanContext], options);
}

// Re-export types for backwards compatibility
export type { AgentFinding, Story, OrchestratorResult, ScanContext };
