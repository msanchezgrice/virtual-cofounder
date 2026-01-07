// API route to run the Head of Product orchestrator
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { runOrchestrator, type ScanContext } from '@/lib/orchestrator';
import { sendCompletionNotification } from '@/lib/slack';
import { createLinearTask, getDefaultTeamId, mapPriorityToLinear, addLinearComment } from '@/lib/linear';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const workspaceId = process.env.WORKSPACE_ID;
    if (!workspaceId) {
      return NextResponse.json(
        { error: 'WORKSPACE_ID not configured' },
        { status: 500 }
      );
    }

    console.log('[Orchestrator] Starting orchestrator run...');

    // 1. Fetch recent scan results from database (last 24 hours)
    const cutoffTime = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const projects = await db.project.findMany({
      where: {
        workspaceId,
        status: {
          contains: 'ACTIVE', // Only active projects
        },
      },
      include: {
        scans: {
          where: {
            scannedAt: {
              gte: cutoffTime,
            },
          },
          orderBy: {
            scannedAt: 'desc',
          },
        },
      },
    });

    console.log(`[Orchestrator] Found ${projects.length} active projects with recent scans`);

    // 2. Build scan contexts for orchestrator
    const scanContexts: ScanContext[] = projects
      .filter(project => project.scans.length > 0) // Only projects with scans
      .map(project => {
        // Group scans by type (take most recent of each type)
        const scansByType = project.scans.reduce((acc, scan) => {
          if (!acc[scan.scanType] || scan.scannedAt > acc[scan.scanType].scannedAt) {
            acc[scan.scanType] = scan;
          }
          return acc;
        }, {} as Record<string, typeof project.scans[0]>);

        return {
          project: {
            id: project.id,
            name: project.name,
            domain: project.domain,
            status: project.status,
          },
          scans: {
            domain: scansByType.domain ? {
              status: scansByType.domain.status,
              data: scansByType.domain.domainData,
            } : undefined,
            seo: scansByType.seo ? {
              status: scansByType.seo.status,
              detail: scansByType.seo.seoDetail,
            } : undefined,
            analytics: scansByType.analytics ? {
              status: scansByType.analytics.status,
              data: scansByType.analytics.analyticsData,
            } : undefined,
          },
        };
      });

    if (scanContexts.length === 0) {
      return NextResponse.json({
        success: false,
        message: 'No projects with recent scans found',
        run_id: null,
        findings_count: 0,
        completions_count: 0,
      });
    }

    console.log(`[Orchestrator] Processing ${scanContexts.length} projects`);

    // 3. Run orchestrator
    const result = await runOrchestrator(scanContexts);

    console.log(`[Orchestrator] Run complete: ${result.findings.length} findings, ${result.completions.length} completions`);

    // 4. Save orchestrator run to database
    const orchestratorRun = await db.orchestratorRun.create({
      data: {
        runId: result.runId,
        status: 'completed',
        findingsCount: result.findings.length,
        completionsCount: result.completions.length,
        conversation: result.conversation,
        completedAt: new Date(),
      },
    });

    // 5. Save agent findings to database
    for (const finding of result.findings) {
      await db.agentFinding.create({
        data: {
          workspaceId,
          runId: result.runId,
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

    // 6. Save completions to database, create Linear tasks, and send Slack notifications
    for (const completion of result.completions) {
      const dbCompletion = await db.completion.create({
        data: {
          workspaceId,
          runId: result.runId,
          projectId: completion.projectId,
          title: completion.title,
          rationale: completion.rationale,
          priority: completion.priority,
          policy: completion.policy,
          status: 'pending',
        },
      });

      // Get project for notifications
      const project = projects.find(p => p.id === completion.projectId);

      // Create Linear task
      try {
        const teamId = await getDefaultTeamId();
        const linearPriority = mapPriorityToLinear(completion.priority);

        const linearTask = await createLinearTask({
          teamId,
          title: completion.title,
          description: `**Project:** ${project?.name || 'Unknown'}\n\n**Rationale:**\n${completion.rationale}\n\n**Priority:** ${completion.priority}\n**Policy:** ${completion.policy}\n\n**Run ID:** ${result.runId}`,
          priority: linearPriority,
        });

        // Update completion with Linear task ID
        await db.completion.update({
          where: { id: dbCompletion.id },
          data: { linearTaskId: linearTask.id },
        });

        console.log(`[Orchestrator] Created Linear task ${linearTask.identifier} for completion ${dbCompletion.id}`);

        // Post agent dialogue as a comment
        if (result.conversation && result.conversation.length > 0) {
          const dialogue = result.conversation
            .slice(0, 10) // Limit to first 10 messages to avoid overly long comments
            .map((msg, i) => `${i + 1}. ${msg}`)
            .join('\n\n');

          await addLinearComment(
            linearTask.id,
            `**Agent Dialogue:**\n\n${dialogue}\n\n_Generated by AI Co-Founder orchestrator run ${result.runId}_`
          );

          console.log(`[Orchestrator] Posted agent dialogue to Linear task ${linearTask.identifier}`);
        }
      } catch (linearError) {
        // Log but don't fail the orchestrator run if Linear fails
        console.error('[Orchestrator] Linear task creation failed:', linearError);
      }

      // Send Slack notification (non-blocking)
      if (project) {
        try {
          await sendCompletionNotification({
            completionId: dbCompletion.id,
            projectName: project.name,
            title: completion.title,
            rationale: completion.rationale,
            priority: completion.priority,
            policy: completion.policy,
          });
        } catch (slackError) {
          // Log but don't fail the orchestrator run if Slack fails
          console.error('[Orchestrator] Slack notification failed:', slackError);
        }
      }
    }

    console.log(`[Orchestrator] Saved ${result.findings.length} findings and ${result.completions.length} completions to database`);

    // 7. Return results
    return NextResponse.json({
      success: true,
      run_id: result.runId,
      findings_count: result.findings.length,
      completions_count: result.completions.length,
      conversation: result.conversation,
    });

  } catch (error) {
    console.error('[Orchestrator] Error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
