/**
 * State Manager Agent
 * 
 * Analyzes project state and generates AI assessment + recommendations.
 * Runs after orchestrator completes to create daily project snapshots.
 * 
 * Feature flag: STATE_AGENT_ENABLED
 */

import Anthropic from '@anthropic-ai/sdk';
import { featureFlags } from '@/lib/config/feature-flags';
import { 
  aggregateProjectState, 
  createProjectSnapshot,
  type AggregatedState,
  type LaunchStage 
} from '@/lib/state/aggregate';

const anthropic = new Anthropic();

// Agent configuration
export const stateManagerAgent = {
  name: 'State Manager',
  role: 'state-manager',
  type: 'ops' as const,
  model: 'claude-sonnet-4-5-20250929' as const,
  maxTurns: 1,
  canSpawnSubagents: false,
  prompt: `You are a State Manager that assesses project health and launch readiness.

Given project state data (scan results, work summary, checklist), you will:
1. Assess the current launch stage and progress
2. Identify blockers preventing advancement
3. Recommend 3-5 specific next actions
4. Provide a brief summary paragraph

Output structured JSON only with these fields:
- ai_assessment: One paragraph summary of project health (max 200 words)
- recommended_focus: Array of 3-5 specific, actionable recommendations
- blockers: Array of critical issues preventing launch stage advancement
- confidence: 0.0-1.0 confidence in assessment`,
};

export interface StateAssessment {
  ai_assessment: string;
  recommended_focus: string[];
  blockers: string[];
  confidence: number;
}

/**
 * Build the prompt context from aggregated state
 */
function buildStateContext(state: AggregatedState, projectName: string): string {
  const { launchStage, launchScore, scanScores, workSummary, launchChecklist } = state;

  // Format checklist
  const checklistItems = Object.entries(launchChecklist)
    .map(([key, value]) => `  - ${key.replace(/_/g, ' ')}: ${value ? '✅' : '❌'}`)
    .join('\n');

  // Format scan scores
  const scanItems = Object.entries(scanScores)
    .filter(([key]) => key !== 'overall')
    .map(([key, value]) => `  - ${key}: ${value !== null ? value + '/100' : 'not scanned'}`)
    .join('\n');

  return `
PROJECT: ${projectName}

CURRENT STATE:
- Launch Stage: ${launchStage}
- Launch Score: ${launchScore}/100
- Overall Scan Score: ${scanScores.overall}/100

SCAN SCORES:
${scanItems}

WORK SUMMARY:
- Pending: ${workSummary.pending}
- In Progress: ${workSummary.in_progress}
- Completed: ${workSummary.completed}
- Rejected/Failed: ${workSummary.rejected}
- Total: ${workSummary.total}
- Completion Rate: ${workSummary.completion_rate}%

LAUNCH CHECKLIST:
${checklistItems}

STAGE REQUIREMENTS:
- idea (0-19): Initial concept, no deployment
- mvp (20-39): Basic deployment, some features working
- alpha (40-59): Core features complete, needs polish
- beta (60-79): Feature complete, testing with users
- launch (80-94): Ready for public launch
- growth (95-100): Live with paying users

Assess this project and provide recommendations to advance to the next stage.
`.trim();
}

/**
 * Generate AI assessment using Claude
 */
export async function generateStateAssessment(
  state: AggregatedState,
  projectName: string
): Promise<StateAssessment> {
  // Default assessment if agent is disabled
  if (!featureFlags.STATE_AGENT_ENABLED) {
    return generateDefaultAssessment(state);
  }

  const context = buildStateContext(state, projectName);

  try {
    const response = await anthropic.messages.create({
      model: stateManagerAgent.model,
      max_tokens: 1024,
      messages: [{
        role: 'user',
        content: context,
      }],
      system: stateManagerAgent.prompt,
    });

    // Parse JSON response
    const textContent = response.content.find(c => c.type === 'text');
    if (!textContent || textContent.type !== 'text') {
      throw new Error('No text response from agent');
    }

    // Extract JSON from response (might be wrapped in markdown)
    let jsonStr = textContent.text;
    const jsonMatch = jsonStr.match(/```json?\n?([\s\S]*?)\n?```/);
    if (jsonMatch) {
      jsonStr = jsonMatch[1];
    }

    const parsed = JSON.parse(jsonStr) as StateAssessment;
    
    // Validate response structure
    if (!parsed.ai_assessment || !Array.isArray(parsed.recommended_focus)) {
      throw new Error('Invalid response structure');
    }

    return {
      ai_assessment: parsed.ai_assessment,
      recommended_focus: parsed.recommended_focus.slice(0, 5),
      blockers: parsed.blockers || [],
      confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.8,
    };

  } catch (error) {
    console.error('[StateManager] Error generating assessment:', error);
    return generateDefaultAssessment(state);
  }
}

