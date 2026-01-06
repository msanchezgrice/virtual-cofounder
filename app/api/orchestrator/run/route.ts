// API route to run the Head of Product orchestrator
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { runOrchestrator, type ScanContext } from '@/lib/orchestrator';
import { sendCompletionNotification } from '@/lib/slack';

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

    // 6. Save completions to database and send Slack notifications
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

      // Get project name for Slack notification
      const project = projects.find(p => p.id === completion.projectId);
      if (project) {
        // Send Slack notification (non-blocking)
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
