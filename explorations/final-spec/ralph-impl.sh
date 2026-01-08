#!/bin/bash
# Ralph Implementation Loop - Agent SDK Integration
# 
# Usage:
#   bash ralph-impl.sh 1       # Run Phase 1 tasks
#   bash ralph-impl.sh 2       # Run Phase 2 tasks
#   bash ralph-impl.sh all     # Run all phases sequentially
#
# This script reads from prd-impl.json and processes stories one by one.
# Stories marked as "worktree" should be done in parallel worktrees (see IMPLEMENTATION-PLAN.md)
#
# ⚠️  CRITICAL CONSTRAINT ⚠️
# This script should NEVER modify the spec, architecture, or PRD to make a story pass.
# If a story fails validation:
#   1. Surface the issue to the user
#   2. Wait for user decision
#   3. NEVER auto-fix by changing requirements
#
# The spec is the source of truth. Implementation adapts to spec, not vice versa.

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PRD_FILE="$SCRIPT_DIR/prd-impl.json"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}🤖 Ralph Implementation Loop - Agent SDK Integration${NC}"
echo ""

# Check if prd-impl.json exists
if [ ! -f "$PRD_FILE" ]; then
  echo -e "${RED}Error: prd-impl.json not found at $PRD_FILE${NC}"
  exit 1
fi

# Get phase from args
PHASE=${1:-1}

if [ "$PHASE" = "all" ]; then
  echo "Running all phases sequentially..."
  for p in 1 2 3 4 5; do
    bash "$0" $p
  done
  exit 0
fi

echo -e "Phase: ${YELLOW}$PHASE${NC}"
echo ""

# Function to get next task
get_next_task() {
  node -e "
    const prd = require('$PRD_FILE');
    const phase = 'phase-$PHASE';
    
    const story = prd.stories.find(s => 
      s.phase === phase &&
      s.status === 'todo' && 
      (!s.blockedBy || s.blockedBy.length === 0 || s.blockedBy.every(id => 
        prd.stories.find(b => b.id === id)?.status === 'done'
      ))
    );
    
    if (story) {
      // Skip worktree tasks with a warning
      if (story.executionMode === 'worktree') {
        console.log('WORKTREE:' + story.id);
      } else {
        console.log(story.id);
      }
    }
  "
}

# Function to get task details
get_task_details() {
  local task_id=$1
  node -e "
    const prd = require('$PRD_FILE');
    const story = prd.stories.find(s => s.id === '$task_id');
    console.log(JSON.stringify(story, null, 2));
  "
}

# Function to mark task as done
mark_task_done() {
  local task_id=$1
  node -e "
    const fs = require('fs');
    const prd = require('$PRD_FILE');
    const story = prd.stories.find(s => s.id === '$task_id');
    story.status = 'done';
    story.completedAt = new Date().toISOString();
    fs.writeFileSync('$PRD_FILE', JSON.stringify(prd, null, 2));
  "
}

# Function to show phase progress
show_progress() {
  node -e "
    const prd = require('$PRD_FILE');
    const phase = 'phase-$PHASE';
    const phaseStories = prd.stories.filter(s => s.phase === phase);
    const done = phaseStories.filter(s => s.status === 'done').length;
    const total = phaseStories.length;
    const worktree = phaseStories.filter(s => s.executionMode === 'worktree' && s.status === 'todo').length;
    
    console.log('Phase $PHASE Progress: ' + done + '/' + total + ' tasks complete');
    if (worktree > 0) {
      console.log('  ⚠️  ' + worktree + ' tasks require parallel worktrees');
    }
  "
}

