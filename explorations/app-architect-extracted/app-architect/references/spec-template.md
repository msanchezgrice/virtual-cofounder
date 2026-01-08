# Architecture Spec Template

Comprehensive template for architecture documents. Adapt sections based on project complexity.

## Document Structure

```markdown
# [Project Name]
## Architecture & Implementation Specification

> **Project Codename**: [Name]
> **Type**: [Web App / Mobile App / Game / API]
> **Author**: [Creator]

---

## 1. Project Overview

### Vision
[2-3 sentences: what is it and why does it matter]

### Core Features
- Feature 1 - brief description
- Feature 2 - brief description

### Success Metrics
- [Measurable goal 1]
- [Measurable goal 2]

---

## 2. Tech Stack

| Layer | Technology | Version | Purpose |
|-------|------------|---------|---------|
| Frontend | [Framework] | [x.x+] | [Why] |
| Backend | [Framework/DB] | [x.x+] | [Why] |
| Database | [DB] | [x.x+] | [Why] |
| Auth | [Provider] | - | [Why] |

---

## 3. System Architecture

### Diagram
```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Client    │────▶│   Server    │────▶│  Database   │
└─────────────┘     └─────────────┘     └─────────────┘
```

### Data Flow
1. [Request initiates]
2. [Processing happens]
3. [Response returns]

---

## 4. Data Models

### [Entity Name]
```typescript
interface EntityName {
  id: string;
  field1: Type;
  field2: Type;
  createdAt: Date;
}
```

[Repeat for all core entities with actual typed definitions]

---

## 5. Core Logic

### [Feature/Algorithm Name]
```typescript
// Actual implementation code or detailed pseudocode
function featureName(params: Type): ReturnType {
  // Logic here
}
```

### Business Rules
- Rule 1: [Description]
- Rule 2: [Description]

---

## 6. API/Interface Design

### `POST /api/resource`
- **Purpose**: [What it does]
- **Auth**: Required/Optional
- **Body**: `{ field: type }`
- **Response**: `{ field: type }`

[Repeat for all endpoints/methods]

---

## 7. Client Architecture

### State Management
[Approach and key stores/contexts]

### Key Hooks
```typescript
export function useFeature() {
  // Implementation
}
```

---

## 8. Authentication

### Flow
1. User action
2. Provider handles
3. Token stored
4. Subsequent requests authenticated

### Permissions Table
| Role | Capabilities |
|------|-------------|
| User | X, Y |
| Admin | X, Y, Z |

---

## 9. UI/UX Screens

### Flow
```
Home ──▶ List ──▶ Detail ──▶ Action
```

### Key Screens
1. **Screen Name** - Purpose, key elements

---

## 10. File Structure

```
project/
├── package.json
├── src/
│   ├── app/
│   ├── components/
│   ├── lib/
│   └── hooks/
└── public/
```

---

## 11. Implementation Phases

### Phase 1: Foundation (Week 1)
- [ ] Setup
- [ ] Core structure

### Phase 2: Features (Week 2-3)
- [ ] Core features
- [ ] UI

### Phase 3: Polish (Week 4)
- [ ] Testing
- [ ] Optimization

---

## 12. Future Features

- Near-term ideas
- Long-term vision
```

## Section Adaptations

**For Games** add:
- Game Mechanics (controls, physics, rules, game loop)
- Asset Requirements (sprites, audio)
- Multiplayer/Networking (if applicable)

**For Real-time Apps** add:
- Subscription Design
- State Synchronization
- Conflict Resolution

**For Mobile** add:
- Platform Considerations
- Offline Support
- Push Notifications

**For APIs** expand:
- Full endpoint documentation
- Rate Limiting
- Versioning

## Length Guidelines

| Complexity | Lines | Examples |
|------------|-------|----------|
| Simple | 200-400 | CRUD app, landing page |
| Medium | 500-800 | Auth + real-time features |
| Complex | 1000-2000 | Multiplayer game, distributed system |
