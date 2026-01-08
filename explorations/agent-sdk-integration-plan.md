# Claude Agent SDK Integration Plan
## Complete UX Vision + Architecture Refactoring

**Created**: 2026-01-08
**Updated**: 2026-01-08
**Status**: Proposed
**Priority**: P0 (Foundational architecture)
**Reference**: https://platform.claude.com/docs/en/agent-sdk/overview

---

## Table of Contents

1. [User Stories](#user-stories-complete-ux-vision)
2. [Deployment: Online vs Local](#deployment-online-vs-local)
3. [Architecture Overview](#architecture-overview)
4. [Technical Implementation](#technical-implementation)
5. [Data Model Changes](#data-model-changes)
6. [Development Phases](#development-phases)
7. [Cost Analysis](#cost-analysis)

---

## User Stories: Complete UX Vision

### Priority & Communication

| ID | User Story | Current State | Proposed State |
|----|-----------|---------------|----------------|
| **US-01** | I can talk to Head of Product in Slack at any time and set priority | ❌ Only scheduled check-ins, priorities stored but never used | ✅ All Slack DMs/mentions to bot feed into priority_signals, trigger re-rank |
| **US-02** | All projects analyzed daily + morning/evening check-in set work for next cycle | ⚠️ Scans run, but no PM check-in, orchestrator not scheduled | ✅ 9am scan + orchestrator → PM recap at 6pm → user feedback → overnight work |
| **US-03** | Orchestrator checks in 2x/day via Slack | ⚠️ Only AM check-in exists | ✅ AM: "What's priority?" PM: "Here's what I found, approve?" |
| **US-04** | If not approved, orchestrator stops | ❌ Executes regardless | ✅ Orchestrator waits for approval, backs off if rejected |

### Visibility & Transparency

| ID | User Story | Current State | Proposed State |
|----|-----------|---------------|----------------|
| **US-05** | I can see all agents' thinking traces | ❌ Not stored or displayed | ✅ SDK auto-captures, stored in DB, visible in UI + Slack + Linear |
| **US-06** | Agents update Linear stories as they start/work/complete | ⚠️ Updates on complete only | ✅ Real-time status: "Starting analysis..." → "Found issue..." → "PR created" |
| **US-07** | I can see agents assigned to projects | ⚠️ UI exists but derives from completions, not actual assignments | ✅ Real agent_findings with agent attribution + thinking |
| **US-08** | I can see agent thinking in Linear comments | ⚠️ Only final rationale posted | ✅ Full thinking trace as threaded comments |

### Approval & Feedback

| ID | User Story | Current State | Proposed State |
|----|-----------|---------------|----------------|
| **US-09** | User can approve, request feedback, or reject work in Linear or Slack | ⚠️ Slack approve only | ✅ 3 buttons: Approve / Request Changes / Reject (both Slack + Linear) |
| **US-10** | Rejected work stops orchestrator from continuing | ❌ No rejection handling | ✅ Reject → mark story "rejected", orchestrator skips similar work |

### Work Generation

| ID | User Story | Current State | Proposed State |
|----|-----------|---------------|----------------|
| **US-11** | User can generate new work from Slack | ❌ Only check-in replies processed | ✅ DM bot with task → creates story with P0 priority |
| **US-12** | User can generate new work from Linear | ❌ Not implemented | ✅ Create issue with "[AI]" tag → bot picks up and processes |

### Agent Capabilities

| ID | User Story | Current State | Proposed State |
|----|-----------|---------------|----------------|
| **US-13** | Agents can do code work | ⚠️ Placeholder only | ✅ Agent SDK: Read/Write/Edit/Bash tools |
| **US-14** | Agents can do non-code work via skills/specialist subagents | ❌ Not implemented | ✅ Design Agent, Copy Agent, Research Agent as subagents |
| **US-15** | Non-code work hosted at unique URL for review | ❌ Not implemented | ✅ Outputs uploaded to Supabase Storage, preview URLs in Slack |

### Priority Management

| ID | User Story | Current State | Proposed State |
|----|-----------|---------------|----------------|
| **US-16** | Priority tracked by orchestrator but changeable by user at any time | ❌ Formula-only ranking | ✅ P0-P3 system, user comments override, re-rank on signal |
| **US-17** | Orchestrator keeps stack-ranked priority list per project with thinking | ❌ Not implemented | ✅ Per-project ranked list with score breakdown + AI rationale |
| **US-18** | In absence of user input, orchestrator sets priority and does 1 round | ❌ Requires manual trigger | ✅ Auto-run 2x/day, wait for approval before next round |

---

## Deployment: Online vs Local

### Does This Work Online or Locally?

**Both!** The Claude Agent SDK works in both environments:

| Mode | How It Works | Pros | Cons |
|------|-------------|------|------|
| **Local** | Claude Code CLI runs on your machine | Simple setup, no server costs | You must be online, laptop must be running |
| **Server/Cloud** | SDK runs on Railway/Vercel/etc | Always-on, automated | More setup, server costs |

### Current Setup (Already Online!)

Your current architecture is **already designed for cloud deployment**:

```
┌─────────────────────────────────────────────────────────┐
│ Vercel (Next.js App + API Routes)                        │
│ • /api/orchestrator/run                                  │
│ • /api/slack/events                                      │
│ • /api/scans/trigger                                     │
│ • Cron jobs (9am scan, 9:05am orchestrator)             │
└─────────────────────────────────────────────────────────┘
         │                    │                    │
         ▼                    ▼                    ▼
┌─────────────┐    ┌─────────────┐    ┌─────────────────┐
│ Railway     │    │ Supabase    │    │ Upstash Redis   │
│ Workers     │    │ Postgres    │    │ BullMQ Queues   │
│ • scan      │    │ • projects  │    │ • scans         │
│ • orchestr. │    │ • scans     │    │ • orchestrator  │
│ • execution │    │ • stories   │    │ • execution     │
└─────────────┘    └─────────────┘    └─────────────────┘
```

### What Changes for Agent SDK Online?

**Good news**: The Agent SDK can run in your existing Railway workers! It doesn't require Claude Code CLI in headless mode.

```typescript
// This works in Railway/Vercel/any Node.js environment:
import { query } from "@anthropic-ai/claude-agent-sdk";

// The SDK uses your ANTHROPIC_API_KEY, no CLI needed for headless
for await (const message of query({
  prompt: "Fix the bug in auth.ts",
  options: {
    allowedTools: ["Read", "Write", "Edit", "Bash"],
    cwd: "/tmp/cloned-repo"  // Working in cloned repo
  }
})) {
  console.log(message);
}
```

### What You Need for Online Deployment

| Requirement | Already Have? | Action Needed |
|-------------|--------------|---------------|
| **ANTHROPIC_API_KEY** | ✅ Yes | Already configured |
| **Railway Workers** | ✅ Yes | Already running |
| **Supabase DB** | ✅ Yes | Add new tables |
| **Redis/BullMQ** | ✅ Yes | Already configured |
| **Agent SDK package** | ❌ No | `npm install @anthropic-ai/claude-agent-sdk` |
| **File system access** | ✅ Yes | Railway workers have `/tmp` |
| **Git operations** | ✅ Yes | lib/git.ts already works |

### The Only Infrastructure Change

Add the SDK package to your workers:

```bash
# In package.json
npm install @anthropic-ai/claude-agent-sdk
```

That's it! Your existing Railway workers already have:
- File system access (`/tmp` for cloning repos)
- Network access (API calls, git operations)
- Environment variables (ANTHROPIC_API_KEY, etc.)

---

## Architecture Overview

### Current vs Proposed Flow

```
┌────────────────────────────────────────────────────────────────────────────┐
│                          PROPOSED DAILY WORKFLOW                            │
├────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  9:00 AM - MORNING CHECK-IN                                          │   │
│  │                                                                       │   │
│  │  Orchestrator → Slack: "Good morning! What should I focus on today?" │   │
│  │                                                                       │   │
│  │  User options:                                                        │   │
│  │  • Reply with priorities → P0-P3 signals stored                      │   │
│  │  • No reply → Orchestrator uses scan data + history                  │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                    │                                         │
│                                    ▼                                         │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  9:05 AM - SCANNING                                                   │   │
│  │                                                                       │   │
│  │  All projects scanned: domain, SEO, analytics, security, performance │   │
│  │  Results → scans table                                                │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                    │                                         │
│                                    ▼                                         │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  9:30 AM - ORCHESTRATOR ANALYSIS                                      │   │
│  │                                                                       │   │
│  │  Head of Product Agent:                                               │   │
│  │  1. Reviews scan results                                              │   │
│  │  2. Incorporates user priority signals                                │   │
│  │  3. Spawns specialist agents (Security, SEO, Analytics...)           │   │
│  │  4. Collects findings with thinking traces                           │   │
│  │  5. Creates stack-ranked stories per project                         │   │
│  │                                                                       │   │
│  │  Thinking traces → orchestrator_runs.conversation                    │   │
│  │  Findings → agent_findings                                            │   │
│  │  Stories → stories (with priority_level, rank_in_project)            │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                    │                                         │
│                                    ▼                                         │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  THROUGHOUT DAY - USER INTERACTION                                    │   │
│  │                                                                       │   │
│  │  Slack DM: "Hey, prioritize the checkout bug"                        │   │
│  │     → priority_signals (P0 explicit)                                 │   │
│  │     → Immediate re-rank                                               │   │
│  │     → Story moves to top of queue                                     │   │
│  │                                                                       │   │
│  │  Slack DM: "Add analytics to warmstart"                              │   │
│  │     → Creates new story (P0, user-generated)                         │   │
│  │     → Linear task created                                             │   │
│  │     → Queued for execution                                            │   │
│  │                                                                       │   │
│  │  Linear comment: "This is blocking launch"                           │   │
│  │     → priority_signals (P0 from Linear)                              │   │
│  │     → Story promoted                                                  │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                    │                                         │
│                                    ▼                                         │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  6:00 PM - EVENING RECAP                                              │   │
│  │                                                                       │   │
│  │  Orchestrator → Slack:                                                │   │
│  │  "Here's what I found today:                                         │   │
│  │                                                                       │   │
│  │   🔴 P0 (2 items):                                                   │   │
│  │   1. Checkout bug fix (Warmstart) - Ready to execute                 │   │
│  │   2. SSL cert expiring (TalkingObject) - 3 days left                 │   │
│  │                                                                       │   │
│  │   🟠 P1 (3 items):                                                   │   │
│  │   3. Add PostHog to ShipShow                                         │   │
│  │   ...                                                                 │   │
│  │                                                                       │   │
│  │   [Approve P0] [Approve All] [Review First] [Skip Tonight]"          │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                    │                                         │
│                          User clicks button                                  │
│                                    │                                         │
│                                    ▼                                         │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  OVERNIGHT - EXECUTION                                                │   │
│  │                                                                       │   │
│  │  If approved:                                                         │   │
│  │    For each approved story:                                           │   │
│  │    1. Clone repo                                                      │   │
│  │    2. Code Generation Agent makes changes (with thinking traces)     │   │
│  │    3. Run tests                                                       │   │
│  │    4. Create PR                                                       │   │
│  │    5. Post to Slack + Linear with full trace                         │   │
│  │                                                                       │   │
│  │  If "Skip Tonight":                                                   │   │
│  │    Orchestrator waits for next cycle                                  │   │
│  │                                                                       │   │
│  │  If no response by 10pm:                                              │   │
│  │    Execute P0 items only (safety mode)                                │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
└────────────────────────────────────────────────────────────────────────────┘
```

### Specialist Agents (Subagents)

```
┌────────────────────────────────────────────────────────────────────────────┐
│                           HEAD OF PRODUCT AGENT                             │
│                         (Meta-Agent / Orchestrator)                         │
├────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Tools: Task (spawn subagents), Read, Grep                                  │
│                                                                              │
│  Can spawn these specialist subagents:                                       │
│                                                                              │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐          │
│  │ SECURITY AGENT   │  │ ANALYTICS AGENT  │  │ SEO AGENT        │          │
│  │                  │  │                  │  │                  │          │
│  │ Tools:           │  │ Tools:           │  │ Tools:           │          │
│  │ • Read           │  │ • WebFetch       │  │ • WebFetch       │          │
│  │ • Grep           │  │ • Read           │  │ • Read           │          │
│  │ • Bash (npm aud) │  │ • Grep           │  │                  │          │
│  │ • WebFetch       │  │                  │  │                  │          │
│  │                  │  │                  │  │                  │          │
│  │ OUTPUT:          │  │ OUTPUT:          │  │ OUTPUT:          │          │
│  │ Vulnerabilities  │  │ Missing tracking │  │ Meta tag issues  │          │
│  │ Exposed secrets  │  │ Event suggestions│  │ Sitemap problems │          │
│  └──────────────────┘  └──────────────────┘  └──────────────────┘          │
│                                                                              │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐          │
│  │ DOMAIN AGENT     │  │ DEPLOYMENT AGENT │  │ CODE GEN AGENT   │          │
│  │                  │  │                  │  │                  │          │
│  │ Tools:           │  │ Tools:           │  │ Tools:           │          │
│  │ • WebFetch       │  │ • WebFetch       │  │ • Read           │          │
│  │ • Bash (SSL)     │  │ • Read           │  │ • Write          │          │
│  │                  │  │ • Bash           │  │ • Edit           │          │
│  │                  │  │                  │  │ • Bash           │          │
│  │ OUTPUT:          │  │ OUTPUT:          │  │ • Grep           │          │
│  │ SSL status       │  │ Build failures   │  │ • Glob           │          │
│  │ DNS issues       │  │ Deploy errors    │  │                  │          │
│  │ Uptime problems  │  │ Env var issues   │  │ OUTPUT:          │          │
│  └──────────────────┘  └──────────────────┘  │ Actual code PRs  │          │
│                                               └──────────────────┘          │
│                                                                              │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐          │
│  │ DESIGN AGENT     │  │ COPY AGENT       │  │ RESEARCH AGENT   │          │
│  │ (Non-code work)  │  │ (Non-code work)  │  │ (Non-code work)  │          │
│  │                  │  │                  │  │                  │          │
│  │ Tools:           │  │ Tools:           │  │ Tools:           │          │
│  │ • Read           │  │ • Read           │  │ • WebSearch      │          │
│  │ • Write          │  │ • Write          │  │ • WebFetch       │          │
│  │ • WebFetch       │  │ • WebSearch      │  │ • Write          │          │
│  │                  │  │                  │  │                  │          │
│  │ OUTPUT:          │  │ OUTPUT:          │  │ OUTPUT:          │          │
│  │ Figma specs      │  │ Copy suggestions │  │ Competitor analysis│        │
│  │ CSS improvements │  │ Marketing copy   │  │ Market research   │          │
│  │ UI mockups       │  │ Email templates  │  │ Feature ideas    │          │
│  │ → Hosted preview │  │ → Markdown files │  │ → Report doc     │          │
│  └──────────────────┘  └──────────────────┘  └──────────────────┘          │
│                                                                              │
└────────────────────────────────────────────────────────────────────────────┘
```

### Non-Code Work Preview URLs

```typescript
// When Design/Copy/Research agent creates output:

// 1. Agent writes output file
await writeFile('/tmp/output/design-review.html', designOutput);

// 2. Upload to Supabase Storage
const { data } = await supabase.storage
  .from('agent-outputs')
  .upload(`${storyId}/design-review.html`, file, {
    contentType: 'text/html',
    upsert: true
  });

// 3. Get public URL
const { data: { publicUrl } } = supabase.storage
  .from('agent-outputs')
  .getPublicUrl(`${storyId}/design-review.html`);

// 4. Post to Slack with preview
await slack.chat.postMessage({
  channel: SLACK_CHANNEL,
  text: `Design Agent completed work for ${project.name}`,
  blocks: [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*Design Review Ready*\n\n${story.title}\n\n📎 Preview: ${publicUrl}`
      }
    },
    {
      type: "actions",
      elements: [
        { type: "button", text: { type: "plain_text", text: "👀 Preview" }, url: publicUrl },
        { type: "button", text: { type: "plain_text", text: "✅ Approve" }, action_id: "approve" },
        { type: "button", text: { type: "plain_text", text: "💬 Feedback" }, action_id: "feedback" },
        { type: "button", text: { type: "plain_text", text: "❌ Reject" }, action_id: "reject" }
      ]
    }
  ]
});
```

---

## How Subagent Spawning Works

### Where: lib/orchestrator.ts (Railway Worker)

The orchestrator is where the Head of Product Agent runs and spawns specialist subagents.

**Flow**:
1. Vercel cron triggers `/api/orchestrator/run` (9:30 AM)
2. API route queues job to BullMQ orchestrator queue
3. Railway orchestrator worker picks up job
4. `lib/orchestrator.ts` uses Agent SDK to run Head of Product Agent
5. Head of Product Agent spawns subagents via Task tool
6. Each subagent runs, returns findings
7. Head of Product Agent aggregates, ranks, creates stories

### Code Example: lib/orchestrator.ts

```typescript
// lib/orchestrator.ts - Head of Product Agent spawns specialists

import { query } from '@anthropic-ai/claude-agent-sdk';
import { prisma } from '@/lib/db';

export async function runOrchestrator(runId: string) {
  // Fetch recent scans + priority signals
  const scans = await getRecentScans();
  const prioritySignals = await getPrioritySignals();
  const projects = await getProjects();

  // Build context for Head of Product Agent
  const context = buildOrchestratorContext(scans, prioritySignals, projects);

  const findings: AgentFinding[] = [];
  const conversation: Message[] = [];

  // Run Head of Product Agent (meta-agent)
  for await (const message of query({
    prompt: `You are the Head of Product for a multi-project software portfolio.

Context:
${context}

Your job:
1. Review scan results for all projects
2. Consider user priority signals from Slack/Linear
3. Spawn specialist agents to investigate issues
4. Aggregate their findings
5. Create a stack-ranked priority list

Available specialists (use Task tool to spawn):
- security-agent: Check for vulnerabilities, exposed secrets
- analytics-agent: Verify tracking setup
- seo-agent: Check meta tags, sitemaps
- domain-agent: Check SSL, DNS, uptime

For each finding, include:
- Project name
- Priority level (P0/P1/P2/P3)
- Impact score (1-5)
- Confidence score (1-5)
- Recommended action`,

    options: {
      allowedTools: ['Task', 'Read', 'Grep'],
      model: 'claude-opus-4-5-20251101',

      // Define specialist subagents
      agents: {
        'security-agent': {
          description: 'Security specialist for vulnerability analysis',
          prompt: `Analyze project for security issues:
          - Check package.json for vulnerable dependencies
          - Look for exposed API keys in .env files
          - Check for security headers
          Return findings with severity and remediation steps.`,
          tools: ['Read', 'Grep', 'Bash']
        },

        'analytics-agent': {
          description: 'Analytics specialist for tracking verification',
          prompt: `Verify analytics setup:
          - Check if PostHog/GA is installed
          - Verify tracking events are firing
          - Check for missing page views
          Return findings with implementation steps.`,
          tools: ['Read', 'Grep', 'WebFetch']
        },

        'seo-agent': {
          description: 'SEO specialist for meta tag analysis',
          prompt: `Analyze SEO setup:
          - Check meta tags (title, description, OG tags)
          - Verify sitemap.xml exists
          - Check robots.txt configuration
          Return findings with specific fixes.`,
          tools: ['WebFetch', 'Read']
        },

        'domain-agent': {
          description: 'Domain specialist for SSL/DNS checks',
          prompt: `Check domain configuration:
          - Verify SSL certificate validity
          - Check DNS records
          - Verify uptime status
          Return findings with urgency levels.`,
          tools: ['WebFetch', 'Bash']
        }
      }
    }
  })) {
    // Capture all messages for conversation log
    conversation.push(message);

    // Handle thinking traces
    if ('thinking' in message) {
      console.log('Head of Product thinking:', message.thinking);

      // Post to Slack in real-time
      await postOrchestratorUpdate(runId, message.thinking);
    }

    // Handle when Head of Product spawns a subagent
    if ('toolUse' in message && message.toolUse.name === 'Task') {
      const agentName = message.toolUse.input.agentName;
      console.log(`Spawning ${agentName}...`);

      // SDK handles the subagent execution automatically
      // We just log that it's happening
    }

    // Handle subagent results
    if ('taskResult' in message) {
      const { agentName, output } = message.taskResult;
      console.log(`${agentName} completed:`, output);

      // Store finding from specialist agent
      const finding = await prisma.agentFinding.create({
        data: {
          runId,
          agentName,
          projectId: extractProjectId(output),
          finding: output.finding,
          evidence: output.evidence,
          thinkingTrace: output.thinking || [],
          confidence: output.confidence,
          impact: output.impact
        }
      });

      findings.push(finding);
    }

    // Handle final output from Head of Product
    if ('text' in message && message.role === 'assistant') {
      // This is the Head of Product's final synthesis
      console.log('Head of Product final analysis:', message.text);
    }
  }

  // Store conversation (full thinking trace)
  await prisma.orchestratorRun.update({
    where: { id: runId },
    data: {
      conversation: conversation,
      status: 'completed',
      findingCount: findings.length
    }
  });

  // Stack rank findings with priority signals
  const rankedStories = await stackRankFindings(findings, prioritySignals);

  // Create stories (completions)
  for (const [index, finding] of rankedStories.entries()) {
    await prisma.story.create({
      data: {
        runId,
        projectId: finding.projectId,
        title: finding.title,
        rationale: finding.rationale,
        priorityLevel: finding.priorityLevel, // P0/P1/P2/P3
        priorityScore: finding.score,
        rankInProject: finding.rankInProject,
        rankOverall: index + 1,
        status: 'pending',
        thinkingTrace: finding.thinkingTrace
      }
    });
  }

  return { runId, findingCount: findings.length, storyCount: rankedStories.length };
}

// Example of what the Head of Product might do internally:
//
// 1. Head of Product: "I'll analyze each project. Let me start with Warmstart."
// 2. Head of Product: Uses Task tool → spawns security-agent for Warmstart
// 3. Security Agent: Runs, finds 3 vulnerabilities, returns findings
// 4. Head of Product: Uses Task tool → spawns analytics-agent for Warmstart
// 5. Analytics Agent: Runs, finds missing PostHog events, returns findings
// 6. Head of Product: "Warmstart has security issues (P0) and analytics gaps (P1)"
// 7. Head of Product: Moves to next project, repeats
// 8. Head of Product: Synthesizes all findings, applies priority signals
// 9. Head of Product: Returns stack-ranked list
```

### Key Points

**1. Single Process**: All agents run in the same Railway worker process
   - Head of Product Agent runs first
   - It spawns subagents via Task tool
   - SDK manages subagent execution

**2. Sequential Execution**: Subagents run one at a time
   - Head of Product decides which agent to spawn when
   - Each subagent completes before next spawns
   - Results flow back to Head of Product

**3. Thinking Traces**: Captured automatically
   - Head of Product's reasoning
   - Each specialist's reasoning
   - All stored in `orchestrator_runs.conversation`

**4. Real-time Updates**: Posted to Slack as agents work
   - "Spawning Security Agent for Warmstart..."
   - "Security Agent found 3 vulnerabilities"
   - "Creating P0 story: Fix auth vulnerability"

---

## Technical Implementation

### US-01: Talk to Head of Product Anytime

```typescript
// /api/slack/events - Handle all inbound messages

export async function POST(request: Request) {
  const event = await request.json();

  // Handle any DM to the bot
  if (event.type === 'message' && event.channel_type === 'im') {
    const text = event.text;
    const userId = event.user;

    // Store the inbound
    await prisma.slackInbound.create({
      data: {
        workspaceId: workspace.id,
        userId,
        text,
        messageTs: event.ts,
        isDm: true,
        source: 'dm'
      }
    });

    // Classify: Is this a priority signal or a work request?
    const classification = await classifyUserIntent(text);

    if (classification.type === 'priority') {
      // "Focus on warmstart" → P0 signal for warmstart project
      await prisma.prioritySignal.create({
        data: {
          workspaceId: workspace.id,
          projectId: classification.projectId,
          priorityLevel: classification.level, // P0
          signalText: text,
          source: 'slack',
          isExplicit: true
        }
      });

      // Trigger immediate re-rank
      await rerankProject(classification.projectId);

      // Acknowledge
      await slack.chat.postMessage({
        channel: event.channel,
        text: `Got it! ${classification.projectName} is now P0. I'll prioritize it in the next cycle.`
      });
    }

    else if (classification.type === 'new_work') {
      // "Add analytics to warmstart" → Create new story
      const story = await prisma.story.create({
        data: {
          projectId: classification.projectId,
          title: classification.title,
          rationale: `User request via Slack: "${text}"`,
          priority: 'high',
          priorityLevel: 'P0',
          policy: 'approval_required',
          status: 'pending',
          source: 'user_slack'
        }
      });

      // Create Linear task
      const linearTask = await createLinearTask({
        title: story.title,
        description: story.rationale,
        teamId: project.linearTeamId
      });

      await prisma.story.update({
        where: { id: story.id },
        data: { linearTaskId: linearTask.id }
      });

      await slack.chat.postMessage({
        channel: event.channel,
        text: `Created task: *${story.title}*\n\nI'll work on this in the next execution cycle. Linear: ${linearTask.url}`
      });
    }
  }
}

async function classifyUserIntent(text: string) {
  // Check for explicit priority keywords
  if (/\b(focus on|prioritize|urgent|P0|today)\b/i.test(text)) {
    return { type: 'priority', ... };
  }

  // Check for work generation keywords
  if (/\b(add|create|fix|implement|build)\b/i.test(text)) {
    return { type: 'new_work', ... };
  }

  // LLM fallback for ambiguous messages
  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-5-20250929',
    messages: [{
      role: 'user',
      content: `Classify this user message:\n\n"${text}"\n\nIs this:\n1. A priority signal (wanting to prioritize something)\n2. A work request (wanting something done)\n3. A question (asking for information)\n4. Other\n\nReturn JSON: { type, projectName?, details }`
    }]
  });

  return JSON.parse(response.content[0].text);
}
```

### US-02 & US-03: Morning/Evening Check-ins

```typescript
// /api/slack/check-in - Morning check-in (9am)
export async function GET(request: Request) {
  // Get recent scan summary
  const scanSummary = await getScanSummary();

  // Get current priority queue
  const topStories = await prisma.story.findMany({
    where: { status: 'pending' },
    orderBy: [
      { priorityLevel: 'asc' }, // P0 first
      { priorityScore: 'desc' }
    ],
    take: 5
  });

  await slack.chat.postMessage({
    channel: SLACK_CHANNEL,
    text: `Good morning! 🌅`,
    blocks: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*Good morning!* Here's what I'm seeing:\n\n` +
                `📊 *Scan Summary:*\n${scanSummary}\n\n` +
                `📋 *Current Queue:*\n${formatStoryList(topStories)}\n\n` +
                `What should I focus on today? Reply with priorities or say "looks good" to proceed.`
        }
      }
    ]
  });
}

// /api/slack/recap - Evening recap (6pm)
export async function GET(request: Request) {
  // Get today's findings
  const todayFindings = await getTodayFindings();
  const pendingStories = await getPendingStories();

  await slack.chat.postMessage({
    channel: SLACK_CHANNEL,
    text: `Evening recap`,
    blocks: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*Evening Recap* 🌙\n\nHere's what I found today:\n\n${formatFindings(todayFindings)}`
        }
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*Ready for execution:*\n\n${formatPendingStories(pendingStories)}`
        }
      },
      {
        type: "actions",
        elements: [
          {
            type: "button",
            text: { type: "plain_text", text: "✅ Approve P0 Only" },
            style: "primary",
            action_id: "approve_p0"
          },
          {
            type: "button",
            text: { type: "plain_text", text: "✅ Approve All" },
            action_id: "approve_all"
          },
          {
            type: "button",
            text: { type: "plain_text", text: "👀 Review First" },
            action_id: "review"
          },
          {
            type: "button",
            text: { type: "plain_text", text: "⏸️ Skip Tonight" },
            action_id: "skip"
          }
        ]
      }
    ]
  });

  // Set timeout: if no response by 10pm, auto-execute P0 only
  await scheduleAutoApproval();
}
```

### US-05: Thinking Traces

```typescript
// The SDK automatically captures thinking traces!

import { query } from "@anthropic-ai/claude-agent-sdk";

for await (const message of query({
  prompt: "Analyze security issues in this codebase",
  options: {
    allowedTools: ["Read", "Grep", "Bash"],
    cwd: repoPath
  }
})) {
  // message includes thinking automatically
  if ("thinking" in message) {
    // Store thinking trace
    await prisma.agentFinding.update({
      where: { id: findingId },
      data: {
        thinkingTrace: {
          push: {
            timestamp: new Date(),
            thinking: message.thinking,
            toolUse: message.toolUse || null
          }
        }
      }
    });

    // Post to Linear as comment
    await addLinearComment(
      linearTaskId,
      `🤔 **Agent Thinking:**\n\n${message.thinking}`
    );

    // Post to Slack thread
    await slack.chat.postMessage({
      channel: SLACK_CHANNEL,
      thread_ts: storyThreadTs,
      text: `💭 ${message.thinking.slice(0, 200)}...`
    });
  }
}
```

### US-09: Approve/Feedback/Reject in Both Platforms

```typescript
// Slack button handler
if (action.action_id === 'request_feedback') {
  // Open modal for feedback
  await slack.views.open({
    trigger_id: payload.trigger_id,
    view: {
      type: "modal",
      title: { type: "plain_text", text: "Request Changes" },
      submit: { type: "plain_text", text: "Submit" },
      blocks: [
        {
          type: "input",
          element: {
            type: "plain_text_input",
            multiline: true,
            action_id: "feedback_text"
          },
          label: { type: "plain_text", text: "What changes do you need?" }
        }
      ]
    }
  });
}

if (action.action_id === 'reject') {
  await prisma.story.update({
    where: { id: storyId },
    data: {
      status: 'rejected',
      rejectedAt: new Date(),
      rejectionReason: 'User rejected'
    }
  });

  // Update Linear
  await updateLinearTaskStatus(story.linearTaskId, 'cancelled');

  // Notify user
  await slack.chat.postMessage({
    channel: payload.channel.id,
    text: `Understood. I've cancelled this task and won't suggest similar work.`
  });
}

// Linear webhook handler for comments
if (event.type === 'Comment' && event.action === 'create') {
  const comment = event.data.body.toLowerCase();

  if (comment.includes('approved') || comment.includes('lgtm')) {
    await handleApproval(event.data.issueId);
  }
  else if (comment.includes('changes needed') || comment.includes('please fix')) {
    await handleFeedbackRequest(event.data.issueId, event.data.body);
  }
  else if (comment.includes('reject') || comment.includes('cancel')) {
    await handleRejection(event.data.issueId);
  }
}
```

### US-14 & US-15: Non-Code Work with Preview URLs

```typescript
// Design Agent subagent definition
const designAgent = {
  description: "Design specialist for UI/UX improvements",
  prompt: `You are a design specialist. Analyze the UI and suggest improvements.
    
    When you complete your analysis:
    1. Create an HTML file with your design recommendations
    2. Include visual mockups using inline SVG or CSS
    3. The file will be hosted for the user to review`,
  tools: ["Read", "Write", "WebFetch"]
};

// In the orchestrator:
for await (const message of query({
  prompt: `This project needs design review: ${project.name}`,
  options: {
    allowedTools: ["Task"],
    agents: {
      "design-agent": designAgent
    }
  }
})) {
  if ("taskResult" in message && message.taskResult.agentName === "design-agent") {
    // Agent wrote output to /tmp/design-output.html
    const outputPath = message.taskResult.outputPath;

    // Upload to Supabase Storage
    const file = await fs.readFile(outputPath);
    const { data } = await supabase.storage
      .from('agent-outputs')
      .upload(`${storyId}/design-review-${Date.now()}.html`, file);

    const publicUrl = supabase.storage
      .from('agent-outputs')
      .getPublicUrl(data.path).data.publicUrl;

    // Store URL and notify user
    await prisma.story.update({
      where: { id: storyId },
      data: { previewUrl: publicUrl }
    });

    await slack.chat.postMessage({
      channel: SLACK_CHANNEL,
      text: `🎨 Design review ready for ${project.name}`,
      blocks: [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `*Design Review Complete*\n\n👀 [View Preview](${publicUrl})`
          }
        },
        {
          type: "actions",
          elements: [
            { type: "button", text: { text: "✅ Approve" }, action_id: "approve" },
            { type: "button", text: { text: "💬 Feedback" }, action_id: "feedback" },
            { type: "button", text: { text: "❌ Reject" }, action_id: "reject" }
          ]
        }
      ]
    });
  }
}
```

---

## Data Model Changes

### New Tables

```sql
-- All Slack inbound messages (not just check-in replies)
CREATE TABLE slack_inbounds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id),
  user_id TEXT NOT NULL,
  channel_id TEXT,
  text TEXT,
  message_ts TEXT NOT NULL,
  thread_ts TEXT,
  is_dm BOOLEAN DEFAULT false,
  source TEXT NOT NULL, -- 'dm' | 'channel' | 'mention' | 'reaction'
  reaction_emoji TEXT,
  raw_payload JSONB,
  processed BOOLEAN DEFAULT false,
  classification TEXT, -- 'priority' | 'new_work' | 'question' | 'feedback'
  created_at TIMESTAMP DEFAULT NOW()
);

-- Priority signals from all sources
CREATE TABLE priority_signals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id),
  project_id UUID REFERENCES projects(id),
  story_id UUID REFERENCES stories(id),
  source TEXT NOT NULL, -- 'slack' | 'linear' | 'ui' | 'scan' | 'orchestrator'
  priority_level TEXT, -- 'P0' | 'P1' | 'P2' | 'P3'
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

-- Agent outputs for non-code work
CREATE TABLE agent_outputs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  story_id UUID NOT NULL REFERENCES stories(id),
  agent_type TEXT NOT NULL, -- 'design' | 'copy' | 'research'
  output_type TEXT NOT NULL, -- 'html' | 'markdown' | 'json'
  storage_path TEXT NOT NULL,
  public_url TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);
```

### Updated Stories Table

```sql
ALTER TABLE stories ADD COLUMN IF NOT EXISTS priority_level TEXT DEFAULT 'P2';
ALTER TABLE stories ADD COLUMN IF NOT EXISTS priority_score INTEGER;
ALTER TABLE stories ADD COLUMN IF NOT EXISTS rank_in_project INTEGER;
ALTER TABLE stories ADD COLUMN IF NOT EXISTS rank_overall INTEGER;
ALTER TABLE stories ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'orchestrator'; -- 'orchestrator' | 'user_slack' | 'user_linear'
ALTER TABLE stories ADD COLUMN IF NOT EXISTS thinking_trace JSONB DEFAULT '[]';
ALTER TABLE stories ADD COLUMN IF NOT EXISTS preview_url TEXT;
ALTER TABLE stories ADD COLUMN IF NOT EXISTS rejected_at TIMESTAMP;
ALTER TABLE stories ADD COLUMN IF NOT EXISTS rejection_reason TEXT;
ALTER TABLE stories ADD COLUMN IF NOT EXISTS feedback_requested_at TIMESTAMP;
ALTER TABLE stories ADD COLUMN IF NOT EXISTS feedback_text TEXT;
```

---

## Development Phases

### Phase 1: Foundation (Week 1) - 5 days

| Task | Description | Files |
|------|-------------|-------|
| Install SDK | Add @anthropic-ai/claude-agent-sdk | package.json |
| Slack inbound logging | Log all DMs/channels/mentions | /api/slack/events |
| Priority signals table | Create table + Prisma model | prisma/schema.prisma |
| Basic classification | Detect priority vs work requests | lib/intent-classifier.ts |
| AM check-in enhancement | Include scan summary + queue | /api/slack/check-in |

### Phase 2: Code Generation Agent (Week 2) - 4 days

| Task | Description | Files |
|------|-------------|-------|
| Code Gen Agent | Replace placeholder with SDK | lib/agents/code-generation.ts |
| Thinking trace storage | Store agent reasoning | prisma/schema.prisma |
| Slack thread updates | Post thinking in real-time | workers/execution-worker.ts |
| PR description | Include thinking trace | workers/execution-worker.ts |

### Phase 3: Priority System (Week 2-3) - 5 days

| Task | Description | Files |
|------|-------------|-------|
| P0-P3 classification | Explicit + LLM fallback | lib/priority-classifier.ts |
| Stack ranking | Per-project + overall | lib/stack-ranker.ts |
| Re-rank triggers | Immediate vs batch | lib/rerank-queue.ts |
| Auto-enqueue | On approval, add to queue | /api/slack/events |
| Priority UI | Stack-ranked list view | app/dashboard/queue |

### Phase 4: Evening Recap + Approval Flow (Week 3) - 3 days

| Task | Description | Files |
|------|-------------|-------|
| PM recap cron | 6pm summary message | /api/slack/recap |
| Multi-button actions | Approve/Feedback/Reject | /api/slack/events |
| Linear integration | Comment-based approval | /api/linear/webhook |
| Auto-approval timeout | 10pm fallback | /api/slack/auto-approve |

### Phase 5: Specialist Agents (Week 4) - 4 days

| Task | Description | Files |
|------|-------------|-------|
| Security Agent | Tools: Read, Grep, Bash | lib/agents/security.ts |
| Analytics Agent | Tools: WebFetch, Read | lib/agents/analytics.ts |
| SEO Agent | Tools: WebFetch | lib/agents/seo.ts |
| Head of Product | Spawn specialists | lib/orchestrator.ts |

### Phase 6: Non-Code Agents (Week 4-5) - 3 days

| Task | Description | Files |
|------|-------------|-------|
| Design Agent | HTML mockup generation | lib/agents/design.ts |
| Copy Agent | Content suggestions | lib/agents/copy.ts |
| Preview hosting | Supabase Storage upload | lib/output-hosting.ts |

**Total: ~24 days**

---

## Cost Analysis

| Component | Current | With SDK | Notes |
|-----------|---------|----------|-------|
| Orchestrator runs (50/mo) | $37 | $75 | Multi-turn agents |
| Code generation (100/mo) | $0 (placeholder) | $50 | Real code changes |
| Priority classification (200/mo) | $0 | $5 | LLM fallback only |
| Non-code agents (50/mo) | $0 | $25 | Design/Copy/Research |
| Supabase Storage | $0 | $5 | Preview hosting |
| **Total** | **$37/mo** | **$160/mo** | **+$123/mo** |

---

## Questions Answered

### Does this plan work online or locally only?

**Both!** The plan is designed for your existing cloud infrastructure:
- Vercel (API routes, cron jobs)
- Railway (workers)
- Supabase (database, storage)
- Upstash (Redis queues)

The Claude Agent SDK works in headless mode without the CLI.

### How much harder to set up for online?

**Not harder at all!** You already have the infrastructure. Just:

1. `npm install @anthropic-ai/claude-agent-sdk`
2. Add new database tables (migrations)
3. Deploy updated workers to Railway

Your existing Railway workers already have file system access (`/tmp`), network access, and environment variables.

### What would we need to do for online?

| Requirement | Status | Action |
|-------------|--------|--------|
| Node.js runtime | ✅ Have | Railway uses Node.js |
| File system | ✅ Have | `/tmp` available |
| API keys | ✅ Have | Already configured |
| Agent SDK | ❌ Need | `npm install` |
| New tables | ❌ Need | Prisma migration |
| Supabase Storage | ✅ Have | Already configured |

---

## Next Steps

1. **Review this plan** - Does it capture all your user stories?
2. **Confirm priorities** - Which phase to start with?
3. **Install SDK** - Test locally first
4. **Phase 1** - Foundation (Slack logging, priority signals)
5. **Phase 2** - Code generation agent (highest value)

