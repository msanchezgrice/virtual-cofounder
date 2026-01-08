# Agent SDK Analysis - Virtual Cofounder

**Date:** 2026-01-07
**Status:** Phase 3 marked complete, but Agent SDK was NOT implemented
**Issue:** Manual orchestration pattern used instead of Claude Agent SDK

---

## Executive Summary

Phase 3 was supposed to implement the Claude Agent SDK for multi-agent orchestration, but **this never happened**. Instead, a manual orchestration pattern was implemented using the standard `@anthropic-ai/sdk`. This works, but misses significant opportunities for:

1. **True agent autonomy** - Agents that can use tools and spawn subagents
2. **Parallel agent execution** - Multiple agents working simultaneously on different aspects
3. **Built-in orchestration** - Let the SDK handle coordination instead of manual logic
4. **Cleaner architecture** - SDK provides patterns for agent communication and delegation

---

## Why Agent SDK Wasn't Implemented

### The Evidence

From `thoughts/shared/handoffs/general/2026-01-06_17-13-31_phase3-orchestrator-complete.md:80-84`:

```markdown
### Agent SDK Adaptation
**Discovery:** @anthropic-ai/agent-sdk doesn't exist as a public package
- **Solution:** Implemented multi-agent orchestration using standard @anthropic-ai/sdk
- **Pattern:** Each agent is a configuration (name, model, instructions) + API calls
- **Works well:** Gives full control over agent behavior and coordination
```

### What Happened

1. **Package doesn't exist**: The team discovered `@anthropic-ai/agent-sdk` is not a real NPM package
2. **Fallback solution**: Implemented manual orchestration using `@anthropic-ai/sdk` instead
3. **Pattern used**:
   - Agents = config objects with instructions (lib/agents.ts)
   - Orchestrator = manual function that calls each agent sequentially (lib/orchestrator.ts)
   - No actual agent autonomy or tool use

### The Ralph Build Spec Planned For It

From `/Users/miguel/.claude/plans/ralph-build-spec.md:199-215`:

```bash
### Phase 3: Orchestrator
```bash
# Test 1: Agent SDK installed
npm list @anthropic-ai/agent-sdk
# Expected: Version shown (e.g., 1.0.0)

# Test 2: Agents defined
node -e "import('./lib/agents').then(a => console.log(Object.keys(a.agents)))"
# Expected: ['security', 'analytics', 'domain', 'seo', ...]
```

**This test was never run** - the story validation used different criteria that didn't check for Agent SDK.

---

## Current Architecture (What Was Actually Built)

### "Agents" Are Just Config Objects

`lib/agents.ts:1-194` - Agent registry:

```typescript
export interface AgentConfig {
  name: string;
  role: string;
  model: 'claude-opus-4-5-20251101' | 'claude-sonnet-4-5-20250929';
  instructions: string;
}

export const securityAgent: AgentConfig = {
  name: 'Security Agent',
  role: 'security',
  model: 'claude-opus-4-5-20251101',
  instructions: `You are a Security Agent analyzing web projects...`
};
```

**Problem:** These aren't agents - they're just instruction templates.

### Orchestrator Manually Calls Each "Agent"

`lib/orchestrator.ts:55-118` - Manual agent execution:

```typescript
async function runAgent(
  agent: AgentConfig,
  scanContext: ScanContext
): Promise<AgentFinding[]> {
  const prompt = `Analyze this project's scan data...`;

  const response = await anthropic.messages.create({
    model: agent.model,
    max_tokens: 2048,
    messages: [{ role: 'user', content: prompt }],
    system: agent.instructions,
  });

  // Parse JSON response...
}
```

**Problem:** Each "agent" is just a single API call with specific instructions. No:
- Tool use
- Subagent spawning
- Multi-turn conversations
- Autonomous decision-making

### Sequential Execution (Not True Parallelism)

`lib/orchestrator.ts:261-273`:

```typescript
const agentPromises = relevantAgents.map(agent =>
  runAgent(agent, scanContext)
);

const projectFindings = (await Promise.all(agentPromises)).flat();
```

**Issue:** While this uses `Promise.all`, each agent is still just a single API call. Real agents would:
- Run multiple turns
- Use tools to gather more information
- Spawn subagents for specialized tasks
- Communicate with each other

---

## Where Agent SDK SHOULD Be Used

### 1. **Head of Product Orchestrator** ⭐⭐⭐ HIGHEST PRIORITY

**Current state:** Manual function in `lib/orchestrator.ts`

**Should be:** An Agent SDK agent with:
- **Tools available:**
  - `spawn_agent` - Delegate to specialist agents
  - `read_scan_data` - Query database for scan results
  - `create_completion` - Generate work items
  - `rank_findings` - Use built-in reasoning

- **Autonomous behavior:**
  - Analyzes scan data
  - Decides which specialist agents to spawn
  - Coordinates their findings
  - Makes prioritization decisions

**Example implementation:**

```typescript
import { Agent } from '@anthropic-ai/agent-sdk';

