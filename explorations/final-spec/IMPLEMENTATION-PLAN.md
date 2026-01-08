# Virtual Cofounder - Implementation Plan v1.0

> **Last Updated**: January 8, 2026  
> **Companion to**: MASTER-SPEC.md  
> **Total Duration**: 6 weeks  
> **Total Tasks**: 47 tasks across 5 phases

---

## Table of Contents

1. [Execution Strategy](#1-execution-strategy)
2. [Phase 1: Foundation](#2-phase-1-foundation)
3. [Phase 2: Agent SDK Core](#3-phase-2-agent-sdk-core)
4. [Phase 3: Multi-Source Approval](#4-phase-3-multi-source-approval)
5. [Phase 4: Launch Readiness](#5-phase-4-launch-readiness)
6. [Phase 5: Polish & Integration](#6-phase-5-polish--integration)
7. [E2E Test Scenarios](#7-e2e-test-scenarios)
8. [Risk Register](#8-risk-register)
9. [Rollback Strategies](#9-rollback-strategies)
10. [Ralph Method Tasks](#10-ralph-method-tasks)
11. [Parallel Worktree Candidates](#11-parallel-worktree-candidates)

---

## 1. Execution Strategy

### Overview

This plan uses three execution modes based on task risk and complexity:

| Mode | Use When | Git Strategy |
|------|----------|--------------|
| **Sequential** | Dependencies exist, high risk | Single branch, one task at a time |
| **Ralph Method** | Low-risk, well-defined tasks | Automated story-by-story with validation |
| **Parallel Worktrees** | Experimental/risky changes | Multiple branches simultaneously |

### Decision Tree

```
┌─────────────────────────────────────────────────────────────┐
│                    NEW TASK ARRIVES                          │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
                    ┌─────────────────┐
                    │  Has clear AC?  │
                    │  Low coupling?  │
                    └─────────────────┘
                     │              │
                    YES             NO
                     │              │
                     ▼              ▼
        ┌─────────────────┐    ┌─────────────────┐
        │  Risky change?  │    │    SEQUENTIAL   │
        │  (Core system)  │    │   (Manual impl) │
        └─────────────────┘    └─────────────────┘
         │              │
        YES             NO
         │              │
         ▼              ▼
┌─────────────────┐  ┌─────────────────┐
│    PARALLEL     │  │  RALPH METHOD   │
│   WORKTREES     │  │   (Automated)   │
└─────────────────┘  └─────────────────┘
```

### Feature Flag Strategy

All Agent SDK changes will be behind feature flags:

```typescript
// lib/config/feature-flags.ts
export const featureFlags = {
  AGENT_SDK_ENABLED: process.env.AGENT_SDK_ENABLED === 'true',
  STATE_AGENT_ENABLED: process.env.STATE_AGENT_ENABLED === 'true',
  MULTI_SOURCE_APPROVAL: process.env.MULTI_SOURCE_APPROVAL === 'true',
  LAUNCH_READINESS: process.env.LAUNCH_READINESS === 'true',
};
```

---

## 2. Phase 1: Foundation

**Duration**: Week 1-2 (10 days)  
**Goal**: Install dependencies, create new tables, implement State Agent  
**Risk Level**: Low  
**Execution Mode**: Mixed (Ralph + Sequential)

### Tasks

| ID | Task | Effort | Mode | Depends On | Acceptance Criteria |
|----|------|--------|------|------------|---------------------|
| 1.1 | Install `@anthropic-ai/claude-agent-sdk` | 0.5d | Ralph | - | Package in package.json, imports work |
| 1.2 | Add feature flags config | 0.5d | Ralph | 1.1 | Feature flags file exists, env vars documented |
| 1.3 | Create `project_snapshots` migration | 1d | Ralph | - | Table exists with all columns from spec |
| 1.4 | Create `slack_inbounds` migration | 0.5d | Ralph | - | Table exists, indexes created |
| 1.5 | Create `priority_signals` migration | 0.5d | Ralph | - | Table exists, indexes created |
| 1.6 | Create `agent_sessions` migration | 0.5d | Ralph | - | Table exists, FK to orchestrator_runs |
| 1.7 | Create `agent_outputs` migration | 0.5d | Ralph | 1.6 | Table exists, FK to agent_sessions |
| 1.8 | Update Prisma schema | 1d | Sequential | 1.3-1.7 | `npx prisma generate` succeeds |
| 1.9 | Implement `lib/state/aggregate.ts` | 1d | Sequential | 1.3 | SQL aggregation functions work |
| 1.10 | Implement State Manager Agent | 2d | Sequential | 1.9 | Agent generates ai_assessment |
| 1.11 | Add Progress link to navigation | 0.5d | Ralph | - | Link visible in sidebar |
| 1.12 | Create Progress page skeleton | 1d | Ralph | 1.11 | Page renders with placeholder |

### Phase 1 E2E Tests

```typescript
// tests/e2e/phase1.spec.ts

describe('Phase 1: Foundation', () => {
  test('1.1 Agent SDK imports correctly', async () => {
    const sdk = await import('@anthropic-ai/claude-agent-sdk');
    expect(sdk.createAgent).toBeDefined();
  });

  test('1.2 Feature flags load from env', () => {
    process.env.AGENT_SDK_ENABLED = 'true';
    const flags = require('@/lib/config/feature-flags');
    expect(flags.featureFlags.AGENT_SDK_ENABLED).toBe(true);
  });

  test('1.3 project_snapshots table exists', async () => {
    const result = await prisma.$queryRaw`
      SELECT column_name FROM information_schema.columns 
      WHERE table_name = 'project_snapshots'
    `;
    expect(result).toContainEqual({ column_name: 'launch_score' });
    expect(result).toContainEqual({ column_name: 'ai_assessment' });
  });

  test('1.9 Aggregation creates valid snapshot', async () => {
    const snapshot = await createProjectSnapshot(testProjectId);
    expect(snapshot.launchScore).toBeGreaterThanOrEqual(0);
    expect(snapshot.launchScore).toBeLessThanOrEqual(100);
    expect(snapshot.scanScores).toBeDefined();
  });

  test('1.10 State Agent generates assessment', async () => {
    const result = await generateStateAssessment(mockContext);
    expect(result.ai_assessment).toBeTruthy();
    expect(result.recommended_focus.length).toBeGreaterThan(0);
  });

  test('1.11 Progress link visible', async () => {
    const page = await browser.newPage();
    await page.goto('/dashboard');
    const progressLink = await page.$('a[href*="progress"]');
    expect(progressLink).toBeTruthy();
  });
});
```

### Phase 1 Approval Gate

| Criterion | Required | Validator |
|-----------|----------|-----------|
| All migrations run successfully | ✓ | `npx prisma migrate deploy` |
| Prisma client generates | ✓ | `npx prisma generate` |
| State Agent cost < $0.10/project | ✓ | Token usage logging |
| All Phase 1 E2E tests pass | ✓ | `npm run test:e2e:phase1` |
| No regression in existing scans | ✓ | `npm run test:scans` |
| Feature flag disables new code | ✓ | Manual verification |

### Phase 1 Completion Checklist

```markdown
## Phase 1 Sign-off

- [ ] All 12 tasks completed
- [ ] All 6 E2E tests pass
- [ ] All 6 gate criteria met
- [ ] Code reviewed and merged to main
- [ ] Progress page accessible at /progress
- [ ] State Agent token usage documented

**Approved by**: _________________ **Date**: _________
```

---

## 3. Phase 2: Agent SDK Core

**Duration**: Week 2-3 (8 days)  
**Goal**: Refactor orchestrator and execution worker to use Agent SDK  
**Risk Level**: HIGH ⚠️  
**Execution Mode**: Parallel Worktrees (recommended)

### Why Parallel Worktrees?

Phase 2 involves replacing core orchestration logic. If it fails, the entire system breaks. Using parallel worktrees allows:

1. **Worktree A**: Legacy orchestrator (production fallback)
2. **Worktree B**: Agent SDK orchestrator (experimental)

```bash
# Create parallel worktrees
git worktree add ../vc-agent-sdk-orchestrator agent-sdk-orchestrator
git worktree add ../vc-agent-sdk-execution agent-sdk-execution

# Work on orchestrator in isolation
cd ../vc-agent-sdk-orchestrator
# ... make changes ...

# Test without affecting main
npm run test:orchestrator

# If successful, merge back
git checkout main
git merge agent-sdk-orchestrator
```

### Tasks

| ID | Task | Effort | Mode | Depends On | Acceptance Criteria |
|----|------|--------|------|------------|---------------------|
| 2.1 | Create agent registry (`lib/agents/index.ts`) | 1d | Sequential | 1.1 | All 17 agents defined |
| 2.2 | Create `AgentDefinition` interface | 0.5d | Ralph | 2.1 | TypeScript interface with tools, prompts |
| 2.3 | Convert Security Agent to SDK | 1d | **Worktree** | 2.1 | Agent runs with Read, Grep, WebFetch |
| 2.4 | Convert Analytics Agent to SDK | 0.5d | Ralph | 2.3 | Agent runs with Read, WebFetch |
| 2.5 | Convert Domain Agent to SDK | 0.5d | Ralph | 2.3 | Agent runs with WebFetch, DNS |
| 2.6 | Convert SEO Agent to SDK | 0.5d | Ralph | 2.3 | Agent runs with Read, WebFetch |
| 2.7 | Convert Deployment Agent to SDK | 0.5d | Ralph | 2.3 | Agent runs with Read, Bash |
| 2.8 | Refactor `lib/orchestrator.ts` (Head of Product) | 2d | **Worktree** | 2.1-2.7 | HoP spawns subagents via SDK |
| 2.9 | Add thinking trace storage | 1d | Sequential | 2.8, 1.6 | Traces stored in agent_sessions |
| 2.10 | Create Code Generation Agent | 2d | **Worktree** | 2.1 | Agent uses Read, Write, Edit, Bash |
| 2.11 | Refactor execution worker | 2d | **Worktree** | 2.10 | Real code changes via Agent SDK |
| 2.12 | Add execution trace storage | 0.5d | Sequential | 2.11, 1.6 | Tool calls stored in agent_sessions |

### Worktree Setup for Phase 2

```bash
#!/bin/bash
# scripts/setup-phase2-worktrees.sh

set -e

echo "🌳 Setting up Phase 2 parallel worktrees..."

# Ensure we're on main
git checkout main
git pull origin main

# Create feature branches
git branch -D agent-sdk-orchestrator 2>/dev/null || true
git branch -D agent-sdk-execution 2>/dev/null || true
git checkout -b agent-sdk-orchestrator
git checkout -b agent-sdk-execution
git checkout main

# Create worktrees
git worktree remove ../vc-orchestrator 2>/dev/null || true
git worktree remove ../vc-execution 2>/dev/null || true

git worktree add ../vc-orchestrator agent-sdk-orchestrator
git worktree add ../vc-execution agent-sdk-execution

echo "✅ Worktrees created:"
echo "   - ../vc-orchestrator (orchestrator refactor)"
echo "   - ../vc-execution (execution worker refactor)"
echo ""
echo "Work on each independently, then merge when ready."
```

### Phase 2 E2E Tests

```typescript
// tests/e2e/phase2.spec.ts

describe('Phase 2: Agent SDK Core', () => {
  test('2.1 Agent registry contains 17 agents', () => {
    const registry = require('@/lib/agents');
    expect(Object.keys(registry.agentRegistry).length).toBe(17);
  });

  test('2.3 Security Agent runs with tools', async () => {
    const result = await runAgentWithSDK('security', mockProject);
    expect(result.toolsUsed).toContain('Read');
    expect(result.findings.length).toBeGreaterThan(0);
  });

  test('2.8 Head of Product spawns subagents', async () => {
    const result = await runOrchestrator(mockScanContext);
    expect(result.agentsSpawned.length).toBeGreaterThan(0);
    expect(result.agentsSpawned).toContain('security');
  });

  test('2.9 Thinking traces are stored', async () => {
    await runOrchestrator(mockScanContext);
    const sessions = await prisma.agentSession.findMany({
      where: { agentName: 'Head of Product' }
    });
    expect(sessions.length).toBeGreaterThan(0);
    expect(sessions[0].thinkingTrace).toBeTruthy();
  });

  test('2.10 Code Gen Agent makes real changes', async () => {
    const result = await runCodeGenAgent(mockStory, testRepoPath);
    const diff = await git.diff(testRepoPath);
    expect(diff).toContain(mockStory.title);
  });

  test('2.11 Execution worker uses Agent SDK', async () => {
    await executeStory(mockStoryId);
    const completion = await prisma.completion.findFirst({
      where: { storyId: mockStoryId }
    });
    expect(completion.status).toBe('COMPLETED');
    expect(completion.prUrl).toBeTruthy();
  });
});
```

### Phase 2 Approval Gate

| Criterion | Required | Validator |
|-----------|----------|-----------|
| All 17 agents defined in registry | ✓ | Unit test |
| Orchestrator spawns subagents correctly | ✓ | E2E test |
| Thinking traces stored in DB | ✓ | DB query |
| Code Gen Agent creates real PRs | ✓ | GitHub API check |
| Legacy orchestrator still works (flag off) | ✓ | Feature flag test |
| Token usage within budget (<$5/run) | ✓ | Cost tracking |
| No increase in scan failure rate | ✓ | Error monitoring |

### Phase 2 Completion Checklist

```markdown
## Phase 2 Sign-off

- [ ] All 12 tasks completed
- [ ] Worktrees merged back to main
- [ ] All 6 E2E tests pass
- [ ] All 7 gate criteria met
- [ ] Feature flag tested (on and off)
- [ ] Agent SDK token costs documented
- [ ] Legacy fallback verified

**Approved by**: _________________ **Date**: _________
```

---

## 4. Phase 3: Multi-Source Approval

**Duration**: Week 3-4 (6 days)  
**Goal**: Enable approval from Linear, Slack, and Dashboard  
**Risk Level**: Medium  
**Execution Mode**: Ralph Method (well-defined tasks)

### Tasks

| ID | Task | Effort | Mode | Depends On | Acceptance Criteria |
|----|------|--------|------|------------|---------------------|
| 3.1 | Update Linear webhook for "in progress" trigger | 1d | Ralph | - | Status change enqueues story |
| 3.2 | Add `getPriorityNumber()` helper | 0.5d | Ralph | - | P0=1, P1=2, P2=3, P3=4 |
| 3.3 | Create `/api/stories/[id]/approve` endpoint | 1d | Ralph | - | POST approves and enqueues |
| 3.4 | Create `/api/stories/[id]/reject` endpoint | 0.5d | Ralph | 3.3 | POST rejects with reason |
| 3.5 | Create `/api/stories/[id]/request-changes` endpoint | 0.5d | Ralph | 3.3 | POST adds comment, keeps pending |
| 3.6 | Add approval buttons to Story Detail UI | 1d | Ralph | 3.3-3.5 | Buttons visible and functional |
| 3.7 | Implement priority signal classifier | 1d | Sequential | 1.5 | Classifies Slack/Linear/Scan signals |
| 3.8 | Create unified inbound handler | 1d | Sequential | 3.7 | All signals flow to priority_signals |
| 3.9 | Implement stack ranker | 1d | Sequential | 3.7 | Stories ranked by computed score |

### Ralph Method PRD for Phase 3

Since Phase 3 tasks are well-defined, we can use the Ralph method. Add these to `prd.json`:

```json
{
  "stories": [
    {
      "id": "phase3-01",
      "phase": "phase-3",
      "title": "Linear webhook triggers execution on 'in progress'",
      "description": "Update app/api/linear/webhook/route.ts to enqueue story for execution when Linear status changes to 'in progress' or 'started'.",
      "acceptanceCriteria": [
        { "type": "file_contains", "path": "app/api/linear/webhook/route.ts", "pattern": "executionQueue.add" },
        { "type": "api_test", "method": "POST", "path": "/api/linear/webhook", "body": {"type": "Issue", "action": "update"}, "expectedStatus": 200 }
      ],
      "status": "todo",
      "effort": "medium",
      "priority": "high"
    },
    {
      "id": "phase3-02",
      "phase": "phase-3",
      "title": "Create story approval API endpoint",
      "description": "Create app/api/stories/[id]/approve/route.ts that approves a story and enqueues it for execution.",
      "acceptanceCriteria": [
        { "type": "file_exists", "path": "app/api/stories/[id]/approve/route.ts" },
        { "type": "api_test", "method": "POST", "path": "/api/stories/test-id/approve", "expectedStatus": 200 }
      ],
      "status": "todo",
      "blockedBy": [],
      "effort": "medium",
      "priority": "high"
    }
    // ... more stories
  ]
}
```

### Phase 3 E2E Tests

```typescript
// tests/e2e/phase3.spec.ts

describe('Phase 3: Multi-Source Approval', () => {
  test('3.1 Linear status change enqueues story', async () => {
    const webhookPayload = {
      type: 'Issue',
      action: 'update',
      data: { state: { name: 'In Progress' } }
    };
    
    await fetch('/api/linear/webhook', {
      method: 'POST',
      body: JSON.stringify(webhookPayload)
    });
    
    const job = await executionQueue.getJob(testStoryId);
    expect(job).toBeTruthy();
  });

  test('3.3 Dashboard approval enqueues story', async () => {
    const response = await fetch(`/api/stories/${testStoryId}/approve`, {
      method: 'POST'
    });
    
    expect(response.status).toBe(200);
    const job = await executionQueue.getJob(testStoryId);
    expect(job).toBeTruthy();
  });

  test('3.6 Approval buttons render on Story Detail', async () => {
    const page = await browser.newPage();
    await page.goto(`/stories/${testStoryId}`);
    
    const approveBtn = await page.$('button:has-text("Approve")');
    const rejectBtn = await page.$('button:has-text("Reject")');
    
    expect(approveBtn).toBeTruthy();
    expect(rejectBtn).toBeTruthy();
  });

  test('3.7 Priority classifier handles all sources', async () => {
    const slackSignal = { source: 'slack', text: 'P0: fix this now!' };
    const linearSignal = { source: 'linear', text: 'urgent bug' };
    const scanSignal = { source: 'scan_critical', text: 'XSS vulnerability' };
    
    expect(await classifyPriority(slackSignal)).toBe('P0');
    expect(await classifyPriority(linearSignal)).toBe('P1');
    expect(await classifyPriority(scanSignal)).toBe('P0');
  });

  test('3.9 Stack ranker orders by priority score', async () => {
    const ranked = await getStackRankedStories(testProjectId);
    
    for (let i = 1; i < ranked.length; i++) {
      expect(ranked[i-1].priorityScore).toBeGreaterThanOrEqual(ranked[i].priorityScore);
    }
  });
});
```

### Phase 3 Approval Gate

| Criterion | Required | Validator |
|-----------|----------|-----------|
| Linear → execution trigger works | ✓ | Webhook test |
| Dashboard approval works | ✓ | E2E test |
| Slack approval works | ✓ | E2E test |
| All 3 sources flow to priority_signals | ✓ | DB verification |
| Stack ranker produces correct order | ✓ | Unit test |
| No duplicate story enqueues | ✓ | Idempotency test |

### Phase 3 Completion Checklist

```markdown
## Phase 3 Sign-off

- [ ] All 9 tasks completed
- [ ] Ralph method stories in prd.json
- [ ] All 5 E2E tests pass
- [ ] All 6 gate criteria met
- [ ] Multi-source approval demo recorded
- [ ] Documentation updated

**Approved by**: _________________ **Date**: _________
```

---

## 5. Phase 4: Launch Readiness

**Duration**: Week 4-5 (7 days)  
**Goal**: Implement launch score, Progress screen, priority weighting  
**Risk Level**: Low  
**Execution Mode**: Ralph Method

### Tasks

| ID | Task | Effort | Mode | Depends On | Acceptance Criteria |
|----|------|--------|------|------------|---------------------|
| 4.1 | Implement launch score calculation | 1d | Ralph | 1.9 | Score 0-100 based on factors |
| 4.2 | Implement launch stage derivation | 0.5d | Ralph | 4.1 | Stage from idea→growth |
| 4.3 | Implement launch checklist | 1d | Ralph | - | 12 checklist items computed |
| 4.4 | Create Progress screen header | 1d | Ralph | 1.12 | Shows stage, score, project info |
| 4.5 | Create Progress timeline component | 1d | Ralph | 4.4 | Visual timeline from idea→growth |
| 4.6 | Create Progress checklist component | 1d | Ralph | 4.3 | Interactive checklist display |
| 4.7 | Create Progress recommendations component | 0.5d | Ralph | 4.6 | Shows AI recommendations |
| 4.8 | Integrate launch score into priority weighting | 1d | Sequential | 4.1, 3.9 | Stories weighted by proximity |
| 4.9 | Add "advances launch stage" flag to stories | 0.5d | Ralph | 4.8 | Flag computed and stored |

### Phase 4 E2E Tests

```typescript
// tests/e2e/phase4.spec.ts

describe('Phase 4: Launch Readiness', () => {
  test('4.1 Launch score calculates correctly', async () => {
    const score = await calculateLaunchScore(testProjectId);
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(100);
  });

  test('4.2 Launch stage derived from score', () => {
    expect(deriveLaunchStage(10)).toBe('idea');
    expect(deriveLaunchStage(30)).toBe('mvp');
    expect(deriveLaunchStage(50)).toBe('alpha');
    expect(deriveLaunchStage(70)).toBe('beta');
    expect(deriveLaunchStage(85)).toBe('launch');
    expect(deriveLaunchStage(95)).toBe('growth');
  });

  test('4.3 Launch checklist computes all items', async () => {
    const checklist = await calculateLaunchChecklist(testProjectId);
    expect(Object.keys(checklist).length).toBeGreaterThanOrEqual(10);
    expect(checklist.repository_exists).toBeDefined();
  });

  test('4.5 Progress timeline renders stages', async () => {
    const page = await browser.newPage();
    await page.goto(`/progress/${testProjectId}`);
    
    const stages = await page.$$('.stage-timeline .stage');
    expect(stages.length).toBe(6); // idea→mvp→alpha→beta→launch→growth
  });

  test('4.8 Priority weighting includes launch factor', async () => {
    const storyNearLaunch = { projectLaunchScore: 80, impact: 5 };
    const storyEarlyProject = { projectLaunchScore: 20, impact: 5 };
    
    const scoreNear = calculatePriorityScore(storyNearLaunch);
    const scoreEarly = calculatePriorityScore(storyEarlyProject);
    
    expect(scoreNear).toBeGreaterThan(scoreEarly);
  });
});
```

### Phase 4 Approval Gate

| Criterion | Required | Validator |
|-----------|----------|-----------|
| Launch score 0-100 range | ✓ | Unit test |
| All 6 stages reachable | ✓ | Unit test |
| Progress screen loads under 2s | ✓ | Performance test |
| Checklist has 10+ items | ✓ | Unit test |
| Priority weighting uses launch score | ✓ | Integration test |
| Mobile responsive Progress screen | ✓ | Visual test |

### Phase 4 Completion Checklist

```markdown
## Phase 4 Sign-off

- [ ] All 9 tasks completed
- [ ] All 5 E2E tests pass
- [ ] All 6 gate criteria met
- [ ] Progress screen demo with real data
- [ ] Launch score documentation written
- [ ] Priority weighting documented

**Approved by**: _________________ **Date**: _________
```

---

## 6. Phase 5: Polish & Integration

**Duration**: Week 5-6 (8 days)  
**Goal**: Finalize UI, integrate all features, documentation  
**Risk Level**: Low  
**Execution Mode**: Mixed (Ralph + Sequential)

### Tasks

| ID | Task | Effort | Mode | Depends On | Acceptance Criteria |
|----|------|--------|------|------------|---------------------|
| 5.1 | Implement History page | 1d | Ralph | - | Shows all activity timeline |
| 5.2 | Implement Priorities page | 1d | Ralph | 3.9 | Stack-ranked lists by project |
| 5.3 | Implement Projects page | 1d | Ralph | - | Project grid with health indicators |
| 5.4 | Implement Agents page | 1d | Ralph | 2.9 | Real-time agent activity |
| 5.5 | Implement Scans page | 1d | Ralph | - | Detailed scan results |
| 5.6 | Implement Settings page | 1d | Ralph | - | Integrations, limits, preferences |
| 5.7 | Implement Gallery search/filter | 0.5d | Ralph | - | Search by project/type |
| 5.8 | Unify UX across all screens | 1d | Sequential | 5.1-5.7 | Consistent styling |
| 5.9 | Write user documentation | 1d | Sequential | All | README, getting started guide |
| 5.10 | Create demo video | 0.5d | Sequential | 5.9 | 3-5 min walkthrough |

### Phase 5 E2E Tests

```typescript
// tests/e2e/phase5.spec.ts

describe('Phase 5: Polish & Integration', () => {
  test('5.1 History page loads activity', async () => {
    const page = await browser.newPage();
    await page.goto('/history');
    const items = await page.$$('.activity-item');
    expect(items.length).toBeGreaterThan(0);
  });

  test('5.2 Priorities page shows ranked stories', async () => {
    const page = await browser.newPage();
    await page.goto('/priorities');
    const projectLists = await page.$$('.project-priority-list');
    expect(projectLists.length).toBeGreaterThan(0);
  });

  test('5.4 Agents page shows activity', async () => {
    const page = await browser.newPage();
    await page.goto('/agents');
    const agentCards = await page.$$('.agent-card');
    expect(agentCards.length).toBeGreaterThan(0);
  });

  test('5.8 UX consistency check', async () => {
    const pages = ['/dashboard', '/progress', '/priorities', '/agents'];
    for (const path of pages) {
      const page = await browser.newPage();
      await page.goto(path);
      
      // Check consistent sidebar
      const sidebar = await page.$('.sidebar');
      expect(sidebar).toBeTruthy();
      
      // Check consistent typography
      const fontFamily = await page.evaluate(() => 
        getComputedStyle(document.body).fontFamily
      );
      expect(fontFamily).toContain('DM Sans');
    }
  });

  test('Full E2E flow: Scan → Story → Approval → PR', async () => {
    // 1. Trigger scan
    await fetch('/api/scans/trigger', { method: 'POST' });
    await wait(5000);
    
    // 2. Check stories created
    const stories = await prisma.story.findMany({
      where: { projectId: testProjectId, status: 'PENDING' }
    });
    expect(stories.length).toBeGreaterThan(0);
    
    // 3. Approve story
    await fetch(`/api/stories/${stories[0].id}/approve`, { method: 'POST' });
    await wait(10000);
    
    // 4. Check PR created
    const completion = await prisma.completion.findFirst({
      where: { storyId: stories[0].id }
    });
    expect(completion.prUrl).toBeTruthy();
  });
});
```

### Phase 5 Approval Gate

| Criterion | Required | Validator |
|-----------|----------|-----------|
| All 10 screens implemented | ✓ | Visual check |
| All screens pass UX consistency | ✓ | E2E test |
| Full E2E flow works | ✓ | Integration test |
| Documentation complete | ✓ | Manual review |
| Performance: all pages < 3s | ✓ | Lighthouse |
| Mobile responsive | ✓ | Device testing |

### Phase 5 Completion Checklist

```markdown
## Phase 5 Sign-off (FINAL)

- [ ] All 10 tasks completed
- [ ] All 5 E2E tests pass
- [ ] All 6 gate criteria met
- [ ] Full E2E demo successful
- [ ] Documentation reviewed
- [ ] Demo video recorded
- [ ] Production deployment ready

**Final Approved by**: _________________ **Date**: _________
```

---

## 7. E2E Test Scenarios

### Complete Test Suite Summary

| Phase | Tests | Critical | Duration |
|-------|-------|----------|----------|
| Phase 1 | 6 | 2 | ~30s |
| Phase 2 | 6 | 4 | ~2min |
| Phase 3 | 5 | 3 | ~1min |
| Phase 4 | 5 | 2 | ~30s |
| Phase 5 | 5 + 1 full E2E | 1 | ~5min |
| **Total** | **28** | **12** | **~9min** |

### Critical Path Tests

These tests MUST pass before any phase can be considered complete:

```typescript
// tests/e2e/critical-path.spec.ts

describe('Critical Path Tests', () => {
  // Phase 1
  test('State Agent generates valid assessment', async () => { /* ... */ });
  test('Project snapshot stores correctly', async () => { /* ... */ });
  
  // Phase 2
  test('Agent SDK orchestrator runs successfully', async () => { /* ... */ });
  test('Code Gen Agent creates real code changes', async () => { /* ... */ });
  test('Thinking traces stored in DB', async () => { /* ... */ });
  test('Feature flag disables Agent SDK correctly', async () => { /* ... */ });
  
  // Phase 3
  test('Multi-source approval all trigger execution', async () => { /* ... */ });
  test('Priority signals flow to database', async () => { /* ... */ });
  test('Stack ranker produces correct order', async () => { /* ... */ });
  
  // Phase 4
  test('Launch score calculates correctly', async () => { /* ... */ });
  test('Priority weighting includes launch factor', async () => { /* ... */ });
  
  // Phase 5
  test('Full E2E: Scan → Story → Approval → PR', async () => { /* ... */ });
});
```

### Test Commands

```bash
# Run all E2E tests
npm run test:e2e

# Run specific phase
npm run test:e2e:phase1
npm run test:e2e:phase2
npm run test:e2e:phase3
npm run test:e2e:phase4
npm run test:e2e:phase5

# Run critical path only
npm run test:e2e:critical

# Run with coverage
npm run test:e2e -- --coverage
```

---

## 8. Risk Register

| ID | Risk | Probability | Impact | Mitigation | Owner |
|----|------|-------------|--------|------------|-------|
| R1 | Claude Agent SDK doesn't run in Railway | Medium | High | Test locally first; dockerize Claude Code runtime | Dev |
| R2 | Token costs exceed budget | Medium | Medium | Implement daily caps; use Sonnet where possible | Dev |
| R3 | Agent SDK API changes | Low | High | Pin SDK version; monitor changelog | Dev |
| R4 | Execution worker timeouts | Medium | Medium | Implement step caps; max 30 min per story | Dev |
| R5 | Database migration fails | Low | High | Test migrations on staging first; have rollback | Dev |
| R6 | Feature flag doesn't isolate correctly | Low | High | Comprehensive flag testing before merge | Dev |
| R7 | Slack/Linear rate limits | Medium | Low | Implement backoff; batch updates | Dev |
| R8 | State Agent assessment quality | Medium | Low | Human review of first 10 assessments | User |
| R9 | Parallel worktree merge conflicts | Medium | Medium | Small, focused changes; frequent rebases | Dev |
| R10 | Test environment differs from prod | Medium | Medium | Use identical config; test in Railway staging | Dev |

### Risk Response Matrix

```
         │ Low Impact │ Medium Impact │ High Impact
─────────┼────────────┼───────────────┼─────────────
High     │   ACCEPT   │    MITIGATE   │   AVOID
Prob.    │            │               │
─────────┼────────────┼───────────────┼─────────────
Medium   │   ACCEPT   │    MITIGATE   │   MITIGATE
Prob.    │            │               │
─────────┼────────────┼───────────────┼─────────────
Low      │   ACCEPT   │    ACCEPT     │   MITIGATE
Prob.    │            │               │
```

---

## 9. Rollback Strategies

### Phase 1 Rollback

**Trigger**: State Agent fails or costs exceed $1/project

```bash
# Rollback steps
1. Set STATE_AGENT_ENABLED=false in .env
2. No data migration needed (new tables are additive)
3. Progress page shows "Coming Soon" placeholder
4. Existing scans continue working unchanged
```

### Phase 2 Rollback

**Trigger**: Agent SDK orchestrator fails repeatedly or creates invalid PRs

```bash
# Rollback steps
1. Set AGENT_SDK_ENABLED=false in .env
2. lib/orchestrator.ts falls back to legacy code
3. workers/execution-worker.ts uses placeholder method
4. All existing functionality restored

# Recovery script
./scripts/rollback-phase2.sh
```

```bash
#!/bin/bash
# scripts/rollback-phase2.sh

echo "🔄 Rolling back Phase 2 (Agent SDK Core)..."

# Disable feature flags
sed -i 's/AGENT_SDK_ENABLED=true/AGENT_SDK_ENABLED=false/' .env

# Clear any stuck Agent SDK jobs
redis-cli KEYS "bull:orchestrator:*" | xargs redis-cli DEL
redis-cli KEYS "bull:execution:*" | xargs redis-cli DEL

# Restart workers
pm2 restart all

echo "✅ Rollback complete. Legacy orchestrator active."
```

### Phase 3 Rollback

**Trigger**: Multi-source approval creates duplicate jobs or wrong priorities

```bash
# Rollback steps
1. Set MULTI_SOURCE_APPROVAL=false in .env
2. Linear webhook stops triggering execution
3. Dashboard buttons hidden
4. Slack-only approval continues (existing flow)
```

### Phase 4 Rollback

**Trigger**: Launch score calculation breaks or produces nonsense

```bash
# Rollback steps
1. Set LAUNCH_READINESS=false in .env
2. Progress page shows placeholder
3. Priority weighting uses legacy formula (no launch factor)
4. project_snapshots table can remain (no harm)
```

### Emergency Full Rollback

**Trigger**: Multiple systems failing, need to restore to pre-refactor state

```bash
#!/bin/bash
# scripts/emergency-rollback.sh

echo "🚨 EMERGENCY ROLLBACK - Restoring pre-refactor state..."

# Kill all workers
pm2 stop all

# Disable ALL feature flags
cat > .env.rollback << EOF
AGENT_SDK_ENABLED=false
STATE_AGENT_ENABLED=false
MULTI_SOURCE_APPROVAL=false
LAUNCH_READINESS=false
EOF

cp .env .env.backup
cp .env.rollback .env

# Checkout last known good commit
LAST_GOOD_COMMIT=$(git log --oneline | grep "Phase 0 complete" | head -1 | cut -d' ' -f1)
git checkout $LAST_GOOD_COMMIT

# Rebuild
npm install
npm run build

# Restart
pm2 start all

echo "✅ Emergency rollback complete."
echo "   Restored to commit: $LAST_GOOD_COMMIT"
echo "   All new features disabled."
```

---

## 10. Ralph Method Tasks

### Tasks Suitable for Ralph Method

The following tasks can be automated using the Ralph method (story-by-story with validation):

| Phase | Task IDs | Count | Why Suitable |
|-------|----------|-------|--------------|
| 1 | 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.11, 1.12 | 9 | Clear AC, low coupling |
| 2 | 2.2, 2.4, 2.5, 2.6, 2.7 | 5 | Repetitive agent conversion |
| 3 | 3.1, 3.2, 3.3, 3.4, 3.5, 3.6 | 6 | Clear API contracts |
| 4 | 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.9 | 8 | UI components, calculations |
| 5 | 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7 | 7 | Page implementations |
| **Total** | | **35** | 74% of all tasks |

### Ralph PRD Structure

Add these to `prd.json` for automated execution:

```json
{
  "stories": [
    {
      "id": "impl-1.1",
      "phase": "implementation",
      "title": "Install @anthropic-ai/claude-agent-sdk",
      "description": "Add the Claude Agent SDK package to the project dependencies.",
      "acceptanceCriteria": [
        {
          "type": "command_succeeds",
          "command": "npm ls @anthropic-ai/claude-agent-sdk"
        },
        {
          "type": "file_contains",
          "path": "package.json",
          "pattern": "@anthropic-ai/claude-agent-sdk"
        }
      ],
      "status": "todo",
      "effort": "low",
      "priority": "high"
    },
    {
      "id": "impl-1.3",
      "phase": "implementation",
      "title": "Create project_snapshots migration",
      "description": "Create a Prisma migration for the project_snapshots table as defined in MASTER-SPEC.md Section 2.",
      "acceptanceCriteria": [
        {
          "type": "file_exists",
          "path": "prisma/migrations/*_add_project_snapshots/migration.sql"
        },
        {
          "type": "command_succeeds",
          "command": "npx prisma migrate dev --name add_project_snapshots"
        },
        {
          "type": "db_table_exists",
          "table": "project_snapshots"
        }
      ],
      "status": "todo",
      "blockedBy": [],
      "effort": "medium",
      "priority": "high"
    }
    // ... 33 more stories
  ]
}
```

### Ralph Execution Script (Updated)

```bash
#!/bin/bash
# ralph-impl.sh - Implementation loop

set -e

echo "🤖 Ralph Implementation Loop Starting..."
echo "   Using IMPLEMENTATION-PLAN.md tasks"
echo ""

PHASE=${1:-1}  # Default to Phase 1

while true; do
  # Find next task for current phase
  story_id=$(node -e "
    const prd = require('./prd-impl.json');
    const story = prd.stories.find(s => 
      s.phase === 'implementation' && 
      s.id.startsWith('impl-${PHASE}.') &&
      s.status === 'todo' && 
      (!s.blockedBy || s.blockedBy.every(id => 
        prd.stories.find(b => b.id === id)?.status === 'done'
      ))
    );
    if (story) console.log(story.id);
  ")

  if [ -z "$story_id" ]; then
    echo "✅ Phase $PHASE complete!"
    echo ""
    echo "Run E2E tests: npm run test:e2e:phase${PHASE}"
    echo "Then proceed to Phase $((PHASE + 1)): bash ralph-impl.sh $((PHASE + 1))"
    exit 0
  fi

  echo "📋 Working on: $story_id"
  
  # Extract and display story
  story_json=$(node -e "
    const prd = require('./prd-impl.json');
    const story = prd.stories.find(s => s.id === '$story_id');
    console.log(JSON.stringify(story, null, 2));
  ")

  cat > /tmp/ralph-prompt.md << EOF
# Implementation Task: $story_id

## Task Details
\`\`\`json
$story_json
\`\`\`

## Context
- Reference: explorations/final-spec/MASTER-SPEC.md
- This is Phase $PHASE of the Agent SDK integration

## Instructions
1. Implement the task according to acceptance criteria
2. Run validation after completion
3. Mark as done when all criteria pass

EOF

  echo ""
  cat /tmp/ralph-prompt.md
  echo ""
  echo "---"
  echo "Press ENTER to implement, or CTRL-C to pause"
  read -r

  # Implementation happens here (via Claude Code)
  # After manual implementation, validate:
  echo "🔍 Validating..."
  npm run validate:story $story_id
  
  if [ $? -eq 0 ]; then
    # Mark as done
    node -e "
      const fs = require('fs');
      const prd = require('./prd-impl.json');
      const story = prd.stories.find(s => s.id === '$story_id');
      story.status = 'done';
      story.completedAt = new Date().toISOString();
      fs.writeFileSync('./prd-impl.json', JSON.stringify(prd, null, 2));
    "
    echo "✅ $story_id complete!"
  else
    echo "❌ Validation failed. Fix and re-run."
    exit 1
  fi
  
  echo ""
done
```

---

## 11. Parallel Worktree Candidates

### Tasks Requiring Parallel Worktrees

These tasks are high-risk and benefit from isolated development:

| Task ID | Task | Risk | Worktree Branch |
|---------|------|------|-----------------|
| 2.3 | Convert Security Agent | Medium | `agent-sdk-security` |
| 2.8 | Refactor orchestrator.ts | **High** | `agent-sdk-orchestrator` |
| 2.10 | Create Code Gen Agent | **High** | `agent-sdk-codegen` |
| 2.11 | Refactor execution worker | **High** | `agent-sdk-execution` |

### Worktree Workflow

```
                    main
                      │
                      ├─────────────────────────────────────┐
                      │                                     │
                      ▼                                     ▼
        ┌─────────────────────────┐          ┌─────────────────────────┐
        │  ../vc-orchestrator     │          │  ../vc-execution        │
        │  (agent-sdk-orchestrator)│          │  (agent-sdk-execution)  │
        └─────────────────────────┘          └─────────────────────────┘
                      │                                     │
                      │  ① Implement                        │  ① Implement
                      │  ② Test locally                     │  ② Test locally
                      │  ③ Run E2E                          │  ③ Run E2E
                      │                                     │
                      ▼                                     │
        ┌─────────────────────────┐                        │
        │  Merge orchestrator     │                        │
        │  to main if passing     │                        │
        └─────────────────────────┘                        │
                      │                                     │
                      │◄──────────────────────────────────-─┘
                      │        Merge execution after
                      │        orchestrator is stable
                      ▼
                    main
              (both features)
```

### Setup Commands

```bash
#!/bin/bash
# scripts/setup-worktrees.sh

set -e

# Ensure clean main
git checkout main
git pull origin main
git status

# Create branches
for branch in agent-sdk-orchestrator agent-sdk-execution agent-sdk-security agent-sdk-codegen; do
  git branch -D $branch 2>/dev/null || true
  git checkout -b $branch
  git checkout main
done

# Create worktrees
mkdir -p ../worktrees
for branch in agent-sdk-orchestrator agent-sdk-execution; do
  worktree_path="../worktrees/vc-${branch#agent-sdk-}"
  git worktree remove $worktree_path 2>/dev/null || true
  git worktree add $worktree_path $branch
  
  # Setup each worktree
  cd $worktree_path
  npm install
  cp ../../virtual-cofounder/.env .env
  cd -
done

echo "✅ Worktrees ready:"
git worktree list
```

### Merge Strategy

```bash
#!/bin/bash
# scripts/merge-worktree.sh

BRANCH=$1

if [ -z "$BRANCH" ]; then
  echo "Usage: ./scripts/merge-worktree.sh <branch-name>"
  exit 1
fi

echo "🔀 Merging $BRANCH to main..."

# Run tests in worktree first
WORKTREE_PATH="../worktrees/vc-${BRANCH#agent-sdk-}"
cd $WORKTREE_PATH
npm run test:e2e
TEST_RESULT=$?
cd -

if [ $TEST_RESULT -ne 0 ]; then
  echo "❌ Tests failed in worktree. Fix before merging."
  exit 1
fi

# Merge
git checkout main
git pull origin main
git merge $BRANCH --no-ff -m "Merge $BRANCH: Agent SDK integration"

# Run full test suite on main
npm run test:e2e

if [ $? -eq 0 ]; then
  echo "✅ Merge successful and tests pass!"
  
  # Cleanup worktree
  git worktree remove $WORKTREE_PATH
  git branch -d $BRANCH
else
  echo "❌ Tests failed after merge. Rolling back..."
  git reset --hard HEAD~1
  exit 1
fi
```

---

## 12. Summary: Execution Timeline

```
Week 1-2: Phase 1 (Foundation)
├── Day 1-2: Migrations (Ralph: 1.3-1.7)
├── Day 3-4: Prisma + State aggregation (Sequential: 1.8-1.9)
├── Day 5-6: State Agent (Sequential: 1.10)
├── Day 7-8: Progress page (Ralph: 1.11-1.12)
├── Day 9: E2E tests + gate review
└── Day 10: Phase 1 sign-off ✓

Week 2-3: Phase 2 (Agent SDK Core)
├── Day 1: Agent registry setup (Sequential: 2.1-2.2)
├── Day 2-4: Agent conversions (Ralph: 2.4-2.7, Worktree: 2.3)
├── Day 5-7: Orchestrator refactor (Worktree: 2.8)
├── Day 8-10: Execution worker (Worktree: 2.10-2.11)
├── Day 11: Trace storage (Sequential: 2.9, 2.12)
├── Day 12: E2E tests + gate review
└── Day 13: Phase 2 sign-off ✓

Week 3-4: Phase 3 (Multi-Source Approval)
├── Day 1-2: Linear + API endpoints (Ralph: 3.1-3.5)
├── Day 3: UI buttons (Ralph: 3.6)
├── Day 4-5: Priority classifier (Sequential: 3.7-3.8)
├── Day 6: Stack ranker (Sequential: 3.9)
├── Day 7: E2E tests + gate review
└── Day 8: Phase 3 sign-off ✓

Week 4-5: Phase 4 (Launch Readiness)
├── Day 1-2: Score calculation (Ralph: 4.1-4.3)
├── Day 3-5: Progress components (Ralph: 4.4-4.7)
├── Day 6: Priority integration (Sequential: 4.8-4.9)
├── Day 7: E2E tests + gate review
└── Day 8: Phase 4 sign-off ✓

Week 5-6: Phase 5 (Polish)
├── Day 1-5: All pages (Ralph: 5.1-5.7)
├── Day 6: UX unification (Sequential: 5.8)
├── Day 7: Documentation (Sequential: 5.9)
├── Day 8: Demo video (Sequential: 5.10)
├── Day 9: Full E2E + gate review
└── Day 10: FINAL SIGN-OFF ✓
```

---

## Appendix A: File Checklist

### Files to Create

| File | Phase | Task |
|------|-------|------|
| `lib/config/feature-flags.ts` | 1 | 1.2 |
| `lib/state/aggregate.ts` | 1 | 1.9 |
| `lib/state/snapshot.ts` | 1 | 1.10 |
| `lib/agents/state-manager.ts` | 1 | 1.10 |
| `lib/agents/index.ts` | 2 | 2.1 |
| `lib/agents/security.ts` | 2 | 2.3 |
| `lib/agents/code-generation.ts` | 2 | 2.10 |
| `lib/priority/classifier.ts` | 3 | 3.7 |
| `lib/priority/ranker.ts` | 3 | 3.9 |
| `lib/launch/score.ts` | 4 | 4.1 |
| `lib/launch/checklist.ts` | 4 | 4.3 |
| `app/api/stories/[id]/approve/route.ts` | 3 | 3.3 |
| `app/api/stories/[id]/reject/route.ts` | 3 | 3.4 |
| `app/(app)/progress/page.tsx` | 1 | 1.12 |
| `app/(app)/history/page.tsx` | 5 | 5.1 |
| `app/(app)/priorities/page.tsx` | 5 | 5.2 |
| `app/(app)/projects/page.tsx` | 5 | 5.3 |
| `app/(app)/agents/page.tsx` | 5 | 5.4 |
| `app/(app)/scans/page.tsx` | 5 | 5.5 |
| `app/(app)/settings/page.tsx` | 5 | 5.6 |

### Files to Modify

| File | Phase | Task | Change |
|------|-------|------|--------|
| `package.json` | 1 | 1.1 | Add Agent SDK |
| `prisma/schema.prisma` | 1 | 1.8 | Add new models |
| `lib/orchestrator.ts` | 2 | 2.8 | Replace with Agent SDK |
| `workers/execution-worker.ts` | 2 | 2.11 | Replace with Agent SDK |
| `app/api/linear/webhook/route.ts` | 3 | 3.1 | Add execution trigger |
| `app/(app)/layout.tsx` | 1 | 1.11 | Add Progress link |
| `components/story-detail.tsx` | 3 | 3.6 | Add approval buttons |

---

## Appendix B: Quick Reference Commands

```bash
# Setup
./scripts/setup-worktrees.sh           # Create parallel worktrees
cp .env.example .env                   # Configure environment

# Ralph Method
bash ralph-impl.sh 1                   # Run Phase 1 tasks
bash ralph-impl.sh 2                   # Run Phase 2 tasks

# Testing
npm run test:e2e                       # All E2E tests
npm run test:e2e:phase1                # Phase 1 only
npm run test:e2e:critical              # Critical path only

# Worktree Management
git worktree list                      # See all worktrees
./scripts/merge-worktree.sh agent-sdk-orchestrator  # Merge back

# Rollback
./scripts/rollback-phase2.sh           # Rollback Phase 2
./scripts/emergency-rollback.sh        # Full emergency rollback

# Validation
npm run validate:story impl-1.1        # Validate specific story
npm run lint && npm run typecheck      # Code quality
```

---

*End of Implementation Plan*
