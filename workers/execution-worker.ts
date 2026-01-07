// Execution worker - Processes approved completions and creates PRs
import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(__dirname, '../.env.local') });

import { Worker, Job } from 'bullmq';
import Redis from 'ioredis';
import { PrismaClient } from '@prisma/client';
import { cloneRepo, createBranch, applyChanges, commitChanges, pushBranch, cleanup } from '../lib/git';
import { createPullRequest, parseRepoUrl } from '../lib/github';
import { sendSlackNotification } from '../lib/slack';
import { updateLinearTaskStatus, getTeamWorkflowStates, addLinearComment } from '../lib/linear';

// Create fresh Prisma client with direct connection (not pooler)
const directDatabaseUrl = process.env.DATABASE_URL?.replace(':6543', ':5432').replace('?pgbouncer=true&connection_limit=1', '');
const prisma = new PrismaClient({
  datasources: {
    db: {
      url: directDatabaseUrl,
    },
  },
});

// Redis connection for BullMQ worker
const connection = new Redis(
  process.env.REDIS_URL || 'redis://localhost:6379',
  {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    // TLS for Upstash (rediss://)
    tls: process.env.REDIS_URL?.startsWith('rediss://') ? {} : undefined,
  }
);

interface ExecutionJob {
  completionId: string;
}

/**
 * Update Linear task status based on completion status
 */
