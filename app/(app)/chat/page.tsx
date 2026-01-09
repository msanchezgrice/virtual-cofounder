'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useAgentChat, type ChatMessage } from '@/lib/hooks/useAgentChat';

// Quick command chips
const QUICK_COMMANDS = [
  { label: '✅ approved', value: 'approved' },
  { label: 'P0:', value: 'P0: ' },
  { label: 'status', value: 'status' },
];

// Format time for display
function formatTime(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleTimeString('en-US', { 
    hour: 'numeric', 
    minute: '2-digit',
    hour12: true 
  });
}

// Format date for system messages
function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }) + ' at ' + formatTime(dateStr);
}

// Priority badge component
function PriorityBadge({ level }: { level: string }) {
  const styles: Record<string, { bg: string; text: string }> = {
    P0: { bg: '#FEE2E2', text: '#991B1B' },
    P1: { bg: '#FEF3C7', text: '#92400E' },
    P2: { bg: '#DBEAFE', text: '#1E40AF' },
    P3: { bg: '#F3F4F6', text: '#6B7280' },
  };
  const style = styles[level] || styles.P2;
  
  return (
    <span
      style={{
        padding: '2px 8px',
        borderRadius: '4px',
        fontSize: '11px',
        fontWeight: 600,
        backgroundColor: style.bg,
        color: style.text,
      }}
    >
      {level}
    </span>
  );
}

// Priority card component (for assistant messages with priorities)
function PriorityCard({ priorities }: { priorities: Array<{ level?: string; priority?: string; title?: string; content?: string }> }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '8px' }}>
      {priorities.map((p, i) => (
        <div
          key={i}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '8px 12px',
            backgroundColor: (p.level || p.priority) === 'P0' ? 'rgba(239,68,68,0.1)' : 
                            (p.level || p.priority) === 'P1' ? 'rgba(245,158,11,0.1)' :
                            'rgba(59,130,246,0.1)',
            borderRadius: '6px',
          }}
        >
          <PriorityBadge level={p.level || p.priority || 'P2'} />
          <span style={{ fontSize: '13px' }}>{p.title || p.content}</span>
        </div>
      ))}
    </div>
  );
}

