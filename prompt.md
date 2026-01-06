# Ralph Build Agent - Virtual Cofounder Phase 2

You are implementing the Virtual Cofounder project using Ralph loops. Your task is to implement ONE user story at a time, validate it, and capture learnings.

## Current Story

Read `prd.json` and find the FIRST story where `status == "todo"` and `blockedBy` is empty or all blocking stories are complete.

## Implementation Process

1. **Read the story**
   - Understand acceptance criteria
   - Check what files need to be created
   - Review any referenced files (e.g., old system code to port)

2. **Implement the story**
   - Create all required files
   - Follow TypeScript best practices
   - Use existing patterns from Phase 1 (Prisma, Next.js App Router)
   - Add proper error handling
   - Write clean, production-ready code

3. **Validate**
   - Run all acceptance criteria commands
   - Ensure all `mustExist` files are created
   - Ensure all `mustContain` patterns are present
   - Ensure all `mustPass` commands succeed

4. **Capture learnings**
   - Append to `progress.txt`:
     - Story ID and title
     - What worked well
     - What was challenging
     - Any patterns established
     - File:line references for key decisions

5. **Update prd.json**
   - Change story `status` from "todo" to "done"
   - Move to next story

## Context from Phase 1

**Database**: We use Prisma + Supabase PostgreSQL
- Connection: `lib/db.ts` exports singleton Prisma client
- Schema: `prisma/schema.prisma` has 9 tables including `scans` table
- Use pooler connection (port 6543) for runtime, direct (5432) for migrations

**Tech Stack**:
- Next.js 14 with App Router
- TypeScript strict mode
- Tailwind CSS for styling
- Prisma for database ORM

**Existing Files**:
- `app/page.tsx` - Dashboard (Portfolio + Overview views)
- `lib/db.ts` - Prisma client
- `prisma/schema.prisma` - Database schema

**Old System Reference**:
- `/Users/miguel/Reboot/dashboard-archive/scan_projects.js` - Old scanning code to port

## Dependencies to Install

When you need new packages, use:
```bash
npm install <package>
```

Common packages for Phase 2:
- `bullmq` - Already installed (queue system)
- `ioredis` - For Redis connection
- `cheerio` - For HTML parsing (SEO scanner)
- `node-fetch` - For HTTP requests

## Validation Commands

After implementing, run:
```bash
npm run validate:story <story-id>
```

This will check all acceptance criteria and tell you if the story is complete.

## Remember

- One story at a time
- All acceptance criteria must pass
- Capture learnings after each story
- Update prd.json status when done
- Ask for clarification if story is unclear

Now, read `prd.json`, find the first incomplete story, and implement it!
