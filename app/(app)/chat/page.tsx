'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import { useAgentChat, type ChatMessage } from '@/lib/hooks/useAgentChat';

// Quick command chips (default, can be overridden by agent)
const DEFAULT_QUICK_COMMANDS = [
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

// Priority card component
function PriorityCard({ priorities }: { priorities: Array<{ level?: string; priority?: string; title?: string; content?: string }> }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '12px' }}>
      {priorities.map((p, i) => (
        <div
          key={i}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '10px 14px',
            backgroundColor: (p.level || p.priority) === 'P0' ? 'rgba(239,68,68,0.1)' : 
                            (p.level || p.priority) === 'P1' ? 'rgba(245,158,11,0.1)' :
                            'rgba(59,130,246,0.1)',
            borderRadius: '8px',
            border: '1px solid',
            borderColor: (p.level || p.priority) === 'P0' ? 'rgba(239,68,68,0.2)' : 
                         (p.level || p.priority) === 'P1' ? 'rgba(245,158,11,0.2)' :
                         'rgba(59,130,246,0.2)',
          }}
        >
          <PriorityBadge level={p.level || p.priority || 'P2'} />
          <span style={{ fontSize: '13px', fontWeight: 500 }}>{p.title || p.content}</span>
        </div>
      ))}
    </div>
  );
}

// Smart action buttons suggested by the agent
interface SuggestedAction {
  label: string;
  value: string;
  style?: 'primary' | 'secondary' | 'success' | 'danger';
}

function ActionButtons({ 
  actions, 
  onAction,
  disabled 
}: { 
  actions: SuggestedAction[]; 
  onAction: (value: string) => void;
  disabled?: boolean;
}) {
  const getButtonStyle = (style?: string) => {
    switch (style) {
      case 'primary':
        return { background: '#8B5CF6', color: 'white', border: 'none' };
      case 'success':
        return { background: '#10B981', color: 'white', border: 'none' };
      case 'danger':
        return { background: '#EF4444', color: 'white', border: 'none' };
      default:
        return { background: 'white', color: '#1C1917', border: '1px solid #E7E5E4' };
    }
  };

  return (
    <div style={{ display: 'flex', gap: '8px', marginTop: '12px', flexWrap: 'wrap' }}>
      {actions.map((action, i) => (
        <button
          key={i}
          onClick={() => onAction(action.value)}
          disabled={disabled}
          style={{
            padding: '8px 16px',
            borderRadius: '8px',
            fontSize: '13px',
            fontWeight: 500,
            cursor: disabled ? 'not-allowed' : 'pointer',
            opacity: disabled ? 0.5 : 1,
            transition: 'all 0.2s',
            ...getButtonStyle(action.style),
          }}
        >
          {action.label}
        </button>
      ))}
    </div>
  );
}

