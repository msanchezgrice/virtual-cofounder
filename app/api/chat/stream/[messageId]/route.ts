/**
 * Chat API - SSE Streaming Endpoint
 * 
 * GET /api/chat/stream/[messageId]
 * Server-Sent Events stream for agent responses
 * 
 * Uses Claude Agent SDK with the same patterns as the orchestrator
 */

import { prisma } from '@/lib/db';
import { 
  query, 
  type Options as SDKOptions 
} from '@anthropic-ai/claude-agent-sdk';
import { 
  agentRegistry, 
  type AgentDefinition 
} from '@/lib/agents/index';
import { buildChatContext, parseQuickCommand } from '@/lib/agents/chat';
import { syncMessageToSlack } from '@/lib/chat-slack-sync';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Default workspace for MVP
const DEFAULT_WORKSPACE_ID = 'cm3wev4rp0000pa2o0vyqz4qa';

// Model mapping for SDK
const MODEL_MAP: Record<string, 'opus' | 'sonnet' | 'haiku'> = {
  'claude-opus-4-5-20251101': 'opus',
  'claude-sonnet-4-5-20250929': 'sonnet',
};

// Tool mapping for SDK
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

/**
 * Get recent conversation for context
 */
async function getConversationHistory(conversationId: string, limit = 10) {
  const messages = await prisma.chatMessage.findMany({
    where: {
      workspaceId: DEFAULT_WORKSPACE_ID,
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
  
  // Return in chronological order
  return messages.reverse();
}

/**
 * Get project context for the agent
 */
async function getProjectContext() {
  const [projects, stories, signals] = await Promise.all([
    prisma.project.findMany({
      where: { workspaceId: DEFAULT_WORKSPACE_ID },
      select: { name: true, status: true },
      take: 10,
    }),
    prisma.story.findMany({
      where: { workspaceId: DEFAULT_WORKSPACE_ID },
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: { title: true, priorityLevel: true, status: true },
    }),
    prisma.prioritySignal.findMany({
      where: { workspaceId: DEFAULT_WORKSPACE_ID },
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
  
  // Add conversation history
  if (history.length > 0) {
    prompt += '\n\n---\nRECENT CONVERSATION:\n';
    for (const msg of history.slice(-5)) { // Last 5 messages
      const role = msg.role === 'user' ? 'User' : 'You';
      prompt += `${role}: ${msg.content}\n`;
    }
  }
  
  // Add current message
  prompt += `\n---\nUser: ${userMessage}\n\nRespond conversationally:`;
  
  return prompt;
}

/**
 * Handle priority command inline
 */
async function handlePriorityCommand(
  command: ReturnType<typeof parseQuickCommand>,
  workspaceId: string
): Promise<string> {
  if (command.type !== 'priority' || !command.data?.priority || !command.data?.content) {
    return '';
  }
  
  try {
    // Create priority signal
    await prisma.prioritySignal.create({
      data: {
        workspaceId,
        source: 'dashboard',
        signalType: 'priority_set',
        priority: command.data.priority,
        rawText: command.data.content,
        isExplicit: true,
        confidence: 1.0,
        expiresAt: new Date(Date.now() + 72 * 60 * 60 * 1000), // 72 hours
      },
    });
    
    return `Got it! Created ${command.data.priority} priority: "${command.data.content}"`;
  } catch (error) {
    console.error('[Chat Stream] Error creating priority signal:', error);
    return `Acknowledged ${command.data.priority}: "${command.data.content}" (note: failed to save signal)`;
  }
}

export async function GET(
  req: Request,
  { params }: { params: { messageId: string } }
) {
  const messageId = params.messageId;
  
  // Set up SSE headers
  const encoder = new TextEncoder();
  
  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: object) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };
      
      try {
        // Get the assistant message placeholder
        const assistantMsg = await prisma.chatMessage.findUnique({
          where: { id: messageId },
        });
        
        if (!assistantMsg) {
          send({ type: 'error', message: 'Message not found' });
          controller.close();
          return;
        }
        
        // Get the user message (previous message in conversation)
        const userMsg = await prisma.chatMessage.findFirst({
          where: {
            workspaceId: assistantMsg.workspaceId,
            conversationId: assistantMsg.conversationId,
            role: 'user',
            createdAt: { lt: assistantMsg.createdAt },
          },
          orderBy: { createdAt: 'desc' },
        });
        
        if (!userMsg) {
          send({ type: 'error', message: 'User message not found' });
          controller.close();
          return;
        }
        
        // Parse command from user message
        const command = parseQuickCommand(userMsg.content);
        
        // Handle priority commands directly (fast response)
        if (command.type === 'priority') {
          const response = await handlePriorityCommand(command, assistantMsg.workspaceId);
          send({ type: 'delta', content: response });
          
          // Save to DB
          await prisma.chatMessage.update({
            where: { id: messageId },
            data: { 
              content: response, 
              isProcessing: false,
              contentType: 'priority_card',
              metadata: command.data ? { priorities: [command.data] } : undefined,
            },
          });
          
          send({ type: 'done' });
          
          // Sync to Slack (async, don't block)
          syncMessageToSlack(messageId).catch(err => 
            console.error('[Chat Stream] Slack sync error:', err)
          );
          
          controller.close();
          return;
        }
        
        // Handle status commands
        if (command.type === 'status') {
          const projectContext = await getProjectContext();
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
          
          send({ type: 'delta', content: response });
          
          await prisma.chatMessage.update({
            where: { id: messageId },
            data: { content: response, isProcessing: false },
          });
          
          send({ type: 'done' });
          
          // Sync to Slack
          syncMessageToSlack(messageId).catch(err => 
            console.error('[Chat Stream] Slack sync error:', err)
          );
          
          controller.close();
          return;
        }
        
        // Handle approval commands
        if (command.type === 'approval') {
          // Find most recent pending story
          const pendingStory = await prisma.story.findFirst({
            where: { 
              workspaceId: assistantMsg.workspaceId,
              status: 'pending',
            },
            orderBy: { createdAt: 'desc' },
          });
          
          let response: string;
          if (pendingStory) {
            // Approve the story
            await prisma.story.update({
              where: { id: pendingStory.id },
              data: { status: 'approved', userApproved: true },
            });
            response = `✅ Approved: "${pendingStory.title}"\n\nI'll start working on this now.`;
          } else {
            response = "No pending items to approve. Send me a priority (e.g., 'P1: fix the bug') to create work.";
          }
          
          send({ type: 'delta', content: response });
          
          await prisma.chatMessage.update({
            where: { id: messageId },
            data: { content: response, isProcessing: false },
          });
          
          send({ type: 'done' });
          
          // Sync to Slack
          syncMessageToSlack(messageId).catch(err => 
            console.error('[Chat Stream] Slack sync error:', err)
          );
          
          controller.close();
          return;
        }
        
        // For general messages, use the Agent SDK
        const history = await getConversationHistory(assistantMsg.conversationId);
        const projectContext = await getProjectContext();
        const prompt = buildAgentPrompt(
          history.map(h => ({ role: h.role, content: h.content })),
          userMsg.content,
          projectContext
        );
        
        // Get spawnable agents
        const subagents = convertToSDKAgents();
        
        // SDK options
        const sdkOptions: SDKOptions = {
          allowedTools: ['Task', 'Read', 'Grep', 'WebFetch'],
          tools: ['Task', 'Read', 'Grep', 'WebFetch'],
          agents: subagents,
          maxTurns: 5, // Keep chat conversations shorter
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
        
        for await (const message of agentQuery) {
          switch (message.type) {
            case 'assistant': {
              const msg = message as any;
              if (msg.message?.content) {
                const textParts = msg.message.content.filter((c: any) => c.type === 'text');
                const newText = textParts.map((t: any) => t.text || '').join('');
                if (newText && newText !== fullContent) {
                  // Send only the delta
                  const delta = newText.slice(fullContent.length);
                  if (delta) {
                    send({ type: 'delta', content: delta });
                    fullContent = newText;
                  }
                }
              }
              break;
            }
            
            case 'tool_progress': {
              const toolMsg = message as any;
              if (toolMsg.tool_name) {
                toolsUsed.push(toolMsg.tool_name);
                send({ type: 'tool', tool: toolMsg.tool_name, status: 'running' });
                
                if (toolMsg.tool_name === 'Task' && toolMsg.tool_input?.agentName) {
                  send({ 
                    type: 'agent_spawn', 
                    agent: toolMsg.tool_input.agentName 
                  });
                }
              }
              break;
            }
            
            case 'result': {
              const resultMsg = message as any;
              if (resultMsg.result && typeof resultMsg.result === 'string') {
                fullContent = resultMsg.result;
              }
              send({ 
                type: 'done', 
                usage: resultMsg.usage,
                toolsUsed,
              });
              break;
            }
          }
        }
        
        // Save final content to DB
        await prisma.chatMessage.update({
          where: { id: messageId },
          data: { 
            content: fullContent, 
            isProcessing: false,
            metadata: toolsUsed.length > 0 ? { toolsUsed } : undefined,
          },
        });
        
        // Sync to Slack
        syncMessageToSlack(messageId).catch(err => 
          console.error('[Chat Stream] Slack sync error:', err)
        );
        
      } catch (error) {
        console.error('[Chat Stream] Error:', error);
        send({ type: 'error', message: (error as Error).message });
        
        // Update message with error
        await prisma.chatMessage.update({
          where: { id: messageId },
          data: { 
            content: 'Sorry, I encountered an error processing your message. Please try again.',
            isProcessing: false,
          },
        }).catch(() => {});
        
      } finally {
        controller.close();
      }
    },
  });
  
  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no', // Disable nginx buffering
    },
  });
}
