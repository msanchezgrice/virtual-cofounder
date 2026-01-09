/**
 * Chat Worker - Processes chat messages using Claude Agent SDK
 * 
 * Architecture:
 * 1. Listens to 'chat' BullMQ queue
 * 2. Runs Agent SDK with HoP in chat mode
 * 3. Streams responses via Redis pub/sub
 * 4. Saves final response to database
 * 
 * This runs on Railway, not Vercel, because Agent SDK needs CLI access.
 */

import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(__dirname, '../.env.local') });

import { Worker, Job } from 'bullmq';
import Redis from 'ioredis';
import { PrismaClient } from '@prisma/client';
import {
  query,
  type Options as SDKOptions,
} from '@anthropic-ai/claude-agent-sdk';
import { agentRegistry } from '../lib/agents/index';
import { buildChatContext, parseQuickCommand } from '../lib/agents/chat';

// ============================================================================
// SETUP
// ============================================================================

// Create fresh Prisma client with direct connection (not pooler)
const directDatabaseUrl = process.env.DATABASE_URL
  ?.replace(':6543', ':5432')
  .replace('?pgbouncer=true&connection_limit=1', '');

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
    tls: process.env.REDIS_URL?.startsWith('rediss://') ? {} : undefined,
  }
);

// Separate Redis client for pub/sub (publishing)
const pubClient = new Redis(
  process.env.REDIS_URL || 'redis://localhost:6379',
  {
    tls: process.env.REDIS_URL?.startsWith('rediss://') ? {} : undefined,
  }
);

// ============================================================================
// TYPES
// ============================================================================

interface ChatJob {
  messageId: string;          // Assistant message ID to fill
  userMessageId: string;      // User message that triggered this
  workspaceId: string;
  conversationId: string;
  userContent: string;        // The user's message content
  projectId?: string;
}

// ============================================================================
// AGENT SDK SETUP
// ============================================================================

const MODEL_MAP: Record<string, 'opus' | 'sonnet' | 'haiku'> = {
  'claude-opus-4-5-20251101': 'opus',
  'claude-sonnet-4-5-20250929': 'sonnet',
};

const TOOL_MAP: Record<string, string> = {
  'Read': 'Read',
  'Write': 'Write',
  'Edit': 'Edit',
  'Bash': 'Bash',
  'Glob': 'Glob',
  'Grep': 'Grep',
  'WebSearch': 'WebSearch',
  'WebFetch': 'WebFetch',
};

/**
 * Convert agent definitions to SDK format for subagent spawning
 */
