# Subagent Execution Fix - Implementation Summary

**Date:** 2026-01-09
**Status:** ✅ Implemented, Ready for Testing
**Plan:** [2026-01-09-subagent-execution-fix.md](../plans/2026-01-09-subagent-execution-fix.md)

## What Was Fixed

### Problem
Subagents spawned by the Head of Product agent were getting stuck in "Running" state because:
1. The orchestrator detected Task tool usage ✅
2. Created AgentSession records ✅
3. **But never processed the subagent results** ❌

The critical `user`/`system` messages containing `tool_result` blocks were being ignored (lines 648-652).

### Solution Implemented

**Option A: Let Agent SDK Handle Execution** - As recommended in the plan.

The Agent SDK already executes subagents when:
- Parent agent has `agents` option configured ✅
- Parent agent uses Task tool ✅
- SDK returns results via `tool_result` blocks ✅

We just needed to **listen for and process these results**.

## Changes Made

### File: `lib/orchestrator.ts`

#### 1. Added Result Tracking (lines 473-477)
```typescript
// Track tool_use_id when spawning
let currentToolUse: {
  name: string;
  inputJson: string;
  index: number;
  toolUseId?: string  // NEW: Track tool_use_id
} | null = null;

// NEW: Map tool_use_id -> AgentSession for matching results
const spawnedAgentSessions = new Map<string, {
  sessionId: string;
  agentName: string;
  startTime: Date
}>();
```

**Why:** Need to match incoming tool_result blocks to the correct AgentSession.

#### 2. Capture tool_use_id on Spawn (lines 519-533)
```typescript
// When Task tool starts
if (streamMsg.event?.type === 'content_block_start' &&
    streamMsg.event.content_block?.type === 'tool_use') {
  const toolName = streamMsg.event.content_block.name || '';
  const toolUseId = streamMsg.event.content_block.id;  // NEW: Capture ID
  console.log(`[Orchestrator] Tool use start: ${toolName}, id=${toolUseId}`);

  if (toolName === 'Task') {
    currentToolUse = {
      name: toolName,
      inputJson: '',
      index: streamMsg.event.index || 0,
      toolUseId  // NEW: Store it
    };
  }
}
```

**Why:** The SDK sends a unique `tool_use_id` with each tool call. We need this to match results later.

#### 3. Store tool_use_id in Tracking Map (lines 580-591)
```typescript
// After creating AgentSession
prisma.agentSession.create({
  data: {
    // ... session data ...
    thinkingTrace: [{
      turn: 1,
      thinking: `Spawned by Head of Product agent`,
      action: 'spawn',
      toolUseId: currentToolUse.toolUseId,  // NEW: Store in trace
      timestamp: new Date().toISOString()
    }],
  },
}).then(session => {
  // NEW: Track this session by tool_use_id
  if (currentToolUse?.toolUseId) {
    spawnedAgentSessions.set(currentToolUse.toolUseId, {
      sessionId: session.id,
      agentName: spawnedAgentType,
      startTime: new Date()
    });
    console.log(`[Orchestrator] Tracking session ${session.id} with tool_use_id=${currentToolUse.toolUseId}`);
  }
});
```

**Why:** When tool_result arrives, we can look up which AgentSession it belongs to.

#### 4. **CRITICAL: Process tool_result Messages** (lines 674-757)

**Before:**
```typescript
case 'user':
case 'system':
  // These contain tool_result content, we don't need to process them
  break;
```

**After:**
```typescript
case 'user':
case 'system': {
  const toolResultMsg = message as {
    type: 'user' | 'system';
    message?: {
      role?: string;
      content?: Array<{
        type: string;
        tool_use_id?: string;
        content?: string | any;
        text?: string;
      }>;
    };
  };

  // NEW: Log all user/system messages to see tool results
  console.log(`[Orchestrator] ${message.type} message:`,
    JSON.stringify(toolResultMsg, null, 2).substring(0, 500));

  // NEW: Check if this message contains tool results
  const content = toolResultMsg.message?.content;
  if (Array.isArray(content)) {
    for (const block of content) {
      // Look for tool_result blocks
      if (block.type === 'tool_result' && block.tool_use_id) {
        console.log(`[Orchestrator] ✅ Found tool_result for tool_use_id=${block.tool_use_id}`);

        // Check if this is a result from a spawned subagent
        const sessionInfo = spawnedAgentSessions.get(block.tool_use_id);
        if (sessionInfo) {
          console.log(`[Orchestrator] 🎯 Matched to agent session: ${sessionInfo.sessionId} (${sessionInfo.agentName})`);

          // Extract the subagent's output
          const subagentOutput = typeof block.content === 'string' ?
            block.content : JSON.stringify(block.content);
          const executionTime = Date.now() - sessionInfo.startTime.getTime();

          console.log(`[Orchestrator] Subagent ${sessionInfo.agentName} output (${subagentOutput.length} chars, ${executionTime}ms)`);

          // Parse findings from subagent output
          const findings = parseFindingsFromAgentOutput(subagentOutput, sessionInfo.agentName);
          console.log(`[Orchestrator] Extracted ${findings.length} findings`);

          // NEW: Update the AgentSession with results
          await prisma.agentSession.update({
            where: { id: sessionInfo.sessionId },
            data: {
              status: 'completed',  // Mark as completed!
              completedAt: new Date(),
              thinkingTrace: {
                push: {
                  turn: 2,
                  thinking: 'Completed analysis',
                  action: 'complete',
                  output: subagentOutput.substring(0, 1000),
                  timestamp: new Date().toISOString(),
                  durationMs: executionTime
                }
              }
            },
          });

          // Add findings to global list
          allFindings.push(...findings);

          // Clean up tracking map
          spawnedAgentSessions.delete(block.tool_use_id);
        }
      }
    }
  }
  break;
}
```

