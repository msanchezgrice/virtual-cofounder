/**
 * Execution Worker - Agent SDK Version
 * 
 * Processes approved stories using the Code Generation Agent.
 * Key improvements over legacy:
 * - Real code changes via Agent SDK tools (Read, Write, Edit, Bash)
 * - Thinking trace capture for debugging
 * - Subagent support (Test Agent, Review Agent)
 * - Cost tracking per execution
 * 
 * Feature flag: AGENT_SDK_ENABLED
 */

import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(__dirname, '../.env.local') });

import { Worker, Job } from 'bullmq';
import Redis from 'ioredis';
import { PrismaClient } from '@prisma/client';
import { cloneRepo, createBranch, applyChanges, commitChanges, pushBranch, cleanup } from '../lib/git';
import { createPullRequest, parseRepoUrlWithInstallation, getAuthenticatedCloneUrl } from '../lib/github';
import { sendSlackNotification } from '../lib/slack';
import { updateLinearTaskStatus, getTeamWorkflowStates, addLinearComment } from '../lib/linear';
import { featureFlags } from '../lib/config/feature-flags';
import { runAgentWithSDK } from '../lib/agents/sdk-runner';
import { codeGenerationAgent } from '../lib/agents/index';

// Database client
const directDatabaseUrl = process.env.DATABASE_URL?.replace(':6543', ':5432').replace('?pgbouncer=true&connection_limit=1', '');
const prisma = new PrismaClient({
  datasources: {
    db: {
      url: directDatabaseUrl,
    },
  },
});

// Redis connection
const connection = new Redis(
  process.env.REDIS_URL || 'redis://localhost:6379',
  {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    tls: process.env.REDIS_URL?.startsWith('rediss://') ? {} : undefined,
  }
);

interface ExecutionJob {
  storyId: string;
  priority?: 'P0' | 'P1' | 'P2' | 'P3';
}

interface CodeChange {
  path: string;
  content: string;
  operation: 'create' | 'modify' | 'delete';
}

// ============================================================================
// LINEAR INTEGRATION
// ============================================================================

async function updateLinearTaskStatusForStory(
  linearTaskId: string | null,
  storyStatus: string,
  teamId: string = 'd5cbb99d-df57-4b21-87c9-95fc5089a6a2'
): Promise<void> {
  if (!linearTaskId) return;

  try {
    const states = await getTeamWorkflowStates(teamId);
    
    let targetState = states.find((s) => {
      const stateName = s.name.toLowerCase();
      const stateType = s.type.toLowerCase();

      switch (storyStatus) {
        case 'in_progress':
          return stateType === 'started' || stateName.includes('progress');
        case 'completed':
          return stateType === 'completed' || stateName.includes('done');
        case 'failed':
          return stateType === 'canceled' || stateName.includes('failed');
        default:
          return stateType === 'unstarted' || stateName.includes('todo');
      }
    });

    if (!targetState) {
      targetState = states.find((s) => {
        if (storyStatus === 'in_progress') return s.type === 'started';
        if (storyStatus === 'completed') return s.type === 'completed';
        if (storyStatus === 'failed') return s.type === 'canceled';
        return s.type === 'unstarted';
      });
    }

    if (targetState) {
      await updateLinearTaskStatus(linearTaskId, targetState.id);
      console.log(`[Linear] Updated task ${linearTaskId} to: ${targetState.name}`);
    }
  } catch (error) {
    console.error('[Linear] Failed to update task status:', error);
  }
}

async function postLinearComment(linearTaskId: string | null, comment: string): Promise<void> {
  if (!linearTaskId) return;
  try {
    await addLinearComment(linearTaskId, comment);
  } catch (error) {
    console.error('[Linear] Failed to post comment:', error);
  }
}

// ============================================================================
// CODE GENERATION AGENT
// ============================================================================

interface CodeGenResult {
  changes: CodeChange[];
  explanation: string;
  testsRun: boolean;
  lintPassed: boolean;
  tokensUsed: number;
  estimatedCost: number;
  thinkingTrace: Array<{ turn: number; thinking: string; action: string }>;
  toolCalls: Array<{ tool: string; input: unknown; output: unknown; duration: number }>;
}

/**
 * Run Code Generation Agent to produce actual code changes
 */
