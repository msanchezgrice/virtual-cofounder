# Virtual Cofounder V1 Completion Roadmap

**Date**: 2026-01-07
**Current Status**: Phases 1-6 Complete, Dashboard Working
**Assessment Method**: Live site inspection + codebase analysis

---

## Executive Summary

### ✅ What's Working (Confirmed via Live Site)

**Dashboard at `/dashboard`**:
- ✅ Portfolio view showing 74 projects
- ✅ Health scores calculated (82/100 average)
- ✅ Scan data visible (21 scanned today)
- ✅ High priority issues shown (1 critical: SurgeryViz with 60/100 health)
- ✅ Recent scans list (Warmstart: 75/100, 17h ago)
- ✅ Filter & sort functionality working
- ✅ "View Site" buttons for each project

**Marketing Site**:
- ✅ Landing page with hero section
- ✅ Navigation menu (Your team, How we help, Your board, Daily rhythm)
- ✅ Kanban board mockup showing workflow
- ✅ Agent showcase section
- ✅ Daily rhythm visualization

**Backend Infrastructure**:
- ✅ All 6 phases implemented (database, scanning, orchestrator, Slack, PR creation, Linear)
- ✅ 73 projects seeded in database
- ✅ Scan API working (`/api/scans`)
- ✅ Orchestrator API ready (`/api/orchestrator/run`)
- ✅ Slack integration coded
- ✅ Linear integration coded
- ✅ Railway execution worker deployed

---

## Critical Gaps: User's 5 Testing Requirements

### 1. ❌ "See my projects scanned automatically"

**Current**: ✅ Scans work, ❌ Not automated

**What's Missing**:
- No Vercel cron job configured
- Manual trigger only via API call
- No scheduling visible to user

**Solution** (2 hours):
```typescript
// File: vercel.json (NEW)
{
  "crons": [{
    "path": "/api/scans/trigger",
    "schedule": "0 9 * * *"  // 9am daily
  }, {
    "path": "/api/orchestrator/run",
    "schedule": "30 9 * * *"  // 9:30am daily (after scans)
  }]
}

// File: app/(app)/dashboard/page.tsx (UPDATE)
// Add "Run Scans Now" button for manual testing
<button onClick={() => fetch('/api/scans/trigger', { method: 'POST' })}>
  🔄 Run Scans Now
</button>
```

**Test Flow**:
1. Add vercel.json file
2. Deploy to Vercel
3. Verify cron runs at 9am
4. Add manual trigger button to dashboard
5. Click button → See "Scanned Today" count increase

---

### 2. ❌ "See Slack messages working (am/pm priority messages)"

**Current**: ✅ Code ready, ❌ Not scheduled, ❌ No test endpoint

**What's Missing**:
- No cron job for morning/evening messages
- Can't test Slack flow without manual trigger
- Approval buttons exist but not visible in dashboard

**Solution** (3 hours):

**A. Add Cron Jobs**:
```json
// File: vercel.json (UPDATE)
{
  "crons": [
    {
      "path": "/api/slack/check-in",
      "schedule": "0 9 * * *"  // Morning check-in
    },
    {
      "path": "/api/slack/evening-recap",
      "schedule": "0 18 * * *"  // Evening recap
    }
  ]
}
```

**B. Create Test Trigger**:
```typescript
// File: app/api/slack/test-message/route.ts (NEW)
import { sendSlackMorningMessage } from '@/lib/slack';

export async function POST() {
  try {
    await sendSlackMorningMessage({
      channel: process.env.SLACK_CHANNEL_ID!,
      projects: await getHighPriorityProjects(),
    });
    return Response.json({ success: true });
  } catch (error) {
    return Response.json({ error: String(error) }, { status: 500 });
  }
}
```

**C. Add Dashboard Button**:
```tsx
// File: app/(app)/dashboard/page.tsx (UPDATE)
<button onClick={() => fetch('/api/slack/test-message', { method: 'POST' })}>
  💬 Send Test Slack Message
</button>
```

