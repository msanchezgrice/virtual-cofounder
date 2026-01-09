/**
 * Chat Mode Agent Configuration
 * 
 * This module defines the conversation-mode prompt for the Head of Product agent
 * when used in the chat interface. Unlike orchestrator mode which automatically
 * spawns specialists for analysis, chat mode is conversational and only spawns
 * agents when explicitly requested.
 */

import { headOfProductAgent, type AgentDefinition } from './index';

/**
 * Chat-mode system prompt for conversational interactions
 * 
 * Key differences from orchestrator mode:
 * - Conversational tone, shorter responses
 * - Only spawns agents when user explicitly requests analysis
 * - Handles priority commands inline
 * - Provides status updates from database
 */
export const chatModePrompt = `You are the Head of Product (Virtual Cofounder) having a direct conversation with the founder.

CONVERSATION STYLE:
- Be concise and helpful - this is a chat, not a report
- Use friendly, professional tone
- Format responses for readability (bullet points, line breaks)
- Keep responses focused unless asked for detail

WHAT YOU CAN DO:

1. PRIORITY COMMANDS - When user says "P0:", "P1:", "P2:", "P3:" followed by a task:
   - Acknowledge the priority
   - Create a priority signal for the orchestrator
   - Show what was captured with a priority card

2. STATUS QUESTIONS - When asked "status", "what's happening", "updates":
   - Summarize recent activity
   - List active work items by priority
   - Mention any blockers or issues

3. APPROVAL COMMANDS - When user says "approved", "approve", or "✅":
   - Acknowledge approval
   - The system will handle execution queue

4. ANALYSIS & IMPLEMENTATION REQUESTS - When user asks you to do work:
   - Tell the user you'll create a story for it with Linear tracking
   - Explain what you'll do in 2-3 bullet points
   - Say: "I'll create a story for this and you'll be able to track progress in Linear."
   - Example: "analyze security on warmstart" → "I'll create a story to run a security analysis..."
   - Example: "build email capture" → "I'll create a story to build the email capture feature..."
   - The system will automatically create the story and return a Linear link to the user

5. GENERAL QUESTIONS - Answer questions about:
   - Project status and health
   - Priority recommendations  
   - What to focus on next
   - Explain past decisions

ACTION BUTTONS:
When offering to do something or presenting options, end with a clear question like:
- "Should I spawn a design agent to do this?"
- "Would you like me to start the security analysis?"
- "Ready to kick off the audit?"

This helps the user respond with one click. For multiple options, use bullet points:
- Option A
- Option B
- Option C

DO NOT:
- Try to do work directly in chat (no spawning agents)
- Write long reports unprompted
- Ask too many clarifying questions
- Be overly formal

WORK EXECUTION:
All work (analysis, implementation, fixes, features) goes through the story system:
- User asks for work → You explain what you'll do → System creates story with Linear tracking
- User gets Linear link immediately to track progress
- Work executes in background via execution queue
- This keeps chat fast and responsive

TYPES OF WORK:
- Analysis: security audit, SEO check, performance review
- Implementation: new features, bug fixes, refactoring
- Testing: write tests, run test suites
- Documentation: write docs, update README
- Research: market analysis, competitor research

When showing priorities, use this format:
[P0] Critical task description
[P1] High priority task
[P2] Medium priority task

Remember: You're a cofounder they can chat with, not a report generator.`;

/**
 * Build the full chat context with conversation history
 */
export function buildChatContext(
  conversationHistory: Array<{ role: string; content: string }>,
  projectContext?: {
    activeProjects: Array<{ name: string; status: string }>;
    recentStories: Array<{ title: string; priority: string; status: string }>;
    prioritySignals: Array<{ level: string; content: string }>;
  }
): string {
  let context = chatModePrompt;
  
  if (projectContext) {
    context += `\n\n---\nCURRENT CONTEXT:\n`;
    
    if (projectContext.activeProjects.length > 0) {
      context += `\nActive Projects:\n`;
      for (const p of projectContext.activeProjects) {
        context += `- ${p.name} (${p.status})\n`;
      }
    }
    
    if (projectContext.recentStories.length > 0) {
      context += `\nRecent Work Items:\n`;
      for (const s of projectContext.recentStories) {
        context += `- [${s.priority}] ${s.title} - ${s.status}\n`;
      }
    }
    
    if (projectContext.prioritySignals.length > 0) {
      context += `\nActive Priority Signals:\n`;
      for (const p of projectContext.prioritySignals) {
        context += `- ${p.level}: ${p.content}\n`;
      }
    }
  }
  
  return context;
}

/**
 * Chat-mode agent definition (based on HoP but tuned for conversation)
 */
export const chatAgent: AgentDefinition = {
  ...headOfProductAgent,
  name: 'Virtual Cofounder (Chat)',
  role: 'chat',
  maxTurns: 5, // Shorter conversations
  prompt: chatModePrompt,
  description: 'Conversational mode for direct founder interaction',
};

/**
 * Parse quick commands from user input
 * Returns the command type and extracted data
 */
export function parseQuickCommand(input: string): {
  type: 'priority' | 'approval' | 'status' | 'analyze' | 'none';
  data?: {
    priority?: 'P0' | 'P1' | 'P2' | 'P3';
    content?: string;
    target?: string;
    agent?: string;
  };
} {
  const trimmed = input.trim();
  
  // Priority commands: "P0: fix X" or "🔴 fix X"
  const priorityMatch = trimmed.match(/^(P0|P1|P2|P3|🔴|🟡|🟢|⚪)[:\s]+(.+)$/i);
  if (priorityMatch) {
    const emojiToPriority: Record<string, 'P0' | 'P1' | 'P2' | 'P3'> = {
      '🔴': 'P0', '🟡': 'P1', '🟢': 'P2', '⚪': 'P3',
    };
    const priority = emojiToPriority[priorityMatch[1]] || 
      priorityMatch[1].toUpperCase() as 'P0' | 'P1' | 'P2' | 'P3';
    return {
      type: 'priority',
      data: { priority, content: priorityMatch[2].trim() },
    };
  }
  
  // Approval commands
  if (/^(approved?|✅|yes|lgtm|ship it)$/i.test(trimmed)) {
    return { type: 'approval' };
  }
  
  // Status commands
  if (/^(status|what'?s (up|happening)|updates?|show me)$/i.test(trimmed)) {
    return { type: 'status' };
  }
  
  // Analysis commands: "analyze security on warmstart"
  const analyzeMatch = trimmed.match(/^(analyze|check|run|scan)\s+(security|seo|domain|analytics|performance|deployment)\s+(?:on|for)\s+(.+)$/i);
  if (analyzeMatch) {
    return {
      type: 'analyze',
      data: {
        agent: analyzeMatch[2].toLowerCase(),
        target: analyzeMatch[3].trim(),
      },
    };
  }
  
  return { type: 'none' };
}

/**
 * Format a priority card for display
 */
export function formatPriorityCard(priorities: Array<{ level: string; title: string; project?: string }>): string {
  return priorities
    .map(p => `[${p.level}] ${p.title}${p.project ? ` (${p.project})` : ''}`)
    .join('\n');
}
