# Linear Integration & Worker Status Report

> **Date**: January 8, 2026
> **Linear Team**: Virtual cofounder (VIR)
> **Railway Project**: nurturing-blessing

---

## ✅ LINEAR INTEGRATION - FULLY WORKING

### Connection Status
```
✅ Linear API Connected!
User: Miguel Sanchez-Grice
Email: msanchezgrice@gmail.com

Teams:
  • Virtual cofounder (VIR)
  • Media maker (MED)
```

### API Credentials Verified
- **LINEAR_API_KEY**: ✅ Set in Vercel (all environments)
- **LINEAR_WEBHOOK_SECRET**: ✅ Set in Vercel (all environments)
- **Local .env.local**: ✅ Configured correctly
- **Railway worker env**: ✅ Variables present

### Recent Issues in Linear
**Found 10 active VIR-* issues:**

| ID | Title | State | Priority |
|----|-------|-------|----------|
| VIR-263 | No conversion funnel tracking | Backlog | P3 |
| VIR-262 | Missing critical event tracking | Backlog | P2 |
| VIR-261 | Missing sitemap.xml | Backlog | P2 |
| VIR-260 | No analytics on landing page | Backlog | P2 |
| VIR-259 | Missing H1 tag | Backlog | P2 |
| VIR-258 | Missing meta description | Backlog | P2 |
| VIR-257 | HIPAA compliance verification | Backlog | P2 |
| VIR-256 | No analytics (healthcare) | Backlog | P2 |
| VIR-255 | Missing H1 tag (healthcare) | Backlog | P2 |
| VIR-254 | Missing sitemap.xml | Backlog | P3 |

**Linear Integration Status: 100% Operational ✅**

### Linear Webhook Flow
```
GitHub PR Created → Linear Issue Updated → Webhook → /api/linear/webhook
                                              ↓
                                        Story Status Updated
                                              ↓
                                    "In Progress" → Execution Queue
```

**Webhook endpoint verified:** ✅ `/api/linear/webhook` (HTTP 200)

---

## 🔴 WORKERS - PARTIALLY DEPLOYED

### Current Deployment Status

| Worker | Status | Railway Service | Command |
|--------|--------|----------------|---------|
| **Scan Worker** | ✅ Running | `virtual-cofounder` | `npm run worker:scan` |
| **Orchestration Worker** | 🔴 Not Running | `orchestration-worker` | `npm run worker:orchestrator` |
| **Execution Worker** | 🔴 Not Running | `execution-worker` | `npm run worker:execute` |

### Why Workers Aren't Running

**Railway Configuration Found:**
- ✅ `railway.json` - Scan worker (DEPLOYED)
- ✅ `railway-orchestration-worker.json` - Orchestration worker (NOT DEPLOYED)
- ✅ `railway-execution-worker.json` - Execution worker (NOT DEPLOYED)

**Each worker needs a separate Railway service.**

Currently only the **Scan Worker** is deployed and running.

### Railway Environment Variables (Verified)
```
✅ ANTHROPIC_API_KEY - Present
✅ DATABASE_URL - Present (PostgreSQL)
✅ REDIS_URL - Present (Upstash rediss://)
✅ LINEAR_API_KEY - Present
✅ GITHUB_APP_* - Present (for PR creation)
```

### Recent Railway Activity
```
Railway Deployments (Last 5):
  • 2026-01-08 23:11:34 - Production
  • 2026-01-08 23:10:42 - Deployed to Railway (nurturing-blessing)
  • 2026-01-08 23:05:10 - Production
  • 2026-01-08 23:04:11 - Deployed to Railway (nurturing-blessing)
  • 2026-01-08 22:57:58 - Production
```

**Last deployment:** 11 minutes ago (Scan Worker only)

---

## 🚀 HOW TO GET WORKERS RUNNING

### Option 1: Railway CLI Deployment (Recommended)

**Prerequisites:**
- Railway CLI installed ✅
- Logged in as msanchezgrice@gmail.com ✅
- Connected to project: `nurturing-blessing` ✅

**Deploy Orchestration Worker:**
```bash
# From project root
cd /Users/miguel/virtual-cofounder

# Deploy orchestration worker (uses railway-orchestration-worker.json)
railway up --service orchestration-worker

# Check logs
railway logs --service orchestration-worker --tail
```

**Deploy Execution Worker:**
```bash
# Deploy execution worker (uses railway-execution-worker.json)
railway up --service execution-worker

# Check logs
railway logs --service execution-worker --tail
```

### Option 2: Railway Dashboard Deployment

