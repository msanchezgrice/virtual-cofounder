# Virtual Cofounder Workflow Diagrams

These mermaid diagrams show how scans, orchestrator runs, agents, Slack, and execution fit together.

## 1) System Overview

```mermaid
graph LR
  UI[Next.js UI] --> API[Next.js API routes]
  API --> DB[(Supabase Postgres)]
  API --> Redis[(Upstash Redis / BullMQ)]
  API --> Slack[Slack API]
  API --> Linear[Linear API]
  API --> Anthropic[Anthropic API]
  Redis --> ScanWorker[Railway scan-worker.ts]
  Redis --> ExecWorker[Railway execution-worker.ts]
```

## Change View (Before)

```mermaid
graph TD
  SlackCheckin["Slack check-in (scheduled)"] --> Priorities["user_priorities (check-in only)"]
  Scans["scans (daily)"] --> Orchestrator["/api/orchestrator/run (manual/cron)"]
  Priorities -.-> Orchestrator
  Orchestrator --> Completions["completions (ranked by findings)"]
  Approve["Slack approve button"] --> SlackEvents["/api/slack/events"]
  SlackEvents --> Status["completion.status = in_progress"]
  Status -.-> Script["queue-completion-to-production script"]
  Script --> ExecQueue["execution-queue"]
  ExecQueue --> Worker["execution-worker.ts (when running)"]
```

## Change View (After)

```mermaid
graph TD
  SlackAll["Slack inbound (DMs, channels, mentions)"] --> SlackEvents["/api/slack/events"]
  LinearComments["Linear comments"] --> LinearWebhook["/api/linear/webhook"]
  SlackEvents --> Inbounds["slack_inbounds"]
  Inbounds --> Signals["priority_signals (P0-P3 + factors)"]
  LinearWebhook --> Signals
  Signals --> Rerank["rerank trigger (user: immediate, others: 2x/day)"]
  Scans["scans (daily)"] --> Orchestrator["/api/orchestrator/run"]
  Signals --> Orchestrator
  Orchestrator --> StackRank["stack-ranked work per project"]
  StackRank --> Completions["completions (score + rank + priority)"]
  Completions --> Queue["execution-queue (priority)"]
  Approve["Slack approve button"] --> Queue
  Queue --> Worker["execution-worker.ts (always on)"]
```

## 2) Priority Intake (Slack Check-in)

```mermaid
graph TD
  Cron9[Vercel Cron 9:00] --> Checkin[/api/slack/check-in/]
  Checkin --> SlackMsg[Slack message]
  SlackMsg -->|user reply| Events[/api/slack/events/]
  Events --> Parser[priority-parser]
  Parser --> Priorities[(user_priorities)]
  Priorities -.->|planned weighting input| Orchestrator[/api/orchestrator/run/]
```

## 3) Scanning Pipeline

```mermaid
graph TD
  Cron905["Vercel Cron 9:05"] --> Trigger["/api/scans/trigger"]
  Trigger --> Queue["BullMQ scans queue"]
  Queue --> Worker["scan-worker.ts"]
  Worker --> Domain["scanDomain"]
  Worker --> SEO["scanSEO"]
  Worker --> Analytics["scanAnalytics"]
  Domain --> Scans["scans (table)"]
  SEO --> Scans
  Analytics --> Scans
  Scans --> ScansAPI["/api/scans"]
  ScansAPI --> Dashboard["/dashboard"]
```

## 4) Orchestrator Run + Outputs

```mermaid
graph TD
  RunAPI[/api/orchestrator/run/] --> FetchScans[fetch scans last 24h]
  FetchScans --> Context[ScanContext builder]
  Context --> Orchestrator[lib/orchestrator.ts]
  Orchestrator --> Agents[Agents + Anthropic]
  Agents --> Findings[(agent_findings)]
  Orchestrator --> Rank[rankFindings]
  Rank --> Completions[(completions)]
  Orchestrator --> RunRow[(orchestrator_runs)]
  Completions --> SlackNotify[Slack completion notifications]
  Completions --> LinearTasks[Linear tasks + comments]
```

## 5) Run Data Lineage

```mermaid
graph LR
  RunId[runId] --> OrchestratorRuns[(orchestrator_runs)]
  RunId --> Findings[(agent_findings)]
  RunId --> Completions[(completions)]
  Findings -.-> Completions
```

## 6) Execution Worker Pipeline

```mermaid
graph TD
  Approve[Slack Approve button] --> Events[/api/slack/events/]
  Events --> UpdateStatus[completion status = in_progress]
  UpdateStatus -.->|queue via script| Queue[(execution-queue)]
  Queue --> Worker[execution-worker.ts]
  Worker --> Git[clone/branch/commit/push]
  Git --> PR[GitHub PR]
  PR --> UpdateCompletion[completion.status=completed + prUrl]
  UpdateCompletion --> SlackDone[Slack notification]
  UpdateCompletion --> LinearUpdate[Linear status + comments]
```

## 7) UI Data Surfaces

```mermaid
graph TD
  Dashboard["/dashboard (scan overview)"] --> ScansAPI["/api/scans"]
  Agents["/agents (activity view)"] --> AgentsAPI["/api/agents"]
  Completions["/completions (work queue)"] --> CompletionsAPI["/api/completions"]
  Project["/projects/:id (detail)"] --> ProjectAPI["/api/projects/:id"]
  AgentsAPI --> CompletionsTable["completions (table)"]
  ProjectAPI --> CompletionsTable
  ProjectAPI -.->|legacy scan fields| ProjectTable["projects (table)"]
```

Notes:
- Agents UI currently derives activity from `completions` text, not `agent_findings`.
- Project detail API uses legacy scan fields; the canonical scan data is in `scans`.

## 8) User-Facing UX Flow (Your Perspective)

```mermaid
graph TD
  You["You"] --> Checkin["Slack check-in (set priorities)"]
  Checkin --> Priorities["Priorities saved (72h)"]
  DailyScans["Projects scanned daily"] --> Orchestrator["Orchestrator + agents analyze"]
  Priorities --> Orchestrator
  Orchestrator --> Ranked["Ranked work (completions)"]
  Ranked --> Slack["Slack: approvals + updates"]
  Ranked --> Dashboard["Dashboard: scans + work queue"]
  Ranked --> Linear["Linear: tasks + status"]
  Slack --> You
  Dashboard --> You
  Linear --> You
```
