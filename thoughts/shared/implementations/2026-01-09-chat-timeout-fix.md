# Chat Timeout Fix - Exclude Long-Running Agents

**Date:** 2026-01-09
**Status:** ✅ Implemented, Ready for Deployment
**Issue:** Chat timing out when HoP spawns codegen agents

## Problem

User asked HoP to "build email capture feature" in chat:
1. HoP decided to spawn a **codegen agent** to build it
2. Codegen agents take 5-30 minutes to analyze, design, and write code
3. Chat has a **2-minute timeout** (SSE endpoint in Vercel)
4. After 2 minutes: "Sorry, the request timed out" ❌
5. But the agent keeps running in background, can't return results

## Root Cause

**Chat is designed for quick responses, not long-running operations.**

- **Quick agents** (security, analytics, seo): < 2 minutes → ✅ OK in chat
- **Code agents** (codegen, test, review, api): 5-30 minutes → ❌ Timeout

When HoP spawns a code agent in chat, it's trying to execute a 30-minute operation while the user waits 2 minutes.

## Solution Implemented

### 1. Filter Out Long-Running Agents in Chat Worker

**File:** `workers/chat-worker.ts` (lines 450-458)

```typescript
// Get spawnable agents
const subagents = convertToSDKAgents();

// Exclude long-running agents from chat (they take 5-30 min, chat has 2 min timeout)
// HoP should create stories for code changes instead of spawning these directly
const EXCLUDED_AGENTS_IN_CHAT = ['codegen', 'test', 'review', 'api'];

for (const agentName of EXCLUDED_AGENTS_IN_CHAT) {
  delete subagents[agentName];
}

console.log(`[Chat Worker] Running Agent SDK with ${Object.keys(subagents).length} spawnable agents (excluded: ${EXCLUDED_AGENTS_IN_CHAT.join(', ')})`);
```

**What this does:**
- Removes codegen, test, review, api from spawnable agents in chat
- HoP physically cannot spawn these agents during chat
- Only quick analysis agents available (security, analytics, seo, etc.)

### 2. Updated HoP Chat Prompt

**File:** `lib/agents/chat.ts` (lines 84-93)

Added clear guidance to HoP:

```markdown
CODE IMPLEMENTATION REQUESTS:
When the user asks you to build, implement, or modify code:
- DO NOT spawn codegen, test, review, or api agents directly in chat
- Instead, create a clear plan and tell the user you'll create a story for it
- Example: "Perfect! Here's my plan: [details]. I'll create a story for this
  so the execution team can build it. Should take about 10-15 minutes once they start."
- This ensures work gets properly queued and doesn't timeout in chat

QUICK ANALYSIS vs CODE IMPLEMENTATION:
- Quick analysis agents (security, seo, analytics) finish in <2 min → OK to spawn in chat
- Code implementation (codegen, test, api) takes 5-30 min → Create stories instead
```

**What this does:**
- Teaches HoP the difference between quick analysis and code implementation
- HoP will create stories for code changes instead of spawning agents
- Better UX: User gets immediate plan, execution happens in background

## Expected Behavior After Fix

### Before:
```
User: "build email capture"
HoP: "I'll spawn a codegen agent..."
        [spawns codegen agent]
        [agent runs for 10 minutes]
        [2 minutes pass]
User sees: "Sorry, the request timed out" ❌
```

### After:
```
User: "build email capture"
HoP: "Perfect! Here's my plan:
      - Add email input to hero section
      - Hook up to Resend API
      - Store emails in database
      - Send confirmation email

      I'll create a story for this so the execution team can build it.
      Should take about 10-15 minutes once they start."
User: ✅ Gets immediate response with clear plan
[Story created in queue]
[Execution happens separately, user can check status]
```

## What Users Can Still Do in Chat

✅ **Quick Analysis (< 2 min):**
- "analyze security on warmstart" → spawns security agent
- "check SEO for VC" → spawns seo agent
- "verify analytics setup" → spawns analytics agent
- "check domain health" → spawns domain agent
- "audit performance" → spawns performance agent
- "review accessibility" → spawns accessibility agent

