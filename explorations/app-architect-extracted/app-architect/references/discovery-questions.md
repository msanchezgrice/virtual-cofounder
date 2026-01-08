# Discovery Question Frameworks

Detailed question sets for different app categories. Use to thoroughly understand requirements before researching and recommending.

## Universal Questions (Always Ask)

1. **Purpose**: What problem does this solve in one sentence?
2. **Users**: Who uses this? (developers, consumers, businesses, internal)
3. **Platform**: Web, mobile, desktop, or all?
4. **Scale**: How many users initially? Growth expectations?
5. **Timeline**: When do you need MVP? Full launch?
6. **Team**: Solo or team? What skills are available?
7. **Familiarity**: What tech do you already know well?
8. **Constraints**: Budget, hosting preferences, must-use technologies?

## Category-Specific Questions

### Games

**Core Gameplay**
- 2D or 3D?
- What's the core loop? (What does player do repeatedly?)
- Single-player, multiplayer, or both?
- Turn-based or real-time?
- What existing game is this most like?

**Multiplayer (if applicable)**
- How many players per session?
- Competitive, cooperative, or both?
- Do players need accounts or can they play anonymously?
- What game state needs to sync? (positions, scores, inventory)
- Acceptable latency? (casual: 200ms OK, action: <50ms needed)

**Visuals & Assets**
- Art style reference? (pixel art, hand-drawn, minimal)
- Creating art yourself or need AI generation?
- Sound effects and music needed?

**Streaming/Content (if relevant)**
- Will this be streamed?
- Chat integration needed?
- Spectator mode?

### Real-time Collaboration

**Sync Requirements**
- What data needs real-time sync?
- How many concurrent editors per document/room?
- Conflict resolution strategy? (last-write-wins, OT, CRDT)

**Presence**
- Show who's online?
- Show cursors/selections?
- Typing indicators?

**Persistence**
- Auto-save frequency?
- Version history needed?
- Offline support?

### E-commerce / Marketplace

**Products**
- Physical, digital, or services?
- How many SKUs initially?
- Inventory management needed?

**Payments**
- One-time, subscription, or both?
- Multiple currencies?
- Marketplace (multiple sellers) or single vendor?

**Users**
- Guest checkout?
- User accounts with order history?
- Seller accounts?

### SaaS / Business Tools

**Multi-tenancy**
- Shared database or isolated per customer?
- Custom domains per tenant?
- Different pricing tiers?

**Integrations**
- What existing tools must this connect to?
- API needed for customers?
- Webhooks?

**Compliance**
- Industry regulations? (HIPAA, GDPR, SOC2)
- Data residency requirements?
- Audit logging?

### Mobile Apps

**Platform**
- iOS only, Android only, or both?
- Native or cross-platform?
- Tablet support?

**Device Features**
- Camera?
- GPS/Location?
- Push notifications?
- Offline functionality?

**Distribution**
- App stores or enterprise distribution?
- In-app purchases?

### Content / Media

**Content Types**
- Text, images, video, audio?
- User-generated or curated?
- Live streaming?

**Moderation**
- AI moderation needed?
- Human review queue?
- Reporting system?

**Discovery**
- Search?
- Recommendations?
- Feeds/timelines?

## Follow-up Patterns

**When user says "like X"**:
- "What specifically about X do you want to replicate?"
- "What would you do differently from X?"

**When requirements are vague**:
- "Can you walk me through a typical user session?"
- "What's the #1 thing users should be able to do?"

**When scope seems too large**:
- "What's the absolute minimum for a useful v1?"
- "Which features could wait for v2?"

**When user is unsure about tech**:
- "Are you open to learning new technologies?"
- "What's your experience level with [category]?"