async function runCodeGenAgent(
  story: any,
  repoPath: string,
  options: { orchestratorRunId?: string }
): Promise<CodeGenResult> {
  const context = buildCodeGenContext(story, repoPath);
  
  console.log(`[CodeGen] Running agent for story: ${story.title}`);

  const result = await runAgentWithSDK('codegen', context, {
    projectId: story.projectId,
    storyId: story.id,
    orchestratorRunId: options.orchestratorRunId,
    workingDirectory: repoPath, // Pass repo path for file operations
  });

  // Parse code changes from agent output
  const changes = parseCodeChanges(result.output);
  
  // Check if agent ran tests and lint
  const testsRun = result.session.toolCalls.some(tc => tc.tool === 'RunTests');
  const lintPassed = result.session.toolCalls.some(tc => tc.tool === 'RunLinter');

  console.log(`[CodeGen] Agent completed: ${changes.length} changes, ${result.session.tokensUsed} tokens`);
  console.log(`[CodeGen] Tool calls: ${result.session.toolCalls.map(tc => tc.tool).join(', ')}`);

  return {
    changes,
    explanation: result.output.slice(0, 500),
    testsRun,
    lintPassed,
    tokensUsed: result.session.tokensUsed,
    estimatedCost: estimateCost(result.session.tokensUsed),
    thinkingTrace: (result.session as any).thinkingTrace || [],
    toolCalls: result.session.toolCalls,
  };
}

/**
 * Build context for Code Generation Agent
 */
function buildCodeGenContext(story: any, repoPath: string): string {
  return `You are working on this task for project "${story.project.name}":

TASK: ${story.title}

RATIONALE: ${story.rationale}

REPOSITORY PATH: ${repoPath}

INSTRUCTIONS:
1. First, read relevant files to understand the codebase structure
2. Make minimal, targeted changes to fix the issue
3. Follow existing code patterns and conventions
4. Run tests if available: npm test or yarn test
5. Run linter if available: npm run lint or eslint

OUTPUT YOUR CHANGES in this exact JSON format:
{
  "changes": [
    {
      "path": "relative/path/to/file.ts",
      "content": "full new content of file",
      "operation": "create|modify|delete"
    }
  ],
  "explanation": "Brief explanation of changes made"
}

If no code changes are needed, explain why and return empty changes array.
Do NOT include markdown code blocks in your JSON response.`;
}

/**
 * Parse code changes from agent output
 */
