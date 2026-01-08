# Implementation Q&A - Agent SDK Integration

**Date:** 2026-01-08
**Reference:** codex proposed refactor + agent-sdk-integration-plan.md

---

## 0. Agent Definition: Pre-Defined vs Dynamic Spawning

### Short Answer: **BOTH - but pre-define for specialized tools**

The Claude Agent SDK supports **both approaches**:

1. **Pre-defined agents**: Define agent structure, tools, and prompts upfront
2. **Dynamic spawning**: Let the Head of Product decide what agents to spawn at runtime

### How the Agent SDK Works:

```typescript
// Option 1: Pre-defined agents (RECOMMENDED for specialized tools)
const agents = {
  'design-agent': {
    description: 'Creates UI mockups and landing pages',
    prompt: 'You are a design specialist. Use Figma MCP and WebSearch...',
    tools: ['WebSearch', 'WebFetch', 'Write', 'FigmaMCP'],
    model: 'claude-opus-4-5-20251101',
  },
  'security-agent': {
    description: 'Audits code for vulnerabilities',
    prompt: 'You are a security expert...',
    tools: ['Read', 'Grep', 'Bash'],
    model: 'claude-opus-4-5-20251101',
  },
};

// Head of Product can spawn these by name
const response = await query({
  prompt: 'Analyze this project and identify priority work',
  options: {
    agents: agents,  // Pre-defined agents available
    allowedTools: ['Task'],  // Can spawn agents with Task tool
  }
});

// Option 2: Dynamic spawning (SDK handles)
// The orchestrator CAN spawn ad-hoc agents without pre-definition,
// but they won't have specialized tools like Figma MCP
```

### Why Pre-Define? **SPECIALIZED TOOLS**

The key reason to pre-define agents is **tool access**:

| Pre-Defined | Dynamic |
|-------------|---------|
| ✅ Custom MCP tools (Figma, PostHog, Linear) | ❌ Only standard tools |
| ✅ Tool constraints per agent type | ❌ All tools available |
| ✅ Model selection per agent | ❌ Same model as parent |
| ✅ Detailed prompts with examples | ❌ Generic prompts |

### For Your Design Agent with Great Design Skills:

```typescript
// lib/agents/design-agent.ts

import { AgentDefinition } from './types';

// Pre-define to ensure access to specialized design tools
export const designAgent: AgentDefinition = {
  name: 'Website Design Agent',
  description: 'Creates landing pages, UI components, responsive layouts',
  model: 'claude-opus-4-5-20251101',  // Opus for creativity
  tools: [
    // Standard tools
    'WebSearch',      // Research design trends
    'WebFetch',       // Fetch reference sites
    'Read',           // Read existing code
    'Write',          // Create HTML/CSS files
    
    // SPECIALIZED DESIGN TOOLS (require pre-definition!)
    'FigmaMCP',       // Figma MCP integration
    'Screenshot',     // Take screenshots of designs
    'v0-api',         // v0.dev API for quick prototypes (if available)
  ],
  prompt: `You are an expert Website Design Agent. You create beautiful, 
    modern UI that rivals professional designers.
    
    WORKFLOW:
    1. Research current design trends with WebSearch
    2. Fetch reference sites for inspiration with WebFetch
    3. Create HTML mockups with inline Tailwind CSS
    4. Use FigmaMCP to create/update Figma files
    5. Output preview-able HTML files
    
    STYLE GUIDELINES:
    - Modern, clean aesthetic (not generic AI slop)
    - Mobile-first responsive design
    - Use the brand color palette
    - Include micro-interactions and hover states
    
    OUTPUT FORMAT:
    - HTML files with inline <style> blocks
    - Tailwind CSS classes where possible
    - Each variant in separate file for comparison`,
  maxTurns: 10,
  canSpawnSubagents: false,
  
  // Examples help the agent understand quality bar
  examples: [
    {
      input: 'Create landing page variant for A/B test',
      output: 'Created 3 variants: hero-focused.html, social-proof.html, features.html',
    }
  ],
};
```

### Recommendation: **Hybrid Approach**

