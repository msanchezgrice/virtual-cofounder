# Virtual Cofounder Workflow Diagrams

These mermaid diagrams show how scans, orchestrator runs, agents, Slack, and execution fit together.

## 🚀 Official Claude Agent SDK Integration Plan

**Status**: Proposed | **Priority**: P0 (Foundational architecture)
**SDK**: `@anthropic-ai/claude-agent-sdk` v0.2.1 (published Jan 7, 2026)

**Major Discovery**: The official Claude Agent SDK was published 2 days ago! We can use the official SDK instead of manual tool implementation.

**Why This Changes Everything**:
- ❌ **OLD PLAN**: Manually implement tool loops with `anthropic.beta.tools.messages.create()`
- ✅ **NEW PLAN**: Use official SDK with built-in Read/Write/Edit/Bash/Glob/Grep tools, subagents, hooks, sessions

**Solution**: 4-phase rollout with official SDK (10x simpler than manual implementation)

- **Phase 1 (P0):** Execution Worker code generation (built-in tools, +$7.50/mo, 2-3 days)
- **Phase 2 (P0):** Priority system (P0-P3, stack ranking, all Slack signals, +$5/mo, 5-6 days)
- **Phase 3 (P1):** Specialist agents as subagents (Task tool, +$112.50/mo, 3-4 days)
- **Phase 4 (P2):** Head of Product meta-orchestrator (+$25/mo, 3-4 days)
- **Phase 5 (P1):** UI updates (stack-ranked lists, execution queue, chat history, 5-6 days)

📄 **Full Plan**: [agent-sdk-integration-plan.md](./agent-sdk-integration-plan.md) (18-23 days, +$150/month total)

## 1) System Overview

```mermaid
graph LR
  UI[Next.js UI] --> API[Next.js API routes]
  API --> DB[(Supabase Postgres)]
  API --> Redis[(Upstash Redis / BullMQ)]
  API --> Slack[Slack API]
  API --> Linear[Linear API]
  API --> Anthropic["Anthropic API (via @anthropic-ai/sdk)"]
  Redis --> ScanWorker[Railway scan-worker.ts]
  Redis --> ExecWorker[Railway execution-worker.ts]
```

## Change View (Before)

```mermaid
graph TD
  SlackCheckin["Slack check-in (scheduled)"] --> Priorities["user_priorities (check-in only)"]
  Scans["scans (daily)"] --> Orchestrator["/api/orchestrator/run (manual/cron)"]
  Priorities -.-> Orchestrator
  Orchestrator --> Completions["completions (ranked by findings)"]
  Approve["Slack approve button"] --> SlackEvents["/api/slack/events"]
  SlackEvents --> Status["completion.status = in_progress"]
  Status -.-> Script["queue-completion-to-production script"]
  Script --> ExecQueue["execution-queue"]
  ExecQueue --> Worker["execution-worker.ts (when running)"]
```

## Change View (After)

```mermaid
graph TD
  SlackAll["Slack inbound (DMs, channels, mentions)"] --> SlackEvents["/api/slack/events"]
  LinearComments["Linear comments"] --> LinearWebhook["/api/linear/webhook"]
  SlackEvents --> Inbounds["slack_inbounds"]
  Inbounds --> Signals["priority_signals (P0-P3 + factors)"]
  LinearWebhook --> Signals
  Signals --> Rerank["rerank trigger (user: immediate, others: 2x/day)"]
  Scans["scans (daily)"] --> Orchestrator["/api/orchestrator/run"]
  Signals --> Orchestrator
  Orchestrator --> StackRank["stack-ranked work per project"]
  StackRank --> Completions["completions (score + rank + priority)"]
  Completions --> Queue["execution-queue (priority)"]
  Approve["Slack approve button"] --> Queue
  Queue --> Worker["execution-worker.ts (always on)"]
```

## ✅ What We Keep vs 🔄 What We Replace

### ✅ KEEP (Working Infrastructure)

- **BullMQ Queue System** (orchestrator, execution, scans queues)
- **Scan Workers** (domain, SEO, analytics, security scanners)
- **Database Schema** (workspaces, projects, scans, etc.)
- **Slack Integration** (lib/slack.ts - message sending, threads)
- **Linear Integration** (lib/linear.ts - tasks, updates)
- **Git Operations** (lib/git.ts - clone, commit, push)
- **GitHub Integration** (lib/github.ts - PR creation)
- **Next.js API Routes** (/api/scans, /api/projects, etc.)
- **Railway Deployment** (always-on worker hosting)

