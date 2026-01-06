// Priority parsing utility - extracts project priorities from user messages
import Anthropic from '@anthropic-ai/sdk';
import { db } from './db';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// Types
export interface ParsedPriority {
  projects: Array<{
    name: string;
    tasks?: string[];
    weight: number; // 1.0-3.0
  }>;
}

/**
 * Parse user message to extract project priorities using LLM
 */
export async function parseUserPriority(
  userMessage: string
): Promise<ParsedPriority> {
  const prompt = `Extract project priorities from this user message: "${userMessage}"

Return JSON with this structure:
{
  "projects": [
    {
      "name": "ProjectName",
      "tasks": ["task1", "task2"],  // optional
      "weight": 2.0  // 1.0 (mentioned) to 3.0 (top priority)
    }
  ]
}

Weight guidelines:
- 3.0: Explicit top priority ("focus on", "prioritize", "most important")
- 2.0: Explicitly mentioned project or clear emphasis
- 1.5: Mentioned but not emphasized
- 1.0: Implied or context-based

Examples:
- "Focus on Warmstart launch" → weight: 3.0
- "Fix bugs in TalkingObject" → weight: 2.0
- "Keep an eye on ShipShow" → weight: 1.5

IMPORTANT: Only include projects that are actually mentioned or clearly implied in the message.
If no projects are mentioned, return empty array.`;

  try {
    const response = await anthropic.messages.create({
      model: 'claude-opus-4-5-20251101', // Use Opus for accurate parsing
      max_tokens: 500,
      messages: [{
        role: 'user',
        content: prompt,
      }],
      system: 'You are a precise JSON extraction tool. Return only valid JSON, no additional text.',
    });

    const textContent = response.content.find(block => block.type === 'text');
    if (!textContent || textContent.type !== 'text') {
      console.warn('[PriorityParser] No text response from LLM');
      return { projects: [] };
    }

    // Strip markdown code blocks if present
    let jsonText = textContent.text.trim();
    if (jsonText.startsWith('```')) {
      // Remove code block markers
      jsonText = jsonText.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
    }

    // Parse JSON from response
    const result = JSON.parse(jsonText);

    if (!result.projects || !Array.isArray(result.projects)) {
      console.warn('[PriorityParser] Invalid response format from LLM');
      return { projects: [] };
    }

    // Validate weights
    result.projects = result.projects.map((project: any) => ({
      ...project,
      weight: Math.max(1.0, Math.min(3.0, project.weight || 2.0)), // Clamp to 1.0-3.0
    }));

    return result;

  } catch (error) {
    console.error('[PriorityParser] Error parsing priority:', error);
    return { projects: [] };
  }
}

/**
 * Store parsed priorities in database with 72h expiry
 */
export async function storeUserPriority(
  workspaceId: string,
  userMessage: string,
  slackMessageTs?: string
): Promise<void> {
  // Parse the message
  const parsed = await parseUserPriority(userMessage);

  if (parsed.projects.length === 0) {
    console.log('[PriorityParser] No projects found in message, skipping storage');
    return;
  }

  // Store in database with 72h expiry
  const expiresAt = new Date(Date.now() + 72 * 60 * 60 * 1000); // 72 hours from now

  await db.userPriority.create({
    data: {
      workspaceId,
      userInput: userMessage,
      parsedIntent: parsed as any, // Prisma Json type
      expiresAt,
      slackMessageTs,
    },
  });

  console.log(`[PriorityParser] Stored priority with ${parsed.projects.length} projects (expires in 72h)`);
}

/**
 * Get active user priorities (not expired)
 */
export async function getActivePriorities(
  workspaceId: string
): Promise<ParsedPriority[]> {
  const priorities = await db.userPriority.findMany({
    where: {
      workspaceId,
      expiresAt: {
        gte: new Date(), // Not expired
      },
    },
    orderBy: {
      createdAt: 'desc',
    },
  });

  return priorities.map(p => p.parsedIntent as unknown as ParsedPriority);
}

/**
 * Calculate combined weight for a project based on all active priorities
 */
export async function getProjectWeight(
  workspaceId: string,
  projectName: string
): Promise<number> {
  const priorities = await getActivePriorities(workspaceId);

  let totalWeight = 0;

  for (const priority of priorities) {
    const project = priority.projects.find(
      p => p.name.toLowerCase() === projectName.toLowerCase()
    );

    if (project) {
      totalWeight += project.weight;
    }
  }

  return totalWeight;
}

/**
 * Get all active project priorities with combined weights
 */
export async function getAllProjectWeights(
  workspaceId: string
): Promise<Record<string, number>> {
  const priorities = await getActivePriorities(workspaceId);

  const weights: Record<string, number> = {};

  for (const priority of priorities) {
    for (const project of priority.projects) {
      const name = project.name;
      weights[name] = (weights[name] || 0) + project.weight;
    }
  }

  return weights;
}
