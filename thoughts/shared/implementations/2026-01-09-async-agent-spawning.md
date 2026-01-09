# Async Agent Spawning Implementation

**Date:** 2026-01-09
**Status:** ✅ Implemented, Ready for Production
**Issue:** Chat timeouts when spawning long-running agents

## Solution Overview

Instead of waiting for spawned agents to complete (causing timeouts), we now:
1. **Create a Story** immediately when agent is spawned
2. **Create a Linear issue** to track progress
3. **Enqueue to execution queue** for background processing
4. **Return Linear link immediately** to user (no waiting)
5. **Agent executes via standard flow** with Slack notifications

## Architecture

```
User: "build email capture"
        ↓
HoP: "I'll spawn a codegen agent..."
        ↓
Chat Worker detects Task tool usage
        ↓
┌─────────────────────────────────┐
│ IMMEDIATE (< 1 second):         │
│ 1. Create Story in DB           │
│ 2. Create Linear issue          │
│ 3. Create AgentSession          │
│ 4. Enqueue to execution queue   │
│ 5. Return Linear link to user   │
│ 6. Close chat (done)            │
└─────────────────────────────────┘
        ↓
User sees: "✅ Spawned Code Generation agent!
            Tracking in Linear: [link]
            The agent will execute in the background..."
        ↓
┌────────────────────────────────┐
│ BACKGROUND (5-30 minutes):     │
│ Execution Worker picks up job  │
│ → Runs agent with Agent SDK    │
│ → Creates PR                   │
│ → Updates Linear issue         │
│ → Posts to Slack               │
│ → Updates AgentSession         │
└────────────────────────────────┘
```

## Changes Made

### 1. Chat Worker (`workers/chat-worker.ts`)

#### Added Imports (lines 26-28)
```typescript
import { createLinearTask } from '../lib/linear';
import { enqueueStoryForExecution } from '../lib/queue/execution';
import { randomUUID } from 'crypto';
```

#### Extract projectId from Job Data (line 423)
```typescript
const { messageId, userContent, workspaceId, conversationId, projectId } = job.data;
```

#### Async Story Creation on Agent Spawn (lines 529-625)
When `tool_progress` detects Task tool usage:

**Create Story:**
```typescript
const story = await prisma.story.create({
  data: {
    workspaceId,
    runId: randomUUID(),
    projectId: projectId || workspaceId,
    title: `${agentName}: ${prompt.substring(0, 100)}`,
    rationale: agentPrompt || `Requested via chat to spawn ${spawnedAgent} agent`,
    priority: 'medium',
    priorityLevel: 'P1', // User explicitly requested
    priorityScore: 75,
    policy: 'auto_safe', // Auto-execute
    status: 'pending',
    advancesLaunchStage: false,
  },
});
```

**Create AgentSession (for project history):**
```typescript
await prisma.agentSession.create({
  data: {
    storyId: story.id,
    projectId: story.projectId,
    agentName: agentDef?.name || spawnedAgent,
    agentType: 'specialist',
    status: 'running',
    thinkingTrace: [{
      turn: 1,
      thinking: `Spawned from chat by user request`,
      action: 'spawn',
      prompt: agentPrompt,
      timestamp: new Date().toISOString()
    }],
    toolCalls: [],
  },
});
```

**Why AgentSession:** Shows spawned agent in project's "Agents" and "History" tabs!

**Create Linear Issue:**
```typescript
const linearTask = await createLinearTask({
  teamId: process.env.LINEAR_TEAM_ID,
  title: story.title,
  description: `**Agent:** ${agentName}\n\n**Rationale:**\n${story.rationale}\n\n**Spawned from:** Chat\n**Priority:** P1`,
  priority: 2, // High
});

await prisma.story.update({
  where: { id: story.id },
  data: {
    linearTaskId: linearTask.id,
    linearIssueUrl: linearTask.url,
  },
});
```

**Enqueue for Execution:**
```typescript
await enqueueStoryForExecution(story.id, 'P1', 'dashboard');
```

**Return Immediately to User:**
```typescript
const storyMessage = linearUrl
  ? `✅ Spawned ${agentName} agent! Tracking in Linear: ${linearUrl}\n\nThe agent will execute in the background and update you when complete.`
  : `✅ Spawned ${agentName} agent! Story created (${story.id})\n\nThe agent will execute in the background.`;

await publishToStream(messageId, {
  type: 'delta',
  content: `\n\n${storyMessage}`
});

fullContent += `\n\n${storyMessage}`;
```

**Chat continues normally, user doesn't wait!**

