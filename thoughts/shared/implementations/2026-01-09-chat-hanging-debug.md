# Chat Hanging Issue - Debug Investigation

**Date:** 2026-01-09
**Status:** 🔍 Debugging
**Issue:** Chat shows loading indicator indefinitely, no async agent spawning happening

## Problem

After deploying async agent spawning code:
- Chat completes jobs successfully (Railway logs show "Job X completed")
- But NO agent spawning logs appear
- NO story creation logs
- NO Linear issue creation logs
- User sees hanging loading indicator

## What We Know

### Logs Show This Sequence:
```
[Chat Worker] Processing message xxx
[Chat Worker] Running Agent SDK with 17 spawnable agents
[Chat Worker] Completed message xxx, length: YYY
[Chat Worker] Job N completed
```

### Expected But Missing Logs:
```
[Chat Worker] Starting SDK stream for message xxx
[Chat Worker] Received message type: assistant
[Chat Worker] Received message type: stream_event
[Chat Worker] Detected Task tool in stream_event
[Chat Worker] Agent spawned: codegen
[Chat Worker] Created story xxx for codegen
[Chat Worker] SDK stream finished for message xxx
```

## Investigation Steps

### Step 1: Added Message Type Logging
**Goal:** See what message types SDK emits
**Result:** NO logs appeared - for-await loop never logs anything

### Step 2: Added Task Tool Detection in stream_event
**Goal:** Check if SDK uses stream_event instead of tool_progress
**Result:** Code added but no logs yet (deployment pending)

### Step 3: Added Boundary Logging
**Goal:** See if for-await loop is entered/exited
**Code Added:**
- Before loop: "Starting SDK stream for message xxx"
- After loop: "SDK stream finished for message xxx"
**Result:** Neither log appears! Loop is never entered.

### Step 4: Added query() Call Debugging (CURRENT)
**Goal:** Understand what query() returns
**Code Added:**
```typescript
console.log(`[Chat Worker] SDK options configured, calling query()...`);
agentQuery = query({ prompt, options: sdkOptions });
console.log(`[Chat Worker] query() returned, type: ${typeof agentQuery}, isAsyncIterable: ${!!agentQuery[Symbol.asyncIterator]}`);
console.log(`[Chat Worker] Starting SDK stream for message ${messageId}`);
```

This will tell us:
1. If query() is being called
2. What type it returns
3. If it's actually an async iterable

## Hypothesis

**Most Likely:** The Agent SDK `query()` function is NOT returning an async iterable. Possible reasons:

1. **SDK API Changed:** Recent SDK release changed return type
2. **Wrong Import:** We're importing the wrong function
3. **Synchronous Return:** query() returns a Promise or synchronous result, not async iterator
4. **Error Thrown:** query() throws before returning (but we'd see error logs)

**Less Likely:**
- Railway deployment issue (we see "Running Agent SDK" log)
- Console log buffering (other logs work fine)

## Next Steps

### A. If query() Doesn't Return Async Iterable

Need to check Agent SDK documentation:
```bash
# Check SDK version
grep "@anthropic-ai/claude-agent-sdk" package.json

# Check SDK exports
npx tsx -e "import * as sdk from '@anthropic-ai/claude-agent-sdk'; console.log(Object.keys(sdk))"
```

Possible fixes:
- Use different function (runAgent? executeAgent?)
- Await query() first: `const result = await query(...)`
- Use SDK in non-streaming mode

### B. If query() IS Async Iterable But Loop Doesn't Execute

Check if:
- Loop exits immediately (empty iterator)
- Symbol.asyncIterator is implemented but broken
- Need to call .stream() or similar method

### C. Alternative Approach: Don't Use SDK for Chat

If SDK doesn't work for streaming in chat context:
1. HoP responds with plan immediately
2. Creates story with Linear link
3. Returns Linear link to user
4. Story goes to execution queue
5. Execution worker runs the actual agent

This is the **async spawning pattern** we wanted anyway!

## Code Locations

### chat-worker.ts
- **Line 459:** "Running Agent SDK" log (WORKS)
- **Line 471:** SDK options configured log (TO BE TESTED)
- **Line 476:** query() call (TO BE TESTED)
- **Line 480:** query() returned log (TO BE TESTED)
- **Line 490:** "Starting SDK stream" log (NEVER APPEARS)
- **Line 492:** for-await loop start (NEVER EXECUTES)
- **Line 721:** "SDK stream finished" log (NEVER APPEARS)
- **Line 741:** "Completed message" log (WORKS)

### Async Spawning Code
- **Lines 527-625:** Tool_progress handler with story creation
- **Lines 513-516:** Stream_event Task detection (NEW)

## Current Deployment

Waiting for Railway to deploy commit `16fefb3` with query() debugging.

Once deployed, check logs for:
```bash
railway logs --service chat-worker | grep -E "SDK options configured|query\\(\\) returned|Starting SDK stream"
```

## User Clarification

User confirmed they want:
- **All agents** (even fast ones) attached to stories
- Linear link returned immediately
- No waiting in chat
- Execution happens in background via standard queue
- This applies to orchestrator AND chat

So even if SDK streaming works, we might want to skip it and go straight to async spawning pattern!
