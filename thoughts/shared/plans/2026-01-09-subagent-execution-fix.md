# Subagent Execution Fix Plan

**Date:** 2026-01-09
**Issue:** Subagents spawned by Head of Product agent stuck in "Running" state
**Observed:** https://virtual-cofounder.vercel.app/agents shows agents with "Thinking trace" and "Spawned by Head of Product agent..." but not progressing

## Problem Diagnosis

### Current Behavior

When the Head of Product (HoP) agent spawns subagents (Analytics, SEO, Security, etc.):

1. ✅ **HoP uses Task tool** - Correctly calls Task with subagent_type
2. ✅ **Orchestrator detects spawn** - Listens to `stream_event` and `tool_progress` messages
3. ✅ **AgentSession created** - Records created in DB with status='running'
4. ❌ **Subagents never execute** - No actual execution happens, agents stuck forever

### Root Cause

**The orchestrator treats subagent spawning as a "notification event" rather than letting the Agent SDK execute them.**

Looking at `lib/orchestrator.ts:495-625`:

```typescript
// Detects Task tool usage
if (toolName === 'Task' && spawnedAgentType) {
  agentsSpawned.push(spawnedAgentType);

  // Creates DB record
  prisma.agentSession.create({
    data: {
      status: 'running',
      thinkingTrace: [{ turn: 1, thinking: `Spawned by Head of Product agent`, action: 'spawn' }],
      // ...
    }
  });
}
```

**What's missing:** No actual subagent execution!

The Agent SDK **should** automatically:
1. Intercept Task tool calls
2. Execute the spawned subagent
3. Wait for completion
4. Return results to parent agent

But the orchestrator just logs the event and continues without waiting for subagent results.

### Comparison: Chat vs Orchestrator

Both use the same pattern:

| Aspect | Chat Worker | Orchestrator |
|--------|-------------|--------------|
| **Passes `agents`?** | ✅ Yes (`agents: subagents`) | ✅ Yes (`agents: subagents`) |
| **Task tool enabled?** | ✅ Yes | ✅ Yes |
| **Detects Task calls?** | ✅ Yes (publishes to UI) | ✅ Yes (creates DB records) |
| **Awaits results?** | ❌ Just publishes event | ❌ Just logs event |

**Key insight:** Neither implementation properly awaits subagent results from the SDK!

## Expected SDK Behavior

When configured with `agents` option, the Claude Agent SDK should:

```typescript
const sdkOptions = {
  tools: ['Task', 'Read', 'Grep'],
  agents: {
    'analytics': { description: '...', prompt: '...', ... },
    'security': { description: '...', prompt: '...', ... },
    // ... more agents
  }
};

for await (const message of query({ prompt, options: sdkOptions })) {
  // When parent agent uses Task tool:
  // 1. SDK intercepts the Task tool call
  // 2. SDK executes the subagent internally
  // 3. SDK sends 'tool_progress' message (parent agent is using Task)
  // 4. SDK waits for subagent to complete
  // 5. SDK sends 'user' or 'system' message with tool_result (subagent output)
  // 6. Parent agent receives subagent results and continues
}
```

## Proposed Solutions

### Option A: Let SDK Handle Execution (Recommended)

**Theory:** The SDK already handles subagent execution, but we're missing the results.

**Changes needed:**

1. **Stop creating AgentSession on spawn** - Only create when we have actual results
2. **Listen for tool_result messages** - SDK sends these with subagent output
3. **Update AgentSession with results** - Save findings after subagent completes

```typescript
// In orchestrator.ts message loop
case 'user':
case 'system': {
  const msg = message as { type: 'user' | 'system'; content?: Array<{ type: string; tool_use_id?: string; content?: string }> };

  // Check if this contains a tool result from Task
  const toolResults = msg.content?.filter(c => c.type === 'tool_result' && c.tool_use_id);

  for (const result of toolResults || []) {
    // This is a subagent's output!
    // Update the corresponding AgentSession with results
    const findings = parseAgentFindings(result.content);

    await prisma.agentSession.update({
      where: { /* find by tool_use_id or agent name */ },
      data: {
        status: 'completed',
        findings: findings,
        completedAt: new Date(),
      }
    });
  }
  break;
}
```

**Pros:**
- Uses SDK as designed
- Minimal code changes
- Subagents execute automatically

**Cons:**
- Requires understanding SDK's tool_result format
- May need to match tool_use_id to AgentSession

### Option B: Create Agent Execution Worker

**Theory:** Spawning should queue agents for separate execution.

**Architecture:**
```
HoP spawns → Create AgentSession → Enqueue to 'agent' queue → Agent Worker picks up → Execute → Update DB
```

**Changes needed:**

1. **New BullMQ queue:** 'agent-execution'
2. **New worker:** `workers/agent-worker.ts`
3. **Enqueue on spawn:** Add to queue instead of just creating DB record
4. **Worker executes:** Runs `runAgentWithSDK(agentType, context)`

```typescript
// In orchestrator.ts when Task detected
if (toolName === 'Task' && spawnedAgentType) {
  const session = await prisma.agentSession.create({ /* ... */ });

  // Enqueue for execution
  await agentQueue.add('execute-agent', {
    sessionId: session.id,
    agentType: spawnedAgentType,
    context: { /* scan data */ },
  });
}
```

