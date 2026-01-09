// Orchestrator worker - Processes individual project analyses
// Uses Agent SDK for autonomous subagent spawning when AGENT_SDK_ENABLED=true
import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(__dirname, '../.env.local') });

import { Worker, Job } from 'bullmq';
import Redis from 'ioredis';
import { PrismaClient } from '@prisma/client';
import { runOrchestrator, type ScanContext } from '../lib/orchestrator';
import { sendCompletionNotification } from '../lib/slack';
import { createLinearTask, getDefaultTeamId, mapPriorityToLinear, addLinearComment, getOrCreateProject, getOrCreateLabel, getBacklogStateId } from '../lib/linear';
import { featureFlags } from '../lib/config/feature-flags';

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

interface OrchestratorJob {
  projectId: string;
  scanContext: ScanContext;
  runId: string;
  workspaceId: string;
}

/**
 * Process a single project analysis
 */
async function processProject(job: Job<OrchestratorJob>): Promise<void> {
  const { projectId, scanContext, runId, workspaceId } = job.data;

  console.log(`[Orchestrator Worker] Processing project ${projectId} for run ${runId}`);

  try {
    // Run orchestrator for this single project
    const result = await runOrchestrator([scanContext]);

    console.log(`[Orchestrator Worker] Project ${projectId}: ${result.findings.length} findings, ${result.stories.length} stories`);

    // Save agent findings to database
    for (const finding of result.findings) {
      await prisma.agentFinding.create({
        data: {
          workspaceId,
          runId,
          projectId: finding.projectId,
          agent: finding.agent,
          issue: finding.issue,
          action: finding.action,
          severity: finding.severity,
          effort: finding.effort,
          impact: finding.impact,
          confidence: finding.confidence,
          rank: finding.rank || 0,
        },
      });
    }

    // Get project for notifications
    const project = await prisma.project.findUnique({
      where: { id: projectId },
    });

    // Save stories to database, create Linear tasks, and send Slack notifications
    for (const story of result.stories) {
      const dbStory = await prisma.story.create({
        data: {
          workspaceId,
          runId,
          projectId: story.projectId,
          title: story.title,
          rationale: story.rationale,
          priority: story.priority,
          policy: story.policy,
          status: 'pending',
        },
      });

      // Create Linear task with labels, project, and workflow state
      try {
        const teamId = await getDefaultTeamId();
        const linearPriority = mapPriorityToLinear(story.priority);

        // Get or create Linear project for this dashboard project
        const linearProjectId = project?.name
          ? await getOrCreateProject(teamId, project.name)
          : undefined;

        // Get backlog state for new tasks
        const backlogStateId = await getBacklogStateId(teamId);

        // Create labels for filtering
        const labelIds: string[] = [];

        // Priority label
        const priorityLabel = await getOrCreateLabel(teamId, `priority:${story.priority.toLowerCase()}`);
        labelIds.push(priorityLabel);

        // Policy label
        if (story.policy) {
          const policyLabel = await getOrCreateLabel(teamId, `policy:${story.policy.toLowerCase()}`);
          labelIds.push(policyLabel);
        }

        const linearTask = await createLinearTask({
          teamId,
          title: story.title,
          description: `## Rationale
${story.rationale}

---

**Domain:** ${project?.domain || 'N/A'}
**Policy:** ${story.policy}

_Run ID: ${runId}_
_Story ID: ${dbStory.id}_`,
          priority: linearPriority,
          labelIds,
          projectId: linearProjectId,
          stateId: backlogStateId,
        });

        // Update story with Linear task ID, URL, and identifier
        await prisma.story.update({
          where: { id: dbStory.id },
          data: { 
            linearTaskId: linearTask.id,
            linearIssueUrl: linearTask.url,
            linearIdentifier: linearTask.identifier,
          },
        });

        console.log(`[Orchestrator Worker] Created Linear task ${linearTask.identifier} (${linearTask.url}) for story ${dbStory.id}`);

        // Post agent dialogue as a comment
        if (result.conversation && result.conversation.length > 0) {
          const dialogue = result.conversation
            .slice(0, 10) // Limit to first 10 messages to avoid overly long comments
            .map((msg, i) => `${i + 1}. ${msg}`)
            .join('\n\n');

          await addLinearComment(
            linearTask.id,
            `**Agent Dialogue:**\n\n${dialogue}\n\n_Generated by AI Co-Founder orchestrator run ${runId}_`
          );

          console.log(`[Orchestrator Worker] Posted agent dialogue to Linear task ${linearTask.identifier}`);
        }
      } catch (linearError) {
        // Log but don't fail the job if Linear fails
        console.error('[Orchestrator Worker] Linear task creation failed:', linearError);
      }

      // Send Slack notification (non-blocking)
      // Include Linear URL if we created a task
      if (project) {
        try {
          // Fetch the updated story to get the Linear URL
          const updatedStory = await prisma.story.findUnique({
            where: { id: dbStory.id },
            select: { linearIssueUrl: true },
          });
          
          await sendCompletionNotification({
            completionId: dbStory.id,
            projectName: project.name,
            title: story.title,
            rationale: story.rationale,
            priority: story.priority,
            policy: story.policy,
            linearUrl: updatedStory?.linearIssueUrl || undefined,
          });
        } catch (slackError) {
          // Log but don't fail the job if Slack fails
          console.error('[Orchestrator Worker] Slack notification failed:', slackError);
        }
      }
    }

    console.log(`[Orchestrator Worker] Project ${projectId} complete: ${result.findings.length} findings, ${result.stories.length} stories saved`);

    // Update orchestrator run with aggregated counts
    const findingsCount = await prisma.agentFinding.count({
      where: { runId },
    });
    const storiesCount = await prisma.story.count({
      where: { runId },
    });

    await prisma.orchestratorRun.update({
      where: { runId },
      data: {
        findingsCount,
        storiesCount,
        conversation: result.conversation,
      },
    });

  } catch (error) {
    console.error(`[Orchestrator Worker] Error processing project ${projectId}:`, error);
    throw error; // Let BullMQ handle retries
  }
}