function parseCodeChanges(output: string): CodeChange[] {
  try {
    // Try to find JSON in the output
    const jsonMatch = output.match(/\{[\s\S]*"changes"[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      if (Array.isArray(parsed.changes)) {
        return parsed.changes.filter((c: any) => 
          c.path && c.content !== undefined && c.operation
        );
      }
    }
    return [];
  } catch {
    console.warn('[CodeGen] Failed to parse code changes from output');
    return [];
  }
}

/**
 * Estimate cost from tokens
 */
function estimateCost(tokens: number): number {
  // Opus pricing: $0.015 input, $0.075 output per 1K
  const inputTokens = tokens * 0.7;
  const outputTokens = tokens * 0.3;
  return (inputTokens / 1000 * 0.015) + (outputTokens / 1000 * 0.075);
}

// ============================================================================
// EXECUTION LOGIC
// ============================================================================

/**
 * Run any agent for a story via Agent SDK
 * Routes to correct agent based on role (security, seo, codegen, etc.)
 */
async function runAgentForStory(
  agentRole: string,
  story: any,
  repoPath: string,
  options: { orchestratorRunId?: string }
): Promise<CodeGenResult> {
  // Build context based on agent type
  const context = buildAgentContext(agentRole, story, repoPath);

  console.log(`[${agentRole}] Running agent for story: ${story.title}`);

  // Run agent via SDK - works for all 17 specialist agents
  const result = await runAgentWithSDK(agentRole, context, {
    projectId: story.projectId,
    storyId: story.id,
    orchestratorRunId: options.orchestratorRunId,
    workingDirectory: repoPath,
  });

  // Parse code changes from agent output (for code/content agents)
  const changes = parseCodeChanges(result.output);

  // Check if agent ran tests and lint
  const testsRun = result.session.toolCalls.some(tc => tc.tool === 'RunTests');
  const lintPassed = result.session.toolCalls.some(tc => tc.tool === 'RunLinter');

  console.log(`[${agentRole}] Agent completed: ${changes.length} changes, ${result.session.tokensUsed} tokens`);
  console.log(`[${agentRole}] Tool calls: ${result.session.toolCalls.map(tc => tc.tool).join(', ')}`);

  return {
    changes,
    explanation: result.output.slice(0, 500),
    testsRun,
    lintPassed,
    tokensUsed: result.session.tokensUsed,
    estimatedCost: estimateCost(result.session.tokensUsed),
    thinkingTrace: (result.session as any).thinkingTrace || [],
    toolCalls: result.session.toolCalls,
  };
}

/**
 * Build context for any agent type
 * Adapts prompt based on whether it's analysis, code, or content agent
 */
function buildAgentContext(agentRole: string, story: any, repoPath: string): string {
  const ANALYSIS_AGENTS = ['security', 'seo', 'performance', 'analytics', 'accessibility', 'domain', 'deployment', 'database', 'research'];
  const CODE_AGENTS = ['codegen', 'test', 'review', 'api'];
  const CONTENT_AGENTS = ['design', 'copy', 'docs'];

  const isAnalysisAgent = ANALYSIS_AGENTS.includes(agentRole);
  const isCodeAgent = CODE_AGENTS.includes(agentRole);
  const isContentAgent = CONTENT_AGENTS.includes(agentRole);

  if (isAnalysisAgent) {
    // Analysis agents: Focus on findings, not code changes
    return `You are working on this analysis task for project "${story.project.name}":

TASK: ${story.title}

RATIONALE: ${story.rationale}

REPOSITORY PATH: ${repoPath}

INSTRUCTIONS:
1. Read relevant files to understand the current state
2. Analyze according to your specialization (${agentRole})
3. Provide detailed findings with specific examples
4. Include actionable recommendations
5. Prioritize findings by severity/impact

OUTPUT FORMAT:
Provide your analysis as a well-structured report with:
- Executive Summary
- Key Findings (with severity levels)
- Detailed Analysis
- Recommendations
- Next Steps

Focus on delivering insights, not code changes.`;

  } else if (isCodeAgent || isContentAgent) {
    // Code/Content agents: Focus on making changes
    return `You are working on this task for project "${story.project.name}":

TASK: ${story.title}

RATIONALE: ${story.rationale}

REPOSITORY PATH: ${repoPath}

INSTRUCTIONS:
1. First, read relevant files to understand the codebase structure
2. Make minimal, targeted changes to accomplish the task
3. Follow existing code patterns and conventions
4. Run tests if available: npm test or yarn test
5. Run linter if available: npm run lint or eslint

OUTPUT YOUR CHANGES in this exact JSON format:
{
  "changes": [
    {
      "path": "relative/path/to/file.ts",
      "content": "full new content of file",
      "operation": "create|modify|delete"
    }
  ],
  "explanation": "Brief explanation of changes made"
}

If no code changes are needed, explain why and return empty changes array.
Do NOT include markdown code blocks in your JSON response.`;

  } else {
    // Fallback for unknown agent types
    return buildCodeGenContext(story, repoPath);
  }
}

/**
 * Execute story with Code Generation Agent (SDK mode)
 */
async function executeStorySDK(storyId: string): Promise<void> {
  console.log(`[Execution] Processing story (SDK mode): ${storyId}`);

  const story = await prisma.story.findUnique({
    where: { id: storyId },
    include: { project: true },
  });

  if (!story) {
    console.error(`[Execution] Story ${storyId} not found`);
    return;
  }

  // Get agent type from AgentSession
  const agentSession = await prisma.agentSession.findFirst({
    where: { storyId: story.id },
    orderBy: { startedAt: 'desc' },
  });
  const agentRole = agentSession?.agentName || 'codegen';
  console.log(`[Execution] Agent role: ${agentRole}`);

  // Determine agent category
  const CODE_AGENTS = ['codegen', 'test', 'review', 'api'];
  const ANALYSIS_AGENTS = ['security', 'seo', 'performance', 'analytics', 'accessibility', 'domain', 'deployment', 'database', 'research'];
  const CONTENT_AGENTS = ['design', 'copy', 'docs'];

  const isCodeAgent = CODE_AGENTS.includes(agentRole);
  const isAnalysisAgent = ANALYSIS_AGENTS.includes(agentRole);
  const isContentAgent = CONTENT_AGENTS.includes(agentRole);

  // Policy checks
  if (story.policy === 'suggest_only') {
    console.log(`[Execution] Story is suggest_only - marking complete`);
    await prisma.story.update({
      where: { id: storyId },
      data: { status: 'completed' },
    });
    await updateLinearTaskStatusForStory(story.linearTaskId, 'completed');
    return;
  }

  if (story.policy === 'approval_required' && !story.userApproved) {
    console.log(`[Execution] Story requires approval - skipping`);
    return;
  }

  // Mark in progress
  await prisma.story.update({
    where: { id: storyId },
    data: { status: 'in_progress' },
  });
  await updateLinearTaskStatusForStory(story.linearTaskId, 'in_progress');
  await postLinearComment(story.linearTaskId,
    `**🤖 ${agentSession?.agentName || 'Agent'} Started**\n\n` +
    `Working on: ${story.title}\n\n` +
    `_Using Agent SDK with Read, Write, Edit, Bash tools_`
  );

  let repoPath: string | null = null;

  try {
    // Clone repository
    const repo = story.project.repo;
    if (!repo) throw new Error('No repository configured');

    const authenticatedUrl = await getAuthenticatedCloneUrl(repo);
    repoPath = await cloneRepo(authenticatedUrl);
    const branchName = `ai-improvement-${storyId.slice(0, 8)}`;
    await createBranch(repoPath, branchName);

    // Run agent via SDK - routes to correct agent based on role
    const agentResult = await runAgentForStory(agentRole, story, repoPath, {});

    // Post thinking trace to Linear
    if (agentResult.thinkingTrace.length > 0 || agentResult.toolCalls.length > 0) {
      const thinkingTraceComment = formatThinkingTraceForLinear(agentResult);
      await postLinearComment(story.linearTaskId,
        `**🤔 Agent Thinking Trace**\n\n${thinkingTraceComment}`
      );
    }

    // Handle different agent types
    if (isAnalysisAgent) {
      // Analysis agents: Post findings to Linear, no PR needed
      await postLinearComment(story.linearTaskId,
        `**📊 Analysis Complete**\n\n` +
        `${agentResult.explanation}\n\n` +
        `Tokens used: ${agentResult.tokensUsed}\n` +
        `Cost: $${agentResult.estimatedCost.toFixed(4)}`
      );

      // Update story as completed (no PR for analysis)
      await prisma.story.update({
        where: { id: storyId },
        data: {
          status: 'completed',
          executedAt: new Date(),
        },
      });

      await updateLinearTaskStatusForStory(story.linearTaskId, 'completed');

      // Slack notification
      try {
        await sendSlackNotification({
          completionId: storyId,
          projectName: story.project.name,
          title: story.title,
          rationale: `${agentRole} analysis completed: ${agentResult.explanation.substring(0, 200)}`,
          prUrl: '', // No PR for analysis
        });
      } catch (e) {
        console.error('[Execution] Slack notification failed:', e);
      }

      console.log(`[Execution] Analysis story ${storyId} completed successfully`);

    } else {
      // Code/Content agents: Apply changes and create PR
      if (agentResult.changes.length > 0) {
        await applyChanges(repoPath, agentResult.changes.map(c => ({
          path: c.path,
          content: c.content,
        })));

        await postLinearComment(story.linearTaskId,
          `**⚙️ Code Changes Generated**\n\n` +
          `Files modified: ${agentResult.changes.length}\n` +
          `Tokens used: ${agentResult.tokensUsed}\n` +
          `Cost: $${agentResult.estimatedCost.toFixed(4)}\n\n` +
          `\`\`\`\n${agentResult.explanation}\n\`\`\``
        );
      } else {
        // No changes - create documentation file as fallback
        const fallbackChanges = [{
          path: 'AI_IMPROVEMENTS.md',
          content: `# AI Analysis\n\nStory: ${story.title}\nAnalysis: ${agentResult.explanation}\n`,
        }];
        await applyChanges(repoPath, fallbackChanges);
      }

      // Commit and push
      await commitChanges(repoPath, `AI improvement: ${story.title}`);
      await pushBranch(repoPath, branchName);

      // Create PR - use async parser to get owner from GitHub App installation
      const { owner, repo: repoName } = await parseRepoUrlWithInstallation(repo);

      const prBody = buildPRBody(story, agentResult, agentRole);
      const prResult = await createPullRequest({
        owner,
        repo: repoName,
        head: branchName,
        base: 'main',
        title: story.title,
        body: prBody,
      });

      // Update story
      await prisma.story.update({
        where: { id: storyId },
        data: {
          status: 'completed',
          executedAt: new Date(),
          prUrl: prResult.url,
        },
      });

      await updateLinearTaskStatusForStory(story.linearTaskId, 'completed');
      await postLinearComment(story.linearTaskId,
        `**✅ Pull Request Created**\n\n` +
        `${prResult.url}\n\n` +
        `Files changed: ${agentResult.changes.length}\n` +
        `AI tokens: ${agentResult.tokensUsed}\n` +
        `Estimated cost: $${agentResult.estimatedCost.toFixed(4)}`
      );

      // Slack notification
      try {
        await sendSlackNotification({
          completionId: storyId,
          projectName: story.project.name,
          title: story.title,
          rationale: story.rationale,
          prUrl: prResult.url,
        });
      } catch (e) {
        console.error('[Execution] Slack notification failed:', e);
      }

      console.log(`[Execution] Story ${storyId} completed successfully`);
    }

  } catch (error) {
    console.error(`[Execution] Error executing story ${storyId}:`, error);

    await prisma.story.update({
      where: { id: storyId },
      data: { status: 'failed' },
    });

    await updateLinearTaskStatusForStory(story.linearTaskId, 'failed');
    await postLinearComment(story.linearTaskId,
      `**❌ Execution Failed**\n\n` +
      `Error: ${error instanceof Error ? error.message : String(error)}\n\n` +
      `_The ${agentRole} agent encountered an issue_`
    );
  } finally {
    if (repoPath) await cleanup(repoPath);
  }
}

/**
 * Build PR body with agent metadata and thinking trace
 */
function buildPRBody(story: any, result: CodeGenResult, agentRole: string): string {
  // Build tool usage summary
  const toolSummary = result.toolCalls.length > 0
    ? result.toolCalls.map(tc => `\`${tc.tool}\``).join(', ')
    : 'None';

  // Build thinking trace summary (first few entries)
  const thinkingSummary = result.thinkingTrace.length > 0
    ? result.thinkingTrace.slice(0, 3).map(t => `- Turn ${t.turn}: ${t.action}`).join('\n')
    : 'No thinking trace captured';

  // Agent display name
  const agentDisplayName = agentRole.charAt(0).toUpperCase() + agentRole.slice(1);

  return `## 🤖 AI-Generated Code Changes

**Story:** ${story.title}
**Priority:** ${story.priority}

### Rationale
${story.rationale}

### Agent Details
- **Agent:** ${agentDisplayName}
- **Model:** Claude Opus via Agent SDK
- **Tokens used:** ${result.tokensUsed}
- **Estimated cost:** $${result.estimatedCost.toFixed(4)}
- **Tests run:** ${result.testsRun ? '✅' : '⚠️ Not available'}
- **Lint passed:** ${result.lintPassed ? '✅' : '⚠️ Not available'}
- **Tools used:** ${toolSummary}

### Changes
${result.changes.map(c => `- \`${c.path}\` (${c.operation})`).join('\n')}

### Explanation
${result.explanation}

### Agent Thinking Summary
${thinkingSummary}

---
*Generated by Virtual Co-Founder using Claude Agent SDK*`;
}

/**
 * Format thinking trace for Linear comment
 */
function formatThinkingTraceForLinear(result: CodeGenResult): string {
  const sections: string[] = [];
  
  // Tool calls section
  if (result.toolCalls.length > 0) {
    sections.push(`**🔧 Tools Used (${result.toolCalls.length}):**`);
    for (const tc of result.toolCalls.slice(0, 10)) {
      sections.push(`- \`${tc.tool}\`: ${JSON.stringify(tc.input).slice(0, 100)}...`);
    }
    if (result.toolCalls.length > 10) {
      sections.push(`_...and ${result.toolCalls.length - 10} more_`);
    }
  }
  
  // Thinking trace section
  if (result.thinkingTrace.length > 0) {
    sections.push('');
    sections.push(`**💭 Agent Reasoning (${result.thinkingTrace.length} turns):**`);
    for (const t of result.thinkingTrace.slice(0, 5)) {
      const thinkingSnippet = t.thinking.slice(0, 150).replace(/\n/g, ' ');
      sections.push(`${t.turn}. ${thinkingSnippet}...`);
    }
    if (result.thinkingTrace.length > 5) {
      sections.push(`_...and ${result.thinkingTrace.length - 5} more turns_`);
    }
  }
  
  return sections.join('\n');
}

