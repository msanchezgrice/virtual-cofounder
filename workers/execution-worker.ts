// Execution worker - Processes approved stories and creates PRs
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
  storyId: string;
}

/**
 * Update Linear task status based on story status
 */
async function updateLinearTaskStatusForStory(
  linearTaskId: string | null,
  storyStatus: string,
  teamId: string = 'd5cbb99d-df57-4b21-87c9-95fc5089a6a2' // Default: Virtual cofounder team
): Promise<void> {
  if (!linearTaskId) {
    return; // No Linear task linked, skip
  }

  try {
    // Get workflow states for the team
    const states = await getTeamWorkflowStates(teamId);

    // Map story status to Linear state
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

    // Fallback: find any state matching the type
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
      console.log(`[Linear Sync] Updated task ${linearTaskId} to state: ${targetState.name}`);
    } else {
      console.warn(`[Linear Sync] No matching state found for status: ${storyStatus}`);
    }
  } catch (error) {
    console.error('[Linear Sync] Failed to update Linear task:', error);
    // Don't throw - Linear sync failures shouldn't break execution
  }
}

/**
 * Execute a story: clone repo → create branch → commit → push → create PR
 */
async function executeStory(storyId: string): Promise<void> {
  console.log(`[Execution Worker] Processing story: ${storyId}`);

  try {
    // Fetch story with project details
    const story = await prisma.story.findUnique({
      where: { id: storyId },
      include: { project: true },
    });

    if (!story) {
      console.error(`[Execution Worker] Story ${storyId} not found`);
      return;
    }

    // Check policy
    if (story.policy === 'suggest_only') {
      console.log(`[Execution Worker] Story ${storyId} is suggest_only - skipping execution`);
      await prisma.story.update({
        where: { id: storyId },
        data: { status: 'completed' },
      });

      // Sync status to Linear
      await updateLinearTaskStatusForStory(story.linearTaskId, 'completed');

      return;
    }

    // Check approval for approval_required policy
    if (story.policy === 'approval_required' && !story.userApproved) {
      console.log(`[Execution Worker] Story ${storyId} requires approval - skipping`);
      return;
    }

    // Mark as in progress
    await prisma.story.update({
      where: { id: storyId },
      data: { status: 'in_progress' },
    });

    console.log(`[Execution Worker] Story ${storyId} marked as in_progress`);

    // Sync status to Linear
    await updateLinearTaskStatusForStory(story.linearTaskId, 'in_progress');

    // Post execution start comment to Linear
    if (story.linearTaskId) {
      try {
        const startComment = `**🚀 Execution Started**\n\nThe AI Co-Founder is now working on this task.\n\n**Project:** ${story.project.name}\n**Repository:** ${story.project.repo}\n\n_Started at ${new Date().toLocaleString()}_`;
        await addLinearComment(story.linearTaskId, startComment);
        console.log(`[Execution Worker] Posted execution start to Linear task ${story.linearTaskId}`);
      } catch (error) {
        console.error(`[Execution Worker] Failed to post execution start to Linear:`, error);
      }
    }

    // Execute Git + GitHub workflow
    let repoPath: string | null = null;

    try {
      // Step 1: Clone repository with authentication
      const repo = story.project.repo;
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
      const branchName = `ai-improvement-${storyId.slice(0, 8)}`;
      await createBranch(repoPath, branchName);

      // Step 3: Apply changes (placeholder for now)
      // TODO: Parse story.diff and apply actual changes in future story
      const placeholderChanges = [
        {
          path: 'AI_IMPROVEMENTS.md',
          content: `# AI-Generated Improvements\n\nStory ID: ${storyId}\nGenerated: ${new Date().toISOString()}\n\n${story.title}\n\n## Details\n${story.rationale}\n`,
        },
      ];

      await applyChanges(repoPath, placeholderChanges);

      // Step 4: Commit changes
      const commitMessage = `AI improvement: ${story.title}`;
      await commitChanges(repoPath, commitMessage);

      // Step 5: Push branch
      await pushBranch(repoPath, branchName);

      // Post progress update to Linear before creating PR
      if (story.linearTaskId) {
        try {
          const progressComment = `**⚙️ Creating Pull Request**\n\nChanges have been committed and pushed to branch \`${branchName}\`.\n\nNow creating pull request...\n\n_Updated at ${new Date().toLocaleString()}_`;
          await addLinearComment(story.linearTaskId, progressComment);
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
        title: story.title,
        body: `**Generated by AI Co-Founder**\n\nStory ID: ${storyId}\nPriority: ${story.priority}\n\n${story.rationale}`,
      });

      console.log(`[Execution Worker] PR created: ${prUrl.url}`);

      // Step 7: Update story with PR URL
      await prisma.story.update({
        where: { id: storyId },
        data: {
          status: 'completed',
          executedAt: new Date(),
          prUrl: prUrl.url,
        },
      });

      // Sync status to Linear
      await updateLinearTaskStatusForStory(story.linearTaskId, 'completed');

      // Add PR URL as a comment to Linear task
      if (story.linearTaskId) {
        try {
          const prComment = `**Pull Request Created**\n\n${prUrl.url}\n\n**Project:** ${story.project.name}\n**Title:** ${story.title}\n\n_Automatically created by AI Co-Founder execution worker_`;
          await addLinearComment(story.linearTaskId, prComment); // addLinearComment with prUrl
          console.log(`[Execution Worker] Posted PR URL to Linear task ${story.linearTaskId}`);
        } catch (error) {
          console.error(`[Execution Worker] Failed to post PR URL to Linear:`, error);
        }
      }

      console.log(`[Execution Worker] Story ${storyId} executed successfully`);

      // Step 8: Send Slack notification
      try {
        await sendSlackNotification({
          completionId: storyId,
          projectName: story.project.name,
          title: story.title,
          rationale: story.rationale,
          prUrl: prUrl.url,
        });
      } catch (slackError) {
        // Don't fail the story if Slack notification fails
        console.error(`[Execution Worker] Failed to send Slack notification:`, slackError);
      }
    } finally {
      // Cleanup cloned repository
      if (repoPath) {
        await cleanup(repoPath);
      }
    }
  } catch (error) {
    console.error(`[Execution Worker] Error executing story ${storyId}:`, error);

    // Mark as failed
    await prisma.story.update({
      where: { id: storyId },
      data: { status: 'failed' },
    });

    // Fetch story data for Linear updates
    try {
      const failedStory = await prisma.story.findUnique({
        where: { id: storyId },
        include: { project: true },
      });

      if (failedStory?.linearTaskId) {
        // Sync failed status to Linear
        await updateLinearTaskStatusForStory(failedStory.linearTaskId, 'failed');

        // Post failure comment to Linear with error details
        const errorMessage = error instanceof Error ? error.message : String(error);
        const failureComment = `**❌ Execution Failed**\n\nThe AI Co-Founder encountered an error while working on this task.\n\n**Error:**\n\`\`\`\n${errorMessage}\n\`\`\`\n\n**Project:** ${failedStory.project.name}\n\n_Failed at ${new Date().toLocaleString()}_`;
        await addLinearComment(failedStory.linearTaskId, failureComment);
        console.log(`[Execution Worker] Posted execution failure to Linear task ${failedStory.linearTaskId}`);
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
  const { storyId } = job.data;
  await executeStory(storyId);
}

/**
 * Start the worker
 */
const worker = new Worker<ExecutionJob>('execution-queue', processExecutionJob, {
  connection,
  concurrency: 3, // Process 3 stories concurrently
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

export { executeStory };