const headOfProductAgent = new Agent({
  name: 'Head of Product',
  model: 'claude-opus-4-5-20251101',
  instructions: `You are a Head of Product coordinating specialist agents...`,
  tools: [
    spawnAgentTool,      // Spawn specialist agents
    readScanDataTool,    // Query database
    createCompletionTool // Create work items
  ]
});

// Run with delegation
const result = await headOfProductAgent.run({
  context: scanContexts,
  maxTurns: 10
});
```

### 2. **Specialist Agents** (Security, Analytics, SEO, etc.) ⭐⭐⭐

**Current state:** Config objects in `lib/agents.ts`

**Should be:** Real Agent SDK agents with tools:

```typescript
const securityAgent = new Agent({
  name: 'Security Agent',
  model: 'claude-opus-4-5-20251101',
  instructions: `You are a security specialist...`,
  tools: [
    {
      name: 'scan_code_for_secrets',
      description: 'Scan code for exposed API keys',
      parameters: { repo_url: 'string' },
      execute: async ({ repo_url }) => {
        // Clone repo, scan for secrets
      }
    },
    {
      name: 'check_npm_vulnerabilities',
      description: 'Check for npm package vulnerabilities',
      parameters: { package_json: 'string' },
      execute: async ({ package_json }) => {
        // Run npm audit
      }
    }
  ]
});
```

**Benefits:**
- Agents can actively gather more information (not just analyze what's given)
- Multi-turn reasoning for complex security issues
- Can spawn sub-agents for specific vulnerability types

### 3. **Execution Worker** ⭐⭐ HIGH PRIORITY

**Current state:** `workers/execution-worker.ts` - Manual git operations

**Should be:** Agent SDK agent that:
- Spawns a code implementation agent
- Uses tools for git operations
- Coordinates testing and validation

```typescript
const executionAgent = new Agent({
  name: 'Execution Agent',
  model: 'claude-sonnet-4-5-20250929',
  instructions: `You implement code changes based on completions...`,
  tools: [
    gitCloneTool,
    gitCommitTool,
    gitPushTool,
    createPRTool,
    runTestsTool,
    // Most importantly:
    {
      name: 'spawn_implementation_agent',
      description: 'Spawn an agent to implement the actual code changes',
      execute: async (params) => {
        const implAgent = new Agent({
          name: 'Implementation Agent',
          instructions: 'You write code to solve the given issue...',
          tools: [readFileTool, writeFileTool, bashTool]
        });
        return await implAgent.run(params);
      }
    }
  ]
});
```

### 4. **Orchestrator Worker** ⭐⭐ HIGH PRIORITY

**Current state:** `workers/orchestrator-worker.ts` - Calls manual orchestrator function

**Should be:** Use Agent SDK's parallel agent spawning:

```typescript
// Instead of manual Promise.all
const agentResults = await Promise.all(
  relevantAgents.map(agent => runAgent(agent, context))
);

// Use Agent SDK's parallel delegation
const orchestratorAgent = new Agent({
  name: 'Project Orchestrator',
  instructions: `Coordinate specialist agents for this project...`,
  tools: [
    {
      name: 'analyze_with_specialists',
      description: 'Spawn multiple specialist agents in parallel',
      execute: async ({ specialists, context }) => {
        // Agent SDK handles parallel execution internally
        return await Promise.all(
          specialists.map(s => spawnAgent(s, context))
        );
      }
    }
  ]
});
```

### 5. **Scan Workers** ⭐ MEDIUM PRIORITY

**Current state:** `workers/scan-worker.ts` - Direct scanner function calls

**Could be:** Agents that actively explore:

```typescript
const domainScanAgent = new Agent({
  name: 'Domain Scanner',
  instructions: `Scan a domain for issues...`,
  tools: [
    httpRequestTool,
    dnsLookupTool,
    sslCertCheckTool,
    {
      name: 'spawn_deep_scan_agent',
      description: 'If issues found, spawn agent for deeper analysis',
      execute: async (params) => {
        // Spawn specialized agent for specific issue type
      }
    }
  ]
});
```

---

## Migration Path

### Phase 1: Convert Specialist Agents ✅ EASIEST

1. Install actual Agent SDK (when available) or use Anthropic's tool use patterns
2. Convert each agent config to real Agent with tools
3. Keep orchestrator calling them for now
4. **Impact:** Agents can actively investigate, not just analyze given data

### Phase 2: Convert Head of Product Orchestrator ✅ HIGH VALUE

1. Make orchestrator an Agent SDK agent
2. Give it `spawn_agent` tool to delegate to specialists
3. Let it decide which agents to run and how to coordinate
4. **Impact:** Autonomous orchestration, better decision-making

### Phase 3: Convert Execution Worker ⭐ HIGHEST VALUE

1. Execution agent spawns implementation agents
2. Implementation agents have file editing tools
3. Execution agent coordinates git operations
4. **Impact:** Actually implements code changes autonomously

### Phase 4: Parallel Agent Architecture

1. Multiple orchestrator agents running simultaneously
2. Cross-project pattern recognition
3. Agent communication and knowledge sharing
4. **Impact:** True multi-agent system

---

## Specific Code Changes Needed

### 1. Install Real Agent SDK

```bash
# When available
npm install @anthropic-ai/agent-sdk