// ============================================================================
// LEGACY FALLBACK
// ============================================================================

/**
 * Execute story with placeholder changes (legacy mode)
 */
async function executeStoryLegacy(storyId: string): Promise<void> {
  console.log(`[Execution] Processing story (legacy mode): ${storyId}`);

  const story = await prisma.story.findUnique({
    where: { id: storyId },
    include: { project: true },
  });

  if (!story) {
    console.error(`[Execution] Story ${storyId} not found`);
    return;
  }

  if (story.policy === 'suggest_only') {
    await prisma.story.update({
      where: { id: storyId },
      data: { status: 'completed' },
    });
    await updateLinearTaskStatusForStory(story.linearTaskId, 'completed');
    return;
  }

  if (story.policy === 'approval_required' && !story.userApproved) {
    return;
  }

  await prisma.story.update({
    where: { id: storyId },
    data: { status: 'in_progress' },
  });
  await updateLinearTaskStatusForStory(story.linearTaskId, 'in_progress');
  await postLinearComment(story.linearTaskId,
    `**🚀 Execution Started**\n\nWorking on: ${story.title}`
  );

  let repoPath: string | null = null;

  try {
    const repo = story.project.repo;
    if (!repo) throw new Error('No repository configured');

    const authenticatedUrl = await getAuthenticatedCloneUrl(repo);
    repoPath = await cloneRepo(authenticatedUrl);
    const branchName = `ai-improvement-${storyId.slice(0, 8)}`;
    await createBranch(repoPath, branchName);

    // Placeholder changes (legacy)
    const placeholderChanges = [{
      path: 'AI_IMPROVEMENTS.md',
      content: `# AI-Generated Improvements\n\nStory: ${storyId}\nGenerated: ${new Date().toISOString()}\n\n${story.title}\n\n${story.rationale}\n`,
    }];

    await applyChanges(repoPath, placeholderChanges);
    await commitChanges(repoPath, `AI improvement: ${story.title}`);
    await pushBranch(repoPath, branchName);

    // Use async parser to get owner from GitHub App installation
    const { owner, repo: repoName } = await parseRepoUrlWithInstallation(repo);
    
    const prResult = await createPullRequest({
      owner,
      repo: repoName,
      head: branchName,
      base: 'main',
      title: story.title,
      body: `**Generated by AI Co-Founder (Legacy Mode)**\n\n${story.rationale}`,
    });

    await prisma.story.update({
      where: { id: storyId },
      data: {
        status: 'completed',
        executedAt: new Date(),
        prUrl: prResult.url,
      },
    });

    await updateLinearTaskStatusForStory(story.linearTaskId, 'completed');
    await postLinearComment(story.linearTaskId,
      `**✅ Pull Request Created**\n\n${prResult.url}`
    );

    try {
      await sendSlackNotification({
        completionId: storyId,
        projectName: story.project.name,
        title: story.title,
        rationale: story.rationale,
        prUrl: prResult.url,
      });
    } catch (e) {
      console.error('[Execution] Slack failed:', e);
    }

  } catch (error) {
    console.error(`[Execution] Error:`, error);
    await prisma.story.update({
      where: { id: storyId },
      data: { status: 'failed' },
    });
    await updateLinearTaskStatusForStory(story.linearTaskId, 'failed');
    await postLinearComment(story.linearTaskId,
      `**❌ Execution Failed**\n\n${error instanceof Error ? error.message : String(error)}`
    );
  } finally {
    if (repoPath) await cleanup(repoPath);
  }
}