```typescript
// lib/orchestrator/agent-router.ts

// Pre-define agents with specialized tools
const SPECIALIZED_AGENTS = {
  'design': designAgent,        // Has Figma MCP
  'security': securityAgent,    // Has npm audit bash access
  'analytics': analyticsAgent,  // Has PostHog MCP
  'code-gen': codeGenAgent,     // Has full file system access
};

// Let orchestrator decide WHEN to spawn, but use pre-defined WHAT
async function runOrchestrator(project: Project) {
  const response = await query({
    prompt: `Analyze this project and decide which specialists to spawn.
             Available specialists: ${Object.keys(SPECIALIZED_AGENTS).join(', ')}`,
    options: {
      agents: SPECIALIZED_AGENTS,  // Pre-defined agents
      allowedTools: ['Task'],       // Can spawn them dynamically
    }
  });
  
  // SDK will:
  // 1. Let Head of Product reason about what's needed
  // 2. Spawn appropriate pre-defined agents
  // 3. Pass context to each agent
  // 4. Collect results
}
```

### MCP Tools for Design:

To use "really great design skills," integrate these MCPs:

| MCP | Purpose | How to Use |
|-----|---------|------------|
| **Figma MCP** | Create/edit Figma files | `mcp-figma` package |
| **v0 API** | Generate UI components | Vercel v0.dev API (if available) |
| **Screenshot MCP** | Capture visual previews | `mcp-screenshot` |
| **Tailwind MCP** | Generate Tailwind classes | Custom or built-in |

### Summary:

- ✅ **Pre-define agents** when they need specialized tools (Figma, PostHog, etc.)
- ✅ **Let orchestrator decide** when/whether to spawn each agent
- ✅ **Provide examples** in agent prompts to set quality bar
- ❌ **Don't rely on dynamic spawning** for agents that need MCP tools

---

## 1. Will It Run in Background (Railway Workers)?

### Short Answer: **Yes, with caveats**

### What We Know:
- The Agent SDK (`@anthropic-ai/claude-agent-sdk`) uses the Anthropic API under the hood
- Railway workers already have:
  - ✅ File system access (`/tmp` for cloning repos)
  - ✅ Network access (API calls)
  - ✅ Environment variables (`ANTHROPIC_API_KEY`)
  - ✅ Long-running process support (up to 60 min timeout)

### Potential Issues:

| Risk | Mitigation |
|------|------------|
| **Claude Code CLI required** | SDK docs mention CLI as runtime, but API-only mode likely exists for headless |
| **Long-running processes** | Railway Pro supports up to 60 min; add checkpointing for longer runs |
| **Memory limits** | Monitor agent memory usage; Railway Pro has 8GB limit |
| **Network timeouts** | Add retry logic with exponential backoff |

### Verification Needed:
```bash
# Test SDK in headless mode
npm install @anthropic-ai/claude-agent-sdk

# Run simple test
node -e "
const { query } = require('@anthropic-ai/claude-agent-sdk');
query({ prompt: 'Say hello', options: { allowedTools: [] } })
  .then(console.log)
  .catch(console.error);
"
```

### Recommendation:
**Test locally first**, then in Railway staging, before production.

---

## 2. Cost Estimates + WIP Limits

### Estimated Monthly Cost

| Component | Current | With Agent SDK | Notes |
|-----------|---------|----------------|-------|
| **Orchestrator runs** (2x/day × 30 days) | $37 | $75-150 | Multi-turn increases tokens 2-4x |
| **Code generation** (100 stories/mo) | $0 | $50-100 | ~$0.50-1.00 per story |
| **Specialist agents** (5 per run) | Included | $25-50 | ~$0.25 per agent spawn |
| **Non-code agents** (design/copy/research) | $0 | $25-50 | WebSearch costs extra |
| **Supabase Storage** | $0 | $5-10 | Preview URLs for non-code |
| **Railway workers** | $20 | $20-30 | May need more compute time |
| **Total** | **~$60/mo** | **$200-400/mo** | 3-6x current |

### Token Usage Per Operation

| Operation | Est. Tokens | Est. Cost |
|-----------|-------------|-----------|
| Orchestrator run (full) | 50,000-100,000 | $1.50-3.00 |
| Single agent spawn | 5,000-15,000 | $0.15-0.45 |
| Code generation story | 20,000-50,000 | $0.60-1.50 |
| Design/Copy agent | 10,000-30,000 | $0.30-0.90 |

### WIP Limits + Settings

**Proposed configuration in `lib/config/agent-limits.ts`:**

