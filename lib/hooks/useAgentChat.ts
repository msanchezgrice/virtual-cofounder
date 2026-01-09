/**
 * useAgentChat Hook
 * 
 * React hook for managing chat state and SSE streaming with the Agent SDK.
 * No external dependencies - pure React + EventSource.
 */

import { useState, useCallback, useRef, useEffect } from 'react';

export interface SuggestedAction {
  label: string;
  value: string;
  style?: 'primary' | 'secondary' | 'success' | 'danger';
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  contentType?: string;
  metadata?: {
    priorities?: Array<{ level?: string; priority?: string; title?: string; content?: string }>;
    suggestedActions?: SuggestedAction[];
    agentSpawned?: string;
    toolsUsed?: string[];
    [key: string]: any;
  };
  isStreaming?: boolean;
  isProcessing?: boolean;
  toolsUsed?: string[];
  createdAt: string;
  readAt?: string | null;
}

interface UseAgentChatOptions {
  conversationId?: string;
  projectId?: string;
  onError?: (error: string) => void;
  onMessageComplete?: (message: ChatMessage) => void;
}

interface UseAgentChatReturn {
  messages: ChatMessage[];
  isLoading: boolean;
  isStreaming: boolean;
  error: string | null;
  sendMessage: (content: string) => Promise<void>;
  stop: () => void;
  clearError: () => void;
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
  loadHistory: (since?: string) => Promise<void>;
}

export function useAgentChat(options: UseAgentChatOptions = {}): UseAgentChatReturn {
  const { 
    conversationId = 'main', 
    projectId,
    onError,
    onMessageComplete,
  } = options;
  
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const eventSourceRef = useRef<EventSource | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  
  // Load conversation history
  const loadHistory = useCallback(async (since: string = '1h') => {
    try {
      const params = new URLSearchParams({
        conversationId,
        since,
        limit: '50',
      });
      if (projectId) params.set('projectId', projectId);
      
      const res = await fetch(`/api/chat/messages?${params}`);
      const data = await res.json();
      
      if (data.messages) {
        setMessages(data.messages);
      }
    } catch (err) {
      console.error('[useAgentChat] Error loading history:', err);
    }
  }, [conversationId, projectId]);
  
  // Send a message
  const sendMessage = useCallback(async (content: string) => {
    if (!content.trim() || isLoading) return;
    
    setIsLoading(true);
    setError(null);
    
    // Create abort controller for this request
    abortControllerRef.current = new AbortController();
    
    // Optimistically add user message
    const tempUserMsg: ChatMessage = {
      id: `temp-user-${Date.now()}`,
      role: 'user',
      content: content.trim(),
      createdAt: new Date().toISOString(),
    };
    setMessages(prev => [...prev, tempUserMsg]);
    
    try {
      // POST to create messages
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          content: content.trim(), 
          projectId,
          conversationId,
        }),
        signal: abortControllerRef.current.signal,
      });
      
      if (!res.ok) {
        throw new Error(`Failed to send message: ${res.status}`);
      }
      
      const data = await res.json();
      const { userMessage, assistantMessage, streamUrl } = data;
      
      // Replace temp message with real one
      setMessages(prev => prev.map(m => 
        m.id === tempUserMsg.id ? { ...userMessage, createdAt: userMessage.createdAt } : m
      ));
      
      // Add streaming assistant message placeholder
      const streamingMsg: ChatMessage = {
        ...assistantMessage,
        content: '',
        isStreaming: true,
        isProcessing: true,
        toolsUsed: [],
      };
      setMessages(prev => [...prev, streamingMsg]);
      setIsStreaming(true);
      
      // Connect to SSE stream
      const eventSource = new EventSource(streamUrl);
      eventSourceRef.current = eventSource;
      
      eventSource.onmessage = (event) => {
        try {
          const eventData = JSON.parse(event.data);
          
          switch (eventData.type) {
            case 'delta':
              // Append text to streaming message
              setMessages(prev => prev.map(m => 
                m.id === assistantMessage.id 
                  ? { ...m, content: m.content + eventData.content }
                  : m
              ));
              break;
              
            case 'tool':
              // Track tool usage
              setMessages(prev => prev.map(m => 
                m.id === assistantMessage.id 
                  ? { ...m, toolsUsed: [...(m.toolsUsed || []), eventData.tool] }
                  : m
              ));
              break;
              
            case 'agent_spawn':
              // Track spawned agents
              console.log('[useAgentChat] Agent spawned:', eventData.agent);
              setMessages(prev => prev.map(m => 
                m.id === assistantMessage.id 
                  ? { 
                      ...m, 
                      metadata: { 
                        ...m.metadata, 
                        agentSpawned: eventData.agent 
                      } 
                    }
                  : m
              ));
              break;
              
            case 'actions':
              // Update suggested actions
              setMessages(prev => prev.map(m => 
                m.id === assistantMessage.id 
                  ? { 
                      ...m, 
                      metadata: { 
                        ...m.metadata, 
                        suggestedActions: eventData.actions 
                      } 
                    }
                  : m
              ));
              break;
              
            case 'done':
              // Finalize message
              setMessages(prev => prev.map(m => 
                m.id === assistantMessage.id 
                  ? { ...m, isStreaming: false, isProcessing: false }
                  : m
              ));
              setIsLoading(false);
              setIsStreaming(false);
              eventSource.close();
              
              // Callback
              if (onMessageComplete) {
                const finalMsg = messages.find(m => m.id === assistantMessage.id);
                if (finalMsg) onMessageComplete(finalMsg);
              }
              break;
              
            case 'error':
              setError(eventData.message);
              setIsLoading(false);
              setIsStreaming(false);
              eventSource.close();
              if (onError) onError(eventData.message);
              break;
          }
        } catch (parseError) {
          console.error('[useAgentChat] Error parsing SSE:', parseError);
        }
      };
      
      eventSource.onerror = (err) => {
        console.error('[useAgentChat] SSE error:', err);
        // Only set error if we're still streaming (not intentionally closed)
        if (isStreaming) {
          setError('Connection lost. Please try again.');
          if (onError) onError('Connection lost');
        }
        setIsLoading(false);
        setIsStreaming(false);
        eventSource.close();
      };
      
    } catch (err) {
      if ((err as Error).name === 'AbortError') {
        // User cancelled
        setMessages(prev => prev.filter(m => m.id !== tempUserMsg.id));
      } else {
        console.error('[useAgentChat] Error:', err);
        const errorMsg = (err as Error).message || 'Failed to send message';
        setError(errorMsg);
        if (onError) onError(errorMsg);
      }
      setIsLoading(false);
      setIsStreaming(false);
    }
  }, [conversationId, projectId, isLoading, isStreaming, onError, onMessageComplete, messages]);
  
  // Stop streaming
  const stop = useCallback(() => {
    eventSourceRef.current?.close();
    abortControllerRef.current?.abort();
    setIsLoading(false);
    setIsStreaming(false);
    setMessages(prev => prev.map(m => 
      m.isStreaming ? { ...m, isStreaming: false, isProcessing: false } : m
    ));
  }, []);
  
  // Clear error
  const clearError = useCallback(() => {
    setError(null);
  }, []);
  
  // Cleanup on unmount
  useEffect(() => {
    return () => {
      eventSourceRef.current?.close();
      abortControllerRef.current?.abort();
    };
  }, []);
  
  return {
    messages,
    isLoading,
    isStreaming,
    error,
    sendMessage,
    stop,
    clearError,
    setMessages,
    loadHistory,
  };
}