// User message component
function UserMessage({ message }: { message: ChatMessage }) {
  return (
    <div style={{ display: 'flex', gap: '12px', flexDirection: 'row-reverse' }}>
      {/* User avatar */}
      <div
        style={{
          width: '36px',
          height: '36px',
          borderRadius: '8px',
          background: 'linear-gradient(135deg, #10B981, #059669)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          color: 'white',
          fontWeight: 600,
          fontSize: '14px',
        }}
      >
        M
      </div>
      {/* Message bubble */}
      <div style={{ maxWidth: '70%' }}>
        <div
          style={{
            background: '#8B5CF6',
            color: 'white',
            borderRadius: '12px',
            padding: '12px 16px',
          }}
        >
          <p style={{ fontSize: '14px', margin: 0, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
            {message.content}
          </p>
        </div>
        <span
          style={{
            fontSize: '11px',
            color: '#A8A29E',
            marginTop: '4px',
            display: 'block',
            textAlign: 'right',
          }}
        >
          {formatTime(message.createdAt)}
        </span>
      </div>
    </div>
  );
}

// Assistant message component
function AssistantMessage({ message }: { message: ChatMessage }) {
  const hasPriorities = message.metadata?.priorities?.length > 0;
  
  return (
    <div style={{ display: 'flex', gap: '12px' }}>
      {/* Bot avatar */}
      <div
        style={{
          width: '36px',
          height: '36px',
          borderRadius: '8px',
          background: 'linear-gradient(135deg, #8B5CF6, #7C3AED)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          fontSize: '18px',
        }}
      >
        🤖
      </div>
      {/* Message bubble */}
      <div style={{ maxWidth: '70%' }}>
        <div
          style={{
            background: 'white',
            border: '1px solid #E7E5E4',
            borderRadius: '12px',
            padding: '12px 16px',
          }}
        >
          {message.isStreaming && !message.content ? (
            <div style={{ display: 'flex', gap: '4px' }}>
              <span className="typing-dot" style={{ animationDelay: '0s' }}>●</span>
              <span className="typing-dot" style={{ animationDelay: '0.2s' }}>●</span>
              <span className="typing-dot" style={{ animationDelay: '0.4s' }}>●</span>
            </div>
          ) : (
            <>
              <p style={{ fontSize: '14px', margin: 0, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
                {message.content}
                {message.isStreaming && <span className="cursor-blink">▊</span>}
              </p>
              {hasPriorities && (
                <PriorityCard priorities={message.metadata.priorities} />
              )}
            </>
          )}
        </div>
        <span
          style={{
            fontSize: '11px',
            color: '#A8A29E',
            marginTop: '4px',
            display: 'block',
          }}
        >
          {formatTime(message.createdAt)}
          {message.toolsUsed && message.toolsUsed.length > 0 && (
            <span style={{ marginLeft: '8px', color: '#8B5CF6' }}>
              🔧 {message.toolsUsed.join(', ')}
            </span>
          )}
        </span>
      </div>
    </div>
  );
}

// System message (date divider)
function SystemMessage({ content, timestamp }: { content: string; timestamp: string }) {
  return (
    <div
      style={{
        textAlign: 'center',
        padding: '8px 16px',
        background: '#F9F3ED',
        borderRadius: '8px',
        fontSize: '12px',
        color: '#A8A29E',
      }}
    >
      {content} • {formatDate(timestamp)}
    </div>
  );
}

// Main chat page component
export default function ChatPage() {
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  
  const {
    messages,
    isLoading,
    isStreaming,
    error,
    sendMessage,
    stop,
    clearError,
    loadHistory,
  } = useAgentChat({
    onError: (err) => console.error('[Chat] Error:', err),
  });
  
  // Load history on mount
  useEffect(() => {
    loadHistory('24h');
  }, [loadHistory]);
  
  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);
  
  // Mark messages as read when viewing
  useEffect(() => {
    if (messages.length > 0) {
      fetch('/api/chat/mark-read', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ beforeTimestamp: new Date().toISOString() }),
      }).catch(() => {}); // Silent fail
    }
  }, [messages.length]);
  
  // Handle send
  const handleSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    if (input.trim() && !isLoading) {
      sendMessage(input);
      setInput('');
    }
  }, [input, isLoading, sendMessage]);
  
  // Handle quick command
  const handleQuickCommand = useCallback((value: string) => {
    setInput(value);
    inputRef.current?.focus();
  }, []);
  
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 60px)' }}>
      {/* CSS for animations */}
      <style jsx global>{`
        .typing-dot {
          animation: typing 1.4s infinite;
          color: #A8A29E;
        }
        @keyframes typing {
          0%, 60%, 100% { opacity: 0.3; }
          30% { opacity: 1; }
        }
        .cursor-blink {
          animation: blink 1s infinite;
          color: #8B5CF6;
        }
        @keyframes blink {
          0%, 50% { opacity: 1; }
          51%, 100% { opacity: 0; }
        }
      `}</style>
      
      {/* Chat Header */}
      <div
        style={{
          padding: '16px 24px',
          borderBottom: '1px solid #E7E5E4',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          background: 'white',
        }}
      >
        <div>
          <h2 style={{ fontSize: '18px', fontWeight: 600, margin: 0 }}>Virtual Cofounder</h2>
          <span style={{ fontSize: '12px', color: '#10B981' }}>● Online</span>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          {isStreaming && (
            <button
              onClick={stop}
              style={{
                padding: '6px 12px',
                borderRadius: '6px',
                fontSize: '12px',
                fontWeight: 500,
                background: '#FEE2E2',
                color: '#991B1B',
                border: 'none',
                cursor: 'pointer',
              }}
            >
              ⏹ Stop
            </button>
          )}
        </div>
      </div>
      
      {/* Error Banner */}
      {error && (
        <div
          style={{
            padding: '12px 24px',
            background: '#FEF3C7',
            color: '#92400E',
            fontSize: '14px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <span>⚠️ {error}</span>
          <button
            onClick={clearError}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: '4px',
            }}
          >
            ✕
          </button>
        </div>
      )}
      
      {/* Messages Area */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '24px',
          display: 'flex',
          flexDirection: 'column',
          gap: '20px',
          background: '#FDF8F3',
        }}
      >
        {messages.length === 0 ? (
          <div
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#A8A29E',
              gap: '12px',
            }}
          >
            <div style={{ fontSize: '48px' }}>💬</div>
            <p style={{ fontSize: '16px', margin: 0 }}>Start a conversation</p>
            <p style={{ fontSize: '14px', margin: 0 }}>
              Set priorities, ask for status updates, or get help with your projects.
            </p>
          </div>
        ) : (
          <>
            {/* System message at start */}
            {messages.length > 0 && (
              <SystemMessage 
                content="Conversation started" 
                timestamp={messages[0].createdAt} 
              />
            )}
            
            {/* Messages */}
            {messages.map((msg) => (
              msg.role === 'user' ? (
                <UserMessage key={msg.id} message={msg} />
              ) : msg.role === 'system' ? (
                <SystemMessage 
                  key={msg.id} 
                  content={msg.content} 
                  timestamp={msg.createdAt} 
                />
              ) : (
                <AssistantMessage key={msg.id} message={msg} />
              )
            ))}
            
            <div ref={messagesEndRef} />
          </>
        )}
      </div>
      
      {/* Input Area */}
      <div
        style={{
          padding: '16px 24px',
          borderTop: '1px solid #E7E5E4',
          background: 'white',
        }}
      >
        <form onSubmit={handleSubmit} style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type a message or command..."
            disabled={isLoading}
            style={{
              flex: 1,
              padding: '12px 16px',
              border: '1px solid #E7E5E4',
              borderRadius: '8px',
              fontSize: '14px',
              outline: 'none',
            }}
          />
          <button
            type="submit"
            disabled={isLoading || !input.trim()}
            style={{
              padding: '12px 24px',
              background: isLoading ? '#D6D3D1' : '#8B5CF6',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              fontSize: '14px',
              fontWeight: 600,
              cursor: isLoading ? 'not-allowed' : 'pointer',
            }}
          >
            {isLoading ? '...' : 'Send'}
          </button>
        </form>
        
        {/* Quick Commands */}
        <div style={{ marginTop: '8px', display: 'flex', gap: '8px' }}>
          {QUICK_COMMANDS.map((cmd) => (
            <button
              key={cmd.label}
              type="button"
              onClick={() => handleQuickCommand(cmd.value)}
              style={{
                fontSize: '11px',
                color: '#A8A29E',
                padding: '4px 8px',
                background: '#F9F3ED',
                borderRadius: '4px',
                border: 'none',
                cursor: 'pointer',
              }}
            >
              {cmd.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
