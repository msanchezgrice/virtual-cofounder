# Virtual Cofounder - Final Specification v1.0

> Last Updated: January 8, 2026

## Executive Summary

Virtual Cofounder is an AI-powered product management system that automates the analysis, prioritization, and execution of work across multiple projects. It uses the **Claude Agent SDK** to orchestrate specialist AI agents that can analyze projects, generate code, create designs, and deliver non-code outputs.

### The Gap Addressed
- **PRD Phase 3 specified**: "Create Head of Product orchestrator using Claude Agent SDK"
- **What was built**: Manual orchestration with `@anthropic-ai/sdk` direct API calls
- **Why**: The Agent SDK didn't exist at implementation time. **It exists now.**
- **This spec**: Defines the complete refactored system using the official SDK

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Project State Management](#2-project-state-management)
3. [Launch Readiness System](#3-launch-readiness-system)
4. [Priority System (P0-P3)](#4-priority-system-p0-p3)
5. [Agent Registry](#5-agent-registry)
6. [Data Model](#6-data-model)
7. [User Interface Screens](#7-user-interface-screens)
8. [User Stories](#8-user-stories)
9. [Deployment Architecture](#9-deployment-architecture)
10. [Implementation Roadmap](#10-implementation-roadmap)

---

## 1. Architecture Overview

### Current State (Before)
```
┌─────────────┐      ┌─────────────┐      ┌─────────────┐
│   Vercel    │ ───► │   BullMQ    │ ───► │   Worker    │
│   Cron      │      │   Queue     │      │  (Scans)    │
└─────────────┘      └─────────────┘      └─────────────┘
                                                │
                                                ▼
┌─────────────┐      ┌─────────────┐      ┌─────────────┐
│   Single    │ ◄─── │ Anthropic   │ ◄─── │   Manual    │
│   API Call  │      │    SDK      │      │ Orchestrator│
└─────────────┘      └─────────────┘      └─────────────┘
```

**Problems:**
- Single API call per "agent" (no tool use)
- Placeholder code in PRs
- Manual execution script required
- No project state aggregation

### Proposed State (After)
```
┌─────────────┐      ┌─────────────┐      ┌─────────────┐
│   Vercel    │ ───► │   BullMQ    │ ───► │   Worker    │
│   Cron      │      │   Queue     │      │  (Scans)    │
└─────────────┘      └─────────────┘      └─────────────┘
                                                │
                                                ▼
┌─────────────┐      ┌─────────────┐      ┌─────────────┐
│  Multi-turn │ ◄─── │   Agent     │ ◄─── │ Head of    │
│   + Tools   │      │    SDK      │      │ Product    │
└─────────────┘      └─────────────┘      └─────────────┘
        │                                       │
        │            ┌──────────────┐           │
        └──────────► │  Specialist  │ ◄─────────┘
                     │   Agents     │
                     │ (Subagents)  │
                     └──────────────┘
```

**Benefits:**
- Multi-turn agents with built-in tools (Read, Write, Edit, Bash, etc.)
- Real code changes via Agent SDK
- Auto-enqueue on approval (Linear, Slack, Dashboard)
- Aggregated project state snapshots

---

## 2. Project State Management

### The Problem
Currently, project state is **distributed across multiple tables**:
- `Project` table (basic info, status field)
- `Scan` table (individual scan results per type)
- `Story` table (work items with status)
- `OrchestratorRun` table (run history)

There is **no single "blob"** that represents the current state of a project.

### The Solution: `project_snapshots` Table

A new table that stores daily aggregated snapshots:

```sql
CREATE TABLE project_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id),
  snapshot_at TIMESTAMP DEFAULT NOW(),
  
  -- Launch Readiness
  launch_stage TEXT NOT NULL, -- 'idea' | 'mvp' | 'alpha' | 'beta' | 'launch' | 'growth'
  launch_score INTEGER NOT NULL, -- 0-100
  
  -- Aggregated Scan Scores
  scan_scores JSONB NOT NULL,
  /*
    {
      "domain": { "score": 15, "max": 15, "status": "healthy" },
      "seo": { "score": 7, "max": 10, "status": "warning" },
      "analytics": { "score": 10, "max": 10, "status": "healthy" },
      "security": { "score": 0, "max": 5, "status": "critical" },
      "performance": { "score": 8, "max": 10, "status": "healthy" }
    }
  */
  
  -- Work State
  work_summary JSONB NOT NULL,
  /*
    {
      "total_stories": 24,
      "in_progress": 3,
      "ready_for_review": 7,
      "completed_this_week": 12,
      "blocked": 1
    }
  */
  
  -- Launch Checklist
  launch_checklist JSONB NOT NULL,
  /*
    {
      "repository_exists": true,
      "ci_cd_active": true,
      "auth_configured": true,
      "payment_integration": false,
      "paying_customers": false
    }
  */
  
  -- Priority Queue Snapshot
  top_priorities JSONB, -- Top 5 priority items at snapshot time
  
  -- Computed by State Agent
  ai_assessment TEXT, -- Agent's summary of project health
  recommended_focus TEXT[], -- Agent's recommended next actions
  
  UNIQUE(project_id, DATE(snapshot_at))
);
```

### Who Updates the Project State?

**Option A: State Manager Agent (Recommended)**
A dedicated lightweight agent that runs after scans complete:

```typescript
// lib/agents/state-manager.ts
export const stateManagerAgent: AgentDefinition = {
  name: 'State Manager',
  role: 'state-manager',
  type: 'ops',
  model: 'claude-sonnet-4-5-20250929', // Fast, cheap
  tools: [], // Read-only, no tools needed
  maxTurns: 1, // Single turn only
  canSpawnSubagents: false,
  prompt: `You are a State Manager that aggregates project health.

Given scan results and work items, compute:
1. Launch stage (idea/mvp/alpha/beta/launch/growth)
2. Launch score (0-100)
3. AI assessment (1 paragraph summary)
4. Recommended focus (3-5 next actions)

Output structured JSON only.`
};
```

**Option B: Cron-Triggered SQL Function**
A PostgreSQL function that runs nightly to aggregate state:

```sql
CREATE OR REPLACE FUNCTION create_project_snapshot(p_project_id UUID)
RETURNS UUID AS $$
DECLARE
  v_snapshot_id UUID;
  v_scan_scores JSONB;
  v_work_summary JSONB;
BEGIN
  -- Aggregate latest scans
  SELECT jsonb_object_agg(scan_type, jsonb_build_object(
    'score', score,
    'max', max_score,
    'status', CASE 
      WHEN score >= max_score * 0.8 THEN 'healthy'
      WHEN score >= max_score * 0.5 THEN 'warning'
      ELSE 'critical'
    END
  ))
  INTO v_scan_scores
  FROM (
    SELECT DISTINCT ON (scan_type) scan_type, score, max_score
    FROM scans 
    WHERE project_id = p_project_id
    ORDER BY scan_type, created_at DESC
  ) latest_scans;
  
  -- Aggregate work items
  SELECT jsonb_build_object(
    'total_stories', COUNT(*),
    'in_progress', COUNT(*) FILTER (WHERE status = 'IN_PROGRESS'),
    'ready_for_review', COUNT(*) FILTER (WHERE status = 'REVIEW'),
    'completed_this_week', COUNT(*) FILTER (WHERE status = 'DONE' AND updated_at > NOW() - INTERVAL '7 days'),
    'blocked', COUNT(*) FILTER (WHERE status = 'BLOCKED')
  )
  INTO v_work_summary
  FROM stories WHERE project_id = p_project_id;
  
  -- Insert snapshot
  INSERT INTO project_snapshots (project_id, scan_scores, work_summary, launch_stage, launch_score, launch_checklist)
  VALUES (
    p_project_id,
    COALESCE(v_scan_scores, '{}'),
    COALESCE(v_work_summary, '{}'),
    calculate_launch_stage(p_project_id),
    calculate_launch_score(p_project_id),
    calculate_launch_checklist(p_project_id)
  )
  RETURNING id INTO v_snapshot_id;
  
  RETURN v_snapshot_id;
END;
$$ LANGUAGE plpgsql;
```

**Option C: Hybrid (Recommended)**
- **SQL function** computes objective metrics (scores, counts)
- **State Manager Agent** adds AI assessment and recommendations
- Runs after each scan cycle completes

### Update Frequency
| Trigger | What Updates |
|---------|--------------|
| After scan cycle | Scan scores, launch score |
| After story status change | Work summary |
| Daily at midnight | Full snapshot (including AI assessment) |
| On user request | Immediate re-compute |

---

## 2b. State Agent: How It Works

The **State Manager Agent** is a lightweight, read-only agent that synthesizes project health information into human-readable assessments.

### Detailed Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│                     STATE AGENT EXECUTION FLOW                       │
└─────────────────────────────────────────────────────────────────────┘

1. TRIGGER: Scan cycle completes OR daily cron at midnight
   │
   ▼
2. SQL AGGREGATION (lib/state/aggregate.ts)
   │
   │  SELECT * FROM scans WHERE project_id = ? ORDER BY created_at DESC LIMIT 5
   │  SELECT COUNT(*), status FROM stories WHERE project_id = ? GROUP BY status
   │  SELECT * FROM projects WHERE id = ?
   │
   ▼
3. COMPUTE OBJECTIVE METRICS (no AI needed)
   │
   │  launch_score = calculate_score(scans, checklist)
   │  launch_stage = derive_stage(launch_score)
   │  scan_scores = aggregate_by_type(scans)
   │  work_summary = count_by_status(stories)
   │
   ▼
4. STATE MANAGER AGENT (single-turn, ~500 tokens)
   │
   │  Input: { project_name, launch_score, scan_scores, work_summary, recent_activity }
   │  Output: { ai_assessment: string, recommended_focus: string[] }
   │
   ▼
5. STORE SNAPSHOT (lib/state/snapshot.ts)
   │
   │  INSERT INTO project_snapshots (project_id, launch_stage, launch_score, 
   │    scan_scores, work_summary, launch_checklist, ai_assessment, recommended_focus)
   │
   ▼
6. DONE (snapshot available for dashboard, orchestrator, priority system)
```

### State Agent Definition

```typescript
// lib/agents/state-manager.ts
import { createAgent } from '@anthropic-ai/claude-agent-sdk';

export async function generateStateAssessment(context: StateContext): Promise<StateAssessment> {
  const agent = createAgent({
    name: 'State Manager',
    model: 'claude-sonnet-4-5-20250929', // Fast, cheap
    maxTurns: 1, // Single turn only - no tools needed
    prompt: `You are a State Manager that summarizes project health.

Given the following project data, provide:
1. A 1-2 sentence assessment of current health
2. 3-5 specific recommended actions (prioritized)

Project: ${context.projectName}
Launch Stage: ${context.launchStage} (Score: ${context.launchScore}/100)

Scan Results:
${JSON.stringify(context.scanScores, null, 2)}

Work Summary:
- Total stories: ${context.workSummary.total}
- In progress: ${context.workSummary.inProgress}
- Ready for review: ${context.workSummary.forReview}
- Blocked: ${context.workSummary.blocked}

Recent Activity:
${context.recentActivity.map(a => `- ${a.type}: ${a.description}`).join('\n')}

Respond in JSON format:
{
  "ai_assessment": "string",
  "recommended_focus": ["action1", "action2", "action3"]
}`,
  });

  const result = await agent.run();
  return JSON.parse(result.content);
}
```

### What the State Agent Does NOT Do

| ❌ Does NOT | ✅ Does |
|-------------|---------|
| Create stories | Summarize health |
| Modify data | Recommend actions |
| Spawn other agents | Generate text assessment |
| Use tools | Answer in single turn |
| Make decisions | Provide context for orchestrator |

### Cost Impact

| Operation | Tokens | Cost |
|-----------|--------|------|
| State Agent (per project) | ~500 | ~$0.015 |
| 5 projects daily | ~2,500 | ~$0.075 |
| Monthly (30 days) | ~75,000 | ~$2.25 |

The State Agent is **extremely cheap** because:
1. Single turn (no back-and-forth)
2. No tools (just text generation)
3. Uses Sonnet (not Opus)
4. Small context window (only aggregated data)

### Why a State Agent vs Just SQL?

| Aspect | SQL Only | SQL + State Agent |
|--------|----------|-------------------|
| Objective scores | ✅ Yes | ✅ Yes |
| Stage calculation | ✅ Yes | ✅ Yes |
| Work counts | ✅ Yes | ✅ Yes |
| **Natural language summary** | ❌ No | ✅ Yes |
| **Contextual recommendations** | ❌ No | ✅ Yes |
| **Priority reasoning** | ❌ No | ✅ Yes |

The State Agent adds **qualitative assessment** on top of quantitative metrics. This allows:
- Dashboard to show "Your project is healthy but needs payment integration to launch"
- Orchestrator to have context when prioritizing work
- Users to understand WHY certain things are prioritized

---

## 3. Launch Readiness System

### Stages
Projects progress through 6 stages from idea to paying customers:

| Stage | Score Range | Criteria |
|-------|-------------|----------|
| **Idea** | 0-15 | Concept defined, repository exists |
| **MVP** | 16-35 | Core feature working, deployed somewhere |
| **Alpha** | 36-55 | Multiple features, basic testing |
| **Beta** | 56-75 | Public access, monitoring, auth |
| **Launch** | 76-90 | Payment integration, first customers |
| **Growth** | 91-100 | Paying customers, scaling infrastructure |

### Score Calculation

```typescript
interface LaunchScoreFactors {
  // Infrastructure (25 points max)
  repositoryExists: 5,        // ✓ Git repo exists
  ciCdActive: 5,              // ✓ CI/CD pipeline running
  deploymentWorking: 10,      // ✓ Live deployment accessible
  customDomain: 5,            // ✓ Custom domain configured
  
  // Product (35 points max)
  coreFeatureComplete: 15,    // ✓ Main value prop works
  authConfigured: 10,         // ✓ User accounts work
  errorHandling: 5,           // ✓ Graceful error states
  mobileResponsive: 5,        // ✓ Works on mobile
  
  // Quality (20 points max)
  performanceScore: 5,        // ✓ PageSpeed > 80
  seoScore: 5,                // ✓ SEO basics covered
  securityScore: 5,           // ✓ No critical vulnerabilities
  analyticsConfigured: 5,     // ✓ Tracking in place
  
  // Business (20 points max)
  paymentIntegration: 10,     // ✓ Can accept payments
  payingCustomers: 10,        // ✓ Has paying customers
}
```

### Priority Weighting

The launch score influences work priority:

```typescript
function calculatePriorityScore(story: Story, projectSnapshot: ProjectSnapshot): number {
  const baseScore = story.impact * 2 + story.confidence * 1.5;
  
  // Boost items that advance launch stage
  const stageAdvancementBonus = story.advancesLaunchStage ? 20 : 0;
  
  // Boost items for projects closer to launch
  const proximityToLaunchBonus = (projectSnapshot.launchScore / 100) * 10;
  
  // Reduce priority for optimization work on pre-MVP projects
  const optimizationPenalty = 
    projectSnapshot.launchStage === 'idea' && story.type === 'optimization' ? -15 : 0;
  
  return baseScore + stageAdvancementBonus + proximityToLaunchBonus + optimizationPenalty;
}
```

---

## 4. Priority System (P0-P3)

### Priority Levels

| Level | Name | Description | Response Time |
|-------|------|-------------|---------------|
| **P0** | Critical | Blocking/urgent issues | Immediate |
| **P1** | High | Important for current cycle | Same day |
| **P2** | Medium | Standard backlog items | This week |
| **P3** | Low | Nice-to-have improvements | When available |

### Signal Sources

| Source | How Priority is Extracted |
|--------|---------------------------|
| **Slack DM** | Explicit tags (`P0:`, `urgent:`) or emoji (🔴, 🚨) |
| **Slack Channel** | Mentions + keywords |
| **Linear Comment** | Priority keywords in comments |
| **Linear Status** | High priority → P1-P2 |
| **Scan Findings** | Critical security → P0, Warning → P2 |
| **User Check-in** | Orchestrator 2x/day asks for priorities |

### Classification Logic

```typescript
function classifyPriority(signal: Signal): PriorityLevel {
  // 1. Explicit tags (highest confidence)
  if (signal.text.match(/\b(P0|urgent|critical|emergency)\b/i)) return 'P0';
  if (signal.text.match(/\b(P1|high|important|asap)\b/i)) return 'P1';
  if (signal.text.match(/\b(P2|medium|normal)\b/i)) return 'P2';
  if (signal.text.match(/\b(P3|low|backlog|later)\b/i)) return 'P3';
  
  // 2. Emoji shortcuts
  if (signal.text.includes('🔴') || signal.text.includes('🚨')) return 'P0';
  if (signal.text.includes('🟡') || signal.text.includes('⚡')) return 'P1';
  if (signal.text.includes('🟢')) return 'P2';
  
  // 3. Source-based defaults
  if (signal.source === 'slack_dm') return 'P1'; // DMs are usually important
  if (signal.source === 'scan_critical') return 'P0';
  if (signal.source === 'scan_warning') return 'P2';
  
  // 4. LLM fallback for ambiguous cases
  return await classifyWithLLM(signal);
}
```

---

## 5. Agent Registry

### Core Agents (17 Total)

| # | Agent | Type | Model | Tools | Purpose |
|---|-------|------|-------|-------|---------|
| 1 | **Head of Product** | meta | Opus | spawn, prioritize | Orchestrates all other agents |
| 2 | **State Manager** | ops | Sonnet | - | Aggregates project state |
| 3 | **Security** | infra | Opus | Read, Grep, WebFetch | Security analysis |
| 4 | **Analytics** | ops | Sonnet | Read, WebFetch | Analytics setup & analysis |
| 5 | **Domain** | infra | Sonnet | WebFetch, DNS | Domain & DNS checks |
| 6 | **SEO** | content | Sonnet | Read, WebFetch | SEO optimization |
| 7 | **Deployment** | infra | Sonnet | Read, Bash | Deployment status |
| 8 | **Code Generation** | code | Opus | Read, Write, Edit, Bash | Write & modify code |
| 9 | **Test** | code | Sonnet | Read, Write, Bash | Generate tests |
| 10 | **Review** | code | Opus | Read, Grep | Code review |
| 11 | **Design** | creative | Opus | WebFetch, Write | UI/UX design |
| 12 | **Copy** | content | Sonnet | Read, Write | Marketing copy |
| 13 | **Research** | ops | Sonnet | WebSearch, WebFetch | Market research |
| 14 | **Documentation** | content | Sonnet | Read, Write | Generate docs |
| 15 | **Performance** | infra | Sonnet | WebFetch, Bash | Performance analysis |
| 16 | **Accessibility** | infra | Sonnet | WebFetch | A11y checks |
| 17 | **Database** | infra | Opus | Read, SQL | Database optimization |

### Agent Spawning

The Claude Agent SDK allows **programmatic definition** of agents. You define the menu of available agents; the orchestrator decides when to spawn them.

```typescript
// Agents are defined upfront
const agentRegistry = {
  security: securityAgent,
  analytics: analyticsAgent,
  // ...
};

// But spawned dynamically by Head of Product
async function runOrchestrator() {
  const headOfProduct = createAgent({
    prompt: `You are the Head of Product. Based on scan results and priorities,
             decide which specialist agents to spawn using the spawnAgent tool.`,
    tools: [
      {
        name: 'spawnAgent',
        description: 'Spawn a specialist agent',
        parameters: {
          agentType: { enum: Object.keys(agentRegistry) },
          projectId: { type: 'string' },
          focus: { type: 'string' }
        }
      }
    ]
  });
  
  // Head of Product autonomously decides what to spawn
  await headOfProduct.run(scanContext);
}
```

---

## 6. Data Model

### New Tables

```sql
-- 1. Project Snapshots (see Section 2)
CREATE TABLE project_snapshots ( ... );

-- 2. Slack Inbounds (all messages, not just check-ins)
CREATE TABLE slack_inbounds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id TEXT NOT NULL,
  channel_name TEXT,
  user_id TEXT NOT NULL,
  user_name TEXT,
  message_text TEXT NOT NULL,
  thread_ts TEXT,
  event_type TEXT NOT NULL, -- 'message', 'reaction', 'mention', 'dm'
  raw_event JSONB,
  processed BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW()
);

-- 3. Priority Signals (from all sources)
CREATE TABLE priority_signals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source TEXT NOT NULL, -- 'slack', 'linear', 'scan', 'dashboard'
  source_id TEXT, -- Original ID from source system
  project_id UUID REFERENCES projects(id),
  story_id UUID REFERENCES stories(id),
  priority_level TEXT NOT NULL, -- 'P0', 'P1', 'P2', 'P3'
  signal_text TEXT,
  confidence FLOAT DEFAULT 1.0,
  processed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

-- 4. Agent Sessions (detailed trace storage)
CREATE TABLE agent_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  orchestrator_run_id UUID REFERENCES orchestrator_runs(id),
  story_id UUID REFERENCES stories(id),
  agent_name TEXT NOT NULL,
  project_id UUID REFERENCES projects(id),
  status TEXT DEFAULT 'running', -- 'running', 'completed', 'failed'
  thinking_trace JSONB DEFAULT '[]',
  tokens_used INTEGER,
  estimated_cost DECIMAL(10,4),
  started_at TIMESTAMP DEFAULT NOW(),
  completed_at TIMESTAMP
);

-- 5. Agent Outputs (for non-code work)
CREATE TABLE agent_outputs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES agent_sessions(id),
  story_id UUID REFERENCES stories(id),
  project_id UUID REFERENCES projects(id),
  output_type TEXT NOT NULL, -- 'design', 'document', 'analysis', 'asset'
  title TEXT NOT NULL,
  description TEXT,
  content TEXT, -- Markdown content or HTML
  file_url TEXT, -- Supabase Storage URL
  preview_url TEXT, -- Public preview URL
  metadata JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);
```

### Updated Tables

```sql
-- Add to stories table
ALTER TABLE stories ADD COLUMN priority_level TEXT DEFAULT 'P2';
ALTER TABLE stories ADD COLUMN priority_score INTEGER DEFAULT 50;
ALTER TABLE stories ADD COLUMN advances_launch_stage BOOLEAN DEFAULT FALSE;

-- Add to orchestrator_runs table
ALTER TABLE orchestrator_runs ADD COLUMN total_tokens INTEGER;
ALTER TABLE orchestrator_runs ADD COLUMN estimated_cost DECIMAL(10,4);
ALTER TABLE orchestrator_runs ADD COLUMN agents_spawned TEXT[];
```

---

## 6b. Complete Implementation Changes

### Files to Create

| File | Purpose |
|------|---------|
| `lib/agents/index.ts` | Agent registry with all 17 agent definitions |
| `lib/agents/state-manager.ts` | State Manager Agent implementation |
| `lib/state/aggregate.ts` | SQL aggregation functions |
| `lib/state/snapshot.ts` | Snapshot storage functions |
| `lib/priority/classifier.ts` | Priority signal classification |
| `lib/priority/ranker.ts` | Stack ranking algorithm |
| `lib/config/agent-limits.ts` | Configurable limits |
| `app/api/stories/[id]/approve/route.ts` | Dashboard approval endpoint |

### Files to Modify

| File | Change |
|------|--------|
| `lib/orchestrator.ts` | Replace single API calls with Agent SDK multi-turn |
| `workers/execution-worker.ts` | Replace placeholder code with Code Gen Agent |
| `workers/orchestrator-worker.ts` | Integrate State Agent after scans |
| `app/api/linear/webhook/route.ts` | Add execution enqueue on "in progress" status |
| `app/api/slack/events/route.ts` | Expand to handle all signal types |
| `prisma/schema.prisma` | Add new tables and columns |

### Migration Script

```sql
-- migrations/002_agent_sdk_upgrade.sql

-- 1. Project Snapshots
CREATE TABLE project_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  snapshot_at TIMESTAMP NOT NULL DEFAULT NOW(),
  launch_stage TEXT NOT NULL DEFAULT 'idea',
  launch_score INTEGER NOT NULL DEFAULT 0,
  scan_scores JSONB NOT NULL DEFAULT '{}',
  work_summary JSONB NOT NULL DEFAULT '{}',
  launch_checklist JSONB NOT NULL DEFAULT '{}',
  top_priorities JSONB,
  ai_assessment TEXT,
  recommended_focus TEXT[],
  UNIQUE(project_id, DATE(snapshot_at))
);

CREATE INDEX idx_project_snapshots_project_id ON project_snapshots(project_id);
CREATE INDEX idx_project_snapshots_date ON project_snapshots(snapshot_at DESC);

-- 2. Slack Inbounds
CREATE TABLE slack_inbounds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id TEXT NOT NULL,
  channel_name TEXT,
  user_id TEXT NOT NULL,
  user_name TEXT,
  message_text TEXT NOT NULL,
  thread_ts TEXT,
  event_type TEXT NOT NULL,
  raw_event JSONB,
  processed BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_slack_inbounds_channel ON slack_inbounds(channel_id);
CREATE INDEX idx_slack_inbounds_user ON slack_inbounds(user_id);
CREATE INDEX idx_slack_inbounds_processed ON slack_inbounds(processed);

-- 3. Priority Signals
CREATE TABLE priority_signals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source TEXT NOT NULL,
  source_id TEXT,
  project_id UUID REFERENCES projects(id),
  story_id UUID REFERENCES stories(id),
  priority_level TEXT NOT NULL,
  signal_text TEXT,
  confidence FLOAT DEFAULT 1.0,
  processed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_priority_signals_project ON priority_signals(project_id);
CREATE INDEX idx_priority_signals_story ON priority_signals(story_id);
CREATE INDEX idx_priority_signals_level ON priority_signals(priority_level);

-- 4. Agent Sessions
CREATE TABLE agent_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  orchestrator_run_id UUID REFERENCES orchestrator_runs(id),
  story_id UUID REFERENCES stories(id),
  agent_name TEXT NOT NULL,
  project_id UUID REFERENCES projects(id),
  status TEXT DEFAULT 'running',
  thinking_trace JSONB DEFAULT '[]',
  tool_calls JSONB DEFAULT '[]',
  tokens_used INTEGER,
  estimated_cost DECIMAL(10,4),
  started_at TIMESTAMP DEFAULT NOW(),
  completed_at TIMESTAMP
);

CREATE INDEX idx_agent_sessions_run ON agent_sessions(orchestrator_run_id);
CREATE INDEX idx_agent_sessions_project ON agent_sessions(project_id);
CREATE INDEX idx_agent_sessions_status ON agent_sessions(status);

-- 5. Agent Outputs
CREATE TABLE agent_outputs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES agent_sessions(id),
  story_id UUID REFERENCES stories(id),
  project_id UUID REFERENCES projects(id),
  output_type TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  content TEXT,
  file_url TEXT,
  preview_url TEXT,
  metadata JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_agent_outputs_project ON agent_outputs(project_id);
CREATE INDEX idx_agent_outputs_type ON agent_outputs(output_type);

-- 6. Update stories table
ALTER TABLE stories ADD COLUMN IF NOT EXISTS priority_level TEXT DEFAULT 'P2';
ALTER TABLE stories ADD COLUMN IF NOT EXISTS priority_score INTEGER DEFAULT 50;
ALTER TABLE stories ADD COLUMN IF NOT EXISTS advances_launch_stage BOOLEAN DEFAULT FALSE;

-- 7. Update orchestrator_runs table
ALTER TABLE orchestrator_runs ADD COLUMN IF NOT EXISTS total_tokens INTEGER;
ALTER TABLE orchestrator_runs ADD COLUMN IF NOT EXISTS estimated_cost DECIMAL(10,4);
ALTER TABLE orchestrator_runs ADD COLUMN IF NOT EXISTS agents_spawned TEXT[];

-- 8. Update projects table (if not exists)
ALTER TABLE projects ADD COLUMN IF NOT EXISTS launch_stage TEXT DEFAULT 'idea';
ALTER TABLE projects ADD COLUMN IF NOT EXISTS launch_score INTEGER DEFAULT 0;
```

### Prisma Schema Additions

```prisma
// Add to prisma/schema.prisma

model ProjectSnapshot {
  id               String   @id @default(uuid())
  projectId        String   @map("project_id")
  project          Project  @relation(fields: [projectId], references: [id], onDelete: Cascade)
  snapshotAt       DateTime @default(now()) @map("snapshot_at")
  launchStage      String   @default("idea") @map("launch_stage")
  launchScore      Int      @default(0) @map("launch_score")
  scanScores       Json     @default("{}") @map("scan_scores")
  workSummary      Json     @default("{}") @map("work_summary")
  launchChecklist  Json     @default("{}") @map("launch_checklist")
  topPriorities    Json?    @map("top_priorities")
  aiAssessment     String?  @map("ai_assessment")
  recommendedFocus String[] @map("recommended_focus")

  @@unique([projectId, snapshotAt])
  @@map("project_snapshots")
}

model SlackInbound {
  id          String   @id @default(uuid())
  channelId   String   @map("channel_id")
  channelName String?  @map("channel_name")
  userId      String   @map("user_id")
  userName    String?  @map("user_name")
  messageText String   @map("message_text")
  threadTs    String?  @map("thread_ts")
  eventType   String   @map("event_type")
  rawEvent    Json?    @map("raw_event")
  processed   Boolean  @default(false)
  createdAt   DateTime @default(now()) @map("created_at")

  @@map("slack_inbounds")
}

model PrioritySignal {
  id            String    @id @default(uuid())
  source        String
  sourceId      String?   @map("source_id")
  projectId     String?   @map("project_id")
  project       Project?  @relation(fields: [projectId], references: [id])
  storyId       String?   @map("story_id")
  story         Story?    @relation(fields: [storyId], references: [id])
  priorityLevel String    @map("priority_level")
  signalText    String?   @map("signal_text")
  confidence    Float     @default(1.0)
  processedAt   DateTime? @map("processed_at")
  createdAt     DateTime  @default(now()) @map("created_at")

  @@map("priority_signals")
}

model AgentSession {
  id               String    @id @default(uuid())
  orchestratorRunId String?  @map("orchestrator_run_id")
  orchestratorRun  OrchestratorRun? @relation(fields: [orchestratorRunId], references: [id])
  storyId          String?   @map("story_id")
  story            Story?    @relation(fields: [storyId], references: [id])
  agentName        String    @map("agent_name")
  projectId        String?   @map("project_id")
  project          Project?  @relation(fields: [projectId], references: [id])
  status           String    @default("running")
  thinkingTrace    Json      @default("[]") @map("thinking_trace")
  toolCalls        Json      @default("[]") @map("tool_calls")
  tokensUsed       Int?      @map("tokens_used")
  estimatedCost    Decimal?  @map("estimated_cost") @db.Decimal(10, 4)
  startedAt        DateTime  @default(now()) @map("started_at")
  completedAt      DateTime? @map("completed_at")
  outputs          AgentOutput[]

  @@map("agent_sessions")
}

model AgentOutput {
  id          String       @id @default(uuid())
  sessionId   String?      @map("session_id")
  session     AgentSession? @relation(fields: [sessionId], references: [id])
  storyId     String?      @map("story_id")
  story       Story?       @relation(fields: [storyId], references: [id])
  projectId   String?      @map("project_id")
  project     Project?     @relation(fields: [projectId], references: [id])
  outputType  String       @map("output_type")
  title       String
  description String?
  content     String?
  fileUrl     String?      @map("file_url")
  previewUrl  String?      @map("preview_url")
  metadata    Json?
  createdAt   DateTime     @default(now()) @map("created_at")

  @@map("agent_outputs")
}
```

### Key Implementation: Linear Webhook Update

```typescript
// app/api/linear/webhook/route.ts - ADD THIS SECTION

// After status update...
const newStatus = mapLinearStateToStatus(newState.type);

// Update story status
await prisma.story.update({
  where: { id: story.id },
  data: { status: newStatus },
});

// NEW: If status changed to "in progress", enqueue for execution
if (newState.type === 'started' || newState.name?.toLowerCase() === 'in progress') {
  const { executionQueue } = await import('@/lib/queues');
  
  await executionQueue.add('execute-story', {
    storyId: story.id,
    projectId: story.projectId,
    triggeredBy: 'linear',
    triggeredAt: new Date().toISOString(),
  }, {
    priority: getPriorityNumber(story.priorityLevel), // P0=1, P1=2, etc.
  });
  
  console.log(`[Linear] Story ${story.id} enqueued for execution`);
}
```

### Data Loss Consideration

⚠️ **Clean implementation is prioritized over data preservation.**

The following can be safely dropped/recreated:
- `orchestrator_runs` - Historical only, no dependencies
- `agent_findings` - Will be replaced by `agent_sessions` + `agent_outputs`
- `user_priorities` - Will be replaced by `priority_signals`

The following MUST be preserved:
- `projects` - User data
- `stories` - Work items (can add new columns)
- `scans` - Historical scan data
- `completions` - PR history

---

## 7. User Interface Screens

### Screen Inventory

| # | Screen | Priority | Purpose | Key Features |
|---|--------|----------|---------|--------------|
| 1 | Dashboard | P0 | Daily overview | Stats, quick actions, recent activity |
| 2 | Execution Queue | P0 | Work in progress | FIFO queue, priority badges, status |
| 3 | Chat History | P0 | Orchestrator comms | Slack-style conversation, commands |
| 4 | Priorities | P0 | Stack-ranked lists | By project, overall, with scores |
| 5 | **Progress** | **P0** | **Launch readiness** | Timeline, score, checklist |
| 6 | Projects | P1 | Project list | Health indicators, quick actions |
| 7 | Project Detail | P1 | Single project | Scans, stories, agents, state |
| 8 | Story Detail | P1 | Single work item | Timeline, traces, approval buttons |
| 9 | Agents | P1 | Agent activity | Real-time traces, status |
| 10 | Scans | P2 | Scan results | Detailed findings, history |
| 11 | Gallery | P2 | Non-code outputs | Search, filter, previews |
| 12 | Settings | P2 | Configuration | Integrations, limits, preferences |

### Navigation Structure

```
├── Dashboard (📊)
├── Queue (📋) [badge: count]
├── Chat (💬)
├── Priorities (🎯)
├── Progress (🚀) ← NEW
├── Projects (📁)
│   └── [Project Detail]
│       └── [Story Detail]
├── Agents (🤖)
├── Outputs
│   ├── Scans (🔍)
│   └── Gallery (🎨)
└── Settings (⚙️)
```

### Design System

| Element | Value |
|---------|-------|
| **Font** | DM Sans |
| **Background** | #FDF8F3 (warm cream) |
| **Cards** | #FFFFFF with subtle shadow |
| **Dark mode** | #1C1917 / #0C0A09 |
| **Primary** | #8B5CF6 (purple) |
| **Success** | #10B981 (green) |
| **Warning** | #F59E0B (amber) |
| **Error** | #EF4444 (red) |
| **Border** | #E7E5E4 |

---

## 8. User Stories

### What Users Can Do

| # | User Story | Source | Implementation |
|---|------------|--------|----------------|
| 1 | Talk to Head of Product in Slack at any time and set priority | Slack DM | `slack_inbounds` → priority classification |
| 2 | Projects analyzed daily, AM/PM check-ins set work | Cron jobs | 9:30 AM / 5:30 PM orchestrator runs |
| 3 | See all agent thinking traces | Dashboard | `agent_sessions.thinking_trace` |
| 4 | Agents update Linear as they work | Linear API | Story comments + status updates |
| 5 | Approve/reject work in Linear or Slack | Multi-source | Webhook handlers + execution queue |
| 6 | Generate new work from Slack or Linear | Either | Intent detection → story creation |
| 7 | See agents assigned to projects | Dashboard | `orchestrator_runs.agents_spawned` |
| 8 | Non-code work hosted at unique URLs | Gallery | `agent_outputs.preview_url` |
| 9 | Change priority via comments anytime | Linear/Slack | `priority_signals` re-triggers ranking |
| 10 | Stack-ranked list per project with reasoning | Priorities screen | `project_snapshots.top_priorities` |
| 11 | Orchestrator stops if no approval after 1 round | Safety | `maxUnapprovedRounds: 1` config |
| 12 | **See launch readiness and project progress** | **Progress screen** | **`project_snapshots.launch_*`** |

---

## 9. Deployment Architecture

### Online (Production)

```
┌─────────────────────────────────────────────────────────────┐
│                         Vercel                               │
│  ┌─────────────────┐  ┌─────────────────┐                   │
│  │   Next.js App   │  │   API Routes    │                   │
│  │   (Frontend)    │  │   (Backend)     │                   │
│  └─────────────────┘  └─────────────────┘                   │
│                              │                               │
│  ┌─────────────────┐         │                               │
│  │   Cron Jobs     │ ────────┤                               │
│  │   (Triggers)    │         │                               │
│  └─────────────────┘         │                               │
└──────────────────────────────┼───────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                        Railway                               │
│  ┌─────────────────┐  ┌─────────────────┐                   │
│  │   BullMQ        │  │   Workers       │                   │
│  │   (Redis)       │◄─┤   (Scan,        │                   │
│  │                 │  │   Orchestrator, │                   │
│  └─────────────────┘  │   Execution)    │                   │
│                       └─────────────────┘                   │
└──────────────────────────────┼───────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                       Supabase                               │
│  ┌─────────────────┐  ┌─────────────────┐                   │
│  │   PostgreSQL    │  │   Storage       │                   │
│  │   (Data)        │  │   (Files)       │                   │
│  └─────────────────┘  └─────────────────┘                   │
└─────────────────────────────────────────────────────────────┘
```

### Local Development

```bash
# 1. Start Redis for queues
docker run -d -p 6379:6379 redis

# 2. Run workers locally
npm run worker:scan
npm run worker:orchestrator
npm run worker:execution

# 3. Run Next.js dev server
npm run dev
```

---

## 10. Implementation Roadmap

> **📋 Detailed Implementation Plan**: See [IMPLEMENTATION-PLAN.md](./IMPLEMENTATION-PLAN.md) for:
> - 47 detailed tasks with acceptance criteria
> - E2E test scenarios for each phase
> - Ralph Method task assignments (35 automatable tasks)
> - Parallel Worktree candidates (4 high-risk tasks)
> - Risk register and rollback strategies
> - Approval gates and sign-off checklists

### Phase 1: Foundation (Week 1-2)
| Task | Effort | Owner |
|------|--------|-------|
| Install `@anthropic-ai/claude-agent-sdk` | 0.5 day | Dev |
| Create `project_snapshots` table | 0.5 day | Dev |
| Implement State Manager Agent | 1 day | Dev |
| Add `priority_signals` table | 0.5 day | Dev |
| Update navigation with Progress | 0.5 day | Dev |

### Phase 2: Agent SDK Integration (Week 2-3)
| Task | Effort | Owner |
|------|--------|-------|
| Refactor `lib/orchestrator.ts` | 3 days | Dev |
| Convert agents to SDK format | 2 days | Dev |
| Add thinking trace storage | 1 day | Dev |
| Update execution worker | 2 days | Dev |

### Phase 3: Multi-Source Approval (Week 3-4)
| Task | Effort | Owner |
|------|--------|-------|
| Linear status → execution trigger | 1 day | Dev |
| Dashboard approval buttons | 1 day | Dev |
| Unified priority signal handler | 2 days | Dev |

### Phase 4: Launch Readiness (Week 4-5)
| Task | Effort | Owner |
|------|--------|-------|
| Launch score calculation | 2 days | Dev |
| Progress screen UI | 2 days | Dev |
| Priority weighting integration | 1 day | Dev |

### Phase 5: Polish (Week 5-6)
| Task | Effort | Owner |
|------|--------|-------|
| Unified UX across screens | 2 days | Dev |
| Output Gallery with search | 1 day | Dev |
| Settings page | 1 day | Dev |
| Documentation | 1 day | Dev |

---

## Appendix A: File References

| File | Purpose | URL |
|------|---------|-----|
| `explorations/final-spec/MASTER-SPEC.md` | This document | — |
| `explorations/final-spec/IMPLEMENTATION-PLAN.md` | **Detailed implementation plan (47 tasks)** | — |
| `explorations/final-spec/prd-impl.json` | **PRD for Ralph automation (47 stories)** | — |
| `explorations/final-spec/ralph-impl.sh` | **Ralph implementation loop script** | — |
| `explorations/final-spec/setup-worktrees.sh` | **Parallel worktree setup script** | — |
| `explorations/final-spec/merge-worktree.sh` | **Worktree merge script** | — |
| `explorations/final-spec/mockups.html` | All UI mockups (17 screens) | [http://localhost:8000/final-spec/mockups.html](http://localhost:8000/final-spec/mockups.html) |
| `explorations/final-spec/architecture.html` | Architecture diagrams | [http://localhost:8000/final-spec/architecture.html](http://localhost:8000/final-spec/architecture.html) |
| `explorations/architecture-workflows.html` | Detailed workflow diagrams | [http://localhost:8000/architecture-workflows.html](http://localhost:8000/architecture-workflows.html) |
| `explorations/ux-complete-mockups.html` | Original mockups (reference) | [http://localhost:8000/ux-complete-mockups.html](http://localhost:8000/ux-complete-mockups.html) |
| `explorations/agent-sdk-integration-plan.md` | Integration details | — |
| `explorations/implementation-qa.md` | Q&A documentation | — |

### Architecture Diagram Sections

The `architecture.html` file contains these sections (accessible via in-page navigation):

| Section | Anchor | Description |
|---------|--------|-------------|
| System Overview | `#overview` | High-level component diagram |
| Before/After | `#before-after` | Agent SDK integration comparison |
| Project State | `#project-state` | State management flow |
| Launch Readiness | `#launch-readiness` | Stage progression and scoring |
| Priority System | `#priority` | P0-P3 classification flow |
| Agents | `#agents` | Agent registry and tools |
| Data Flow | `#data-flow` | End-to-end sequence diagram |
| Multi-Source Approval | `#approval` | Approval from Linear/Slack/Dashboard |

---

## Appendix B: Cost Estimates

| Operation | Tokens | Cost |
|-----------|--------|------|
| Daily scan (5 projects) | ~50K | ~$1.50 |
| Orchestrator run | ~100K | ~$3.00 |
| Code generation (per story) | ~150K | ~$4.50 |
| State snapshot | ~10K | ~$0.30 |

**Estimated monthly**: $200-400 depending on activity.

### Cost Controls

```typescript
// lib/config/agent-limits.ts
export const agentLimits = {
  maxAgentSpawns: 10,          // Per orchestrator run
  maxTurnsPerAgent: 5,         // Per agent
  maxTokensPerRun: 200_000,    // Per run
  maxDailyOrchestratorRuns: 4, // Safety cap
  maxDailyTokenSpend: 500_000, // ~$15/day cap
  wipLimit: 3,                 // Max parallel work items
};
```

---

*End of Specification*
