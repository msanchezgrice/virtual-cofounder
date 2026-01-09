# Async Story Creation for Chat - Final Implementation

**Date:** 2026-01-09
**Status:** ✅ Implemented, Deploying to Railway
**Commit:** `959a96c`

## Problem Solved

Chat was timing out (2 min limit) when trying to spawn agents because the Agent SDK `query()` function was blocking until the entire agent execution completed.

## Solution Implemented

**Async story creation pattern**: HoP responds immediately with a plan, system creates story + Linear issue, returns link to user, work executes in background.

## Changes Made

### 1. Chat Worker (`workers/chat-worker.ts`)

#### Removed Agent Spawning (Line 456-468)
```typescript
// BEFORE: agents: subagents, (blocking SDK calls)
// AFTER: No agents option - HoP cannot spawn, must create stories instead

console.log(`[Chat Worker] Running Agent SDK in chat mode (no spawnable agents)`);

const sdkOptions: SDKOptions = {
  allowedTools: ['Task', 'Read', 'Grep', 'WebFetch'],
  tools: ['Task', 'Read', 'Grep', 'WebFetch'],
  // agents: subagents,  // REMOVED
  maxTurns: 5,
  persistSession: false,
  includePartialMessages: true,
};
```

#### Added Story Detection & Creation (Lines 731-826)
```typescript
// After SDK stream finishes, check if HoP wants to create a story
const storyRequest = detectStoryCreationRequest(fullContent);
if (storyRequest) {
  // 1. Create story in database
  const story = await prisma.story.create({ ... });

  // 2. Create AgentSession (shows in project Agents tab)
  await prisma.agentSession.create({ ... });

  // 3. Create Linear issue
  const linearTask = await createLinearTask({ ... });

  // 4. Enqueue for execution
  await enqueueStoryForExecution(story.id, 'P1', 'chat');

  // 5. Append Linear link to response
  fullContent += `\n\n✅ **Story created!** Track progress: ${linearUrl}`;
  await publishToStream(messageId, { type: 'delta', content: trackingMessage });
}
```

#### Added Story Detection Function (Lines 309-349)
```typescript
function detectStoryCreationRequest(content: string): StoryCreationRequest | null {
  // Patterns: "I'll create a story for...", "I'll create a ... story"
  const storyPatterns = [
    /I'll create a story (?:for|to)\s+(.+?)(?:\.|$)/i,
    /I'll create (?:a|an)\s+(.+?)\s+story/i,
    /creating a story (?:for|to)\s+(.+?)(?:\.|$)/i,
  ];

  // Determine agent type from content
  if (/security|vulnerability/i.test(content)) agentType = 'Security';
  else if (/build|implement|create|add/i.test(content)) agentType = 'Code Generation';
  // ... etc

  return {
    title: `${agentType}: ${workDescription}`,
    description: bulletPoints || workDescription,
    agentType,
  };
}
```

### 2. HoP Chat Prompt (`lib/agents/chat.ts`)

#### Updated Instructions (Lines 45-51)
```markdown
4. ANALYSIS & IMPLEMENTATION REQUESTS - When user asks you to do work:
   - Tell the user you'll create a story for it with Linear tracking
   - Explain what you'll do in 2-3 bullet points
   - Say: "I'll create a story for this and you'll be able to track progress in Linear."
   - Example: "analyze security on warmstart" → "I'll create a story to run a security analysis..."
   - Example: "build email capture" → "I'll create a story to build the email capture feature..."
   - The system will automatically create the story and return a Linear link to the user
```

#### Removed Agent Spawning References (Lines 70-88)
```markdown
DO NOT:
- Try to do work directly in chat (no spawning agents)

WORK EXECUTION:
All work (analysis, implementation, fixes, features) goes through the story system:
- User asks for work → You explain what you'll do → System creates story with Linear tracking
- User gets Linear link immediately to track progress
- Work executes in background via execution queue
- This keeps chat fast and responsive

TYPES OF WORK:
- Analysis: security audit, SEO check, performance review
- Implementation: new features, bug fixes, refactoring
- Testing: write tests, run test suites
- Documentation: write docs, update README
- Research: market analysis, competitor research
```

## How It Works

### User Flow