async function updateLinearTaskStatusForCompletion(
  linearTaskId: string | null,
  completionStatus: string,
  teamId: string = 'd5cbb99d-df57-4b21-87c9-95fc5089a6a2' // Default: Virtual cofounder team
): Promise<void> {
  if (!linearTaskId) {
    return; // No Linear task linked, skip
  }

  try {
    // Get workflow states for the team
    const states = await getTeamWorkflowStates(teamId);

    // Map completion status to Linear state
    let targetState = states.find((s) => {
      const stateName = s.name.toLowerCase();
      const stateType = s.type.toLowerCase();

      switch (completionStatus) {
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

    // Fallback: find any state matching the type
    if (!targetState) {
      targetState = states.find((s) => {
        if (completionStatus === 'in_progress') return s.type === 'started';
        if (completionStatus === 'completed') return s.type === 'completed';
        if (completionStatus === 'failed') return s.type === 'canceled';
        return s.type === 'unstarted';
      });
    }

    if (targetState) {
      await updateLinearTaskStatus(linearTaskId, targetState.id);
      console.log(`[Linear Sync] Updated task ${linearTaskId} to state: ${targetState.name}`);
    } else {
      console.warn(`[Linear Sync] No matching state found for status: ${completionStatus}`);
    }
  } catch (error) {
    console.error('[Linear Sync] Failed to update Linear task:', error);
    // Don't throw - Linear sync failures shouldn't break execution
  }
}

/**
 * Execute a completion: clone repo → create branch → commit → push → create PR
 */
async function executeCompletion(completionId: string): Promise<void> {
  console.log(`[Execution Worker] Processing completion: ${completionId}`);

  try {
    // Fetch completion with project details
    const completion = await prisma.completion.findUnique({
      where: { id: completionId },
      include: { project: true },
    });

    if (!completion) {
      console.error(`[Execution Worker] Completion ${completionId} not found`);
      return;
    }

    // Check policy
    if (completion.policy === 'suggest_only') {
      console.log(`[Execution Worker] Completion ${completionId} is suggest_only - skipping execution`);
      await prisma.completion.update({
        where: { id: completionId },
        data: { status: 'completed' },
      });

      // Sync status to Linear
      await updateLinearTaskStatusForCompletion(completion.linearTaskId, 'completed');

      return;
    }

    // Check approval for approval_required policy
    if (completion.policy === 'approval_required' && !completion.userApproved) {
      console.log(`[Execution Worker] Completion ${completionId} requires approval - skipping`);
      return;
    }

    // Mark as in progress
    await prisma.completion.update({
      where: { id: completionId },
      data: { status: 'in_progress' },
    });

    console.log(`[Execution Worker] Completion ${completionId} marked as in_progress`);

    // Sync status to Linear
    await updateLinearTaskStatusForCompletion(completion.linearTaskId, 'in_progress');

    // Post execution start comment to Linear
    if (completion.linearTaskId) {
      try {
        const startComment = `**🚀 Execution Started**\n\nThe AI Co-Founder is now working on this task.\n\n**Project:** ${completion.project.name}\n**Repository:** ${completion.project.repo}\n\n_Started at ${new Date().toLocaleString()}_`;
        await addLinearComment(completion.linearTaskId, startComment);
        console.log(`[Execution Worker] Posted execution start to Linear task ${completion.linearTaskId}`);
      } catch (error) {
        console.error(`[Execution Worker] Failed to post execution start to Linear:`, error);
      }
    }

    // Execute Git + GitHub workflow
    let repoPath: string | null = null;

    try {
      // Step 1: Clone repository with authentication
      const repo = completion.project.repo;
      if (!repo) {
        throw new Error('Project has no repository configured');
      }

      // Get authenticated clone URL using GitHub App token
      const { getAuthenticatedCloneUrl } = await import('../lib/github');
      const authenticatedUrl = await getAuthenticatedCloneUrl(repo);

      // Preserve original repo URL for PR creation
      const repoUrl = repo.startsWith('http')
        ? repo
        : `https://github.com/${repo}.git`;

      console.log(`[Execution Worker] Cloning repository: ${repoUrl}`);
      repoPath = await cloneRepo(authenticatedUrl);

      // Step 2: Create branch
      const branchName = `ai-improvement-${completionId.slice(0, 8)}`;
      await createBranch(repoPath, branchName);

      // Step 3: Apply changes (placeholder for now)
      // TODO: Parse completion.diff and apply actual changes in future story
      const placeholderChanges = [
        {
          path: 'AI_IMPROVEMENTS.md',
          content: `# AI-Generated Improvements\n\nCompletion ID: ${completionId}\nGenerated: ${new Date().toISOString()}\n\n${completion.title}\n\n## Details\n${completion.rationale}\n`,
        },
      ];

      await applyChanges(repoPath, placeholderChanges);

      // Step 4: Commit changes
      const commitMessage = `AI improvement: ${completion.title}`;
      await commitChanges(repoPath, commitMessage);

      // Step 5: Push branch
      await pushBranch(repoPath, branchName);

      // Post progress update to Linear before creating PR
      if (completion.linearTaskId) {
        try {
          const progressComment = `**⚙️ Creating Pull Request**\n\nChanges have been committed and pushed to branch \`${branchName}\`.\n\nNow creating pull request...\n\n_Updated at ${new Date().toLocaleString()}_`;
          await addLinearComment(completion.linearTaskId, progressComment);
        } catch (error) {
          console.error(`[Execution Worker] Failed to post progress to Linear:`, error);
        }
      }

      // Step 6: Create pull request
      const { owner, repo: repoName } = parseRepoUrl(repoUrl);
      const prUrl = await createPullRequest({
        owner,
        repo: repoName,
        head: branchName,
        base: 'main', // TODO: Make configurable per project
        title: completion.title,
        body: `**Generated by AI Co-Founder**\n\nCompletion ID: ${completionId}\nPriority: ${completion.priority}\n\n${completion.rationale}`,
      });

      console.log(`[Execution Worker] PR created: ${prUrl.url}`);

      // Step 7: Update completion with PR URL
      await prisma.completion.update({
        where: { id: completionId },
        data: {
          status: 'completed',
          executedAt: new Date(),
          prUrl: prUrl.url,
        },
      });

      // Sync status to Linear
      await updateLinearTaskStatusForCompletion(completion.linearTaskId, 'completed');

      // Add PR URL as a comment to Linear task
      if (completion.linearTaskId) {
        try {
          const prComment = `**Pull Request Created**\n\n${prUrl.url}\n\n**Project:** ${completion.project.name}\n**Title:** ${completion.title}\n\n_Automatically created by AI Co-Founder execution worker_`;
          await addLinearComment(completion.linearTaskId, prComment); // addLinearComment with prUrl
          console.log(`[Execution Worker] Posted PR URL to Linear task ${completion.linearTaskId}`);
        } catch (error) {
          console.error(`[Execution Worker] Failed to post PR URL to Linear:`, error);
        }
      }

      console.log(`[Execution Worker] Completion ${completionId} executed successfully`);

      // Step 8: Send Slack notification
      try {
        await sendSlackNotification({
          completionId,
          projectName: completion.project.name,
          title: completion.title,
          rationale: completion.rationale,
          prUrl: prUrl.url,
        });
      } catch (slackError) {
        // Don't fail the completion if Slack notification fails
        console.error(`[Execution Worker] Failed to send Slack notification:`, slackError);
      }
    } finally {
      // Cleanup cloned repository
      if (repoPath) {
        await cleanup(repoPath);
      }
    }
  } catch (error) {
    console.error(`[Execution Worker] Error executing completion ${completionId}:`, error);

    // Mark as failed
    await prisma.completion.update({
      where: { id: completionId },
      data: { status: 'failed' },
    });

    // Fetch completion data for Linear updates
    try {
      const failedCompletion = await prisma.completion.findUnique({
        where: { id: completionId },
        include: { project: true },
      });

      if (failedCompletion?.linearTaskId) {
        // Sync failed status to Linear
        await updateLinearTaskStatusForCompletion(failedCompletion.linearTaskId, 'failed');

        // Post failure comment to Linear with error details
        const errorMessage = error instanceof Error ? error.message : String(error);
        const failureComment = `**❌ Execution Failed**\n\nThe AI Co-Founder encountered an error while working on this task.\n\n**Error:**\n\`\`\`\n${errorMessage}\n\`\`\`\n\n**Project:** ${failedCompletion.project.name}\n\n_Failed at ${new Date().toLocaleString()}_`;
        await addLinearComment(failedCompletion.linearTaskId, failureComment);
        console.log(`[Execution Worker] Posted execution failure to Linear task ${failedCompletion.linearTaskId}`);
      }
    } catch (linearError) {
      console.error(`[Execution Worker] Failed to post execution failure to Linear:`, linearError);
    }
  }
}

/**
 * Worker processor
 */
async function processExecutionJob(job: Job<ExecutionJob>): Promise<void> {
  const { completionId } = job.data;
  await executeCompletion(completionId);
}

/**
 * Start the worker
 */
const worker = new Worker<ExecutionJob>('execution-queue', processExecutionJob, {
  connection,
  concurrency: 3, // Process 3 completions concurrently
  limiter: {
    max: 10, // Max 10 jobs per duration
    duration: 60000, // 1 minute
  },
});

worker.on('completed', (job) => {
  console.log(`[Execution Worker] Job ${job.id} completed`);
});

worker.on('failed', (job, err) => {
  console.error(`[Execution Worker] Job ${job?.id} failed:`, err);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('[Execution Worker] Shutting down...');
  await worker.close();
  await connection.quit();
  await prisma.$disconnect();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('[Execution Worker] Shutting down...');
  await worker.close();
  await connection.quit();
  await prisma.$disconnect();
  process.exit(0);
});

console.log('[Execution Worker] Worker started');

export { executeCompletion };