// ============================================================================
// WORKER SETUP
// ============================================================================

/**
 * Main execution function - chooses SDK or legacy based on feature flag
 */
async function executeStory(storyId: string): Promise<void> {
  if (featureFlags.AGENT_SDK_ENABLED) {
    await executeStorySDK(storyId);
  } else {
    await executeStoryLegacy(storyId);
  }
}

async function processExecutionJob(job: Job<ExecutionJob>): Promise<void> {
  const { storyId, priority } = job.data;
  
  // Log priority for queue ordering visibility
  if (priority) {
    console.log(`[Execution] Processing ${priority} priority story: ${storyId}`);
  }
  
  await executeStory(storyId);
}

// Worker with priority support
const worker = new Worker<ExecutionJob>('execution-queue', processExecutionJob, {
  connection,
  concurrency: featureFlags.PARALLEL_EXECUTION_ENABLED ? 3 : 1,
  limiter: {
    max: 10,
    duration: 60000,
  },
});

worker.on('completed', (job) => {
  console.log(`[Execution] Job ${job.id} completed`);
});

worker.on('failed', (job, err) => {
  console.error(`[Execution] Job ${job?.id} failed:`, err);
});

// Graceful shutdown
async function shutdown() {
  console.log('[Execution] Shutting down...');
  await worker.close();
  await connection.quit();
  await prisma.$disconnect();
  process.exit(0);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

console.log(`[Execution] Worker started (SDK: ${featureFlags.AGENT_SDK_ENABLED ? 'enabled' : 'disabled'})`);

export { executeStory };