```typescript
export const agentLimits = {
  // Per orchestrator run
  maxAgentSpawns: 10,           // Max specialist agents per run
  maxTurnsPerAgent: 5,          // Max conversation turns per agent
  maxToolCallsPerAgent: 20,     // Max tool uses per agent
  maxTokensPerRun: 200_000,     // Hard token cap per orchestrator run

  // Per execution cycle
  maxStoriesPerCycle: 5,        // Max stories to execute overnight
  maxParallelExecutions: 1,     // Sequential by default (safer)
  maxCodeChangesPerStory: 10,   // Max file edits per story

  // Daily limits
  maxDailyOrchestratorRuns: 4,  // 2 scheduled + 2 user-triggered
  maxDailyTokenSpend: 500_000,  // ~$15/day hard cap
  maxDailyStories: 20,          // Max stories created per day

  // User-overridable (via Slack/UI)
  wipLimit: 3,                  // Max in-progress stories at once
  cycleDelay: 'overnight',      // 'immediate' | 'overnight' | 'manual'
};

// Can be overridden via environment
export function getAgentLimits() {
  return {
    ...agentLimits,
    maxStoriesPerCycle: parseInt(process.env.MAX_STORIES_PER_CYCLE || '5'),
    wipLimit: parseInt(process.env.WIP_LIMIT || '3'),
  };
}
```

### Cost Tracking Query:

```sql
-- Add to orchestrator_runs table
ALTER TABLE orchestrator_runs ADD COLUMN tokens_used INTEGER;
ALTER TABLE orchestrator_runs ADD COLUMN estimated_cost DECIMAL(10,4);

-- Daily cost summary
SELECT 
  DATE(started_at) as date,
  SUM(tokens_used) as total_tokens,
  SUM(estimated_cost) as total_cost
FROM orchestrator_runs
GROUP BY DATE(started_at);
```

---

## 3. Parallel Execution (Yes, Can Be a Setting!)

### Current: Sequential (Safer)

```typescript
// Current: SDK runs subagents one at a time
for await (const message of query({
  prompt: "Analyze project",
  options: { agents: { 'security': securityAgent } }
})) {
  // Processes one agent at a time
}
```

### Proposed: Configurable Parallel Execution

```typescript
// lib/orchestrator.ts with parallel option

export interface OrchestratorOptions {
  parallelAgents: boolean;      // Enable parallel agent execution
  maxParallelAgents: number;    // Max concurrent agents (2-5)
  parallelStrategy: 'all' | 'by-type' | 'by-project';
}

const defaultOptions: OrchestratorOptions = {
  parallelAgents: false,        // Sequential by default (safer)
  maxParallelAgents: 3,         // If enabled, limit concurrency
  parallelStrategy: 'by-type',  // Run same type across projects in parallel
};

export async function runOrchestrator(options: Partial<OrchestratorOptions> = {}) {
  const opts = { ...defaultOptions, ...options };

  if (opts.parallelAgents) {
    // Run agents in parallel
    const agentPromises = projects.map(project =>
      runAgentsForProject(project, opts.maxParallelAgents)
    );
    return await Promise.all(agentPromises);
  } else {
    // Sequential (current behavior)
    const results = [];
    for (const project of projects) {
      results.push(await runAgentsForProject(project, 1));
    }
    return results;
  }
}

// Parallel agent execution with concurrency limit
async function runAgentsForProject(project, maxConcurrent: number) {
  const agents = ['security', 'analytics', 'seo', 'domain', 'deployment'];

  // Use p-limit for concurrency control
  const limit = pLimit(maxConcurrent);

  const results = await Promise.all(
    agents.map(agent =>
      limit(() => spawnAgent(agent, project))
    )
  );

  return results;
}
```

### Settings in UI/Slack:

```
Slack: /cofounder config parallel on
Slack: /cofounder config max-parallel 3

Dashboard: Settings > Agent Configuration > Parallel Execution
```

### Recommendation:
- **Default: Sequential** (safer, easier to debug, predictable costs)
- **Parallel: Opt-in** for users who want speed over predictability
- **Max parallel: 3-5** to prevent API rate limits

---

## 4. Thinking Traces Storage

### Yes, Stored in Database!

**Current Schema (`orchestrator_runs` table):**

```sql
-- Already exists in schema.prisma
model OrchestratorRun {
  id            String   @id @default(uuid())
  runId         String   @unique @map("run_id")
  status        String   @default("running")
  findingsCount Int      @default(0) @map("findings_count")
  storiesCount  Int      @default(0) @map("completions_count")
  conversation  Json?    // <-- THINKING TRACES GO HERE
  startedAt     DateTime @default(now()) @map("started_at")
  completedAt   DateTime? @map("completed_at")
}
```