# Or implement using tool use patterns
npm install @anthropic-ai/sdk  # Already installed
```

### 2. Convert Security Agent Example

**Before (current):**
```typescript
// lib/agents.ts
export const securityAgent: AgentConfig = {
  name: 'Security Agent',
  role: 'security',
  model: 'claude-opus-4-5-20251101',
  instructions: `You are a Security Agent...`
};
```

**After (with Agent SDK):**
```typescript
// lib/agents/security.ts
import { Agent, Tool } from '@anthropic-ai/agent-sdk';

const scanSecretsToolconst checkVulnerabilitiesTool = new Tool({
  name: 'check_vulnerabilities',
  description: 'Check npm packages for known vulnerabilities',
  parameters: {
    type: 'object',
    properties: {
      packageJson: { type: 'string' },
      lockFile: { type: 'string' }
    }
  },
  execute: async ({ packageJson, lockFile }) => {
    // Implementation
  }
});

export const securityAgent = new Agent({
  name: 'Security Agent',
  model: 'claude-opus-4-5-20251101',
  instructions: `You are a Security Agent analyzing web projects.

  Use your tools to:
  - Scan code for exposed secrets
  - Check dependencies for vulnerabilities
  - Analyze security configurations

  If you find high-severity issues, spawn a specialized agent for deeper analysis.`,
  tools: [scanSecretsTool, checkVulnerabilitiesTool],
  maxTurns: 5
});
```

### 3. Convert Orchestrator

**Before (current):**
```typescript
// lib/orchestrator.ts
export async function runOrchestrator(contexts: ScanContext[]) {
  const allFindings = [];

  for (const context of contexts) {
    const agents = getRelevantAgents(context);
    const findings = await Promise.all(
      agents.map(a => runAgent(a, context))
    );
    allFindings.push(...findings.flat());
  }

  return { findings: allFindings, /* ... */ };
}
```

**After (with Agent SDK):**
```typescript
// lib/orchestrator.ts
import { Agent } from '@anthropic-ai/agent-sdk';
import { securityAgent, analyticsAgent, /* ... */ } from './agents';

const spawnAgentTool = new Tool({
  name: 'spawn_specialist_agent',
  description: 'Delegate analysis to a specialist agent',
  parameters: {
    type: 'object',
    properties: {
      agentType: {
        type: 'string',
        enum: ['security', 'analytics', 'seo', 'domain', 'deployment']
      },
      context: { type: 'object' }
    }
  },
  execute: async ({ agentType, context }) => {
    const agentMap = {
      security: securityAgent,
      analytics: analyticsAgent,
      // ...
    };

    const agent = agentMap[agentType];
    return await agent.run({ context });
  }
});

export const headOfProductAgent = new Agent({
  name: 'Head of Product',
  model: 'claude-opus-4-5-20251101',
  instructions: `You coordinate specialist agents to analyze projects.

  For each project:
  1. Determine which specialists are needed based on project state
  2. Spawn those agents to analyze the project
  3. Synthesize their findings into actionable completions
  4. Prioritize by impact and effort

  You have access to security, analytics, SEO, domain, and deployment specialists.`,
  tools: [spawnAgentTool, readScanDataTool, createCompletionTool],
  maxTurns: 10
});

export async function runOrchestrator(contexts: ScanContext[]) {
  return await headOfProductAgent.run({
    contexts,
    goal: 'Analyze all projects and create prioritized completions'
  });
}
```

---

## Benefits of Using Agent SDK

### Current Architecture (Manual Orchestration)

```
Orchestrator Function
  ├─ Call Security Agent API (1 turn)
  ├─ Call Analytics Agent API (1 turn)
  ├─ Call SEO Agent API (1 turn)
  └─ Manually rank and combine results