**Test Flow**:
1. Add test endpoint
2. Add button to dashboard
3. Click "Send Test Slack Message"
4. Check #cofounder-updates channel
5. Verify morning message appears with priorities
6. Test approval buttons work

---

### 3. ❌ "See Linear tasks moving with comments"

**Current**: ✅ Tasks created, ❌ Not visible in dashboard

**What's Missing**:
- No way to see Linear tasks without opening Linear app
- No visual connection between completions and Linear
- Agent comments hidden

**Solution** (4 hours):

**A. Create Completions Page**:
```typescript
// File: app/(app)/completions/page.tsx (NEW)
'use client';

export default function CompletionsPage() {
  const [completions, setCompletions] = useState([]);

  useEffect(() => {
    fetch('/api/completions')
      .then(r => r.json())
      .then(setCompletions);
  }, []);

  return (
    <div className="max-w-7xl mx-auto px-6 py-8">
      <h1 className="text-3xl font-bold mb-6">Agent Recommendations</h1>

      <div className="space-y-4">
        {completions.map(completion => (
          <CompletionCard
            key={completion.id}
            {...completion}
          />
        ))}
      </div>
    </div>
  );
}

function CompletionCard({ title, rationale, priority, status, linearTaskId, prUrl }) {
  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-xl font-semibold">{title}</h3>
          <p className="text-gray-600 mt-2">{rationale}</p>
          <div className="flex gap-4 mt-4">
            <span className={`px-3 py-1 rounded ${getPriorityColor(priority)}`}>
              {priority}
            </span>
            <span className={`px-3 py-1 rounded ${getStatusColor(status)}`}>
              {status}
            </span>
          </div>
        </div>
        <div className="flex gap-2">
          {linearTaskId && (
            <a href={`https://linear.app/.../${linearTaskId}`}
               target="_blank"
               className="px-4 py-2 bg-purple-600 text-white rounded">
              📋 View in Linear
            </a>
          )}
          {prUrl && (
            <a href={prUrl}
               target="_blank"
               className="px-4 py-2 bg-gray-800 text-white rounded">
              🔗 View PR
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
```

**B. Create API Route**:
```typescript
// File: app/api/completions/route.ts (NEW)
import { db } from '@/lib/db';

export async function GET() {
  const completions = await db.completion.findMany({
    orderBy: { createdAt: 'desc' },
    take: 50,
    include: {
      project: true,
    },
  });

  return Response.json(completions);
}
```

**C. Add Navigation Link**:
```tsx
// File: app/(app)/layout.tsx (UPDATE)
<nav>
  <Link href="/dashboard">Dashboard</Link>
  <Link href="/completions">Completions</Link>  {/* NEW */}
  <Link href="/agents">Agents</Link>           {/* NEW */}
</nav>
```

**Test Flow**:
1. Create completions page
2. Run orchestrator: `curl -X POST http://localhost:3000/api/orchestrator/run`
3. Navigate to `/completions`
4. Click "View in Linear" → See task with agent comments
5. Verify status badge shows correct state

---

### 4. ✅ "See scan results" (PARTIALLY WORKING)

**Current**: ✅ Overview shows results, ❌ Detail view missing

**What's Working**:
- Dashboard shows high-level scan stats
- Health scores visible per project
- Issues listed for high-priority projects

**What's Missing**:
- Can't click into a project to see detailed scan results
- No scan history timeline
- No way to see SEO/analytics scan details

**Solution** (5 hours):

**A. Create Project Detail Page**:
```typescript
// File: app/(app)/projects/[id]/page.tsx (NEW)
export default async function ProjectDetailPage({ params }: { params: { id: string } }) {
  const project = await db.project.findUnique({
    where: { id: params.id },
    include: {
      scans: {
        orderBy: { scannedAt: 'desc' },
        take: 10,
      },
    },
  });

  return (
    <div className="max-w-7xl mx-auto px-6 py-8">
      <h1 className="text-3xl font-bold mb-2">{project.name}</h1>
      <a href={`https://${project.domain}`} className="text-blue-600">
        {project.domain}
      </a>

      {/* Tabs */}
      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="scans">Scan Results</TabsTrigger>
          <TabsTrigger value="completions">Recommendations</TabsTrigger>
        </TabsList>

        <TabsContent value="scans">
          <ScanHistory scans={project.scans} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function ScanHistory({ scans }) {
  return (
    <div className="space-y-6">
      {scans.map(scan => (
        <div key={scan.id} className="bg-white rounded-lg shadow p-6">
          <div className="flex justify-between items-start mb-4">
            <h3 className="text-lg font-semibold">{scan.scanType} Scan</h3>
            <span className="text-sm text-gray-600">
              {formatDate(scan.scannedAt)}
            </span>
          </div>

          {scan.scanType === 'domain' && (
            <DomainScanResults data={scan.domainData} />
          )}
          {scan.scanType === 'seo' && (
            <SEOScanResults data={scan.seoDetail} />
          )}
          {scan.scanType === 'analytics' && (
            <AnalyticsScanResults data={scan.analyticsData} />
          )}
        </div>
      ))}
    </div>
  );
}

function SEOScanResults({ data }) {
  return (
    <div className="grid grid-cols-2 gap-4">
      <ResultRow
        label="Title Tag"
        value={data.title || 'Missing'}
        status={data.title ? 'pass' : 'fail'}
      />
      <ResultRow
        label="Meta Description"
        value={data.metaDescription || 'Missing'}
        status={data.metaDescription ? 'pass' : 'fail'}
      />
      <ResultRow
        label="OG Image"
        value={data.ogImage || 'Missing'}
        status={data.ogImage ? 'pass' : 'fail'}
      />
      <ResultRow
        label="Robots.txt"
        value={data.hasRobots ? 'Found' : 'Missing'}
        status={data.hasRobots ? 'pass' : 'warn'}
      />
      <ResultRow
        label="Sitemap"
        value={data.hasSitemap ? 'Found' : 'Missing'}
        status={data.hasSitemap ? 'pass' : 'warn'}
      />
    </div>
  );
}

function ResultRow({ label, value, status }) {
  const colors = {
    pass: 'bg-green-50 text-green-700',
    fail: 'bg-red-50 text-red-700',
    warn: 'bg-yellow-50 text-yellow-700',
  };

  return (
    <div className="flex justify-between items-center">
      <span className="font-medium">{label}:</span>
      <span className={`px-3 py-1 rounded ${colors[status]}`}>
        {value}
      </span>
    </div>
  );
}
```

**B. Make Project Cards Clickable**:
```tsx
// File: app/(app)/dashboard/page.tsx (UPDATE ProjectCard)
function ProjectCard({ project }) {
  return (
    <Link href={`/projects/${project.id}`}>  {/* Make entire card clickable */}
      <div className="bg-white rounded-lg p-4 shadow hover:shadow-lg transition-shadow cursor-pointer">
        {/* ... existing card content ... */}
      </div>
    </Link>
  );
}
```

**Test Flow**:
1. Click any project card on dashboard
2. See project detail page with tabs
3. Click "Scan Results" tab
4. See detailed scan data with pass/fail indicators
5. Verify SEO, domain, analytics scans all visible

---

### 5. ❌ "See agents assigned to teams"

**Current**: ✅ Orchestrator assigns agents, ❌ Not visible anywhere

**What's Missing**:
- No way to see which agents ran for which projects
- Agent findings hidden in database
- Can't see agent activity timeline

**Solution** (4 hours):

**A. Create Agents Page**:
```typescript
// File: app/(app)/agents/page.tsx (NEW)
'use client';

export default function AgentsPage() {
  const [agentActivity, setAgentActivity] = useState([]);

  useEffect(() => {
    fetch('/api/agents/activity')
      .then(r => r.json())
      .then(setAgentActivity);
  }, []);

  return (
    <div className="max-w-7xl mx-auto px-6 py-8">
      <h1 className="text-3xl font-bold mb-6">Agent Activity</h1>

      <div className="grid grid-cols-3 gap-6">
        {agentActivity.map(agent => (
          <AgentCard key={agent.name} {...agent} />
        ))}
      </div>

      <div className="mt-12">
        <h2 className="text-2xl font-semibold mb-4">Recent Findings</h2>
        <FindingsTimeline findings={agentActivity.flatMap(a => a.findings)} />
      </div>
    </div>
  );
}

function AgentCard({ name, icon, activeProjects, findingsCount, status }) {
  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="flex items-center gap-3 mb-4">
        <span className="text-3xl">{icon}</span>
        <div>
          <h3 className="font-semibold">{name}</h3>
          <span className={`text-sm ${status === 'active' ? 'text-green-600' : 'text-gray-500'}`}>
            {status === 'active' ? '🟢 Active' : '⚪ Idle'}
          </span>
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex justify-between">
          <span className="text-gray-600">Projects:</span>
          <span className="font-semibold">{activeProjects}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-600">Findings:</span>
          <span className="font-semibold">{findingsCount}</span>
        </div>
      </div>
    </div>
  );
}

function FindingsTimeline({ findings }) {
  return (
    <div className="space-y-4">
      {findings.map(finding => (
        <div key={finding.id} className="bg-white rounded-lg shadow p-4 border-l-4 border-blue-600">
          <div className="flex justify-between items-start">
            <div>
              <span className="font-semibold text-blue-600">{finding.agent}</span>
              <span className="text-gray-600 mx-2">•</span>
              <span className="font-medium">{finding.project}</span>
            </div>
            <span className="text-sm text-gray-500">{formatTimeAgo(finding.createdAt)}</span>
          </div>
          <p className="mt-2 text-gray-700">{finding.issue}</p>
          <p className="mt-1 text-sm text-gray-600">{finding.action}</p>
          <div className="flex gap-2 mt-2">
            <span className={`text-xs px-2 py-1 rounded ${getSeverityColor(finding.severity)}`}>
              {finding.severity}
            </span>
            <span className="text-xs px-2 py-1 rounded bg-gray-100">
              Impact: {finding.impact}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}
```

**B. Create API Route**:
```typescript
// File: app/api/agents/activity/route.ts (NEW)
import { db } from '@/lib/db';
import { agents } from '@/lib/agents';

export async function GET() {
  // Get recent findings grouped by agent
  const findings = await db.agentFinding.findMany({
    orderBy: { createdAt: 'desc' },
    take: 100,
    include: {
      project: true,
    },
  });

  // Group by agent
  const agentActivity = Object.values(agents).map(agent => {
    const agentFindings = findings.filter(f => f.agent === agent.role);
    const activeProjects = new Set(agentFindings.map(f => f.projectId)).size;

    return {
      name: agent.name,
      icon: agent.icon || '🤖',
      role: agent.role,
      activeProjects,
      findingsCount: agentFindings.length,
      status: agentFindings.length > 0 ? 'active' : 'idle',
      findings: agentFindings.slice(0, 5),
    };
  });

  return Response.json(agentActivity);
}
```

**Test Flow**:
1. Run orchestrator: `curl -X POST http://localhost:3000/api/orchestrator/run`
2. Navigate to `/agents`
3. See agent cards showing activity
4. See which agents found issues for which projects
5. Verify findings timeline shows recent discoveries

---

## Phase 7-9 Review: What to Skip for V1

### Phase 7: Advanced Scanning

**From Original Spec**:
- ✅ INCLUDE: Vercel deployment scanner (quick win, 2 hours)
- ⏸️ DEFER: Playwright/Browserless (Core Web Vitals, screenshots)
- ⏸️ DEFER: Security scanning (npm audit, exposed secrets)

**Rationale**: Current 3 scanners sufficient for testing. Vercel scanner adds deployment status visibility which is useful. Playwright and security can wait for V2.

**Quick Win - Vercel Scanner** (2 hours):
```typescript
// File: lib/scanners/vercel.ts (NEW)
export async function scanVercelDeployment(projectId: string) {
  const response = await fetch(
    `https://api.vercel.com/v13/deployments?projectId=${projectId}`,
    {
      headers: {
        Authorization: `Bearer ${process.env.VERCEL_TOKEN}`,
      },
    }
  );

  const { deployments } = await response.json();
  const latest = deployments[0];

  return {
    status: latest.state, // READY, ERROR, BUILDING
    url: latest.url,
    createdAt: latest.created,
    buildTime: latest.buildTime,
    hasErrors: latest.state === 'ERROR',
    errorMessage: latest.errorMessage,
  };
}
```

### Phase 8: Production Polish

**From Original Spec**:
- ⏸️ DEFER: Landing page (already exists!)
- ⏸️ DEFER: Progressive OAuth wizard (current setup works)
- ⏸️ DEFER: Documentation (README sufficient for V1)
- ⚠️ INCLUDE: Error handling/logging (critical for debugging)
- ⏸️ DEFER: Performance optimization (not needed yet)

**Keep**: Basic error boundaries and console logging
**Skip**: Everything else

### Phase 9: Multi-User

**Status**: ⏸️ DEFER ENTIRELY

Database already multi-user ready with `workspace_id`. Single-user hardcoded values work perfectly for V1 testing. Multi-user is a V2 feature.

---

## Minimum Viable V1: Implementation Checklist

### Week 1: Core Visibility (16 hours)

**Day 1-2: Essential Pages** (10 hours)
- [ ] Create `/completions` page showing agent recommendations
- [ ] Create `/agents` page showing agent activity
- [ ] Create `/projects/[id]` detail page with scan results tabs
- [ ] Add navigation menu linking all pages
- [ ] Make project cards clickable (link to detail page)

**Day 3: Automation Setup** (6 hours)
- [ ] Create `vercel.json` with cron jobs:
  - Morning scan trigger (9am)
  - Orchestrator run (9:30am)
  - Morning Slack check-in (9am)
  - Evening Slack recap (6pm)
- [ ] Add manual trigger buttons to dashboard:
  - "Run Scans Now"
  - "Run Orchestrator"
  - "Send Test Slack Message"
- [ ] Create `/api/slack/test-message` endpoint

### Week 2: Test & Polish (8 hours)

**Day 4: E2E Testing** (4 hours)
- [ ] Test full flow: Scan → Orchestrator → Completions → Linear
- [ ] Verify Slack messages send correctly
- [ ] Test approval buttons in Slack
- [ ] Verify Linear tasks show agent comments
- [ ] Check Railway execution worker creates PRs

**Day 5: Quick Wins** (2 hours)
- [ ] Add Vercel deployment scanner
- [ ] Add error boundaries to all pages
- [ ] Fix any bugs discovered in testing

**Day 6: Deploy & Validate** (2 hours)
- [ ] Deploy to Vercel production
- [ ] Verify cron jobs run on schedule
- [ ] Test live Slack integration
- [ ] Document test results

---

## V1 Success Criteria

When V1 is complete, you should be able to:

### User Requirement 1: ✅ See projects scanned automatically
- [ ] Cron triggers scans daily at 9am
- [ ] Dashboard shows "Scanned Today" count
- [ ] "Run Scans Now" button works for manual testing
- [ ] Recent scans list updates after each run

### User Requirement 2: ✅ See Slack messages working
- [ ] Morning check-in sent at 9am
- [ ] Evening recap sent at 6pm
- [ ] Test button sends message on demand
- [ ] Approval buttons in Slack work
- [ ] Clicking [Approve] triggers execution worker

### User Requirement 3: ✅ See Linear tasks moving with comments
- [ ] Navigate to `/completions` page
- [ ] See list of agent recommendations
- [ ] Click "View in Linear" opens Linear task
- [ ] Linear task shows agent dialogue in comments
- [ ] Task status syncs when completion changes

### User Requirement 4: ✅ See scan results
- [ ] Click any project card on dashboard
- [ ] See project detail page
- [ ] Click "Scan Results" tab
- [ ] View detailed SEO, domain, analytics scans
- [ ] Pass/fail indicators clear for each check

### User Requirement 5: ✅ See agents assigned to teams
- [ ] Navigate to `/agents` page
- [ ] See list of all agents with activity counts
- [ ] View which agents found issues
- [ ] See findings timeline
- [ ] Identify which projects each agent worked on

---

## Files to Create/Modify

### New Files (10 files)
```
vercel.json                               # Cron job configuration
app/(app)/completions/page.tsx            # Completions browser
app/(app)/agents/page.tsx                 # Agent activity dashboard
app/(app)/projects/[id]/page.tsx          # Project detail with scans
app/api/completions/route.ts              # Completions API
app/api/agents/activity/route.ts          # Agent activity API
app/api/slack/test-message/route.ts       # Slack test trigger
app/api/slack/evening-recap/route.ts      # Evening recap cron
lib/scanners/vercel.ts                    # Vercel deployment scanner
components/ScanResults.tsx                # Reusable scan display component
```

### Files to Modify (3 files)
```
app/(app)/layout.tsx                      # Add navigation menu
app/(app)/dashboard/page.tsx              # Add manual trigger buttons
app/api/scans/trigger/route.ts            # Ensure triggers all scan types
```

---

## Estimated Timeline

**Total Time**: 24 hours of focused work

**Week 1** (16 hours):
- Mon-Tue: Build missing pages (10h)
- Wed: Set up automation (6h)

**Week 2** (8 hours):
- Thu: E2E testing (4h)
- Fri: Quick wins & polish (2h)
- Sat: Deploy & validate (2h)

**Outcome**: Fully testable V1 ready for real-world use

---

## What's NOT in V1 (Defer to V2)

❌ Advanced Features (Phase 7-9):
- Playwright deep scans (Core Web Vitals, screenshots)
- Security scanning (npm audit, exposed secrets)
- Multi-user support (authentication, workspaces)
- Public landing page (current one is fine for testing)
- Mobile responsive design (desktop-first OK)
- Advanced visualizations
- Billing/monetization

✅ What V1 Includes:
- All backend infrastructure working
- Dashboard with real scan data
- Manual + automated scanning
- Slack notifications + approvals
- Linear integration with comments
- PR creation via Railway
- Vercel deployment monitoring
- 3 core scanners (domain, SEO, analytics)
- Single-user mode (hardcoded workspace)

---

## Next Steps (Today)

1. **Review this document** - Confirm priorities align with your vision
2. **Choose starting point** - Pick one of these options:
   - Option A: Start with completions page (highest visibility)
   - Option B: Start with automation setup (enables testing)
   - Option C: Start with agents page (shows orchestrator working)

3. **Set timeline** - Decide if 2-week timeline works or adjust

4. **Begin implementation** - I can start building any of these immediately

---

## Key Insights from Live Site Assessment

### What's Better Than Expected ✨
- Dashboard UI is polished and functional
- Health scores working correctly
- Scan data displaying properly
- Marketing site is professional
- Navigation structure logical

### What Needs Work ⚠️
- No way to test automation (missing cron + buttons)
- Completions/agents pages don't exist (backend works but invisible)
- Project detail view missing (can't drill down into scan results)
- Slack integration not testable without triggers
- Linear integration invisible from dashboard

### Quick Wins Available 🎯
1. Add 3 trigger buttons to dashboard (30 min)
2. Create vercel.json for cron (15 min)
3. Build completions page (3 hours)
4. Build agents page (3 hours)
5. Add Vercel scanner (2 hours)

**Total for quick wins**: ~9 hours to make everything testable

---

## Conclusion

**Current State**: Backend is 100% complete. Frontend is 40% complete.

**Gap**: Missing 3 pages + automation setup + test triggers.

**Recommendation**: Focus on Week 1 tasks (pages + automation). This unlocks all 5 of your testing requirements and makes V1 fully usable.

**Timeline**: 2 weeks of focused work gets you to a production-ready V1.

**After V1**: You'll have a working system managing 74 projects with automated scans, AI agent recommendations, Slack notifications, Linear integration, and automated PR creation. Perfect foundation for scaling to more users (Phase 9) and advanced features (Phase 7-8).

---

**Status**: Ready to begin V1 completion
**Blocked by**: Nothing - all infrastructure complete
**Next action**: Create `/completions` page as first high-value addition