### Enhanced Schema for Agent Traces:

```sql
-- NEW: More granular trace storage
CREATE TABLE agent_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  orchestrator_run_id UUID REFERENCES orchestrator_runs(id),
  agent_name TEXT NOT NULL,           -- 'security', 'analytics', etc.
  project_id UUID REFERENCES projects(id),
  status TEXT DEFAULT 'running',      -- 'running', 'completed', 'failed'
  thinking_trace JSONB DEFAULT '[]',  -- Array of thinking steps
  tool_calls JSONB DEFAULT '[]',      -- Array of tool uses
  tokens_used INTEGER,
  started_at TIMESTAMP DEFAULT NOW(),
  completed_at TIMESTAMP
);

CREATE TABLE agent_tool_calls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES agent_sessions(id),
  tool_name TEXT NOT NULL,           -- 'Read', 'Grep', 'Bash', etc.
  input JSONB,                        -- Tool input parameters
  output JSONB,                       -- Tool output
  duration_ms INTEGER,
  created_at TIMESTAMP DEFAULT NOW()
);
```

### Trace Format:

```typescript
// What gets stored in conversation/thinking_trace
interface ThinkingStep {
  timestamp: string;
  role: 'thinking' | 'tool_use' | 'tool_result' | 'assistant';
  content: string;
  toolUse?: {
    name: string;
    input: Record<string, any>;
    output?: any;
    durationMs?: number;
  };
}

// Example trace
const trace: ThinkingStep[] = [
  {
    timestamp: "2026-01-08T09:30:00Z",
    role: "thinking",
    content: "I'll start by analyzing the security scan results for Warmstart..."
  },
  {
    timestamp: "2026-01-08T09:30:05Z",
    role: "tool_use",
    content: "Running security agent",
    toolUse: {
      name: "Task",
      input: { agentName: "security-agent", project: "warmstart" }
    }
  },
  {
    timestamp: "2026-01-08T09:30:45Z",
    role: "tool_result",
    content: "Security agent found 2 issues: exposed API key, outdated lodash",
    toolUse: {
      name: "Task",
      output: { findings: [...] },
      durationMs: 40000
    }
  }
];
```

---

## 5. Full Agent Registry (17 Agents)

### Current Implementation (5 agents):
- Security Agent
- Analytics Agent
- Domain Agent
- SEO Agent
- Deployment Agent

### Full Proposed Registry (17+ agents):

| # | Agent | Type | Tools | Purpose |
|---|-------|------|-------|---------|
| **CORE ANALYSIS (5)** |
| 1 | Security Agent | Code | Read, Grep, Bash | Vulnerabilities, secrets, CVEs |
| 2 | Analytics Agent | Code | WebFetch, Read | PostHog/GA setup, event tracking |
| 3 | Domain Agent | Infra | WebFetch, Bash | SSL, DNS, uptime |
| 4 | SEO Agent | Content | WebFetch, Read | Meta tags, sitemap, robots.txt |
| 5 | Deployment Agent | Infra | WebFetch, Bash | Vercel status, build errors |
| **CODE EXECUTION (3)** |
| 6 | Code Generation Agent | Code | Read, Write, Edit, Bash, Grep | Implement story changes |
| 7 | Test Agent | Code | Read, Bash | Run tests, validate changes |
| 8 | Review Agent | Code | Read, Grep | Code review, suggest improvements |
| **NON-CODE WORK (4)** |
| 9 | Design Agent | Creative | Read, Write, WebFetch | UI mockups, CSS suggestions |
| 10 | Copy Agent | Creative | Read, Write, WebSearch | Marketing copy, content |
| 11 | Research Agent | Creative | WebSearch, WebFetch, Write | Market research, competitor analysis |
| 12 | Documentation Agent | Content | Read, Write, Grep | README, API docs, guides |
| **SPECIALIZED (5)** |
| 13 | Performance Agent | Code | WebFetch, Bash | Lighthouse, Core Web Vitals |
| 14 | Accessibility Agent | Code | WebFetch, Read | WCAG compliance, a11y issues |
| 15 | Database Agent | Code | Read, Grep | Schema analysis, query optimization |
| 16 | API Agent | Code | WebFetch, Read | API health, endpoint testing |
| 17 | Email Agent | Ops | Read, Write | Resend templates, email flows |