### 🔄 REPLACE with Official Claude Agent SDK

- **execution-worker.ts:180-189** → Code Generation Agent using SDK's `query()` with built-in Read/Write/Edit/Bash tools
- **lib/orchestrator.ts runAgent()** → Spawn subagents via SDK's Task tool
- **lib/agents.ts** → Convert to `AgentDefinition` objects (SDK format)
- **lib/orchestrator.ts getRelevantAgents()** → Meta-agent spawns adaptively via Task tool
- **lib/orchestrator.ts rankFindings()** → Incorporate priority_signals
- **Slack check-in priorities** → priority_signals table (all signals)
- **Manual execution script** → Auto-enqueue on Slack approve

**Key Insight:** We're not rebuilding infrastructure—we're upgrading to official SDK. All the plumbing (queues, workers, integrations) stays. The SDK gives us built-in tools, subagents, hooks, sessions, and automatic thinking traces with 10x less code.

## 🤖 Agent SDK Integration Points

```mermaid
graph TD
  subgraph "Phase 1: Code Generation (P0)"
    ExecWorker["execution-worker.ts"] --> CodeGenAgent["Code Generation Agent<br/>(tools: read_file, write_file, search, run_tests)"]
    CodeGenAgent --> RealCode["Real code changes<br/>(not placeholder)"]
  end

  subgraph "Phase 2: Specialist Agents (P1)"
    Orchestrator["lib/orchestrator.ts"] --> SecurityAgent["Security Agent<br/>(tools: fetch_url, check_cert, scan_deps)"]
    Orchestrator --> AnalyticsAgent["Analytics Agent<br/>(tools: fetch_url, read_config)"]
    Orchestrator --> SEOAgent["SEO Agent<br/>(tools: fetch_url, analyze_meta)"]
    SecurityAgent --> Findings["Evidence-based findings"]
    AnalyticsAgent --> Findings
    SEOAgent --> Findings
  end

  subgraph "Phase 3: Meta-Orchestrator (P2)"
    HeadAgent["Head of Product Agent<br/>(tools: spawn_agent, review_findings, create_story)"] --> SecurityAgent
    HeadAgent --> AnalyticsAgent
    HeadAgent --> SEOAgent
    HeadAgent --> Priorities["Get priority_signals<br/>(user Slack/Linear inputs)"]
  end

  style CodeGenAgent fill:#fef3c7,stroke:#fbbf24
  style SecurityAgent fill:#dbeafe,stroke:#60a5fa
  style AnalyticsAgent fill:#dbeafe,stroke:#60a5fa
  style SEOAgent fill:#dbeafe,stroke:#60a5fa
  style HeadAgent fill:#f5f3ff,stroke:#c4b5fd
```

*Note: All agents use official `@anthropic-ai/claude-agent-sdk` v0.2.1. The SDK provides built-in tools (Read, Write, Edit, Bash, Glob, Grep), subagent spawning via Task tool, hooks for lifecycle events, and automatic thinking traces.*

## 2) Priority Intake (Slack Check-in)

```mermaid
graph TD
  Cron9[Vercel Cron 9:00] --> Checkin[/api/slack/check-in/]
  Checkin --> SlackMsg[Slack message]
  SlackMsg -->|user reply| Events[/api/slack/events/]
  Events --> Parser[priority-parser]
  Parser --> Priorities[(user_priorities)]
  Priorities -.->|planned weighting input| Orchestrator[/api/orchestrator/run/]
```

## 3) Scanning Pipeline

```mermaid
graph TD
  Cron905["Vercel Cron 9:05"] --> Trigger["/api/scans/trigger"]
  Trigger --> Queue["BullMQ scans queue"]
  Queue --> Worker["scan-worker.ts"]
  Worker --> Domain["scanDomain"]
  Worker --> SEO["scanSEO"]
  Worker --> Analytics["scanAnalytics"]
  Domain --> Scans["scans (table)"]
  SEO --> Scans
  Analytics --> Scans
  Scans --> ScansAPI["/api/scans"]
  ScansAPI --> Dashboard["/dashboard"]
```

## 4) Orchestrator Run + Outputs (Current - Manual)

```mermaid
graph TD
  RunAPI[/api/orchestrator/run/] --> FetchScans[fetch scans last 24h]
  FetchScans --> Context[ScanContext builder]
  Context --> Orchestrator[lib/orchestrator.ts]
  Orchestrator --> Agents["Single API calls per agent"]
  Agents --> Findings[(agent_findings)]
  Orchestrator --> Rank[rankFindings]
  Rank --> Completions[(completions)]
  Orchestrator --> RunRow[(orchestrator_runs)]
  Completions --> SlackNotify[Slack completion notifications]
  Completions --> LinearTasks[Linear tasks + comments]
```

