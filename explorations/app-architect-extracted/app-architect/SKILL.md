---
name: app-architect
description: Generate comprehensive architecture specifications for applications and games. Use when a user wants to plan, design, or spec out an app idea before building. Triggers on requests like "help me plan an app", "architect this project", "create a spec for", "design the system for", "what tech stack should I use", game development planning, or when users describe app ideas and want implementation guidance. Uses Exa MCP to research current frameworks, libraries, and best practices for any tech stack.
---

# App Architect

Generate production-ready architecture specifications through guided discovery and technology research.

## Workflow

### Phase 1: Discovery

Ask questions in batches of 3-5 to understand requirements without overwhelming the user. See `references/discovery-questions.md` for comprehensive question frameworks by app category.

**Always Ask First**
1. What is the app's primary purpose? (one sentence)
2. Who are the users? (developers, consumers, businesses)
3. What platforms? (web, mobile, desktop)
4. What's your timeline and team size?
5. What technologies are you already comfortable with?

**Then Ask Category-Specific Questions**

*Multiplayer/Real-time*: Concurrent users per session? What needs real-time sync? Latency requirements?

*Games*: 2D or 3D? Art style inspiration? Core gameplay loop? Single/multiplayer?

*Data-heavy*: Expected volume? Read or write heavy? Analytics needs?

*Auth/Users*: Social login? Roles/permissions? Sensitive data?

For detailed question frameworks by category (games, e-commerce, SaaS, mobile, etc.), load `references/discovery-questions.md`.

### Phase 2: Research

Use Exa MCP tools to find current best practices. **Always research before recommending.**

```
# Use exa:get_code_context_exa for:
"[technology] TypeScript integration 2024 2025"
"[framework] multiplayer game example tutorial"
"[database] real-time subscription React"

# Use exa:web_search_exa for:
"[tech A] vs [tech B] comparison 2024"
"best [category] framework 2024 2025"
```

**Research Checklist**
- [ ] Technologies user mentioned or seems interested in
- [ ] Alternatives for comparison
- [ ] Integration patterns between chosen technologies
- [ ] Current best practices and gotchas

### Phase 3: Recommend Stack

Present choices as a table with clear rationale:

```markdown
| Layer | Technology | Why |
|-------|------------|-----|
| Frontend | [Choice] | [Reason specific to this project] |
| Backend | [Choice] | [Tradeoff explanation] |
| Database | [Choice] | [Why it fits their needs] |
| Auth | [Choice] | [Consideration of their requirements] |
```

**Get user confirmation before proceeding to full spec.**

### Phase 4: Generate Spec

Create comprehensive markdown document. For structure, see `references/spec-template.md`.

**Required Sections**
1. Project Overview (vision, core features, success metrics)
2. Tech Stack (complete with versions)
3. System Architecture (diagram, data flow)
4. Data Models (schemas with actual code)
5. Core Logic (business rules, algorithms)
6. API/Interface Design (endpoints, methods, signatures)
7. Client Architecture (components, hooks, state)
8. Authentication (identity, sessions, permissions)
9. UI/UX Screens (flow diagram, key screens)
10. File Structure (complete project layout)
11. Implementation Phases (week-by-week plan)
12. Future Features (post-MVP roadmap)

**Spec Length Guide**
- Simple CRUD app: ~200-400 lines
- Medium complexity (auth, real-time features): ~500-800 lines
- Complex (multiplayer game, distributed system): ~1000-2000 lines

### Phase 5: Deliver

Save as `[project-name]-architecture.md` and present to user.

## Quality Checklist

- [ ] All code examples use specific language/framework syntax
- [ ] Versions specified (e.g., "Next.js 14+" not just "Next.js")
- [ ] Data models are complete and typed
- [ ] File structure covers entire project
- [ ] Implementation phases are realistic
- [ ] Research-backed recommendations (not just training knowledge)
- [ ] User's existing skills factored into choices