#### Improved Action Buttons (lines 240-257)
**Before:**
- Label: "✅ Yes, go ahead" (generic)
- Label: "❌ No, not now"

**After:**
- Extracts action from HoP's question
- Label: "✅ Spawn a security agent" (contextual!)
- Label: "❌ Not now"

```typescript
// Extract action from patterns like "should I spawn a security agent?"
const action = match?.[1]?.trim() || '';

if (action && action.length > 3) {
  const capitalizedAction = action.charAt(0).toUpperCase() + action.slice(1);

  actions.push(
    { label: `✅ ${capitalizedAction}`, value: `Yes, ${action}`, style: 'success' },
    { label: '❌ Not now', value: 'No, let\'s hold off on that', style: 'secondary' }
  );
}
```

### 2. HoP Chat Prompt (`lib/agents/chat.ts`)

Kept the original prompt as-is since we're no longer filtering agents. HoP can spawn any agent, and the async flow handles timeouts.

## User Experience

### Before (Timeout)
```
User: "build email capture"
HoP: "I'll spawn a codegen agent..."
        [agent spawns]
        [user waits 2 minutes]
        [timeout]
User sees: "Sorry, the request timed out" ❌
```

### After (Async)
```
User: "build email capture"
HoP: "I'll spawn a codegen agent..."
        [agent spawns]
        [story created]
        [< 1 second passes]
User sees: "✅ Spawned Code Generation agent!
            Tracking in Linear: https://linear.app/...
            The agent will execute in the background..." ✅

[User continues chatting or does other work]

[10 minutes later]
Slack notification: "🎉 Code Generation complete! PR: https://github.com/..."
```

## Notification Flow

### Chat (Immediate)
- User gets Linear link immediately
- Can click to see story details
- Can continue chatting

### Linear (Immediate)
- Issue created with P1 priority
- Shows agent type and rationale
- Auto-updates as agent progresses

### Slack (When Complete)
- Existing `sendSlackNotification` in execution-worker
- Posts when PR is created
- Includes PR link and story details
- ✅ Already implemented!

### Dashboard Chat (TODO)
- Not currently implemented
- Future enhancement: Post completion message to chat
- Would use Redis pub/sub similar to current streaming

### Project Agents Tab (Immediate)
- AgentSession shows in project's "Agents" tab
- Status: "running" → "completed"
- Shows thinking trace with spawn reason
- ✅ Implemented!

### Project History Tab (Immediate)
- Story shows in project's "History" / "Stories" tab
- Links to Linear issue
- Shows execution progress
- ✅ Already works!

## Data Model

### Story Record
```json
{
  "id": "uuid",
  "workspaceId": "uuid",
  "runId": "uuid",
  "projectId": "uuid",
  "title": "Code Generation: Build email capture feature",
  "rationale": "User requested via chat: build email capture for hero section with Resend integration",
  "priority": "medium",
  "priorityLevel": "P1",
  "priorityScore": 75,
  "policy": "auto_safe",
  "status": "pending" → "approved" → "in_progress" → "completed",
  "linearTaskId": "linear-uuid",
  "linearIssueUrl": "https://linear.app/...",
  "prUrl": "https://github.com/..." (after completion)
}
```

### AgentSession Record
```json
{
  "id": "uuid",
  "storyId": "uuid",
  "projectId": "uuid",
  "agentName": "Code Generation",
  "agentType": "specialist",
  "status": "running",
  "thinkingTrace": [
    {
      "turn": 1,
      "thinking": "Spawned from chat by user request",
      "action": "spawn",
      "prompt": "Build email capture feature...",
      "timestamp": "2026-01-09T12:00:00Z"
    }
  ],
  "toolCalls": []
}
```

### Linear Issue
```
Title: Code Generation: Build email capture feature

**Agent:** Code Generation
**Rationale:**
User requested via chat: build email capture for hero section with Resend integration

**Spawned from:** Chat
**Priority:** P1

[Auto-updates as agent executes]
```

## Testing Instructions

### 1. Test Quick Agent (< 2 min)
```
User: "analyze security on warmstart"

Expected:
✅ "Spawned Security agent! Tracking in Linear: [link]"
✅ Agent completes in < 2 minutes
✅ Results posted to Slack
✅ AgentSession shows in Wishmode > Agents tab
```

### 2. Test Long-Running Agent (5-30 min)
```
User: "build email capture feature for the hero"

Expected:
✅ "Spawned Code Generation agent! Tracking in Linear: [link]"
✅ Chat returns immediately (< 1 second)
✅ Can continue chatting
✅ Check Linear: Issue created with P1
✅ Check Dashboard: Story in queue at /queue
✅ Check Project > Agents: AgentSession visible
✅ Wait 10-15 minutes
✅ Check Slack: PR notification posted
✅ Check Linear: Issue updated with PR link
✅ Check Project > Agents: Status = "completed"
```