## 4b) Orchestrator with Agent SDK (Proposed)

```mermaid
graph TD
  RunAPI[/api/orchestrator/run/] --> FetchScans[fetch scans + priority_signals]
  FetchScans --> Context[Build context for Head of Product]
  Context --> HeadAgent["Head of Product Agent (lib/orchestrator.ts)<br/>Uses Agent SDK query()"]

  HeadAgent -->|Task tool| SecurityAgent[Security Agent subagent]
  HeadAgent -->|Task tool| AnalyticsAgent[Analytics Agent subagent]
  HeadAgent -->|Task tool| SEOAgent[SEO Agent subagent]
  HeadAgent -->|Task tool| DomainAgent[Domain Agent subagent]

  SecurityAgent --> SecurityFindings[Security findings + thinking]
  AnalyticsAgent --> AnalyticsFindings[Analytics findings + thinking]
  SEOAgent --> SEOFindings[SEO findings + thinking]
  DomainAgent --> DomainFindings[Domain findings + thinking]

  SecurityFindings --> HeadAgent
  AnalyticsFindings --> HeadAgent
  SEOFindings --> HeadAgent
  DomainFindings --> HeadAgent

  HeadAgent --> StackRank[Stack rank all findings<br/>with priority_signals]
  StackRank --> Completions[(completions table<br/>with P0-P3, rank, score)]

  HeadAgent --> Conversation[(orchestrator_runs.conversation<br/>Full thinking trace)]

  Completions --> SlackThread[Slack: Proposed work with buttons]
  Completions --> LinearTasks[Linear: Tasks with thinking comments]
```

## 5) Run Data Lineage

```mermaid
graph LR
  RunId[runId] --> OrchestratorRuns[(orchestrator_runs)]
  RunId --> Findings[(agent_findings)]
  RunId --> Completions[(completions)]
  Findings -.-> Completions
```

## Claude SDK Usage (Actual)

```mermaid
graph TD
  Orchestrator["lib/orchestrator.ts"] --> AnthropicSDK["@anthropic-ai/sdk (Claude)"]
  PriorityParser["lib/priority-parser.ts"] --> AnthropicSDK
  SlackConvo["/api/slack/events (conversational replies)"] --> AnthropicSDK
```

Note: the Claude Agent SDK is not used; the code calls the Anthropic SDK directly.

## 6) Execution Worker Pipeline

```mermaid
graph TD
  Approve[Slack Approve button] --> Events[/api/slack/events/]
  Events --> UpdateStatus[completion status = in_progress]
  UpdateStatus -.->|queue via script| Queue[(execution-queue)]
  Queue --> Worker[execution-worker.ts]
  Worker --> Git[clone/branch/commit/push]
  Git --> PR[GitHub PR]
  PR --> UpdateCompletion[completion.status=completed + prUrl]
  UpdateCompletion --> SlackDone[Slack notification]
  UpdateCompletion --> LinearUpdate[Linear status + comments]
```

## 7) UI Data Surfaces

```mermaid
graph TD
  Dashboard["/dashboard (scan overview)"] --> ScansAPI["/api/scans"]
  Agents["/agents (activity view)"] --> AgentsAPI["/api/agents"]
  Completions["/completions (work queue)"] --> CompletionsAPI["/api/completions"]
  Project["/projects/:id (detail)"] --> ProjectAPI["/api/projects/:id"]
  AgentsAPI --> CompletionsTable["completions (table)"]
  ProjectAPI --> CompletionsTable
  ProjectAPI -.->|legacy scan fields| ProjectTable["projects (table)"]
```

Notes:
- Agents UI currently derives activity from `completions` text, not `agent_findings`.
- Project detail API uses legacy scan fields; the canonical scan data is in `scans`.

## 8) User-Facing UX Flow (Your Perspective)

```mermaid
graph TD
  You["You"] --> Checkin["Slack check-in (set priorities)"]
  Checkin --> Priorities["Priorities saved (72h)"]
  DailyScans["Projects scanned daily"] --> Orchestrator["Orchestrator + agents analyze"]
  Priorities --> Orchestrator
  Orchestrator --> Ranked["Ranked work (completions)"]
  Ranked --> Slack["Slack: approvals + updates"]
  Ranked --> Dashboard["Dashboard: scans + work queue"]
  Ranked --> Linear["Linear: tasks + status"]
  Slack --> You
  Dashboard --> You
  Linear --> You
```