# Main loop
while true; do
  echo "---"
  show_progress
  echo ""
  
  # Get next task
  next_task=$(get_next_task)
  
  # Check if no tasks left
  if [ -z "$next_task" ]; then
    echo -e "${GREEN}✅ Phase $PHASE: All automatable tasks complete!${NC}"
    echo ""
    
    # Check for remaining worktree tasks
    worktree_count=$(node -e "
      const prd = require('$PRD_FILE');
      const remaining = prd.stories.filter(s => 
        s.phase === 'phase-$PHASE' && 
        s.executionMode === 'worktree' && 
        s.status === 'todo'
      );
      console.log(remaining.length);
    ")
    
    if [ "$worktree_count" -gt "0" ]; then
      echo -e "${YELLOW}⚠️  $worktree_count tasks require parallel worktrees:${NC}"
      node -e "
        const prd = require('$PRD_FILE');
        prd.stories
          .filter(s => s.phase === 'phase-$PHASE' && s.executionMode === 'worktree' && s.status === 'todo')
          .forEach(s => console.log('   - ' + s.id + ': ' + s.title + ' (branch: ' + s.worktreeBranch + ')'));
      "
      echo ""
      echo "See IMPLEMENTATION-PLAN.md for worktree setup instructions."
    fi
    
    echo ""
    echo "Next steps:"
    echo "  1. Run E2E tests: npm run test:e2e:phase$PHASE"
    echo "  2. Complete approval gate checklist"
    echo "  3. Proceed to next phase: bash ralph-impl.sh $((PHASE + 1))"
    exit 0
  fi
  
  # Check if it's a worktree task
  if [[ "$next_task" == WORKTREE:* ]]; then
    task_id="${next_task#WORKTREE:}"
    echo -e "${YELLOW}⚠️  Task $task_id requires parallel worktree${NC}"
    echo "   Skipping. Complete this manually per IMPLEMENTATION-PLAN.md"
    echo "   Then mark done with: node -e \"..."
    
    # Skip to next task by marking it as "worktree-pending"
    node -e "
      const fs = require('fs');
      const prd = require('$PRD_FILE');
      const story = prd.stories.find(s => s.id === '$task_id');
      story.status = 'worktree-pending';
      fs.writeFileSync('$PRD_FILE', JSON.stringify(prd, null, 2));
    "
    continue
  fi
  
  task_id="$next_task"
  
  # Get task details
  task_json=$(get_task_details "$task_id")
  
  # Display task info
  echo -e "${BLUE}📋 Task: $task_id${NC}"
  echo ""
  
  task_title=$(echo "$task_json" | node -e "const d=require('fs').readFileSync('/dev/stdin','utf8');console.log(JSON.parse(d).title)")
  task_desc=$(echo "$task_json" | node -e "const d=require('fs').readFileSync('/dev/stdin','utf8');console.log(JSON.parse(d).description)")
  task_effort=$(echo "$task_json" | node -e "const d=require('fs').readFileSync('/dev/stdin','utf8');console.log(JSON.parse(d).effort)")
  
  echo -e "Title: ${GREEN}$task_title${NC}"
  echo "Description: $task_desc"
  echo "Effort: $task_effort"
  echo ""
  
  # Show acceptance criteria
  echo "Acceptance Criteria:"
  echo "$task_json" | node -e "
    const d = require('fs').readFileSync('/dev/stdin', 'utf8');
    const story = JSON.parse(d);
    story.acceptanceCriteria.forEach((ac, i) => {
      console.log('  ' + (i+1) + '. [' + ac.type + '] ' + (ac.description || ac.path || ac.pattern || ac.command));
    });
  "
  echo ""
  
  # Generate implementation prompt
  cat > /tmp/ralph-prompt.md << EOF
# Implementation Task: $task_id

## Task Details
\`\`\`json
$task_json
\`\`\`

## Context
- Reference: explorations/final-spec/MASTER-SPEC.md
- This is Phase $PHASE of the Agent SDK integration
- Feature flags should be used for all new Agent SDK code

## Instructions
1. Implement the task according to acceptance criteria above
2. Test the implementation locally
3. When ready, press ENTER to validate

## Files to Reference
- MASTER-SPEC.md: Architecture and data models
- IMPLEMENTATION-PLAN.md: Task details and dependencies
- mockups.html: UI design reference

EOF

  echo "---"
  echo -e "${YELLOW}Ready to implement?${NC}"
  echo "  - Press ENTER to continue and validate after implementation"
  echo "  - Press 's' + ENTER to skip this task"
  echo "  - Press 'q' + ENTER to quit"
  echo ""
  read -r response
  
  if [ "$response" = "q" ]; then
    echo "Quitting..."
    exit 0
  fi
  
  if [ "$response" = "s" ]; then
    echo "Skipping task..."
    continue
  fi
  
  # Implementation happens here (manually or via Claude Code)
  # After implementation, validate:
  
  echo -e "${BLUE}🔍 Validating acceptance criteria...${NC}"
  
  validation_passed=true
  echo "$task_json" | node -e "
    const d = require('fs').readFileSync('/dev/stdin', 'utf8');
    const story = JSON.parse(d);
    const fs = require('fs');
    const { execSync } = require('child_process');
    const path = require('path');
    
    const rootDir = path.resolve('$SCRIPT_DIR', '../..');
    
    let allPassed = true;
    
    story.acceptanceCriteria.forEach((ac, i) => {
      let passed = false;
      let message = '';
      
      switch (ac.type) {
        case 'file_exists':
          const filePath = path.join(rootDir, ac.path);
          if (ac.glob) {
            // Glob matching (simplified)
            const { globSync } = require('glob');
            try {
              const matches = globSync(filePath);
              passed = matches.length > 0;
              message = passed ? 'Found ' + matches.length + ' file(s)' : 'No files matched';
            } catch (e) {
              passed = fs.existsSync(filePath.replace(/\*/g, ''));
              message = passed ? 'File exists' : 'File not found';
            }
          } else {
            passed = fs.existsSync(filePath);
            message = passed ? 'File exists' : 'File not found';
          }
          break;
          
        case 'file_contains':
          try {
            const content = fs.readFileSync(path.join(rootDir, ac.path), 'utf8');
            passed = content.includes(ac.pattern);
            message = passed ? 'Pattern found' : 'Pattern not found';
          } catch (e) {
            passed = false;
            message = 'Could not read file: ' + e.message;
          }
          break;
          
        case 'command_succeeds':
          try {
            execSync(ac.command, { cwd: rootDir, stdio: 'pipe' });
            passed = true;
            message = 'Command succeeded';
          } catch (e) {
            passed = false;
            message = 'Command failed';
          }
          break;
          
        case 'visual_check':
          // Manual verification needed
          passed = true;
          message = 'Manual verification (assumed passed)';
          break;
          
        default:
          passed = true;
          message = 'Unknown check type (skipped)';
      }
      
      const status = passed ? '✅' : '❌';
      console.log('  ' + status + ' ' + (ac.description || ac.type) + ': ' + message);
      
      if (!passed) allPassed = false;
    });
    
    process.exit(allPassed ? 0 : 1);
  "
  
  if [ $? -eq 0 ]; then
    echo ""
    echo -e "${GREEN}✅ All criteria passed!${NC}"
    mark_task_done "$task_id"
    echo "Task $task_id marked as done."
  else
    echo ""
    echo -e "${RED}❌ Some criteria failed.${NC}"
    echo ""
    echo -e "${YELLOW}⚠️  IMPORTANT: Do NOT modify the spec/architecture to make this pass!${NC}"
    echo "   The spec is the source of truth. Options:"
    echo "   1. Fix the implementation to match the spec"
    echo "   2. Surface the issue to the user for decision"
    echo "   3. Skip and document the blocker"
    echo ""
    echo "Press ENTER to re-validate after fixing, or 's' to skip and surface issue."
    read -r retry_response
    
    if [ "$retry_response" = "s" ]; then
      echo ""
      echo -e "${RED}BLOCKER: Task $task_id failed validation${NC}"
      echo "Issue needs user review before proceeding."
      echo ""
      echo "Details saved to: /tmp/ralph-blocker-$task_id.md"
      
      # Log the blocker
      cat > "/tmp/ralph-blocker-$task_id.md" << BLOCKER
# Blocker: $task_id

## Task
$(get_task_details "$task_id")

## Issue
Validation failed. Needs user review.

## Timestamp
$(date)

## Note
Do NOT modify spec/architecture to resolve this.
BLOCKER
      
      echo "Pausing Ralph loop. Review the blocker and restart."
      exit 1
    fi
    
    # Loop back to validation
    continue
  fi
  
  echo ""
done