```
User: "build email capture feature for the hero"

↓ (< 1 second)

HoP: "Perfect! Here's my plan:
      - Add email input to hero section
      - Integrate with Resend API
      - Store emails in database
      - Send confirmation emails

      I'll create a story for this and you'll be able to track progress in Linear."

↓ (system detects "I'll create a story")

System:
  1. Creates Story (title: "Code Generation: build email capture feature...")
  2. Creates AgentSession (shows in project's Agents tab)
  3. Creates Linear issue (high priority)
  4. Enqueues to execution queue
  5. Appends to chat: "✅ Story created! Track progress: https://linear.app/..."

↓ (user sees immediately)

User: Sees full response with Linear link in < 2 seconds

↓ (background, 5-30 min later)

Execution Worker:
  - Picks up story from queue
  - Runs Code Generation agent
  - Creates PR
  - Updates Linear issue
  - Posts to Slack
```

### Data Created

**Story:**
```json
{
  "title": "Code Generation: Build email capture feature for hero",
  "rationale": "- Add email input to hero section\n- Integrate with Resend API...",
  "priority": "medium",
  "priorityLevel": "P1",
  "policy": "auto_safe",
  "status": "pending",
  "linearIssueUrl": "https://linear.app/...",
}
```

**AgentSession:**
```json
{
  "agentName": "Code Generation",
  "agentType": "specialist",
  "status": "pending",
  "thinkingTrace": [{
    "turn": 1,
    "thinking": "Requested from chat by user",
    "action": "chat_request",
    "prompt": "build email capture feature for the hero"
  }]
}
```

**Linear Issue:**
```
Title: Code Generation: Build email capture feature for hero

**Type:** Code Generation
**Description:**
- Add email input to hero section
- Integrate with Resend API
- Store emails in database
- Send confirmation emails

**Requested from:** Chat
**Priority:** P1
```

## Benefits

✅ **Fast Chat Response**: < 2 seconds (was timing out at 2 minutes)
✅ **Linear Tracking**: User gets link immediately
✅ **Background Execution**: Work happens via standard execution queue
✅ **Project Visibility**: AgentSession shows in Agents tab
✅ **Slack Notifications**: Existing notification flow works
✅ **Consistent Pattern**: Same queue/execution flow as orchestrator

## Testing Instructions

### 1. Test Analysis Request
```
User: "analyze security on warmstart"

Expected:
✅ HoP responds: "I'll create a story to run a security analysis..."
✅ System detects "I'll create a story"
✅ Story created with title: "Security: run a security analysis..."
✅ Linear issue created
✅ AgentSession created
✅ Response includes Linear link
✅ Total time: < 2 seconds
```

### 2. Test Implementation Request
```
User: "build email capture feature for the hero"

Expected:
✅ HoP responds with plan + "I'll create a story for this..."
✅ Story created with title: "Code Generation: build email capture..."
✅ Linear issue created
✅ Response includes Linear link
✅ Total time: < 2 seconds
```

### 3. Test Bug Fix Request
```
User: "fix the login bug"

Expected:
✅ HoP responds: "I'll create a story to fix the login bug..."
✅ Story created with title: "Bug Fix: fix the login bug"
✅ Linear issue created
✅ Response includes Linear link
```

### 4. Check Execution Flow
```bash
# After story is created, check it's in the queue
DATABASE_URL="..." npx tsx -e "
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

const stories = await prisma.story.findMany({
  where: { status: 'pending', priorityLevel: 'P1' },
  orderBy: { createdAt: 'desc' },
  take: 5
});

console.log('Pending P1 stories:', stories.map(s => s.title));
"

# Wait 1-2 minutes, check execution worker picks it up
railway logs --service execution-worker | grep -E "Processing story|Story.*approved"

# Check project Agents tab shows the AgentSession
# Navigate to project detail > Agents tab
# Should see agent with status 'pending' or 'running'
```

### 5. Verify Railway Logs
```bash
# Check chat worker logs for new pattern
railway logs --service chat-worker | grep -E "chat mode|Detected story|Created story|Linear issue"

# Expected logs:
[Chat Worker] Running Agent SDK in chat mode (no spawnable agents)
[Chat Worker] Detected story creation request: Security: analyze...
[Chat Worker] Created story abc123 for chat request
[Chat Worker] Created Linear issue: https://linear.app/...
[Chat Worker] Enqueued story abc123 for execution
```

## Deployment Status