## 9) User Interaction Flows (With Agent SDK)

### Priority Setting & Work Generation

```mermaid
graph TD
  User[User] -->|"DM: Fix auth bug"| SlackBot[Slack Bot]
  User -->|"@mention in channel"| SlackBot
  User -->|"React with 🔥"| SlackBot
  User -->|"Create Linear issue"| LinearWebhook[Linear Webhook]
  User -->|"Comment: this is urgent"| LinearWebhook

  SlackBot --> PrioritySignals[(priority_signals)]
  LinearWebhook --> PrioritySignals

  PrioritySignals -->|"Immediate rerank"| Orchestrator[Head of Product Agent]
  Orchestrator -->|"Spawn specialist agents"| Specialists[Security/Analytics/SEO Agents]
  Specialists -->|"Findings + evidence"| StackRank[Stack-Ranked Lists]

  StackRank --> SlackThread[Slack Thread: Proposed Work]
  SlackThread -->|"✅ Approve"| ExecQueue[(execution-queue FIFO)]
  SlackThread -->|"💬 Feedback"| Orchestrator
  SlackThread -->|"❌ Reject"| Rejected[Mark rejected]

  ExecQueue --> CodeGenAgent[Code Generation Agent]
  CodeGenAgent -->|"Real-time updates"| SlackUpdates[Slack: thinking traces]
  CodeGenAgent -->|"Status updates"| LinearComments[Linear: progress comments]
  CodeGenAgent -->|"PR created"| GitHubPR[GitHub PR]

  GitHubPR --> LinearDone[Linear: Done + PR link]
  GitHubPR --> SlackDone[Slack: PR ready for review]
```

### Agent Thinking Traces Flow

```mermaid
sequenceDiagram
  participant User
  participant Slack
  participant Orchestrator
  participant SecurityAgent
  participant CodeGenAgent
  participant Linear

  User->>Slack: Approve "Fix SSL certificate issue"
  Slack->>Orchestrator: completion.status = in_progress
  Orchestrator->>SecurityAgent: Spawn via Task tool

  SecurityAgent->>Slack: 🤔 "Analyzing SSL configuration..."
  SecurityAgent->>Linear: Comment: "Checking certificate expiry"
  SecurityAgent->>SecurityAgent: Use fetch_url tool
  SecurityAgent->>Slack: 🤔 "Certificate expires in 7 days"
  SecurityAgent->>Linear: Comment: "Found: cert expires Jan 15"

  SecurityAgent-->>Orchestrator: Evidence: {expiry: "2026-01-15", provider: "Let's Encrypt"}
  Orchestrator->>CodeGenAgent: Generate renewal script

  CodeGenAgent->>Slack: 🤔 "Reading existing cert config..."
  CodeGenAgent->>Linear: Comment: "Creating renewal automation"
  CodeGenAgent->>CodeGenAgent: Use Read/Write/Edit tools
  CodeGenAgent->>Slack: 🤔 "Created certbot automation script"
  CodeGenAgent->>Linear: Comment: "Added weekly renewal cron job"

  CodeGenAgent->>Linear: Status: Done + PR link
  CodeGenAgent->>Slack: ✅ "PR #123 ready: SSL auto-renewal"
  Slack->>User: Notification with PR link
```

### Daily Orchestration Cycle

```mermaid
graph LR
  Morning[9:00 AM Check-in] --> UserInput{User responds?}
  UserInput -->|Yes| Priorities[Capture P0-P3 priorities]
  UserInput -->|No| FallbackMode[Use scan results + past patterns]

  Priorities --> Scans[Daily scans run]
  FallbackMode --> Scans

  Scans --> Orchestrator[Head of Product analyzes]
  Orchestrator --> Specialists[Spawn specialist agents]
  Specialists --> Findings[Evidence-based findings]
  Findings --> Rank[Stack rank by priority + score]

  Rank --> Evening[6:00 PM Check-in]
  Evening --> Present[Present top 5 items to user]
  Present --> UserDecision{User approves?}

  UserDecision -->|Approve items| Queue[Add to execution queue]
  UserDecision -->|Request changes| Orchestrator
  UserDecision -->|No response| OneRound[Execute 1 item, wait for approval]

  Queue --> Execution[Overnight execution]
  OneRound --> WaitApproval[Stop until approved]
  Execution --> NextMorning[Next morning: results ready]
```