```

**Limitations:**
- Agents can't investigate further
- No multi-turn reasoning
- Manual coordination logic
- Sequential decision-making

### With Agent SDK

```
Head of Product Agent
  ├─ Analyzes scan data
  ├─ Decides to spawn Security Agent
  │   ├─ Security Agent scans for secrets (tool use)
  │   ├─ Finds exposed API key
  │   └─ Spawns Secret Rotation Agent (autonomous)
  ├─ Spawns Analytics Agent in parallel
  │   └─ Analytics Agent checks event tracking
  └─ Synthesizes findings and creates completions
```

**Benefits:**
- ✅ Multi-turn reasoning per agent
- ✅ Tool use for active investigation
- ✅ Autonomous subagent spawning
- ✅ Parallel execution handled by SDK
- ✅ Agents can make independent decisions

---

## Current vs. Ideal Architecture

### Current (Manual)

```
User triggers orchestrator
  ↓
lib/orchestrator.ts:runOrchestrator()
  ↓
For each project:
  ├─ Manually determine relevant agents
  ├─ Call each agent (single API call)
  ├─ Parse JSON responses
  └─ Manually rank findings
  ↓
Create completions
  ↓
Save to database
```

### Ideal (Agent SDK)

```
User triggers orchestrator
  ↓
Head of Product Agent spawns
  ├─ Reads scan data (tool use)
  ├─ Decides which specialists needed
  ├─ Spawns specialists in parallel
  │   ├─ Security Agent
  │   │   ├─ Uses tools to scan code
  │   │   ├─ Multi-turn investigation
  │   │   └─ Spawns remediation subagent if needed
  │   ├─ Analytics Agent
  │   └─ SEO Agent
  ├─ Synthesizes findings (autonomous reasoning)
  ├─ Creates completions (tool use)
  └─ Returns prioritized results
```

---

## Action Items

### Immediate (Next Session)

1. ✅ **Research actual Agent SDK availability**
   - Check if `@anthropic-ai/agent-sdk` now exists
   - If not, use tool use patterns from standard SDK
   - Document the correct SDK to use

2. ✅ **Convert Security Agent as POC**
   - Add tools for secret scanning
   - Add tools for vulnerability checking
   - Test multi-turn reasoning

3. ✅ **Update orchestrator to spawn agents**
   - Convert orchestrator to Agent SDK agent
   - Give it spawn_agent tool
   - Test autonomous coordination

### Short-term (This Week)

4. ✅ **Convert remaining specialist agents**
   - Analytics, SEO, Domain, Deployment
   - Add appropriate tools to each
   - Test parallel spawning

5. ✅ **Update execution worker**
   - Use agents for code implementation
   - Add file editing tools
   - Test end-to-end PR creation

### Long-term (This Month)

6. ✅ **Parallel orchestration**
   - Multiple orchestrator agents for different project sets
   - Cross-project pattern recognition
   - Agent knowledge sharing

7. ✅ **Advanced capabilities**
   - Agents that learn from past completions
   - Self-improving agent instructions
   - Agent collaboration protocols

---

## Questions to Investigate

1. **Does `@anthropic-ai/agent-sdk` exist now?**
   - Phase 3 was implemented in late 2025
   - SDK may have been released since then
   - Check Anthropic documentation

2. **What's the recommended pattern for multi-agent orchestration?**
   - Tool use with spawn patterns?
   - Extended context for agent coordination?
   - Message-based communication?

3. **How to handle agent memory/context?**
   - Store findings between agent calls?
   - Share context across specialist agents?
   - Persist agent state between orchestrator runs?

4. **Performance implications?**
   - Agent SDK overhead vs manual API calls?
   - Parallel agent execution efficiency?
   - Cost of multi-turn agent conversations?

---

## Conclusion

**Phase 3 did NOT implement Agent SDK** - it implemented a manual orchestration pattern that mimics some aspects of multi-agent systems but lacks true agent autonomy.

**Highest Impact Changes:**
1. Convert Head of Product Orchestrator to Agent SDK agent ⭐⭐⭐
2. Add tools to specialist agents for active investigation ⭐⭐⭐
3. Implement execution agent with code editing tools ⭐⭐⭐

**Next Session Should:**
1. Research correct Agent SDK or tool use patterns
2. Convert Security Agent as POC with full tools
3. Update orchestrator to spawn agents autonomously
4. Test end-to-end with real scan data

The current system works, but we're missing out on:
- Autonomous agent decision-making
- Active investigation vs passive analysis
- True multi-agent collaboration
- Code implementation capabilities