### Full Agent Definitions (`lib/agents/index.ts`):

```typescript
// lib/agents/index.ts

export interface AgentDefinition {
  name: string;
  role: string;
  type: 'code' | 'creative' | 'infra' | 'ops' | 'content';
  model: 'claude-opus-4-5-20251101' | 'claude-sonnet-4-5-20250929';
  tools: Tool[];
  prompt: string;
  maxTurns: number;
  canSpawnSubagents: boolean;
}

// ============== CORE ANALYSIS AGENTS ==============

export const securityAgent: AgentDefinition = {
  name: 'Security Agent',
  role: 'security',
  type: 'code',
  model: 'claude-opus-4-5-20251101', // High stakes
  tools: ['Read', 'Grep', 'Bash'],
  prompt: `You are a Security Agent. Analyze codebases for:
    - Exposed secrets (API keys, passwords, tokens)
    - npm vulnerabilities (run npm audit)
    - Insecure configurations (CORS, CSP headers)
    - Hardcoded credentials
    
    Use your tools to actively investigate. Don't just analyze given data.`,
  maxTurns: 5,
  canSpawnSubagents: false,
};

export const analyticsAgent: AgentDefinition = {
  name: 'Analytics Agent',
  role: 'analytics',
  type: 'code',
  model: 'claude-sonnet-4-5-20250929',
  tools: ['WebFetch', 'Read', 'Grep'],
  prompt: `You are an Analytics Agent. Check projects for:
    - PostHog/GA/Plausible installation
    - Key event tracking (signups, conversions)
    - Missing funnel tracking
    - Pre-launch analytics setup`,
  maxTurns: 3,
  canSpawnSubagents: false,
};

export const domainAgent: AgentDefinition = {
  name: 'Domain Agent',
  role: 'domain',
  type: 'infra',
  model: 'claude-sonnet-4-5-20250929',
  tools: ['WebFetch', 'Bash'],
  prompt: `You are a Domain Agent. Monitor domain health:
    - SSL certificate validity (check expiry)
    - DNS configuration
    - Domain reachability (HTTP/HTTPS)
    - Redirect chains`,
  maxTurns: 3,
  canSpawnSubagents: false,
};

export const seoAgent: AgentDefinition = {
  name: 'SEO Agent',
  role: 'seo',
  type: 'content',
  model: 'claude-sonnet-4-5-20250929',
  tools: ['WebFetch', 'Read'],
  prompt: `You are an SEO Agent. Optimize search visibility:
    - Meta tags (title, description, OG)
    - robots.txt and sitemap.xml
    - H1 structure
    - Canonical URLs`,
  maxTurns: 3,
  canSpawnSubagents: false,
};

export const deploymentAgent: AgentDefinition = {
  name: 'Deployment Agent',
  role: 'deployment',
  type: 'infra',
  model: 'claude-sonnet-4-5-20250929',
  tools: ['WebFetch', 'Read', 'Bash'],
  prompt: `You are a Deployment Agent. Monitor deployment health:
    - Vercel deployment status
    - Build errors and failures
    - Environment variable issues
    - Build time optimization`,
  maxTurns: 3,
  canSpawnSubagents: false,
};

// ============== CODE EXECUTION AGENTS ==============

export const codeGenerationAgent: AgentDefinition = {
  name: 'Code Generation Agent',
  role: 'code-gen',
  type: 'code',
  model: 'claude-opus-4-5-20251101', // Complex task
  tools: ['Read', 'Write', 'Edit', 'Bash', 'Grep', 'Glob'],
  prompt: `You are a Code Generation Agent. Implement story changes:
    - Read existing code to understand context
    - Make minimal, focused changes
    - Follow existing code style
    - Run tests after changes
    - Create clean, reviewable diffs`,
  maxTurns: 10,
  canSpawnSubagents: true, // Can spawn Test Agent
};

export const testAgent: AgentDefinition = {
  name: 'Test Agent',
  role: 'test',
  type: 'code',
  model: 'claude-sonnet-4-5-20250929',
  tools: ['Read', 'Bash', 'Grep'],
  prompt: `You are a Test Agent. Validate code changes:
    - Run existing test suite
    - Identify failing tests
    - Suggest test additions
    - Verify build succeeds`,
  maxTurns: 5,
  canSpawnSubagents: false,
};