function convertToSDKAgents(): Record<string, any> {
  const sdkAgents: Record<string, any> = {};
  const NON_SPAWNABLE_ROLES = ['head-of-product', 'chat'];
  
  for (const [role, agent] of Object.entries(agentRegistry)) {
    if (!NON_SPAWNABLE_ROLES.includes(role)) {
      const sdkTools = agent.tools
        .map(t => TOOL_MAP[t])
        .filter(Boolean);
      
      sdkAgents[role] = {
        description: `${agent.name}: ${agent.description || agent.role}`,
        prompt: agent.prompt,
        model: MODEL_MAP[agent.model] || 'sonnet',
        tools: sdkTools.length > 0 ? sdkTools : ['Read', 'Grep'],
      };
    }
  }
  
  return sdkAgents;
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Publish a message to the chat stream channel
 */
async function publishToStream(messageId: string, data: object) {
  const channel = `chat:stream:${messageId}`;
  await pubClient.publish(channel, JSON.stringify(data));
}

/**
 * Get recent conversation history
 */
async function getConversationHistory(workspaceId: string, conversationId: string, limit = 10) {
  const messages = await prisma.chatMessage.findMany({
    where: {
      workspaceId,
      conversationId,
      isProcessing: false,
    },
    orderBy: { createdAt: 'desc' },
    take: limit,
    select: {
      role: true,
      content: true,
      createdAt: true,
    },
  });
  
  return messages.reverse();
}

/**
 * Get project context for the agent
 */
async function getProjectContext(workspaceId: string) {
  const [projects, stories, signals] = await Promise.all([
    prisma.project.findMany({
      where: { workspaceId },
      select: { name: true, status: true },
      take: 10,
    }),
    prisma.story.findMany({
      where: { workspaceId },
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: { title: true, priorityLevel: true, status: true },
    }),
    prisma.prioritySignal.findMany({
      where: { workspaceId },
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: { priority: true, rawText: true },
    }),
  ]);
  
  return {
    activeProjects: projects.map(p => ({ name: p.name, status: p.status })),
    recentStories: stories.map(s => ({ 
      title: s.title, 
      priority: s.priorityLevel || 'P2', 
      status: s.status 
    })),
    prioritySignals: signals
      .filter(s => s.priority && s.rawText)
      .map(s => ({ level: s.priority!, content: s.rawText! })),
  };
}

/**
 * Build prompt for the agent
 */
function buildAgentPrompt(
  history: Array<{ role: string; content: string }>,
  userMessage: string,
  projectContext: any
): string {
  const systemContext = buildChatContext(history, projectContext);
  
  let prompt = systemContext;
  
  if (history.length > 0) {
    prompt += '\n\n---\nRECENT CONVERSATION:\n';
    for (const msg of history.slice(-5)) {
      const role = msg.role === 'user' ? 'User' : 'You';
      prompt += `${role}: ${msg.content}\n`;
    }
  }
  
  prompt += `\n---\nUser: ${userMessage}\n\nRespond conversationally:`;
  
  return prompt;
}

/**
 * Extract suggested actions from agent response
 */
interface SuggestedAction {
  label: string;
  value: string;
  style?: 'primary' | 'secondary' | 'success' | 'danger';
}

function extractSuggestedActions(content: string): SuggestedAction[] {
  const actions: SuggestedAction[] = [];
  
  const yesNoPatterns = [
    /should i\s+(.+?)\??$/im,
    /would you like me to\s+(.+?)\??$/im,
    /do you want me to\s+(.+?)\??$/im,
    /want me to\s+(.+?)\??$/im,
    /shall i\s+(.+?)\??$/im,
    /ready to\s+(.+?)\??$/im,
  ];
  
  for (const pattern of yesNoPatterns) {
    if (pattern.test(content)) {
      const match = content.match(pattern);
      const action = match?.[1]?.trim() || '';
      
      actions.push(
        { label: '✅ Yes, go ahead', value: `Yes, ${action}`, style: 'success' },
        { label: '❌ No, not now', value: 'No, let\'s hold off on that', style: 'secondary' }
      );
      break;
    }
  }
  
  const spawnPatterns = [
    /spawn a?\s*\*?\*?(\w+)\s*agent\*?\*?/i,
    /run (?:a|the)\s*\*?\*?(\w+)\s*agent\*?\*?/i,
    /kick off (?:a|the)?\s*\*?\*?(\w+)\s*(?:agent|audit|analysis)\*?\*?/i,
  ];
  
  for (const pattern of spawnPatterns) {
    const match = content.match(pattern);
    if (match) {
      const agentName = match[1].toLowerCase();
      if (actions.length === 0) {
        actions.push(
          { label: `🤖 Spawn ${agentName} agent`, value: `spawn ${agentName}`, style: 'primary' },
          { label: '💬 Walk through together', value: 'Let\'s walk through this together instead', style: 'secondary' }
        );
      }
      break;
    }
  }
  
  const bulletPoints = content.match(/^- (.+)$/gm);
  if (bulletPoints && bulletPoints.length >= 2 && bulletPoints.length <= 5) {
    const hasQuestionBefore = /\?\s*\n/.test(content.slice(0, content.indexOf(bulletPoints[0])));
    if (hasQuestionBefore && actions.length === 0) {
      bulletPoints.slice(0, 4).forEach((bullet, i) => {
        const option = bullet.replace(/^- /, '').trim();
        if (option.length < 100) {
          actions.push({
            label: option.slice(0, 40) + (option.length > 40 ? '...' : ''),
            value: option,
            style: i === 0 ? 'primary' : 'secondary',
          });
        }
      });
    }
  }
  
  return actions;
}

/**
 * Handle priority command (quick response, no Agent SDK needed)
 */
async function handlePriorityCommand(
  job: Job<ChatJob>,
  command: ReturnType<typeof parseQuickCommand>
): Promise<void> {
  const { messageId, workspaceId } = job.data;
  
  if (command.type !== 'priority' || !command.data?.priority || !command.data?.content) {
    return;
  }
  
  try {
    await prisma.prioritySignal.create({
      data: {
        workspaceId,
        source: 'dashboard',
        signalType: 'priority_set',
        priority: command.data.priority,
        rawText: command.data.content,
        isExplicit: true,
        confidence: 1.0,
        expiresAt: new Date(Date.now() + 72 * 60 * 60 * 1000),
      },
    });
    
    const response = `Got it! Created ${command.data.priority} priority: "${command.data.content}"`;
    
    await publishToStream(messageId, { type: 'delta', content: response });
    
    await prisma.chatMessage.update({
      where: { id: messageId },
      data: { 
        content: response, 
        isProcessing: false,
        contentType: 'priority_card',
        metadata: { priorities: [command.data] },
      },
    });
    
    await publishToStream(messageId, { type: 'done' });
    
  } catch (error) {
    console.error('[Chat Worker] Error handling priority command:', error);
    throw error;
  }
}

/**
 * Handle status command (quick response)
 */
async function handleStatusCommand(job: Job<ChatJob>): Promise<void> {
  const { messageId, workspaceId } = job.data;
  
  const projectContext = await getProjectContext(workspaceId);
  let response = "Here's the current status:\n\n";
  
  if (projectContext.recentStories.length > 0) {
    response += "**Recent Work Items:**\n";
    for (const s of projectContext.recentStories) {
      response += `• [${s.priority}] ${s.title} - ${s.status}\n`;
    }
  } else {
    response += "No active work items.\n";
  }
  
  if (projectContext.prioritySignals.length > 0) {
    response += "\n**Active Priorities:**\n";
    for (const p of projectContext.prioritySignals) {
      response += `• ${p.level}: ${p.content}\n`;
    }
  }
  
  await publishToStream(messageId, { type: 'delta', content: response });
  
  await prisma.chatMessage.update({
    where: { id: messageId },
    data: { content: response, isProcessing: false },
  });
  
  await publishToStream(messageId, { type: 'done' });
}

/**
 * Handle approval command (quick response)
 */
async function handleApprovalCommand(job: Job<ChatJob>): Promise<void> {
  const { messageId, workspaceId } = job.data;
  
  const pendingStory = await prisma.story.findFirst({
    where: { 
      workspaceId,
      status: 'pending',
    },
    orderBy: { createdAt: 'desc' },
  });
  
  let response: string;
  if (pendingStory) {
    await prisma.story.update({
      where: { id: pendingStory.id },
      data: { status: 'approved', userApproved: true },
    });
    response = `✅ Approved: "${pendingStory.title}"\n\nI'll start working on this now.`;
  } else {
    response = "No pending items to approve. Send me a priority (e.g., 'P1: fix the bug') to create work.";
  }
  
  await publishToStream(messageId, { type: 'delta', content: response });
  
  await prisma.chatMessage.update({
    where: { id: messageId },
    data: { content: response, isProcessing: false },
  });
  
  await publishToStream(messageId, { type: 'done' });
}

// ============================================================================
// MAIN PROCESSOR - Uses Agent SDK
// ============================================================================

async function processChat(job: Job<ChatJob>): Promise<void> {
  const { messageId, userContent, workspaceId, conversationId } = job.data;
  
  console.log(`[Chat Worker] Processing message ${messageId}`);
  
  // Parse for quick commands first
  const command = parseQuickCommand(userContent);
  
  // Handle quick commands (no Agent SDK needed)
  if (command.type === 'priority') {
    await handlePriorityCommand(job, command);
    return;
  }
  
  if (command.type === 'status') {
    await handleStatusCommand(job);
    return;
  }
  
  if (command.type === 'approval') {
    await handleApprovalCommand(job);
    return;
  }
  
  // For general messages, use the Agent SDK
  try {
    const history = await getConversationHistory(workspaceId, conversationId);
    const projectContext = await getProjectContext(workspaceId);
    const prompt = buildAgentPrompt(
      history.map(h => ({ role: h.role, content: h.content })),
      userContent,
      projectContext
    );
    
    // Get spawnable agents
    const subagents = convertToSDKAgents();
    
    console.log(`[Chat Worker] Running Agent SDK with ${Object.keys(subagents).length} spawnable agents`);
    
    // SDK options
    const sdkOptions: SDKOptions = {
      allowedTools: ['Task', 'Read', 'Grep', 'WebFetch'],
      tools: ['Task', 'Read', 'Grep', 'WebFetch'],
      agents: subagents,
      maxTurns: 5,
      persistSession: false,
      includePartialMessages: true,
    };
    
    // Run the agent
    const agentQuery = query({
      prompt,
      options: sdkOptions,
    });
    
    let fullContent = '';
    let toolsUsed: string[] = [];
    let lastPublishedLength = 0;
    
    for await (const message of agentQuery) {
      switch (message.type) {
        case 'assistant': {
          const msg = message as any;
          if (msg.message?.content) {
            const textParts = msg.message.content.filter((c: any) => c.type === 'text');
            const newText = textParts.map((t: any) => t.text || '').join('');
            
            if (newText && newText.length > lastPublishedLength) {
              // Send delta (new content since last publish)
              const delta = newText.slice(lastPublishedLength);
              await publishToStream(messageId, { type: 'delta', content: delta });
              fullContent = newText;
              lastPublishedLength = newText.length;
            }
          }
          break;
        }
        
        case 'stream_event': {
          // Handle streaming events for tool use detection
          const streamMsg = message as any;
          
          if (streamMsg.event?.type === 'content_block_start' && 
              streamMsg.event.content_block?.type === 'tool_use') {
            const toolName = streamMsg.event.content_block.name || '';
            toolsUsed.push(toolName);
            await publishToStream(messageId, { type: 'tool', tool: toolName, status: 'starting' });
          }
          
          // For text deltas in stream events
          if (streamMsg.event?.type === 'content_block_delta' &&
              streamMsg.event.delta?.type === 'text_delta') {
            const textDelta = streamMsg.event.delta.text || '';
            if (textDelta) {
              fullContent += textDelta;
              await publishToStream(messageId, { type: 'delta', content: textDelta });
              lastPublishedLength = fullContent.length;
            }
          }
          break;
        }
        
        case 'tool_progress': {
          const toolMsg = message as any;
          const toolName = toolMsg.tool_name || toolMsg.name;
          const toolInput = toolMsg.tool_input || toolMsg.input;
          
          if (toolName) {
            if (!toolsUsed.includes(toolName)) {
              toolsUsed.push(toolName);
            }
            await publishToStream(messageId, { type: 'tool', tool: toolName, status: 'running' });
            
            // Check for subagent spawning
            const spawnedAgent = toolInput?.subagent_type || toolInput?.agentName;
            if ((toolName === 'Task' || toolName === 'task') && spawnedAgent) {
              await publishToStream(messageId, { 
                type: 'agent_spawn', 
                agent: spawnedAgent 
              });
              console.log(`[Chat Worker] Spawned subagent: ${spawnedAgent}`);
            }
          }
          break;
        }
        
        case 'result': {
          const resultMsg = message as any;
          if (resultMsg.result && typeof resultMsg.result === 'string') {
            // If result is different from what we've accumulated, use it
            if (resultMsg.result !== fullContent) {
              const delta = resultMsg.result.slice(fullContent.length);
              if (delta) {
                await publishToStream(messageId, { type: 'delta', content: delta });
              }
              fullContent = resultMsg.result;
            }
          }
          
          // Extract suggested actions
          const suggestedActions = extractSuggestedActions(fullContent);
          if (suggestedActions.length > 0) {
            await publishToStream(messageId, { type: 'actions', actions: suggestedActions });
          }
          
          // Send done event
          await publishToStream(messageId, { 
            type: 'done', 
            usage: resultMsg.usage,
            toolsUsed,
          });
          break;
        }
        
        default:
          console.log(`[Chat Worker] Unhandled message type: ${message.type}`);
          break;
      }
    }
    
    // Extract suggested actions from final content
    const suggestedActions = extractSuggestedActions(fullContent);
    
    // Save final content to DB
    const hasMetadata = toolsUsed.length > 0 || suggestedActions.length > 0;
    
    await prisma.chatMessage.update({
      where: { id: messageId },
      data: { 
        content: fullContent, 
        isProcessing: false,
        ...(hasMetadata ? {
          metadata: JSON.parse(JSON.stringify({
            ...(toolsUsed.length > 0 ? { toolsUsed } : {}),
            ...(suggestedActions.length > 0 ? { suggestedActions } : {}),
          })),
        } : {}),
      },
    });
    
    console.log(`[Chat Worker] Completed message ${messageId}, length: ${fullContent.length}`);
    
  } catch (error) {
    console.error('[Chat Worker] Error processing chat:', error);
    
    const errorMessage = 'Sorry, I encountered an error processing your message. Please try again.';
    
    await publishToStream(messageId, { type: 'delta', content: errorMessage });
    await publishToStream(messageId, { type: 'error', message: (error as Error).message });
    
    await prisma.chatMessage.update({
      where: { id: messageId },
      data: { 
        content: errorMessage,
        isProcessing: false,
      },
    });
    
    throw error;
  }
}

// ============================================================================
// WORKER SETUP
// ============================================================================

const worker = new Worker('chat', processChat, {
  connection,
  concurrency: 3, // Allow 3 concurrent chat messages
  limiter: {
    max: 10,
    duration: 60000, // 10 messages per minute max
  },
});

// Event handlers
worker.on('completed', (job) => {
  console.log(`[Chat Worker] Job ${job.id} completed`);
});

worker.on('failed', (job, err) => {
  console.error(`[Chat Worker] Job ${job?.id} failed:`, err);
});

worker.on('error', (err) => {
  console.error('[Chat Worker] Worker error:', err);
});

console.log('[Chat Worker] Started - listening for chat messages');
console.log('[Chat Worker] Redis pub/sub ready for streaming');

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('[Chat Worker] Shutting down...');
  await worker.close();
  await connection.quit();
  await pubClient.quit();
  await prisma.$disconnect();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('[Chat Worker] Shutting down...');
  await worker.close();
  await connection.quit();
  await pubClient.quit();
  await prisma.$disconnect();
  process.exit(0);
});