1. Go to https://railway.app/project/nurturing-blessing
2. Create new service: "orchestration-worker"
   - Source: GitHub (msanchezgrice/virtual-cofounder)
   - Branch: main
   - Build command: `npm install`
   - Start command: `npm run worker:orchestrator`
   - Environment: Copy from existing service

3. Create new service: "execution-worker"
   - Source: GitHub (msanchezgrice/virtual-cofounder)
   - Branch: main
   - Build command: `npm install`
   - Start command: `npm run worker:execute`
   - Environment: Copy from existing service

### Option 3: Local Testing (Development)

**Test workers locally before deploying:**

```bash
# Terminal 1 - Redis (if not using Upstash)
docker run -d -p 6379:6379 redis

# Terminal 2 - Scan Worker
npm run worker:scan

# Terminal 3 - Orchestration Worker
npm run worker:orchestrator

# Terminal 4 - Execution Worker
npm run worker:execute

# Terminal 5 - Trigger a scan
curl -X POST https://www.virtualcofounder.ai/api/scans/trigger \
  -H "Content-Type: application/json" \
  -d '{"projectId": "PROJECT_ID_HERE"}'
```

---

## 📊 WORKER ARCHITECTURE

### How Workers Connect

```
┌─────────────────────────────────────────────────────────────────┐
│                     VERCEL (Next.js App)                         │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │ /api/scans/trigger → Enqueues scan job                    │  │
│  │ /api/orchestrator/run → Enqueues orchestration job        │  │
│  │ /api/stories/[id]/approve → Enqueues execution job        │  │
│  └───────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    REDIS (Upstash) - BullMQ                      │
│  ┌───────────────┐  ┌──────────────────┐  ┌─────────────────┐  │
│  │  scan queue   │  │ orchestrate queue│  │  execute queue  │  │
│  └───────────────┘  └──────────────────┘  └─────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
       │                       │                       │
       ▼                       ▼                       ▼
┌─────────────┐      ┌─────────────────┐    ┌──────────────────┐
│   RAILWAY   │      │    RAILWAY      │    │    RAILWAY       │
│ Scan Worker │      │ Orchestrator    │    │ Execution Worker │
│  ✅ Running │      │ 🔴 Not Running  │    │ 🔴 Not Running   │
└─────────────┘      └─────────────────┘    └──────────────────┘
```

### Worker Responsibilities

**1. Scan Worker** (✅ Running)
- Monitors: `scan` queue
- Job: Run security/SEO/analytics/domain scans
- Output: Saves scan results to `scans` table
- Next step: Triggers orchestrator run

**2. Orchestration Worker** (🔴 Not Running)
- Monitors: `orchestrate` queue
- Job: Run Head of Product agent
- Spawns: Specialist agents (Security, SEO, Analytics, etc.)
- Output: Creates findings in `agent_findings` table
- Creates: Stories/Completions in `completions` table
- Next step: Creates Linear tasks, sends Slack messages

**3. Execution Worker** (🔴 Not Running)
- Monitors: `execute` queue
- Job: Run Code Generation agent
- Clones: GitHub repo
- Executes: Makes code changes, runs tests
- Creates: Pull requests
- Output: Updates completion with PR URL

---

## 🔍 VERIFICATION CHECKLIST

### ✅ Verified Working
- [x] Linear API connection
- [x] Linear webhook endpoint
- [x] Scan worker running on Railway
- [x] Database connection (74 projects, 806 scans)
- [x] Redis connection (Upstash)
- [x] All API routes deployed
- [x] GitHub App configured

### 🔴 Not Working (Needs Deployment)
- [ ] Orchestration worker running
- [ ] Execution worker running
- [ ] Agent sessions being created
- [ ] Project snapshots being generated
- [ ] Priority signals being classified

### 📝 Evidence of Missing Workers

**Database shows:**
- `agent_sessions` table: **0 rows** (orchestrator not running)
- `project_snapshots` table: **0 rows** (state agent not running)
- `priority_signals` table: **0 rows** (priority classifier not running)

**But:**
- `scans` table: **806 rows** ✅ (scan worker IS working!)
- `orchestrator_runs` table: **35 rows** ✅ (ran before, but not recently)

---

## 🎯 IMMEDIATE ACTION PLAN

### Step 1: Deploy Orchestration Worker (15 minutes)

```bash
# Deploy to Railway
railway up --service orchestration-worker

# Wait 2 minutes for deployment
sleep 120

# Verify it's running
railway logs --service orchestration-worker --tail

# Expected log: "[Orchestrator Worker] Waiting for jobs..."
```