### 3. Test Action Buttons
```
HoP asks: "Should I spawn a security agent to analyze this?"

Expected buttons:
✅ "Spawn a security agent" (not "Yes, go ahead")
❌ "Not now" (not "No, not now")
```

### 4. Check Logs
```bash
railway logs --service chat-worker | grep -E "Agent spawned|Created story|Enqueued|Linear issue"

Expected:
[Chat Worker] Agent spawned: codegen
[Chat Worker] Created story xxx for codegen
[Chat Worker] Created AgentSession for codegen
[Chat Worker] Created Linear issue: https://linear.app/...
[Chat Worker] Enqueued story xxx for execution (job: yyy)
```

## Files Changed

1. **workers/chat-worker.ts**
   - Added imports: createLinearTask, enqueueStoryForExecution, randomUUID
   - Extract projectId from job.data
   - Async story creation on agent spawn (lines 529-625)
   - Improved action button labels (lines 240-257)

2. **lib/agents/chat.ts**
   - No changes needed (kept original prompt)

## Environment Variables Required

```bash
# Linear integration (for issue creation)
LINEAR_API_KEY=lin_api_xxx
LINEAR_TEAM_ID=team-uuid

# Already exist
REDIS_URL=rediss://...
DATABASE_URL=postgresql://...
```

## Success Criteria

- [x] Code implemented
- [x] TypeScript compiles without errors
- [ ] Deployed to Railway
- [ ] User can spawn agents without timeout
- [ ] Story created immediately with Linear link
- [ ] AgentSession visible in project Agents tab
- [ ] Execution happens in background
- [ ] Slack notifications work on completion
- [ ] Action buttons show contextual labels

## Future Enhancements

### Dashboard Chat Notifications
When agent completes, post to chat:
```typescript
await publishToStream(originalMessageId, {
  type: 'agent_complete',
  agent: agentName,
  storyId: story.id,
  prUrl: pr.url,
  message: `🎉 ${agentName} completed! PR: ${pr.url}`
});
```

Would require:
- Store original messageId in Story metadata
- Execution worker publishes completion to Redis
- Dashboard SSE endpoint forwards to user

### Multiple Agent Orchestration
HoP could spawn multiple agents:
```
User: "full audit on warmstart"
HoP spawns: security, seo, performance, accessibility
→ 4 stories created
→ 4 Linear issues
→ All execute in parallel
→ Results consolidated
```

### Agent Progress Streaming
Stream agent progress in real-time:
```
Linear issue auto-updates:
- ✅ Cloned repository
- ✅ Analyzed codebase
- 🔄 Writing email capture component...
- ⏳ Running tests...
```

## Migration Notes

**No database migrations needed!** All fields already exist:
- Story.linearTaskId
- Story.linearIssueUrl
- AgentSession (all fields exist)

**Backward compatible:** Existing stories/agents unaffected.

## Deployment Checklist

```bash
# 1. Verify environment variables
railway variables --service chat-worker

# Should include:
# LINEAR_API_KEY
# LINEAR_TEAM_ID
# REDIS_URL
# DATABASE_URL

# 2. Commit changes
git add workers/chat-worker.ts lib/agents/chat.ts
git commit -m "feat: Async agent spawning with immediate Linear tracking

- Create story + Linear issue immediately when agent spawns
- Enqueue to execution queue for background processing
- Return Linear link to user (no waiting/timeout)
- Add AgentSession for project Agents/History tabs
- Improve action buttons to show contextual labels
- User can continue chatting while agent executes
- Slack notifications work via existing execution flow"

# 3. Push to trigger deployment
git push origin main

# 4. Monitor deployment
railway logs --service chat-worker --follow

# 5. Test in production
# Chat with HoP: "build X feature"
# Verify: Immediate response with Linear link
# Verify: Story in queue
# Verify: AgentSession in project
# Wait: Check Slack for completion

# 6. Monitor for errors
railway logs --service chat-worker | grep -i error
railway logs --service execution-worker | grep -i error
```

## Rollback Plan

If issues occur:
```bash
# Revert commit
git revert HEAD
git push origin main

# Or disable Linear integration temporarily
railway variables --service chat-worker
# Unset LINEAR_API_KEY (stories still created, no Linear issues)
```

Stories will still be created and queued, just no Linear integration.