/**
 * Generate a default assessment when AI is unavailable
 */
function generateDefaultAssessment(state: AggregatedState): StateAssessment {
  const { launchStage, launchScore, launchChecklist, scanScores } = state;

  // Find incomplete items
  const incompleteItems = Object.entries(launchChecklist)
    .filter(([, value]) => !value)
    .map(([key]) => key.replace(/_/g, ' '));

  // Generate recommendations based on incomplete items
  const recommendations: string[] = [];
  
  if (!launchChecklist.analytics_installed) {
    recommendations.push('Set up PostHog or similar analytics to track user behavior');
  }
  if (!launchChecklist.security_passing) {
    recommendations.push('Address critical security vulnerabilities found in scans');
  }
  if (!launchChecklist.payments_configured) {
    recommendations.push('Configure Stripe or payment processor for monetization');
  }
  if (!launchChecklist.performance_passing) {
    recommendations.push('Optimize page load times to improve Core Web Vitals');
  }
  if (!launchChecklist.seo_optimized) {
    recommendations.push('Add meta descriptions and Open Graph tags for better SEO');
  }
  if (!launchChecklist.error_monitoring) {
    recommendations.push('Set up Sentry or similar for production error monitoring');
  }

  // Build assessment
  const stageDisplay = launchStage.charAt(0).toUpperCase() + launchStage.slice(1);
  const ai_assessment = `Project is currently at ${stageDisplay} stage with a launch readiness score of ${launchScore}/100. ${
    incompleteItems.length > 0
      ? `Key items needed: ${incompleteItems.slice(0, 3).join(', ')}.`
      : 'All core checklist items complete.'
  } ${
    scanScores.overall < 70
      ? `Scan health (${scanScores.overall}/100) needs attention.`
      : 'Scan health is good.'
  } ${
    launchScore >= 80
      ? 'Project appears ready for launch.'
      : `Focus on completing remaining items to reach launch stage.`
  }`;

  return {
    ai_assessment,
    recommended_focus: recommendations.slice(0, 5),
    blockers: incompleteItems.slice(0, 3),
    confidence: 0.6, // Lower confidence for rule-based assessment
  };
}

/**
 * Run state assessment and create snapshot for a project
 */
export async function runStateManager(projectId: string, projectName: string) {
  // Aggregate current state
  const state = await aggregateProjectState(projectId);

  // Generate AI assessment
  const assessment = await generateStateAssessment(state, projectName);

  // Create snapshot
  const snapshot = await createProjectSnapshot(
    projectId,
    assessment.ai_assessment,
    assessment.recommended_focus
  );

  return {
    snapshot,
    assessment,
    state,
  };
}

/**
 * Run state manager for all active projects
 */
export async function runStateManagerForAllProjects() {
  const { prisma } = await import('@/lib/db');
  
  const activeProjects = await prisma.project.findMany({
    where: {
      status: { contains: 'ACTIVE' },
    },
    select: {
      id: true,
      name: true,
    },
  });

  const results = [];

  for (const project of activeProjects) {
    try {
      const result = await runStateManager(project.id, project.name);
      results.push({ projectId: project.id, success: true, result });
    } catch (error) {
      console.error(`[StateManager] Error processing ${project.name}:`, error);
      results.push({ projectId: project.id, success: false, error });
    }
  }

  return results;
}