```typescript
// New workers/agent-worker.ts
agentQueue.process('execute-agent', async (job) => {
  const { sessionId, agentType, context } = job.data;

  // Execute the agent
  const result = await runAgentWithSDK(agentType, context, {
    projectId: context.projectId,
  });

  // Update session with results
  await prisma.agentSession.update({
    where: { id: sessionId },
    data: {
      status: 'completed',
      findings: result.findings,
      output: result.output,
      completedAt: new Date(),
    },
  });
});
```

**Pros:**
- Clean separation of concerns
- Can scale agent execution independently
- Explicit queue for monitoring

**Cons:**
- More infrastructure (new queue, new worker)
- Parent agent doesn't get subagent results inline
- Subagent findings not available to parent during its execution

### Option C: Execute Inline After Detection

**Theory:** When Task is detected, immediately execute that agent.

**Changes needed:**

```typescript
// In orchestrator.ts when Task detected
if (toolName === 'Task' && spawnedAgentType) {
  const session = await prisma.agentSession.create({ /* ... */ });

  // Execute immediately
  const result = await runAgentWithSDK(spawnedAgentType, agentContext, {
    projectId: scanContext.project.id,
  });

  // Update session with results
  await prisma.agentSession.update({
    where: { id: session.id },
    data: {
      status: 'completed',
      findings: result.findings,
      completedAt: new Date(),
    },
  });

  // Add findings to parent agent's context somehow?
  allFindings.push(...result.findings);
}
```

**Pros:**
- Simple, straightforward
- Subagent results available immediately

**Cons:**
- Bypasses SDK's built-in Task handling
- Parent agent doesn't receive results naturally
- May cause race conditions or blocking

## Recommendation

**Start with Option A** - Let SDK handle execution properly.

**Rationale:**
1. The Agent SDK is **designed** to handle subagent spawning via Task tool
2. We're already passing `agents` option correctly
3. We just need to **listen for and process the results** properly
4. This is the least invasive change

**If Option A doesn't work** (SDK doesn't actually execute subagents):
- Fall back to **Option B** (Agent Execution Worker)
- This gives us full control and is architecturally clean
- Similar to how chat-worker and execution-worker already work

## Implementation Steps (Option A)

### Phase 1: Add tool_result Handling

1. **Update orchestrator message loop** (`lib/orchestrator.ts:648-652`)
   - Currently ignores 'user' and 'system' messages
   - Add handler to extract tool_result content
   - Parse subagent output from tool results

2. **Map tool_use_id to AgentSession**
   - Store tool_use_id when creating AgentSession
   - Use it to find the right session when results arrive

3. **Update AgentSession with results**
   - Parse findings from tool_result content
   - Set status='completed'
   - Store output and findings

### Phase 2: Test with Simple Subagent

1. **Trigger HoP orchestration** on a test project
2. **Monitor logs** for tool_result messages
3. **Verify** AgentSession gets updated with results
4. **Check UI** to see if agents move from "Running" to "Completed"

### Phase 3: Verify Full Flow

1. **Check all spawned agents** complete successfully
2. **Verify findings** are saved to DB
3. **Confirm** findings are used to create stories

## Fallback Plan (Option B)

If SDK doesn't handle subagent execution, implement Agent Execution Worker:

### Phase 1: Create Agent Queue

1. **Add 'agent' queue** to BullMQ setup
2. **Create job type** for agent execution
3. **Test enqueueing** agent sessions

### Phase 2: Create Agent Worker

1. **New file:** `workers/agent-worker.ts`
2. **Process agent sessions** from queue
3. **Execute via runAgentWithSDK**
4. **Update DB** with results
5. **Deploy to Railway**

### Phase 3: Update Orchestrator

1. **Enqueue agents** instead of just creating records
2. **Don't await** agent completion in orchestrator
3. **Let worker** handle execution asynchronously

## Testing Plan

### Test 1: Single Subagent
- HoP spawns only Analytics agent
- Verify it completes and returns findings
- Check UI shows completion

### Test 2: Multiple Subagents
- HoP spawns Analytics + SEO + Security
- Verify all complete
- Check findings are merged correctly

### Test 3: Subagent Failure
- Force a subagent to error
- Verify error is handled gracefully
- Check AgentSession status reflects failure

## Success Criteria

- [ ] Subagents move from "Running" to "Completed" in UI
- [ ] AgentSession records have actual findings data
- [ ] Findings are used to create stories
- [ ] No agents stuck in "Running" state indefinitely
- [ ] Parent agent receives subagent results (if Option A)

## Open Questions

1. **Does the SDK actually execute subagents?**
   - Need to verify with logs/debugging
   - Check if tool_result messages appear

2. **What format are tool results?**
   - Need to see actual message structure
   - Determine how to parse subagent output

3. **Should subagents run in parallel or sequential?**
   - SDK may handle this automatically
   - Or we may need to orchestrate it

4. **What happens if subagent fails?**
   - Does SDK retry?
   - Do we get error in tool_result?

## Next Steps

1. **Add detailed logging** to see all message types from SDK
2. **Check for tool_result messages** when Task is used
3. **Implement tool_result handler** if messages exist
4. **Test on staging** with a real project
5. **Monitor agent completion** in UI and DB