// User message component
function UserMessage({ message }: { message: ChatMessage }) {
  return (
    <div style={{ display: 'flex', gap: '12px', flexDirection: 'row-reverse' }}>
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
      <div style={{ maxWidth: '70%' }}>
        <div
          style={{
            background: '#8B5CF6',
            color: 'white',
            borderRadius: '16px 16px 4px 16px',
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

// Assistant message with markdown rendering
function AssistantMessage({ 
  message, 
  onAction,
  isLatest 
}: { 
  message: ChatMessage; 
  onAction: (value: string) => void;
  isLatest: boolean;
}) {
  const hasPriorities = (message.metadata?.priorities?.length ?? 0) > 0;
  const suggestedActions: SuggestedAction[] = message.metadata?.suggestedActions || [];
  const showActions = isLatest && suggestedActions.length > 0 && !message.isStreaming;
  
  return (
    <div style={{ display: 'flex', gap: '12px' }}>
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
      <div style={{ maxWidth: '75%', minWidth: '200px' }}>
        <div
          style={{
            background: 'white',
            border: '1px solid #E7E5E4',
            borderRadius: '4px 16px 16px 16px',
            padding: '14px 18px',
            boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
          }}
        >
          {message.isStreaming && !message.content ? (
            <div style={{ display: 'flex', gap: '4px', padding: '4px 0' }}>
              <span className="typing-dot" style={{ animationDelay: '0s' }}>●</span>
              <span className="typing-dot" style={{ animationDelay: '0.2s' }}>●</span>
              <span className="typing-dot" style={{ animationDelay: '0.4s' }}>●</span>
            </div>
          ) : (
            <>
              <div className="markdown-content">
                <ReactMarkdown
                  components={{
                    p: ({ children }) => (
                      <p style={{ margin: '0 0 12px 0', lineHeight: 1.6 }}>{children}</p>
                    ),
                    strong: ({ children }) => (
                      <strong style={{ fontWeight: 600, color: '#1C1917' }}>{children}</strong>
                    ),
                    em: ({ children }) => (
                      <em style={{ fontStyle: 'italic' }}>{children}</em>
                    ),
                    ul: ({ children }) => (
                      <ul style={{ margin: '8px 0', paddingLeft: '20px' }}>{children}</ul>
                    ),
                    ol: ({ children }) => (
                      <ol style={{ margin: '8px 0', paddingLeft: '20px' }}>{children}</ol>
                    ),
                    li: ({ children }) => (
                      <li style={{ marginBottom: '4px', lineHeight: 1.5 }}>{children}</li>
                    ),
                    code: ({ children }) => (
                      <code style={{ 
                        background: '#F5F5F4', 
                        padding: '2px 6px', 
                        borderRadius: '4px',
                        fontSize: '13px',
                        fontFamily: 'monospace',
                      }}>{children}</code>
                    ),
                    pre: ({ children }) => (
                      <pre style={{ 
                        background: '#1C1917', 
                        color: '#E7E5E4',
                        padding: '12px 16px', 
                        borderRadius: '8px',
                        overflow: 'auto',
                        fontSize: '13px',
                        margin: '12px 0',
                      }}>{children}</pre>
                    ),
                    h1: ({ children }) => (
                      <h3 style={{ fontSize: '16px', fontWeight: 600, margin: '16px 0 8px 0' }}>{children}</h3>
                    ),
                    h2: ({ children }) => (
                      <h4 style={{ fontSize: '15px', fontWeight: 600, margin: '14px 0 6px 0' }}>{children}</h4>
                    ),
                    h3: ({ children }) => (
                      <h5 style={{ fontSize: '14px', fontWeight: 600, margin: '12px 0 4px 0' }}>{children}</h5>
                    ),
                    a: ({ href, children }) => (
                      <a 
                        href={href} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        style={{ color: '#8B5CF6', textDecoration: 'underline' }}
                      >{children}</a>
                    ),
                    blockquote: ({ children }) => (
                      <blockquote style={{ 
                        borderLeft: '3px solid #8B5CF6',
                        paddingLeft: '12px',
                        margin: '12px 0',
                        color: '#57534E',
                      }}>{children}</blockquote>
                    ),
                  }}
                >
                  {message.content}
                </ReactMarkdown>
                {message.isStreaming && <span className="cursor-blink">▊</span>}
              </div>
              {hasPriorities && message.metadata?.priorities && (
                <PriorityCard priorities={message.metadata.priorities} />
              )}
              {showActions && (
                <ActionButtons 
                  actions={suggestedActions} 
                  onAction={onAction}
                  disabled={false}
                />
              )}
            </>
          )}
        </div>
        <div
          style={{
            fontSize: '11px',
            color: '#A8A29E',
            marginTop: '6px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <span>{formatTime(message.createdAt)}</span>
          {message.toolsUsed && message.toolsUsed.length > 0 && (
            <span style={{ color: '#8B5CF6', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <span>🔧</span>
              <span>{message.toolsUsed.filter((v, i, a) => a.indexOf(v) === i).join(', ')}</span>
            </span>
          )}
          {message.metadata?.agentSpawned && (
            <span style={{ color: '#10B981' }}>
              🤖 Spawned: {message.metadata.agentSpawned}
            </span>
          )}
        </div>
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
        background: 'rgba(139, 92, 246, 0.08)',
        borderRadius: '20px',
        fontSize: '12px',
        color: '#78716C',
        margin: '8px auto',
        maxWidth: 'fit-content',
      }}
    >
      {content} • {formatDate(timestamp)}
    </div>
  );
}

// Project interface
interface Project {
  id: string;
  name: string;
  domain: string | null;
}

// Main chat page component
export default function ChatPage() {
  const [input, setInput] = useState('');
  const [suggestedCommands, setSuggestedCommands] = useState(DEFAULT_QUICK_COMMANDS);
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [loadingProjects, setLoadingProjects] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Load projects on mount
  useEffect(() => {
    const fetchProjects = async () => {
      try {
        const res = await fetch('/api/projects');
        const data = await res.json();
        setProjects(data.projects || []);

        // Try to restore last selected project from localStorage
        const savedProjectId = localStorage.getItem('chat_selected_project');
        if (savedProjectId && data.projects?.some((p: Project) => p.id === savedProjectId)) {
          setSelectedProjectId(savedProjectId);
        } else if (data.projects?.length > 0) {
          // Default to first project if none saved or saved project doesn't exist
          setSelectedProjectId(data.projects[0].id);
          localStorage.setItem('chat_selected_project', data.projects[0].id);
        }
      } catch (err) {
        console.error('[Chat] Failed to load projects:', err);
      } finally {
        setLoadingProjects(false);
      }
    };
    fetchProjects();
  }, []);

  // Save selected project to localStorage when it changes
  useEffect(() => {
    if (selectedProjectId) {
      localStorage.setItem('chat_selected_project', selectedProjectId);
    }
  }, [selectedProjectId]);

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
    projectId: selectedProjectId || undefined,
    onError: (err) => console.error('[Chat] Error:', err),
    onMessageComplete: (msg) => {
      // Update suggested commands from latest message
      if (msg.metadata?.suggestedCommands) {
        setSuggestedCommands(msg.metadata.suggestedCommands);
      }
    },
  });

  // Load history on mount and when project changes
  useEffect(() => {
    if (selectedProjectId) {
      loadHistory('24h');
    }
  }, [selectedProjectId, loadHistory]);
  
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
      }).catch(() => {});
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
  
  // Handle action button click
  const handleAction = useCallback((value: string) => {
    if (!isLoading) {
      sendMessage(value);
    }
  }, [isLoading, sendMessage]);
  
  // Handle quick command
  const handleQuickCommand = useCallback((value: string) => {
    if (value.endsWith(' ')) {
      setInput(value);
      inputRef.current?.focus();
    } else {
      sendMessage(value);
    }
  }, [sendMessage]);
  
  // Get last assistant message for showing actions
  const lastAssistantIndex = [...messages].reverse().findIndex(m => m.role === 'assistant');
  const lastAssistantMsgIndex = lastAssistantIndex >= 0 ? messages.length - 1 - lastAssistantIndex : -1;
  
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
          margin-left: 2px;
        }
        @keyframes blink {
          0%, 50% { opacity: 1; }
          51%, 100% { opacity: 0; }
        }
        .markdown-content {
          font-size: 14px;
          color: #1C1917;
          line-height: 1.6;
        }
        .markdown-content > *:last-child {
          margin-bottom: 0 !important;
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
          gap: '16px',
        }}
      >
        <div style={{ flex: 1 }}>
          <h2 style={{ fontSize: '18px', fontWeight: 600, margin: 0, color: '#1C1917' }}>Virtual Cofounder</h2>
          <span style={{ fontSize: '12px', color: '#10B981', display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span style={{ width: '6px', height: '6px', background: '#10B981', borderRadius: '50%' }} />
            Online
          </span>
        </div>

        {/* Project Selector */}
        <div style={{ minWidth: '200px' }}>
          {loadingProjects ? (
            <div style={{
              padding: '8px 12px',
              background: '#F5F5F4',
              borderRadius: '8px',
              fontSize: '13px',
              color: '#78716C',
            }}>
              Loading projects...
            </div>
          ) : projects.length === 0 ? (
            <div style={{
              padding: '8px 12px',
              background: '#FEE2E2',
              borderRadius: '8px',
              fontSize: '13px',
              color: '#991B1B',
            }}>
              ⚠️ No projects
            </div>
          ) : (
            <select
              value={selectedProjectId || ''}
              onChange={(e) => setSelectedProjectId(e.target.value)}
              style={{
                width: '100%',
                padding: '8px 12px',
                border: '1px solid #E7E5E4',
                borderRadius: '8px',
                fontSize: '13px',
                fontWeight: 500,
                background: 'white',
                color: '#1C1917',
                cursor: 'pointer',
                outline: 'none',
              }}
            >
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  📁 {project.name}
                </option>
              ))}
            </select>
          )}
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
              fontSize: '16px',
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
        {projects.length === 0 && !loadingProjects ? (
          <div
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#78716C',
              gap: '16px',
              textAlign: 'center',
              padding: '48px',
            }}
          >
            <div style={{ fontSize: '56px' }}>📁</div>
            <div>
              <p style={{ fontSize: '18px', margin: 0, fontWeight: 600, color: '#1C1917' }}>
                No projects yet
              </p>
              <p style={{ fontSize: '14px', margin: '8px 0 0 0', maxWidth: '400px', color: '#78716C' }}>
                Create a project first to start chatting with your Virtual Cofounder.
                Chat requires a project context to create stories and execute work.
              </p>
              <a
                href="/projects"
                style={{
                  display: 'inline-block',
                  marginTop: '16px',
                  padding: '10px 20px',
                  background: '#8B5CF6',
                  color: 'white',
                  textDecoration: 'none',
                  borderRadius: '8px',
                  fontSize: '14px',
                  fontWeight: 600,
                }}
              >
                Go to Projects
              </a>
            </div>
          </div>
        ) : messages.length === 0 ? (
          <div
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#78716C',
              gap: '16px',
              textAlign: 'center',
            }}
          >
            <div style={{
              fontSize: '56px',
              background: 'linear-gradient(135deg, #8B5CF6, #7C3AED)',
              borderRadius: '20px',
              padding: '16px',
            }}>🤖</div>
            <div>
              <p style={{ fontSize: '18px', margin: 0, fontWeight: 600, color: '#1C1917' }}>
                Start a conversation
              </p>
              <p style={{ fontSize: '14px', margin: '8px 0 0 0', maxWidth: '300px' }}>
                Set priorities, ask for status updates, create stories, or get help with{' '}
                {projects.find(p => p.id === selectedProjectId)?.name || 'your project'}.
              </p>
            </div>
          </div>
        ) : (
          <>
            {messages.length > 0 && (
              <SystemMessage 
                content="Conversation started" 
                timestamp={messages[0].createdAt} 
              />
            )}
            
            {messages.map((msg, index) => (
              msg.role === 'user' ? (
                <UserMessage key={msg.id} message={msg} />
              ) : msg.role === 'system' ? (
                <SystemMessage 
                  key={msg.id} 
                  content={msg.content} 
                  timestamp={msg.createdAt} 
                />
              ) : (
                <AssistantMessage 
                  key={msg.id} 
                  message={msg} 
                  onAction={handleAction}
                  isLatest={index === lastAssistantMsgIndex}
                />
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
            placeholder={
              projects.length === 0
                ? "Please create a project first..."
                : !selectedProjectId
                ? "Select a project to start chatting..."
                : "Type a message or command..."
            }
            disabled={isLoading || projects.length === 0 || !selectedProjectId}
            style={{
              flex: 1,
              padding: '14px 18px',
              border: '1px solid #E7E5E4',
              borderRadius: '12px',
              fontSize: '14px',
              outline: 'none',
              transition: 'border-color 0.2s',
              opacity: projects.length === 0 || !selectedProjectId ? 0.5 : 1,
            }}
            onFocus={(e) => e.target.style.borderColor = '#8B5CF6'}
            onBlur={(e) => e.target.style.borderColor = '#E7E5E4'}
          />
          <button
            type="submit"
            disabled={isLoading || !input.trim() || projects.length === 0 || !selectedProjectId}
            style={{
              padding: '14px 28px',
              background: isLoading || !input.trim() || projects.length === 0 || !selectedProjectId ? '#D6D3D1' : '#8B5CF6',
              color: 'white',
              border: 'none',
              borderRadius: '12px',
              fontSize: '14px',
              fontWeight: 600,
              cursor: isLoading || !input.trim() || projects.length === 0 || !selectedProjectId ? 'not-allowed' : 'pointer',
              transition: 'background 0.2s',
            }}
          >
            {isLoading ? '...' : 'Send'}
          </button>
        </form>
        
        {/* Quick Commands */}
        <div style={{ marginTop: '10px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {suggestedCommands.map((cmd) => (
            <button
              key={cmd.label}
              type="button"
              onClick={() => handleQuickCommand(cmd.value)}
              disabled={isLoading || projects.length === 0 || !selectedProjectId}
              style={{
                fontSize: '12px',
                color: '#57534E',
                padding: '6px 12px',
                background: '#F5F5F4',
                borderRadius: '6px',
                border: 'none',
                cursor: isLoading || projects.length === 0 || !selectedProjectId ? 'not-allowed' : 'pointer',
                transition: 'all 0.2s',
                opacity: isLoading || projects.length === 0 || !selectedProjectId ? 0.5 : 1,
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
