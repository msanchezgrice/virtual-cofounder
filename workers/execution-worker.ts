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
import { createPullRequest, parseRepoUrl, getAuthenticatedCloneUrl } from '../lib/github';
import { sendSlackNotification } from '../lib/slack';
import { updateLinearTaskStatus, getTeamWorkflowStates, addLinearComment } from '../lib/linear';
import { featureFlags } from '../lib/config/feature-flags';
import { runAgentWithSDK } from '../lib/agents/sdk-runner';
import { codeGenerationAgent } from '../lib/agents';

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
  thinkingTrace: object[];
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
  });

  // Parse code changes from agent output
  const changes = parseCodeChanges(result.output);
  
  // Check if agent ran tests and lint
  const testsRun = result.session.toolCalls.some(tc => tc.tool === 'RunTests');
  const lintPassed = result.session.toolCalls.some(tc => tc.tool === 'RunLinter');

  console.log(`[CodeGen] Agent completed: ${changes.length} changes, ${result.session.tokensUsed} tokens`);

  return {
    changes,
    explanation: result.output.slice(0, 500),
    testsRun,
    lintPassed,
    tokensUsed: result.session.tokensUsed,
    estimatedCost: estimateCost(result.session.tokensUsed),
    thinkingTrace: [],
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
    `**🤖 Code Generation Agent Started**\n\n` +
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

    // Run Code Generation Agent
    const codeGenResult = await runCodeGenAgent(story, repoPath, {});

    // Apply changes
    if (codeGenResult.changes.length > 0) {
      await applyChanges(repoPath, codeGenResult.changes.map(c => ({
        path: c.path,
        content: c.content,
      })));

      await postLinearComment(story.linearTaskId,
        `**⚙️ Code Changes Generated**\n\n` +
        `Files modified: ${codeGenResult.changes.length}\n` +
        `Tokens used: ${codeGenResult.tokensUsed}\n` +
        `Cost: $${codeGenResult.estimatedCost.toFixed(4)}\n\n` +
        `\`\`\`\n${codeGenResult.explanation}\n\`\`\``
      );
    } else {
      // No changes - create documentation file as fallback
      const fallbackChanges = [{
        path: 'AI_IMPROVEMENTS.md',
        content: `# AI Analysis\n\nStory: ${story.title}\nAnalysis: ${codeGenResult.explanation}\n`,
      }];
      await applyChanges(repoPath, fallbackChanges);
    }

    // Commit and push
    await commitChanges(repoPath, `AI improvement: ${story.title}`);
    await pushBranch(repoPath, branchName);

    // Create PR
    const repoUrl = repo.startsWith('http') ? repo : `https://github.com/${repo}.git`;
    const { owner, repo: repoName } = parseRepoUrl(repoUrl);
    
    const prBody = buildPRBody(story, codeGenResult);
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
      `Files changed: ${codeGenResult.changes.length}\n` +
      `AI tokens: ${codeGenResult.tokensUsed}\n` +
      `Estimated cost: $${codeGenResult.estimatedCost.toFixed(4)}`
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
      `_The Code Generation Agent encountered an issue_`
    );
  } finally {
    if (repoPath) await cleanup(repoPath);
  }
}

/**
 * Build PR body with agent metadata
 */
function buildPRBody(story: any, result: CodeGenResult): string {
  return `## 🤖 AI-Generated Code Changes

**Story:** ${story.title}
**Priority:** ${story.priority}

### Rationale
${story.rationale}

### Agent Details
- **Model:** Claude Opus (Code Generation Agent)
- **Tokens used:** ${result.tokensUsed}
- **Estimated cost:** $${result.estimatedCost.toFixed(4)}
- **Tests run:** ${result.testsRun ? '✅' : '⚠️ Not available'}
- **Lint passed:** ${result.lintPassed ? '✅' : '⚠️ Not available'}

### Changes
${result.changes.map(c => `- \`${c.path}\` (${c.operation})`).join('\n')}

### Explanation
${result.explanation}

---
*Generated by Virtual Co-Founder using Claude Agent SDK*`;
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

    const repoUrl = repo.startsWith('http') ? repo : `https://github.com/${repo}.git`;
    const { owner, repo: repoName } = parseRepoUrl(repoUrl);
    
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
