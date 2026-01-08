# Codex Proposed Refactor 01.08.26

## Executive Summary
- Replace manual orchestration with the Claude Agent SDK agent loop and built-in tools.
- Require Claude Code runtime in dev/CI/workers and add persistent agent session/tool traces.
- Upgrade execution from placeholder diffs to tool-driven, audited code changes.
- Surface agent traces and approvals across Slack, Linear, and dashboard.
- Migrate in phases behind a feature flag to de-risk rollout.

## Summary
This PRD describes the changes required to deeply integrate the Claude Agent SDK per the docs at https://platform.claude.com/docs/en/agent-sdk/overview. The goal is to replace the current manual multi-agent orchestration (based on @anthropic-ai/sdk) with the Agent SDK agent loop, built-in tools, sessions, and subagents, and to surface agent traces in UX.

## Background (Current State)
- Orchestrator uses @anthropic-ai/sdk directly (single call per agent). See lib/orchestrator.ts.
- Priority parsing and Slack conversational replies also use @anthropic-ai/sdk. See lib/priority-parser.ts and app/api/slack/events/route.ts.
- Execution worker writes placeholder changes; no agent tool loop. See workers/execution-worker.ts.
- PRD Phase 3 calls for Agent SDK usage, but code does not.

## Agent SDK Source of Truth (from overview doc)
- Claude Code SDK is renamed to Claude Agent SDK.
- Agent SDK provides the same tools, agent loop, and context management as Claude Code, programmable in Python and TypeScript.
- Built-in tools include reading files, running commands, editing code, and web search.
- The SDK uses Claude Code as its runtime.
- Quickstart example (Python):

```python
import asyncio
from claude_agent_sdk import query, ClaudeAgentOptions

async def main():
    async for message in query(
        prompt="Find and fix the bug in auth.py",
        options=ClaudeAgentOptions(allowed_tools=["Read", "Edit", "Bash"])
    ):
        print(message)  # Claude reads the file, finds the bug, edits it

asyncio.run(main())
```

- Install commands in docs:
  - Claude Code runtime: curl -fsSL https://claude.ai/install.sh | bash
  - Claude Code runtime (alt): brew install --cask claude-code
  - Claude Code runtime (alt): npm install -g @anthropic-ai/claude-code
  - Agent SDK (TypeScript): npm install @anthropic-ai/claude-agent-sdk
  - Agent SDK (Python): pip install claude-agent-sdk

## Goals
- Replace manual agent orchestration with the Agent SDK agent loop.
- Use built-in tools for code reading, editing, command execution, and web fetch/search as appropriate.
- Implement subagents and task delegation via the Agent SDK.
- Persist sessions, tool calls, and reasoning traces for auditability and UI display.
- Integrate agent traces into Slack, Linear comments, and dashboard.
- Update execution worker to use the Agent SDK for real code changes.

## Non-Goals
- Rewriting the entire scanning system (keep scans pipeline, but feed results into agents).
- Multi-user auth changes (Phase 9). This PRD focuses on agent runtime refactor.

## User Stories (User-facing)
1. I can message the Head of Product in Slack anytime to set or change priority (P0-P3).
2. All projects are analyzed daily; morning and evening check-ins set work for the next cycle.
3. I can view all agents' thinking traces.
4. Agents update Linear stories as they start, work on, and complete them.
5. I can approve, request feedback, or reject work in Slack or Linear.
6. I can generate new work from Slack or from Linear.
7. I can see agents assigned to my work and read their reasoning in Linear comments.
8. Agents can do code and non-code work via specialist subagents; outputs are hosted at a unique URL for review.
9. Orchestrator tracks work priority, but user comments can change it at any time.
10. Orchestrator maintains a stack-ranked list per project (and overall) with traceable reasoning.
11. Orchestrator checks in twice daily; if no response, it sets priority from signals, completes one review cycle, and pauses if not approved.

## Scope of Change (What Must Be Updated)

### 1) Dependencies and Runtime
- Add Agent SDK dependency (TypeScript): @anthropic-ai/claude-agent-sdk.
- Install and manage Claude Code runtime in dev/CI/worker environments.
- Update environment requirements to include Claude Code install path/config.