export const reviewAgent: AgentDefinition = {
  name: 'Review Agent',
  role: 'review',
  type: 'code',
  model: 'claude-sonnet-4-5-20250929',
  tools: ['Read', 'Grep'],
  prompt: `You are a Review Agent. Review code changes:
    - Check for code quality issues
    - Identify potential bugs
    - Suggest improvements
    - Verify best practices`,
  maxTurns: 3,
  canSpawnSubagents: false,
};

// ============== NON-CODE AGENTS ==============

export const designAgent: AgentDefinition = {
  name: 'Design Agent',
  role: 'design',
  type: 'creative',
  model: 'claude-opus-4-5-20251101',
  tools: ['Read', 'Write', 'WebFetch'],
  prompt: `You are a Design Agent. Create UI/UX recommendations:
    - Analyze current design patterns
    - Create HTML mockups with inline CSS
    - Suggest color palette improvements
    - Generate responsive design specs
    
    Output HTML files that can be previewed at unique URLs.`,
  maxTurns: 5,
  canSpawnSubagents: false,
};

export const copyAgent: AgentDefinition = {
  name: 'Copy Agent',
  role: 'copy',
  type: 'creative',
  model: 'claude-sonnet-4-5-20250929',
  tools: ['Read', 'Write', 'WebSearch'],
  prompt: `You are a Copy Agent. Create marketing content:
    - Website copy and headlines
    - Email templates
    - Product descriptions
    - Call-to-action text
    
    Research competitors and industry best practices.`,
  maxTurns: 5,
  canSpawnSubagents: false,
};

export const researchAgent: AgentDefinition = {
  name: 'Research Agent',
  role: 'research',
  type: 'creative',
  model: 'claude-opus-4-5-20251101',
  tools: ['WebSearch', 'WebFetch', 'Write'],
  prompt: `You are a Research Agent. Conduct market research:
    - Competitor analysis
    - Market sizing
    - Feature comparisons
    - Industry trends
    
    Output comprehensive reports with citations.`,
  maxTurns: 10,
  canSpawnSubagents: false,
};

export const documentationAgent: AgentDefinition = {
  name: 'Documentation Agent',
  role: 'docs',
  type: 'content',
  model: 'claude-sonnet-4-5-20250929',
  tools: ['Read', 'Write', 'Grep'],
  prompt: `You are a Documentation Agent. Create/update docs:
    - README files
    - API documentation
    - Setup guides
    - Code comments`,
  maxTurns: 5,
  canSpawnSubagents: false,
};

// ============== SPECIALIZED AGENTS ==============

export const performanceAgent: AgentDefinition = {
  name: 'Performance Agent',
  role: 'performance',
  type: 'code',
  model: 'claude-sonnet-4-5-20250929',
  tools: ['WebFetch', 'Bash', 'Read'],
  prompt: `You are a Performance Agent. Analyze site performance:
    - Lighthouse scores (via API)
    - Core Web Vitals (FCP, LCP, CLS)
    - Bundle size analysis
    - Load time optimization`,
  maxTurns: 5,
  canSpawnSubagents: false,
};

export const accessibilityAgent: AgentDefinition = {
  name: 'Accessibility Agent',
  role: 'a11y',
  type: 'code',
  model: 'claude-sonnet-4-5-20250929',
  tools: ['WebFetch', 'Read', 'Grep'],
  prompt: `You are an Accessibility Agent. Check WCAG compliance:
    - Color contrast issues
    - Missing alt text
    - Keyboard navigation
    - ARIA labels`,
  maxTurns: 3,
  canSpawnSubagents: false,
};

export const databaseAgent: AgentDefinition = {
  name: 'Database Agent',
  role: 'database',
  type: 'code',
  model: 'claude-sonnet-4-5-20250929',
  tools: ['Read', 'Grep'],
  prompt: `You are a Database Agent. Analyze database setup:
    - Schema optimization
    - Missing indexes
    - N+1 query issues
    - Migration safety`,
  maxTurns: 3,
  canSpawnSubagents: false,
};

export const apiAgent: AgentDefinition = {
  name: 'API Agent',
  role: 'api',
  type: 'code',
  model: 'claude-sonnet-4-5-20250929',
  tools: ['WebFetch', 'Read'],
  prompt: `You are an API Agent. Test and monitor APIs:
    - Endpoint health checks
    - Response time analysis
    - Error rate monitoring
    - Schema validation`,
  maxTurns: 5,
  canSpawnSubagents: false,
};