### Step 2: Deploy Execution Worker (15 minutes)

```bash
# Deploy to Railway
railway up --service execution-worker

# Wait 2 minutes for deployment
sleep 120

# Verify it's running
railway logs --service execution-worker --tail

# Expected log: "[Execution Worker] Waiting for jobs..."
```

### Step 3: Test End-to-End Flow (30 minutes)

**Trigger a complete workflow:**

```bash
# 1. Trigger scan (already working)
curl -X POST https://www.virtualcofounder.ai/api/scans/trigger

# 2. Wait for scan to complete (~2 min)
# 3. Orchestrator should auto-run (check agent_sessions table)
# 4. Stories created → Linear tasks created
# 5. Approve story in Linear (set to "In Progress")
# 6. Execution worker should create PR
```

**Verify data population:**
```sql
-- After 10 minutes, check:
SELECT COUNT(*) FROM agent_sessions;  -- Should be > 0
SELECT COUNT(*) FROM project_snapshots;  -- Should be > 0
SELECT COUNT(*) FROM priority_signals;  -- Should be > 0
```

### Step 4: Set Up Cron Jobs (Optional)

**Add to Vercel cron (vercel.json):**
```json
{
  "crons": [
    {
      "path": "/api/scans/trigger",
      "schedule": "0 2 * * *"
    },
    {
      "path": "/api/orchestrator/run",
      "schedule": "30 2 * * *"
    }
  ]
}
```

Or use Railway cron triggers:
- Scan Worker: Runs continuously (queue-based)
- Orchestrator: Triggered by scan completion
- Execution: Triggered by story approval

---

## 🐛 TROUBLESHOOTING

### Worker Not Starting

**Check logs:**
```bash
railway logs --service orchestration-worker
```

**Common issues:**
- Missing environment variables → Copy from main service
- Database connection timeout → Use direct URL (not pooler)
- Redis connection failed → Check REDIS_URL (rediss:// for TLS)
- Prisma client not generated → Add `postinstall` script

### Worker Crashing

**Check for:**
- Out of memory → Increase Railway plan
- Unhandled promise rejections → Add error handlers
- Missing dependencies → `npm install` in worker

### No Jobs Processing

**Verify:**
```bash
# Check Redis connection
redis-cli -u $REDIS_URL PING

# Check queue exists
redis-cli -u $REDIS_URL KEYS "bull:*"

# Check job counts
redis-cli -u $REDIS_URL LLEN "bull:orchestrate:waiting"
```

---

## 📈 SUCCESS METRICS

**When workers are fully operational, you should see:**

1. **Database Growth**
   - `agent_sessions`: New rows every orchestrator run
   - `project_snapshots`: Daily snapshots for each project
   - `priority_signals`: Signals from Linear/Slack
   - `completions`: Stories with PR URLs

2. **Linear Integration**
   - New VIR-* issues created automatically
   - Comments added by agent ("✅ Story approved")
   - Status updates from "Backlog" → "In Progress" → "Done"

3. **GitHub Activity**
   - PRs created by virtual-cofounder[bot]
   - Commits with agent execution traces
   - Branch naming: `vc-auto-{storyId}`

4. **Slack Activity** (if configured)
   - Morning check-in messages
   - Story completion notifications
   - PR ready for review alerts

---

## 📝 NEXT STEPS AFTER DEPLOYMENT

1. **Monitor first orchestrator run** (~5 min)
   - Check `agent_sessions` for thinking traces
   - Verify stories created
   - Confirm Linear tasks appear

2. **Test execution flow** (~10 min)
   - Approve a story in Linear
   - Watch execution worker logs
   - Verify PR created

3. **Enable state snapshots** (~1 day)
   - Create state snapshot worker (separate service)
   - Run nightly to populate Progress page
   - Or add to orchestrator worker (after scan completion)

4. **Add priority classification** (~1 day)
   - Implement `lib/priority/classifier.ts`
   - Hook into Slack/Linear webhooks
   - Populate `priority_signals` table

---

## 🎉 SUMMARY

**Linear Integration: ✅ 100% Working**
- API connected
- Webhook configured
- 10 active issues
- Ready to receive automated tasks

**Workers: 🟡 33% Deployed**
- Scan Worker: ✅ Running
- Orchestration Worker: 🔴 Needs deployment
- Execution Worker: 🔴 Needs deployment

**To Fix:**
```bash
railway up --service orchestration-worker
railway up --service execution-worker
```

**Time to full operation:** ~30 minutes

---

*End of Linear & Worker Verification Report*
