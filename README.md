# Virtual Cofounder

AI Head of Product for Portfolio Management - Cloud-based orchestration system that scans 10-20 projects, creates PRs, and notifies via Slack.

## Quick Start

```bash
# Install dependencies
npm install

# Set up environment variables
cp .env.local .env

# Run dev server
npm run dev
```

## Environment Variables Needed

### Required:
- `DATABASE_URL` - Supabase PostgreSQL connection string (need password from dashboard)
- `ANTHROPIC_API_KEY` - ✅ Configured
- `NEXT_PUBLIC_SUPABASE_URL` - ✅ Configured
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` - ✅ Configured
- `UPSTASH_REDIS_REST_URL` - ✅ Configured
- `VERCEL_TOKEN` - ✅ Configured

### To Create:
- `GITHUB_APP_ID` + `GITHUB_APP_PRIVATE_KEY` - GitHub App for repo access
- `SLACK_BOT_TOKEN` + `SLACK_SIGNING_SECRET` - Slack integration
- `LINEAR_CLIENT_ID` + `LINEAR_API_KEY` - Linear integration

## Architecture

- **Frontend**: Next.js 14 with App Router, TypeScript, Tailwind CSS
- **Database**: Supabase PostgreSQL with Prisma ORM
- **Queue**: Upstash Redis with BullMQ
- **Workers**: Railway (for scanning & PR creation)
- **Agents**: Claude Agent SDK (17 specialist agents)
- **Integrations**: Slack, Linear, GitHub, Vercel

## Project Structure

```
├── app/                 # Next.js App Router
│   ├── api/            # API routes (scans, orchestrator, webhooks)
│   ├── projects/       # Project detail pages
│   └── page.tsx        # Dashboard (portfolio/overview toggle)
├── lib/                # Shared utilities
│   ├── agents/         # Claude Agent SDK agents
│   ├── db.ts           # Prisma client
│   └── orchestrator.ts # Head of Product orchestrator
├── prisma/             # Database schema & migrations
├── scripts/            # Seed scripts, validation tests
├── workers/            # Background job workers (Railway)
└── tests/              # E2E tests (Playwright)
```

## Implementation Status

### ✅ Phase 1: Foundation (COMPLETE)
- [x] Project initialized
- [x] Dependencies installed
- [x] Basic dashboard UI created
- [x] Database connection configured
- [x] Prisma schema created (9 tables)
- [x] Prisma client (lib/db.ts)
- [x] Test scripts created
- [x] Seed script created
- [x] Push schema to Supabase
- [x] Run seed data (73 projects imported)
- [ ] Deploy to Vercel (ready for deployment)

### 🔜 Phase 2-8: Coming Soon
- Scanning system
- Orchestrator + agents
- Slack integration
- PR creation
- Linear integration
- Advanced scanning
- Production polish

## Getting Database Password

Go to: https://supabase.com/dashboard/project/wklvmptaapqowjubsgse/settings/database

Copy the **Connection string (URI)** - it contains the password.