export const emailAgent: AgentDefinition = {
  name: 'Email Agent',
  role: 'email',
  type: 'ops',
  model: 'claude-sonnet-4-5-20250929',
  tools: ['Read', 'Write'],
  prompt: `You are an Email Agent. Manage email flows:
    - Resend template creation
    - Transactional email setup
    - Email deliverability
    - Unsubscribe compliance`,
  maxTurns: 3,
  canSpawnSubagents: false,
};

// ============== AGENT REGISTRY ==============

export const agentRegistry: Record<string, AgentDefinition> = {
  // Core Analysis
  security: securityAgent,
  analytics: analyticsAgent,
  domain: domainAgent,
  seo: seoAgent,
  deployment: deploymentAgent,
  // Code Execution
  'code-gen': codeGenerationAgent,
  test: testAgent,
  review: reviewAgent,
  // Non-Code
  design: designAgent,
  copy: copyAgent,
  research: researchAgent,
  docs: documentationAgent,
  // Specialized
  performance: performanceAgent,
  a11y: accessibilityAgent,
  database: databaseAgent,
  api: apiAgent,
  email: emailAgent,
};

export function getAgent(role: string): AgentDefinition | undefined {
  return agentRegistry[role];
}

export function getAgentsByType(type: AgentDefinition['type']): AgentDefinition[] {
  return Object.values(agentRegistry).filter(a => a.type === type);
}
```

---

## 6. New Tables Required

### Yes, 4 New Tables:

```sql
-- 1. Slack inbounds (all messages, not just check-ins)
CREATE TABLE slack_inbounds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id),
  user_id TEXT NOT NULL,
  channel_id TEXT,
  text TEXT,
  message_ts TEXT NOT NULL,
  thread_ts TEXT,
  is_dm BOOLEAN DEFAULT false,
  source TEXT NOT NULL,              -- 'dm' | 'channel' | 'mention' | 'reaction'
  reaction_emoji TEXT,
  raw_payload JSONB,
  processed BOOLEAN DEFAULT false,
  classification TEXT,               -- 'priority' | 'new_work' | 'question'
  created_at TIMESTAMP DEFAULT NOW()
);

-- 2. Priority signals (from all sources)
CREATE TABLE priority_signals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id),
  project_id UUID REFERENCES projects(id),
  story_id UUID REFERENCES stories(id),
  source TEXT NOT NULL,              -- 'slack' | 'linear' | 'ui' | 'scan'
  priority_level TEXT,               -- 'P0' | 'P1' | 'P2' | 'P3'
  impact INTEGER CHECK (impact BETWEEN 1 AND 5),
  cost INTEGER CHECK (cost BETWEEN 1 AND 5),
  confidence INTEGER CHECK (confidence BETWEEN 1 AND 5),
  urgency INTEGER CHECK (urgency BETWEEN 1 AND 5),
  is_explicit BOOLEAN DEFAULT false,
  signal_text TEXT,
  signal_confidence DECIMAL(3,2),
  created_at TIMESTAMP DEFAULT NOW(),
  expires_at TIMESTAMP
);

-- 3. Agent sessions (detailed trace storage)
CREATE TABLE agent_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  orchestrator_run_id UUID REFERENCES orchestrator_runs(id),
  story_id UUID REFERENCES stories(id),
  agent_name TEXT NOT NULL,
  project_id UUID REFERENCES projects(id),
  status TEXT DEFAULT 'running',
  thinking_trace JSONB DEFAULT '[]',
  tokens_used INTEGER,
  estimated_cost DECIMAL(10,4),
  started_at TIMESTAMP DEFAULT NOW(),
  completed_at TIMESTAMP
);

-- 4. Agent outputs (for non-code work)
CREATE TABLE agent_outputs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  story_id UUID NOT NULL REFERENCES stories(id),
  session_id UUID REFERENCES agent_sessions(id),
  agent_type TEXT NOT NULL,          -- 'design' | 'copy' | 'research'
  output_type TEXT NOT NULL,         -- 'html' | 'markdown' | 'json' | 'pdf'
  storage_path TEXT NOT NULL,
  public_url TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Story table updates
