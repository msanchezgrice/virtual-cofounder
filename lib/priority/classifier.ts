/**
 * Priority Classifier
 * 
 * Classifies signals from multiple sources (Slack, Linear, Scans, Dashboard)
 * into P0-P3 priority levels with computed scores.
 * 
 * Priority Levels:
 * - P0 (Score 90-100): Critical/urgent - requires immediate attention
 * - P1 (Score 70-89): Important - should be done soon
 * - P2 (Score 40-69): Normal - standard priority (default)
 * - P3 (Score 0-39): Low - nice to have
 * 
 * Feature flag: PRIORITY_SYSTEM_ENABLED
 */

import Anthropic from '@anthropic-ai/sdk';
import { prisma } from '@/lib/db';
import { featureFlags } from '@/lib/config/feature-flags';

const anthropic = new Anthropic();

// Types
export type PriorityLevel = 'P0' | 'P1' | 'P2' | 'P3';
export type SignalSource = 'slack' | 'linear' | 'dashboard' | 'scan' | 'orchestrator';
export type SignalType = 'explicit_priority' | 'emoji_reaction' | 'llm_classified' | 'scan_finding' | 'user_mention';

export interface PrioritySignal {
  source: SignalSource;
  signalType: SignalType;
  rawContent: string;
  priorityLevel?: PriorityLevel;
  priorityScore?: number;
  projectId?: string;
  workspaceId: string;
  metadata?: Record<string, any>;
}

export interface ClassificationResult {
  priorityLevel: PriorityLevel;
  priorityScore: number;
  confidence: number;
  reasoning: string;
}

// Explicit priority patterns (highest confidence)
const EXPLICIT_PRIORITY_PATTERNS: Record<PriorityLevel, RegExp[]> = {
  P0: [
    /\bP0\b/i,
    /\b(critical|urgent|asap|emergency|blocker|showstopper|fire)\b/i,
    /🚨|🔥|‼️|⚠️/,
    /\bdrop everything\b/i,
    /\bfix this now\b/i,
  ],
  P1: [
    /\bP1\b/i,
    /\b(important|high priority|priority|soon|needed|must have)\b/i,
    /❗|❕|⚡/,
    /\bthis week\b/i,
    /\bplease prioritize\b/i,
  ],
  P2: [
    /\bP2\b/i,
    /\b(normal|standard|regular|when possible)\b/i,
    /\bnext sprint\b/i,
  ],
  P3: [
    /\bP3\b/i,
    /\b(low|minor|nice to have|whenever|backlog|someday)\b/i,
    /\bno rush\b/i,
    /\bif you have time\b/i,
  ],
};

// Emoji shortcuts for quick priority setting
const EMOJI_PRIORITIES: Record<string, PriorityLevel> = {
  '🔴': 'P0',
  '🚨': 'P0',
  '🔥': 'P0',
  '‼️': 'P0',
  '⚠️': 'P0',
  '🟠': 'P1',
  '❗': 'P1',
  '⚡': 'P1',
  '🟡': 'P2',
  '📝': 'P2',
  '🟢': 'P3',
  '📋': 'P3',
};

// Scan severity to priority mapping
const SCAN_SEVERITY_PRIORITY: Record<string, PriorityLevel> = {
  critical: 'P0',
  high: 'P1',
  medium: 'P2',
  low: 'P3',
};

// Priority level to score ranges
const PRIORITY_SCORE_RANGES: Record<PriorityLevel, { min: number; max: number }> = {
  P0: { min: 90, max: 100 },
  P1: { min: 70, max: 89 },
  P2: { min: 40, max: 69 },
  P3: { min: 0, max: 39 },
};

/**
 * Check for explicit priority patterns in text
 */
function checkExplicitPatterns(text: string): PriorityLevel | null {
  for (const [level, patterns] of Object.entries(EXPLICIT_PRIORITY_PATTERNS)) {
    for (const pattern of patterns) {
      if (pattern.test(text)) {
        return level as PriorityLevel;
      }
    }
  }
  return null;
}

/**
 * Check for emoji-based priority shortcuts
 */