**Why:** This is where the magic happens! When the SDK finishes executing a subagent, it sends a `user` or `system` message with a `tool_result` block containing the subagent's output. We now:
1. Parse the output
2. Extract findings
3. Update AgentSession to `completed`
4. Store results in DB

#### 5. Detect Stuck Agents (lines 768-796)
```typescript
// After SDK stream completes
if (spawnedAgentSessions.size > 0) {
  console.warn(`[Orchestrator] ⚠️ ${spawnedAgentSessions.size} agents were spawned but never completed:`);
  const uncompletedAgents = Array.from(spawnedAgentSessions.entries());

  for (const [toolUseId, info] of uncompletedAgents) {
    console.warn(`  - ${info.agentName} (session=${info.sessionId}, tool_use_id=${toolUseId})`);

    // Mark these sessions as failed
    await prisma.agentSession.update({
      where: { id: info.sessionId },
      data: {
        status: 'failed',
        completedAt: new Date(),
        thinkingTrace: {
          push: {
            turn: 2,
            thinking: 'Agent was spawned but never received tool_result from SDK',
            action: 'timeout',
            timestamp: new Date().toISOString()
          }
        }
      }
    });
  }
}
```

**Why:** If SDK spawns agents but they never complete, we'll know! This helps debug issues where:
- SDK doesn't actually execute subagents
- SDK executes but tool_result never arrives
- tool_use_id mismatch

#### 6. Added Findings Parser (lines 842-886)
```typescript
function parseFindingsFromAgentOutput(output: string, agentName: string): AgentFinding[] {
  try {
    // Try to find JSON findings in the output
    const jsonMatch = output.match(/\{[\s\S]*"findings"[\s\S]*\}/) ||
                     output.match(/\[[\s\S]*\{[\s\S]*"issue"[\s\S]*\}[\s\S]*\]/);

    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);

      // Handle array format
      if (Array.isArray(parsed)) {
        return parsed.map((f: any) => ({
          agent: agentName,
          projectId: f.projectId || '',
          issue: f.issue || '',
          action: f.action || '',
          severity: f.severity || 'medium',
          effort: f.effort || 'medium',
          impact: f.impact || 'medium',
          confidence: f.confidence || 0.7,
        }));
      }

      // Handle object with findings array
      if (parsed.findings && Array.isArray(parsed.findings)) {
        return parsed.findings.map((f: any) => ({ /* ... */ }));
      }
    }

    return [];
  } catch (err) {
    console.warn(`[Orchestrator] Failed to parse findings from ${agentName} output:`, err);
    return [];
  }
}
```

**Why:** Subagents return findings in their output. We need to extract and format them consistently.

## Data Captured for Dashboard

### AgentSession Updates

**When Spawned:**
```json
{
  "status": "running",
  "thinkingTrace": [{
    "turn": 1,
    "thinking": "Spawned by Head of Product agent",
    "action": "spawn",
    "toolUseId": "toolu_abc123",
    "timestamp": "2026-01-09T12:00:00.000Z"
  }]
}
```

**When Completed:**
```json
{
  "status": "completed",
  "completedAt": "2026-01-09T12:00:15.000Z",
  "thinkingTrace": [
    { /* spawn trace */ },
    {
      "turn": 2,
      "thinking": "Completed analysis",
      "action": "complete",
      "output": "Found 3 critical security issues...",
      "timestamp": "2026-01-09T12:00:15.000Z",
      "durationMs": 15000
    }
  ]
}
```

**If Failed/Timeout:**
```json
{
  "status": "failed",
  "completedAt": "2026-01-09T12:01:00.000Z",
  "thinkingTrace": [
    { /* spawn trace */ },
    {
      "turn": 2,
      "thinking": "Agent was spawned but never received tool_result from SDK",
      "action": "timeout",
      "timestamp": "2026-01-09T12:01:00.000Z"
    }
  ]
}
```

### Log Output

**What you'll see in Railway/Vercel logs:**