**Commit pushed:** ✅ `2fe610c` (forced Railway redeploy)
**Railway deployed:** ✅ Connected to GitHub, deployed successfully
**New code running:** ✅ Confirmed "Running Agent SDK in chat mode (no spawnable agents)"

### Check Deployment:
```bash
# Look for "chat mode" log (new code)
railway logs --service chat-worker | grep "chat mode" | tail -1

# Should see:
[Chat Worker] Running Agent SDK in chat mode (no spawnable agents)

# If you see:
[Chat Worker] Running Agent SDK with 17 spawnable agents
# → Old code still running, deployment not complete yet
```

## Rollback Plan

If issues occur:
```bash
# Revert to previous commit (with agent spawning disabled)
git revert 959a96c
git push origin main

# Or restore agent spawning (will cause timeouts again)
git revert 959a96c 16fefb3 29701eb 20ebc13
git push origin main
```

## Next Steps

1. ✅ Code implemented
2. ⏳ Railway deployment in progress
3. ⏳ Test chat with real requests
4. ⏳ Verify stories created correctly
5. ⏳ Verify Linear issues created
6. ⏳ Check execution worker picks up stories
7. ⏳ Confirm Slack notifications work

## Success Criteria

- [x] Code compiles without errors
- [x] Agent spawning removed from chat
- [x] Story detection function implemented
- [x] Linear issue creation implemented
- [x] AgentSession creation implemented
- [x] Deployed to Railway
- [x] Chat responds in < 2 seconds
- [x] Story detection works (confirmed in logs)
- [⚠️] Story creation blocked by missing project_id (see Known Issues)
- [ ] Linear links returned to user (blocked by above)
- [ ] Execution worker processes stories (blocked by above)
- [ ] Slack notifications work on completion (blocked by above)
- [ ] AgentSessions visible in project Agents tab (blocked by above)

## Test Results (2026-01-09 17:05)

### ✅ Working:
1. **Railway deployment**: Successfully deployed after connecting GitHub
2. **New code running**: Logs confirm "Running Agent SDK in chat mode (no spawnable agents)"
3. **Story detection**: Pattern matching works - detected "Security: Run a comprehensive security analysis on warmstart"
4. **Chat response time**: < 2 seconds (no timeout)

### ⚠️ Blocked:
**Foreign key constraint error** when creating story:
```
Foreign key constraint violated: `completions_project_id_fkey (index)`
```

**Root Cause**:
- Frontend chat UI doesn't send `projectId` when creating messages
- API route accepts `projectId` but it's undefined (line 54: `app/api/chat/route.ts`)
- Worker tries to create story with `projectId || workspaceId` (line 839: `workers/chat-worker.ts`)
- Using `workspaceId` as fallback doesn't match existing projects in DB

**Logs showing the issue**:
```
[Chat Worker] Detected story creation request: Security: Rrun a comprehensive security analysis on warmstart
[Chat Worker] Error creating story from chat request: PrismaClientKnownRequestError:
Invalid `prisma.story.create()` invocation:
Foreign key constraint violated: `completions_project_id_fkey (index)`
```

### Fix Required:

**Option 1 (Quick Fix)**: Default to first project in workspace
```typescript
// In workers/chat-worker.ts around line 835
const defaultProject = await prisma.project.findFirst({
  where: { workspaceId },
  orderBy: { createdAt: 'asc' }
});

const story = await prisma.story.create({
  data: {
    projectId: projectId || defaultProject?.id || workspaceId,
    // ... rest
  }
});
```

**Option 2 (Proper Fix)**: Update frontend to send projectId
```typescript
// In app/(dashboard)/chat/page.tsx or wherever chat sends messages
await fetch('/api/chat', {
  method: 'POST',
  body: JSON.stringify({
    content: message,
    projectId: currentProject?.id,  // ADD THIS
    conversationId: 'main'
  })
});
```

## Open Questions

1. **Should we also apply this to orchestrator?**
   - User said "ok yes to be clear we want the orchestrator to create linear tasks and spawn subagents to handle those tasks"
   - This suggests orchestrator should ALSO use async spawning
   - Currently orchestrator still tries to spawn directly via SDK

2. **Dashboard chat notifications?**
   - User mentioned "dashboard chat" notifications might not be implemented
   - Slack works, but native dashboard chat might need work

3. **Pattern matching improvements?**
   - Current patterns: "I'll create a story for...", "I'll create a ... story"
   - May need to expand patterns based on real HoP responses