✅ **Planning & Discussion:**
- "what should I focus on?"
- "status update on projects"
- "explain this priority"
- "help me prioritize features"

✅ **Priority Management:**
- "P0: fix login bug"
- "P1: add user profiles"
- "approved" / "approve all P0s"

❌ **Code Implementation (5-30 min):**
- ~~"build email capture"~~ → Creates story instead
- ~~"fix the login bug"~~ → Creates story instead
- ~~"add user authentication"~~ → Creates story instead
- ~~"write tests for X"~~ → Creates story instead

## Agents Available in Chat

**Quick Analysis Agents (< 2 min, OK to spawn):**
- security
- analytics
- domain
- seo
- deployment
- performance
- accessibility
- database
- design (mockups, not code)
- docs
- research

**Code Agents (5-30 min, EXCLUDED from chat):**
- ~~codegen~~
- ~~test~~
- ~~review~~
- ~~api~~

These run via the execution queue when stories are approved.

## Files Changed

1. **workers/chat-worker.ts**
   - Added `EXCLUDED_AGENTS_IN_CHAT` constant
   - Filter out long-running agents before passing to SDK
   - Updated log message to show excluded agents

2. **lib/agents/chat.ts**
   - Added "CODE IMPLEMENTATION REQUESTS" section
   - Added "QUICK ANALYSIS vs CODE IMPLEMENTATION" guidance
   - Updated available agents list

## Deployment

```bash
# Commit changes
git add workers/chat-worker.ts lib/agents/chat.ts
git commit -m "fix: Exclude long-running agents from chat to prevent timeouts

- Filter out codegen, test, review, api from chat spawnable agents
- These agents take 5-30 min, chat has 2 min timeout
- Updated HoP prompt to create stories for code changes instead
- Users get immediate response with plan, execution happens via queue"

# Push to trigger Railway deployment
git push origin main
```

## Testing Instructions

### 1. Test Code Implementation Request

```
User: "build email capture feature for the hero section"

Expected HoP response:
- ✅ Provides clear plan/design
- ✅ Says "I'll create a story for this"
- ✅ Mentions execution time estimate
- ✅ NO "spawning codegen agent" message
- ✅ NO timeout error
```

### 2. Test Quick Analysis Request

```
User: "analyze security on warmstart"

Expected HoP response:
- ✅ "I'll spawn a security agent..."
- ✅ Agent completes within 2 minutes
- ✅ Returns findings
- ✅ NO timeout
```

### 3. Check Railway Logs

```bash
railway logs --service chat-worker | grep "spawnable agents"

Expected output:
"Running Agent SDK with 13 spawnable agents (excluded: codegen, test, review, api)"
```

## Alternative Solutions Considered

### Option 2: Increase Timeout to 10 Minutes
```typescript
const WORKER_TIMEOUT_MS = 600000; // 10 minutes
```
**Rejected:** Bad UX. User waits 10 minutes staring at loading spinner.

### Option 3: Make Agent Spawning Async
- HoP spawns agent
- Returns immediately: "I'll build this! I'll message you when done."
- Agent runs in background
- New chat message when complete

**Status:** Better long-term solution, but requires more work:
- Background job tracking
- Notification system
- Resume agent context when sending completion message

Could implement this later if needed.

## Success Criteria

- [x] Code changes implemented
- [x] TypeScript compiles without errors
- [ ] Deployed to Railway
- [ ] User can request code changes without timeout
- [ ] Quick analysis agents still work
- [ ] HoP creates stories for code implementation

## Open Questions

1. **Should design agent be excluded?**
   - Currently: Included (creates mockups, fast)
   - If it times out: Add to excluded list

2. **How does story creation work?**
   - Need to verify HoP can create stories in chat mode
   - May need to add story creation capability

3. **What about database agent?**
   - Currently: Included
   - May need to test if it times out on complex schemas

## Next Steps

1. Deploy to Railway
2. Test with real user requests
3. Monitor chat worker logs
4. Check if any other agents need exclusion
5. Consider implementing async agent spawning (Option 3) if needed
