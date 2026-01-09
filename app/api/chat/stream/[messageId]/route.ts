/**
 * Chat API - SSE Streaming Endpoint
 * 
 * GET /api/chat/stream/[messageId]
 * Server-Sent Events stream that subscribes to Redis pub/sub
 * 
 * Architecture:
 * 1. Client connects to this SSE endpoint
 * 2. This endpoint subscribes to Redis channel: chat:stream:{messageId}
 * 3. Railway chat worker publishes deltas to Redis
 * 4. This endpoint forwards deltas to client
 * 
 * This runs on Vercel. The actual Agent SDK processing happens on Railway.
 */

import { prisma } from '@/lib/db';
import Redis from 'ioredis';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Timeout for waiting for worker to start processing
const WORKER_TIMEOUT_MS = 30000; // 30 seconds
const POLL_INTERVAL_MS = 500; // Check every 500ms

export async function GET(
  req: Request,
  { params }: { params: { messageId: string } }
) {
  const messageId = params.messageId;
  
  const encoder = new TextEncoder();
  
  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: object) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        } catch {
          // Controller might be closed
        }
      };
      
      let subscriber: Redis | null = null;
      let isSubscribed = false;
      let isDone = false;
      let pollInterval: NodeJS.Timeout | null = null;
      
      const cleanup = async () => {
        if (pollInterval) {
          clearInterval(pollInterval);
          pollInterval = null;
        }
        
        if (subscriber && isSubscribed) {
          try {
            await subscriber.unsubscribe(`chat:stream:${messageId}`);
            await subscriber.quit();
          } catch {
            // Ignore cleanup errors
          }
        }
        subscriber = null;
        isSubscribed = false;
      };
      
      try {
        // Verify message exists and is processing
        const message = await prisma.chatMessage.findUnique({
          where: { id: messageId },
        });
        
        if (!message) {
          send({ type: 'error', message: 'Message not found' });
          controller.close();
          return;
        }
        
        // If already processed, return the content immediately
        if (!message.isProcessing && message.content) {
          send({ type: 'delta', content: message.content });
          
          // Check for suggested actions in metadata
          const metadata = message.metadata as any;
          if (metadata?.suggestedActions?.length > 0) {
            send({ type: 'actions', actions: metadata.suggestedActions });
          }
          
          send({ type: 'done' });
          controller.close();
          return;
        }
        
        // Set up Redis subscriber
        const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
        subscriber = new Redis(redisUrl, {
          tls: redisUrl.startsWith('rediss://') ? {} : undefined,
        });
        
        const channel = `chat:stream:${messageId}`;
        
        // Handle incoming messages
        subscriber.on('message', (ch: string, data: string) => {
          if (ch !== channel) return;
          
          try {
            const parsed = JSON.parse(data);
            send(parsed);
            
            // Check if we're done
            if (parsed.type === 'done' || parsed.type === 'error') {
              isDone = true;
              cleanup().then(() => {
                controller.close();
              });
            }
          } catch (e) {
            console.error('[Chat Stream] Error parsing Redis message:', e);
          }
        });
        
        subscriber.on('error', (err) => {
          console.error('[Chat Stream] Redis subscriber error:', err);
        });
        
        // Subscribe to channel
        await subscriber.subscribe(channel);
        isSubscribed = true;
        
        console.log(`[Chat Stream] Subscribed to ${channel}`);
        
        // Also poll the database as a fallback
        // In case the worker finished before we subscribed
        let pollCount = 0;
        const maxPolls = WORKER_TIMEOUT_MS / POLL_INTERVAL_MS;
        
        pollInterval = setInterval(async () => {
          if (isDone) {
            await cleanup();
            return;
          }
          
          pollCount++;
          
          try {
            const updated = await prisma.chatMessage.findUnique({
              where: { id: messageId },
            });
            
            // If message is no longer processing, we're done
            if (updated && !updated.isProcessing && updated.content) {
              isDone = true;
              
              // Send final content if we haven't via pub/sub
              send({ type: 'delta', content: updated.content });
              
              const metadata = updated.metadata as any;
              if (metadata?.suggestedActions?.length > 0) {
                send({ type: 'actions', actions: metadata.suggestedActions });
              }
              
              send({ type: 'done' });
              
              await cleanup();
              controller.close();
              return;
            }
            
            // Timeout check
            if (pollCount >= maxPolls) {
              isDone = true;
              send({ 
                type: 'error', 
                message: 'Timeout waiting for response. The chat worker may be busy or not running.'
              });
              
              // Mark message as failed
              await prisma.chatMessage.update({
                where: { id: messageId },
                data: { 
                  content: 'Sorry, the request timed out. Please try again.',
                  isProcessing: false,
                },
              });
              
              await cleanup();
              controller.close();
              return;
            }
          } catch (e) {
            console.error('[Chat Stream] Poll error:', e);
          }
        }, POLL_INTERVAL_MS);
        
        // Handle client disconnect
        req.signal.addEventListener('abort', async () => {
          console.log(`[Chat Stream] Client disconnected from ${channel}`);
          await cleanup();
        });
        
      } catch (error) {
        console.error('[Chat Stream] Error:', error);
        send({ type: 'error', message: (error as Error).message });
        await cleanup();
        controller.close();
      }
    },
  });
  
  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
