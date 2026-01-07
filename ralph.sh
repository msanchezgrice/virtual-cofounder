#!/bin/bash
# Ralph Loop - Autonomous story-by-story implementation
set -e

echo "🤖 Ralph Loop Starting..."
echo ""

while true; do
  # 1. Read next incomplete story from prd.json
  story_id=$(node -e "
    const prd = require('./prd.json');
    const story = prd.stories.find(s => s.status === 'todo' && (!s.blockedBy || s.blockedBy.length === 0 || s.blockedBy.every(id => prd.stories.find(b => b.id === id)?.status === 'done')));
    if (story) {
      console.log(story.id);
    }
  ")

  # 2. If no stories left, exit
  if [ -z "$story_id" ]; then
    echo "✅ All unblocked stories complete!"
    exit 0
  fi

  echo "📋 Working on story: $story_id"

  # 3. Extract story details
  story_json=$(node -e "
    const prd = require('./prd.json');
    const story = prd.stories.find(s => s.id === '$story_id');
    console.log(JSON.stringify(story, null, 2));
  ")

  # 4. Show story prompt
  cat > /tmp/ralph-prompt.md << EOF
# Virtual Cofounder - Story $story_id

You are implementing the Virtual Cofounder project story-by-story.

## Current Story

\`\`\`json
$story_json
\`\`\`

## Your Task

Implement this story completely according to the acceptance criteria.

**Key context:**
- LINEAR_API_KEY is set in .env (OAuth token)
- Linear teams: Virtual cofounder (VIR), Media maker (MED)
- Team ID for VIR: d5cbb99d-df57-4b21-87c9-95fc5089a6a2
- All Phases 1-5 complete, now implementing Phase 6: Linear Integration

**When done:**
1. Run validation: \`npm run validate:story $story_id\`
2. If validation passes, mark story as done
3. Append learnings to progress.txt

**Important:**
- Follow acceptance criteria exactly
- Make all tests pass
- Document any deviations
EOF

  echo ""
  echo "🚀 Implementing story via Claude Code..."
  echo ""

  # Run implementation (interactive for now)
  cat /tmp/ralph-prompt.md
  echo ""
  echo "---"
  echo "Ready to implement? Press ENTER to continue or CTRL-C to exit"
  read -r

  break  # Exit after showing first story (manual mode)
done

echo ""
echo "Ralph loop paused. Run 'bash ralph.sh' again to continue."