### 2) Orchestrator Core
- Replace lib/orchestrator.ts with Agent SDK orchestrator using the SDK agent loop.
- Use subagents for specialist roles (security, seo, analytics, domain, deployment).
- Add tool permissions and policies per agent (Read/Edit/Bash/Web etc).
- Store full agent session transcript, tool calls, and decision traces.

### 3) Agent Registry and Prompts
- Convert lib/agents.ts configs into Agent SDK agent definitions (name, model, tools, constraints, system).
- Ensure consistent tool permissions and rate limits across agents.
- Introduce agent profiles to map roles to allowed tools.

### 4) Execution Worker
- Replace placeholder AI_IMPROVEMENTS.md output with Agent SDK code agent flow.
- Use built-in tools for repo read/edit/test/build:
  - Read, Edit, Bash (tests/build), and optional Search/Web fetch for docs.
- Store execution traces (tool calls and reasoning) in DB and post summary to Slack/Linear.

### 5) Slack + Linear Integration
- Log agent tool traces and decisions into Slack threads and Linear comments.
- Add links from Slack to agent run session details in the dashboard.
- Ensure Slack app mention commands trigger Agent SDK sessions rather than direct API calls.

### 6) Data Model and Observability
- New tables for agent sessions, tool calls, and traces:
  - agent_sessions: run_id, agent_name, status, started_at, completed_at, summary
  - agent_tool_calls: session_id, tool_name, input, output, duration_ms
  - agent_traces: session_id, step_index, role, content, thinking
- Attach session ids to completions and orchestrator runs.

### 7) UI and UX
- Add UI views for agent sessions and tool traces:
  - Orchestrator chat history (with tool call timeline)
  - Execution run details (files touched, commands run, test output)
  - Per-project agent activity with trace summaries

### 8) Tests and Safety
- Update test suites to cover Agent SDK runs and tool permission enforcement.
- Add guardrails to prevent destructive commands in Bash tool.
- Validate model/tool usage for cost control.

## Functional Requirements
- Orchestrator must run via Agent SDK session and persist traces.
- Each specialist agent must use tool calls where applicable.
- Execution worker must apply real code changes using Agent SDK tools.
- Slack and Linear must receive summaries and links to trace views.

## Non-Functional Requirements
- Deterministic tool permissions by agent role.
- Safe command execution in workers (allow list + sandbox).
- Session and trace storage should be queryable for UX.
- Observability for token usage, tool cost, run duration.

## Migration Strategy
- Phase 1: Add Agent SDK dependency and runtime, create experimental Agent SDK orchestrator under feature flag.
- Phase 2: Convert specialist agents to SDK subagents, store traces.
- Phase 3: Replace execution worker placeholder with Agent SDK code agent.
- Phase 4: Wire Slack/Linear trace summaries and UI views.
- Phase 5: Remove legacy @anthropic-ai/sdk flows where replaced.

## Deployment Considerations (Online)
- Install Claude Code runtime in worker environments (Railway/CI) and verify version parity.
- Enforce tool safety in production (repo-only sandbox, allow-listed commands, timeouts).
- Configure secrets for Slack/Linear/GitHub and ensure webhooks are publicly reachable.
- Add observability for agent sessions (duration, tool calls, token/cost usage, failure rates).
- Plan for storage growth (agent traces + tool outputs) with retention policies.

## Risks and Mitigations
- Runtime dependency: Claude Code must be installed on worker environments.
  - Mitigation: dockerized runtime or managed install during deploy.
- Tool safety: Bash tool could be destructive.
  - Mitigation: allow list, repo-only working dir, no network by default.
- Cost and latency: agent loop could be expensive.
  - Mitigation: step caps, max tool calls, caching, and batch limits.

## Open Questions
- Which Agent SDK models to standardize per agent role?
- Should Slack conversational replies use Agent SDK or remain @anthropic-ai/sdk?
- Where should tool execution happen (worker only vs app server)?

## References
- Agent SDK overview: https://platform.claude.com/docs/en/agent-sdk/overview
- Agent SDK quickstart: https://platform.claude.com/docs/en/agent-sdk/quickstart
- TypeScript SDK: https://platform.claude.com/docs/en/agent-sdk/typescript
- Python SDK: https://platform.claude.com/docs/en/agent-sdk/python