// Create the worker
const worker = new Worker('orchestrator', processProject, {
  connection,
  concurrency: 1, // Process one project at a time
  limiter: {
    max: 1, // Max 1 job
    duration: 60000, // per 60 seconds (avoid rate limits)
  },
});

// Event handlers
worker.on('completed', async (job) => {
  console.log(`[Orchestrator Worker] Job ${job.id} completed successfully`);

  if (job.data.runId) {
    try {
      // Check if there are any more jobs for this run
      const queue = await import('bullmq').then(m => new m.Queue('orchestrator', { connection }));
      const waitingJobs = await queue.getWaiting();
      const activeJobs = await queue.getActive();

      // Filter jobs for this specific runId
      const remainingJobsForRun = [...waitingJobs, ...activeJobs].filter(
        j => j.data.runId === job.data.runId
      );

      if (remainingJobsForRun.length === 0) {
        // This was the last job for this run - mark it as completed
        await prisma.orchestratorRun.update({
          where: { runId: job.data.runId },
          data: {
            status: 'completed',
            completedAt: new Date(),
          },
        });
        console.log(`[Orchestrator Worker] Run ${job.data.runId} marked as completed`);
      }
    } catch (error) {
      console.error('[Orchestrator Worker] Error updating run status:', error);
    }
  }
});

worker.on('failed', (job, err) => {
  console.error(`[Orchestrator Worker] Job ${job?.id} failed:`, err);
});

worker.on('error', (err) => {
  console.error('[Orchestrator Worker] Worker error:', err);
});

console.log(`[Orchestrator Worker] Started (SDK: ${featureFlags.AGENT_SDK_ENABLED ? 'enabled - autonomous subagent spawning' : 'disabled - legacy mode'})`);
console.log('[Orchestrator Worker] Waiting for jobs...');

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('[Orchestrator Worker] Shutting down...');
  await worker.close();
  await connection.quit();
  await prisma.$disconnect();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('[Orchestrator Worker] Shutting down...');
  await worker.close();
  await connection.quit();
  await prisma.$disconnect();
  process.exit(0);
});
