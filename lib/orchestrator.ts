// Head of Product Orchestrator - Coordinates specialist agents
import Anthropic from '@anthropic-ai/sdk';
import { agents, type AgentConfig } from './agents';
import { addLinearComment } from './linear';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// Types
export interface ScanContext {
  project: {
    id: string;
    name: string;
    domain: string | null;
    status: string;
  };
  scans: {
    domain?: any;
    seo?: any;
    analytics?: any;
  };
}

export interface AgentFinding {
  agent: string;
  projectId: string;
  issue: string;
  action: string;
  severity: 'high' | 'medium' | 'low';
  effort: 'low' | 'medium' | 'high';
  impact: 'high' | 'medium' | 'low';
  confidence: number;
  rank?: number;
}

export interface Story {
  projectId: string;
  title: string;
  rationale: string;
  priority: 'high' | 'medium' | 'low';
  policy: 'auto_safe' | 'approval_required' | 'suggest_only';
}

export interface OrchestratorResult {
  runId: string;
  findings: AgentFinding[];
  stories: Story[];
  conversation: string[];
}

/**
 * Run a single agent on a project's scan data
 */
async function runAgent(
  agent: AgentConfig,
  scanContext: ScanContext
): Promise<AgentFinding[]> {
  const prompt = `Analyze this project's scan data and identify issues or opportunities.

**Project:** ${scanContext.project.name}
**Status:** ${scanContext.project.status}
**Domain:** ${scanContext.project.domain || 'No domain configured'}

**Scan Results:**
${JSON.stringify(scanContext.scans, null, 2)}

Based on these scan results, identify any ${agent.role}-related issues or opportunities.
Return ONLY valid JSON in the exact format specified in your instructions.
If no issues found, return: {"findings": []}`;

  try {
    const response = await anthropic.messages.create({
      model: agent.model,
      max_tokens: 2048,
      messages: [{
        role: 'user',
        content: prompt
      }],
      system: agent.instructions,
    });

    const textContent = response.content.find(block => block.type === 'text');
    if (!textContent || textContent.type !== 'text') {
      console.warn(`No text response from ${agent.name}`);
      return [];
    }

    // Parse JSON from response (strip markdown code blocks if present)
    let jsonText = textContent.text.trim();

    // Remove markdown code block wrappers if present
    if (jsonText.startsWith('```')) {
      // Extract content between ``` markers
      const match = jsonText.match(/```(?:json)?\n?([\s\S]*?)\n?```/);
      if (match) {
        jsonText = match[1].trim();
      }
    }

    const result = JSON.parse(jsonText);

    if (!result.findings || !Array.isArray(result.findings)) {
      console.warn(`Invalid response format from ${agent.name}`);
      return [];
    }

    // Add metadata to each finding
    return result.findings.map((finding: any) => ({
      ...finding,
      agent: agent.role,
      projectId: scanContext.project.id,
    }));
  } catch (error) {
    console.error(`Error running ${agent.name}:`, error);
    return [];
  }
}

/**
 * Determine which agents should analyze a project based on its scan data
 */
function getRelevantAgents(scanContext: ScanContext): AgentConfig[] {
  const relevantAgents: AgentConfig[] = [];

  // Domain agent - always run if project has a domain
  if (scanContext.project.domain) {
    relevantAgents.push(agents.domain);
  }

  // SEO agent - run if project has a domain and is active
  if (scanContext.project.domain && scanContext.project.status.includes('ACTIVE')) {
    relevantAgents.push(agents.seo);
  }

  // Analytics agent - run if project is active or pre-launch
  if (scanContext.project.status.includes('ACTIVE') || scanContext.project.status.includes('Pre-Launch')) {
    relevantAgents.push(agents.analytics);
  }

  // Security agent - always run for active projects
  if (scanContext.project.status.includes('ACTIVE')) {
    relevantAgents.push(agents.security);
  }

  // Deployment agent - run if project has domain (likely deployed)
  if (scanContext.project.domain) {
    relevantAgents.push(agents.deployment);
  }

  return relevantAgents;
}

/**
 * Rank findings by priority score
 * Score = (severity * 3) + (impact * 2) + confidence - (effort * 0.5)
 */