ALTER TABLE stories ADD COLUMN priority_level TEXT DEFAULT 'P2';
ALTER TABLE stories ADD COLUMN priority_score INTEGER;
ALTER TABLE stories ADD COLUMN rank_in_project INTEGER;
ALTER TABLE stories ADD COLUMN rank_overall INTEGER;
ALTER TABLE stories ADD COLUMN source TEXT DEFAULT 'orchestrator';
ALTER TABLE stories ADD COLUMN preview_url TEXT;
ALTER TABLE stories ADD COLUMN rejected_at TIMESTAMP;
ALTER TABLE stories ADD COLUMN rejection_reason TEXT;
ALTER TABLE stories ADD COLUMN feedback_requested_at TIMESTAMP;
ALTER TABLE stories ADD COLUMN feedback_text TEXT;

-- Orchestrator runs updates
ALTER TABLE orchestrator_runs ADD COLUMN tokens_used INTEGER;
ALTER TABLE orchestrator_runs ADD COLUMN estimated_cost DECIMAL(10,4);
ALTER TABLE orchestrator_runs ADD COLUMN workspace_id UUID REFERENCES workspaces(id);
```

---

## 7. Unique URLs for Non-Code Work

### Option A: Supabase Storage (Recommended)

```typescript
// lib/output-hosting.ts

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

export async function hostAgentOutput(
  storyId: string,
  agentType: 'design' | 'copy' | 'research',
  content: string,
  fileType: 'html' | 'md' | 'json' = 'html'
): Promise<string> {
  const filename = `${storyId}/${agentType}-${Date.now()}.${fileType}`;

  // Upload to Supabase Storage
  const { data, error } = await supabase.storage
    .from('agent-outputs')
    .upload(filename, content, {
      contentType: fileType === 'html' ? 'text/html' : 'text/plain',
      upsert: true,
    });

  if (error) throw error;

  // Get public URL
  const { data: { publicUrl } } = supabase.storage
    .from('agent-outputs')
    .getPublicUrl(filename);

  // Store in database
  await prisma.agentOutput.create({
    data: {
      storyId,
      agentType,
      outputType: fileType,
      storagePath: filename,
      publicUrl,
    },
  });

  return publicUrl;
}

// Usage example
const previewUrl = await hostAgentOutput(
  story.id,
  'design',
  `<!DOCTYPE html>
   <html>
     <head><title>Design Review - ${project.name}</title></head>
     <body>${designOutput}</body>
   </html>`,
  'html'
);

// URL format: https://xxx.supabase.co/storage/v1/object/public/agent-outputs/abc123/design-1704729600000.html
```

### Option B: Use PRs for Non-Code Work Too

```typescript
// Put non-code work in the repo as well
async function createNonCodePR(
  story: Story,
  agentType: 'design' | 'copy' | 'research',
  output: string
) {
  const branch = `agent/${agentType}/${story.id}`;
  const filename = agentType === 'design' 
    ? 'docs/design-review.html'
    : agentType === 'copy'
    ? 'docs/copy-suggestions.md'
    : 'docs/research-report.md';

  // Create PR with the output file
  await createBranch(repo, branch);
  await commitFile(repo, branch, filename, output);
  const prUrl = await createPR(repo, branch, `[AI] ${agentType} work: ${story.title}`);

  return prUrl;
}
```

### Recommendation:
- **Supabase Storage for quick previews** (design mockups, reports)
- **PRs for anything that becomes documentation** (copy changes, docs)
- **Both have unique URLs** - Storage is instant, PRs need merge

---

## 8. UI/UX Mockups

### Screens Needed (10 total):

| Screen | Priority | Description |
|--------|----------|-------------|
| 1. Dashboard Home | P0 | Project overview, health status, recent activity |
| 2. Execution Queue | P0 | Stack-ranked stories, approve/reject buttons |
| 3. Orchestrator Chat History | P0 | Thinking traces, agent conversations |
| 4. Project Detail | P1 | Per-project agent findings, stories, scans |
| 5. Agent Activity | P1 | All agents, their runs, tool usage |
| 6. Story Detail | P1 | Single story with full trace, preview URL |
| 7. Settings | P2 | WIP limits, parallel config, agent toggles |
| 8. Stack Ranked Lists | P0 | Per-project + overall priority lists |
| 9. Scan Results | P2 | Raw scan data, history |
| 10. Agent Outputs Gallery | P2 | Preview URLs for non-code work |

### Creating Mockups...