```
[Orchestrator] Tool use start: Task, id=toolu_abc123
[Orchestrator] HoP spawned: analytics (tool_use_id=toolu_abc123)
[Orchestrator] Created session a1b2c3d4 for analytics
[Orchestrator] Tracking session a1b2c3d4 with tool_use_id=toolu_abc123

... (SDK executes subagent) ...

[Orchestrator] user message: {"type":"user","message":{"role":"user","content":[{"type":"tool_result","tool_use_id":"toolu_abc123","content":"Analytics Analysis Complete..."}]}}
[Orchestrator] ✅ Found tool_result for tool_use_id=toolu_abc123
[Orchestrator] 🎯 Matched to agent session: a1b2c3d4 (analytics)
[Orchestrator] Subagent analytics output (1234 chars, 15000ms)
[Orchestrator] Output preview: Analytics Analysis Complete. Found 3 issues...
[Orchestrator] Extracted 3 findings from analytics
[Orchestrator] ✅ Updated session a1b2c3d4 to completed
```

## Testing Instructions

### 1. Test with Real Orchestrator Run

```bash
# Trigger an orchestrator run (via webhook or manual trigger)
# Check Railway logs for orchestrator worker
railway logs --service orchestrator-worker

# Look for these key log lines:
# ✅ "Tool use start: Task, id=toolu_..."
# ✅ "HoP spawned: <agent-name> (tool_use_id=...)"
# ✅ "Tracking session ... with tool_use_id=..."
# ✅ "Found tool_result for tool_use_id=..."
# ✅ "Matched to agent session: ... (<agent-name>)"
# ✅ "Updated session ... to completed"
```

### 2. Check UI at /agents

Navigate to: https://virtual-cofounder.vercel.app/agents

**Expected:**
- Agents move from "Running" → "Completed"
- Thinking traces show spawn + completion
- No agents stuck in "Running" indefinitely

**If stuck:**
- Check logs for "⚠️ agents were spawned but never completed"
- These will be marked as "failed" with timeout reason

### 3. Check Database

```sql
-- Check recent agent sessions
SELECT
  id,
  agent_name,
  status,
  started_at,
  completed_at,
  thinking_trace->>0 as spawn_trace,
  thinking_trace->>1 as completion_trace
FROM agent_sessions
WHERE started_at > NOW() - INTERVAL '1 hour'
ORDER BY started_at DESC;

-- Should see:
-- status = 'completed' (not 'running')
-- completed_at IS NOT NULL
-- thinking_trace has 2 entries (spawn + complete)
```

### 4. Verify Findings Flow

```bash
# Check that subagent findings make it into stories
DATABASE_URL="..." npx tsx -e "
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

const sessions = await prisma.agentSession.findMany({
  where: {
    status: 'completed',
    agentType: 'specialist'
  },
  include: {
    outputs: true
  },
  orderBy: { startedAt: 'desc' },
  take: 10
});

for (const s of sessions) {
  console.log(\`\${s.agentName}: \${s.outputs.length} outputs, status=\${s.status}\`);
}
"
```

## Next Steps

### If Testing Shows Success ✅

**Agents complete successfully:**
1. Monitor for a few orchestrator runs
2. Verify dashboard shows proper history
3. Check findings quality from subagents
4. **No further changes needed!**

### If Testing Shows Agents Still Stuck ⚠️

**Look for these patterns in logs:**

**Pattern 1: No tool_result messages**
```
[Orchestrator] HoP spawned: analytics
... (no tool_result ever appears) ...
[Orchestrator] ⚠️ 1 agents were spawned but never completed
```
→ **SDK is NOT executing subagents**
→ **Solution:** Implement Option B (Agent Execution Worker)

**Pattern 2: tool_result arrives but no match**
```
[Orchestrator] Found tool_result for tool_use_id=toolu_xyz
[Orchestrator] ⚠️ No session found for tool_use_id=toolu_xyz
```
→ **tool_use_id mismatch**
→ **Solution:** Debug why tool_use_id differs between spawn and result

**Pattern 3: SDK errors**
```
[Orchestrator] Error running HoP agent: ...
```
→ **SDK configuration issue**
→ **Solution:** Check agents option, tools, permissions

## Fallback: Option B - Agent Execution Worker

If the SDK doesn't execute subagents (Pattern 1 above), we'll need:

1. **New Queue:** `agent-execution` BullMQ queue
2. **New Worker:** `workers/agent-worker.ts`
3. **Enqueue on Spawn:** Instead of just logging, enqueue agent for execution
4. **Worker Executes:** Picks up job, runs `runAgentWithSDK()`, updates DB

See the original plan for full details on Option B implementation.

## Success Criteria

- [x] Code changes implemented
- [x] TypeScript compiles without errors
- [x] Comprehensive logging added
- [ ] Tested with real orchestrator run
- [ ] Agents move to "completed" status
- [ ] Dashboard shows full thinking traces
- [ ] Findings from subagents create stories

## Questions to Answer After Testing

1. **Does SDK actually execute subagents?**
   - Look for tool_result messages in logs

2. **What format are tool results?**
   - Check logged tool_result content structure

3. **Do all spawned agents complete?**
   - Check for stuck agent warnings

4. **Are findings properly extracted?**
   - Verify stories created from subagent findings

5. **Do we need a dedicated worker?**
   - If SDK doesn't execute, implement Option B