function rankFindings(findings: AgentFinding[]): AgentFinding[] {
  const scoreMap = {
    severity: { high: 3, medium: 2, low: 1 },
    impact: { high: 3, medium: 2, low: 1 },
    effort: { high: 3, medium: 2, low: 1 },
  };

  return findings
    .map(finding => {
      const severityScore = scoreMap.severity[finding.severity] * 3;
      const impactScore = scoreMap.impact[finding.impact] * 2;
      const effortPenalty = scoreMap.effort[finding.effort] * 0.5;
      const confidenceBonus = finding.confidence;

      const score = severityScore + impactScore + confidenceBonus - effortPenalty;

      return {
        ...finding,
        rank: Math.round(score * 100) / 100,
      };
    })
    .sort((a, b) => (b.rank || 0) - (a.rank || 0));
}

/**
 * Group findings into stories (actionable work items)
 * Each story represents a PR or task that can be executed
 */
function createStories(findings: AgentFinding[]): Story[] {
  const stories: Story[] = [];

  // Group findings by project
  const findingsByProject = findings.reduce((acc, finding) => {
    if (!acc[finding.projectId]) {
      acc[finding.projectId] = [];
    }
    acc[finding.projectId].push(finding);
    return acc;
  }, {} as Record<string, AgentFinding[]>);

  // Create stories for each project's top findings
  Object.entries(findingsByProject).forEach(([projectId, projectFindings]) => {
    // Sort by rank and take top 3 findings per project
    const topFindings = projectFindings
      .sort((a, b) => (b.rank || 0) - (a.rank || 0))
      .slice(0, 3);

    topFindings.forEach(finding => {
      // Determine policy based on agent and severity
      let policy: Story['policy'] = 'approval_required';

      // Auto-safe policies for low-risk changes
      if (finding.agent === 'seo' && finding.severity === 'low') {
        policy = 'auto_safe'; // SEO meta tags are low risk
      } else if (finding.agent === 'analytics' && finding.effort === 'low') {
        policy = 'auto_safe'; // Adding analytics snippets is low risk
      } else if (finding.severity === 'high') {
        policy = 'approval_required'; // High severity always needs approval
      } else if (finding.agent === 'security') {
        policy = 'approval_required'; // Security changes always need approval
      } else {
        policy = 'suggest_only'; // Medium priority suggestions
      }

      // Map severity to priority
      const priorityMap: Record<string, Story['priority']> = {
        high: 'high',
        medium: 'medium',
        low: 'low',
      };

      stories.push({
        projectId,
        title: finding.issue,
        rationale: `${finding.agent.toUpperCase()} AGENT: ${finding.action}\n\nSeverity: ${finding.severity}\nEffort: ${finding.effort}\nImpact: ${finding.impact}\nConfidence: ${(finding.confidence * 100).toFixed(0)}%`,
        priority: priorityMap[finding.severity],
        policy,
      });
    });
  });

  return stories;
}

/**
 * Main orchestrator function - coordinates all agents
 */
export async function runOrchestrator(
  scanContexts: ScanContext[]
): Promise<OrchestratorResult> {
  const runId = `orch_${Date.now()}_${Math.random().toString(36).substring(7)}`;
  const allFindings: AgentFinding[] = [];
  const conversation: string[] = [];

  conversation.push(`[${new Date().toISOString()}] Orchestrator started - analyzing ${scanContexts.length} projects`);

  // Process each project
  for (const scanContext of scanContexts) {
    conversation.push(`\n[${scanContext.project.name}] Determining relevant agents...`);

    const relevantAgents = getRelevantAgents(scanContext);
    conversation.push(`[${scanContext.project.name}] Running ${relevantAgents.length} agents: ${relevantAgents.map(a => a.role).join(', ')}`);

    // Run all relevant agents in parallel
    const agentPromises = relevantAgents.map(agent =>
      runAgent(agent, scanContext).then(findings => {
        if (findings.length > 0) {
          conversation.push(`[${scanContext.project.name}] ${agent.name} found ${findings.length} issue(s)`);
        }
        return findings;
      })
    );

    const projectFindings = (await Promise.all(agentPromises)).flat();
    allFindings.push(...projectFindings);
  }

  conversation.push(`\nTotal findings: ${allFindings.length}`);

  // Rank all findings
  const rankedFindings = rankFindings(allFindings);
  conversation.push(`Findings ranked by priority (top 5): ${rankedFindings.slice(0, 5).map(f => `${f.issue} (rank: ${f.rank})`).join(', ')}`);

  // Create stories from top findings
  const stories = createStories(rankedFindings);
  conversation.push(`Created ${stories.length} stories for user review`);

  conversation.push(`[${new Date().toISOString()}] Orchestrator completed`);

  return {
    runId,
    findings: rankedFindings,
    stories,
    conversation,
  };
}