function checkEmojiPriority(text: string): PriorityLevel | null {
  for (const [emoji, level] of Object.entries(EMOJI_PRIORITIES)) {
    if (text.includes(emoji)) {
      return level;
    }
  }
  return null;
}

/**
 * Calculate priority score within the level's range
 * Higher confidence = higher within range
 */
function calculateScore(level: PriorityLevel, confidence: number): number {
  const range = PRIORITY_SCORE_RANGES[level];
  // Scale confidence (0-1) to the score range
  return Math.round(range.min + (range.max - range.min) * confidence);
}

/**
 * Use LLM to classify priority when patterns don't match
 */
async function classifyWithLLM(text: string): Promise<ClassificationResult> {
  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 256,
      messages: [
        {
          role: 'user',
          content: `Classify the priority level of this message/request:

"${text}"

Priority Levels:
- P0: Critical/urgent - production down, security issue, blocking users
- P1: Important - significant bug, customer-facing issue, business impact
- P2: Normal - standard feature or bug, no immediate urgency
- P3: Low - nice-to-have, cosmetic, backlog item

Return JSON only:
{
  "priorityLevel": "P0"|"P1"|"P2"|"P3",
  "confidence": 0.0-1.0,
  "reasoning": "brief explanation"
}`,
        },
      ],
      system: 'You are a precise priority classifier. Return only valid JSON.',
    });

    const textContent = response.content.find((block) => block.type === 'text');
    if (!textContent || textContent.type !== 'text') {
      return getDefaultClassification();
    }

    let jsonText = textContent.text.trim();
    // Strip markdown code blocks if present
    if (jsonText.startsWith('```')) {
      jsonText = jsonText.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
    }

    const result = JSON.parse(jsonText);
    const level = result.priorityLevel as PriorityLevel;
    const confidence = Math.max(0, Math.min(1, result.confidence || 0.7));

    return {
      priorityLevel: level,
      priorityScore: calculateScore(level, confidence),
      confidence,
      reasoning: result.reasoning || 'LLM classification',
    };
  } catch (error) {
    console.error('[PriorityClassifier] LLM classification error:', error);
    return getDefaultClassification();
  }
}

/**
 * Default classification when nothing else works
 */
function getDefaultClassification(): ClassificationResult {
  return {
    priorityLevel: 'P2',
    priorityScore: 50,
    confidence: 0.5,
    reasoning: 'Default classification - no clear priority indicators',
  };
}

/**
 * Classify a signal from a scan finding
 */
function classifyScanFinding(severity: string): ClassificationResult {
  const level = SCAN_SEVERITY_PRIORITY[severity.toLowerCase()] || 'P2';
  return {
    priorityLevel: level,
    priorityScore: calculateScore(level, 0.9), // High confidence for scan results
    confidence: 0.9,
    reasoning: `Scan finding with ${severity} severity`,
  };
}

/**
 * Main classification function
 */
export async function classifyPriority(signal: PrioritySignal): Promise<ClassificationResult> {
  // If priority system is disabled, return default
  if (!featureFlags.PRIORITY_SYSTEM_ENABLED) {
    return getDefaultClassification();
  }

  const text = signal.rawContent;

  // 1. Check for explicit patterns (highest priority)
  const explicitLevel = checkExplicitPatterns(text);
  if (explicitLevel) {
    return {
      priorityLevel: explicitLevel,
      priorityScore: calculateScore(explicitLevel, 0.95),
      confidence: 0.95,
      reasoning: `Explicit priority indicator found`,
    };
  }

  // 2. Check for emoji shortcuts
  const emojiLevel = checkEmojiPriority(text);
  if (emojiLevel) {
    return {
      priorityLevel: emojiLevel,
      priorityScore: calculateScore(emojiLevel, 0.9),
      confidence: 0.9,
      reasoning: `Emoji priority shortcut detected`,
    };
  }

  // 3. Handle scan findings specially
  if (signal.source === 'scan' && signal.metadata?.severity) {
    return classifyScanFinding(signal.metadata.severity);
  }

  // 4. Fall back to LLM classification
  return classifyWithLLM(text);
}

/**
 * Store a classified signal in the database
 */
export async function storeSignal(
  signal: PrioritySignal,
  classification: ClassificationResult
): Promise<string> {
  // Calculate expiry (72 hours from now)
  const expiresAt = new Date(Date.now() + 72 * 60 * 60 * 1000);

  const record = await prisma.prioritySignal.create({
    data: {
      workspaceId: signal.workspaceId,
      projectId: signal.projectId,
      source: signal.source,
      signalType: signal.signalType,
      priority: classification.priorityLevel,
      rawText: signal.rawContent,
      confidence: classification.confidence,
      isExplicit: signal.signalType === 'explicit_priority',
      expiresAt,
    },
  });

  console.log(
    `[PriorityClassifier] Stored signal ${record.id}: ${classification.priorityLevel} (${classification.priorityScore})`
  );

  return record.id;
}

/**
 * Process and store a new priority signal
 */
export async function processPrioritySignal(signal: PrioritySignal): Promise<{
  signalId: string;
  classification: ClassificationResult;
}> {
  const classification = await classifyPriority(signal);
  const signalId = await storeSignal(signal, classification);

  return { signalId, classification };
}

/**
 * Get active priority signals for a project
 */
export async function getActiveSignals(
  workspaceId: string,
  projectId?: string
): Promise<
  Array<{
    id: string;
    priority: string | null;
    confidence: number;
    source: string;
    rawText: string | null;
    createdAt: Date;
  }>
> {
  const signals = await prisma.prioritySignal.findMany({
    where: {
      workspaceId,
      projectId: projectId || undefined,
      OR: [
        { expiresAt: { gte: new Date() } },
        { expiresAt: null },
      ],
    },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      priority: true,
      confidence: true,
      source: true,
      rawText: true,
      createdAt: true,
    },
  });

  return signals;
}

/**
 * Simple classification function that just returns level and score
 * Used by routes that don't need the full signal processing
 */
export async function classifyPrioritySignal(text: string): Promise<{
  priorityLevel: PriorityLevel;
  priorityScore: number;
  reasoning: string;
}> {
  const signal: PrioritySignal = {
    source: 'dashboard',
    signalType: 'llm_classified',
    rawContent: text,
    workspaceId: '', // Not needed for classification only
  };
  
  const result = await classifyPriority(signal);
  return {
    priorityLevel: result.priorityLevel,
    priorityScore: result.priorityScore,
    reasoning: result.reasoning,
  };
}

/**
 * Calculate aggregate priority for a story based on all active signals
 */
export async function calculateStoryPriority(
  storyId: string,
  workspaceId: string,
  projectId: string
): Promise<{
  priorityLevel: PriorityLevel;
  priorityScore: number;
  signalCount: number;
}> {
  // Get active signals for this project
  const signals = await getActiveSignals(workspaceId, projectId);

  if (signals.length === 0) {
    return {
      priorityLevel: 'P2',
      priorityScore: 50,
      signalCount: 0,
    };
  }

  // Calculate weighted average based on signal priorities
  // More recent signals have higher weight
  const now = Date.now();
  let totalWeight = 0;
  let weightedScore = 0;

  const priorityToScore: Record<string, number> = {
    P0: 95,
    P1: 75,
    P2: 50,
    P3: 25,
  };

  for (const signal of signals) {
    // Weight decays over time (max 72 hours)
    const ageHours = (now - signal.createdAt.getTime()) / (1000 * 60 * 60);
    const weight = Math.max(0.1, 1 - ageHours / 72) * signal.confidence;

    const score = signal.priority ? (priorityToScore[signal.priority] || 50) : 50;
    weightedScore += score * weight;
    totalWeight += weight;
  }

  const avgScore = totalWeight > 0 ? Math.round(weightedScore / totalWeight) : 50;

  // Determine level from score
  let level: PriorityLevel = 'P2';
  if (avgScore >= 90) level = 'P0';
  else if (avgScore >= 70) level = 'P1';
  else if (avgScore >= 40) level = 'P2';
  else level = 'P3';

  return {
    priorityLevel: level,
    priorityScore: avgScore,
    signalCount: signals.length,
  };
}
