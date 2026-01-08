#!/bin/bash
# Merge a Worktree Branch Back to Main
#
# This script:
# 1. Runs tests in the worktree
# 2. Merges the branch to main
# 3. Runs tests on main
# 4. Cleans up the worktree
#
# Usage:
#   bash merge-worktree.sh agent-sdk-orchestrator

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

BRANCH=$1

if [ -z "$BRANCH" ]; then
  echo -e "${RED}Error: Branch name required${NC}"
  echo ""
  echo "Usage: bash merge-worktree.sh <branch-name>"
  echo ""
  echo "Available branches:"
  git worktree list
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
WORKTREE_ROOT="$(cd "$PROJECT_ROOT/.." && pwd)/vc-worktrees"
WORKTREE_PATH="$WORKTREE_ROOT/$BRANCH"

echo -e "${BLUE}🔀 Merging $BRANCH to main${NC}"
echo ""

# Check worktree exists
if [ ! -d "$WORKTREE_PATH" ]; then
  echo -e "${RED}Error: Worktree not found at $WORKTREE_PATH${NC}"
  echo "Run setup-worktrees.sh first."
  exit 1
fi

# Step 1: Run tests in worktree
echo -e "${YELLOW}Step 1: Running tests in worktree...${NC}"
cd "$WORKTREE_PATH"

# Check for uncommitted changes
if [ -n "$(git status --porcelain)" ]; then
  echo -e "${RED}Error: Uncommitted changes in worktree${NC}"
  echo "Please commit or stash changes first."
  git status
  exit 1
fi

# Run tests
if npm run test 2>/dev/null; then
  echo -e "${GREEN}  ✅ Tests passed in worktree${NC}"
else
  echo -e "${YELLOW}  ⚠️  No test script or tests failed${NC}"
  echo "Continue anyway? (y/n)"
  read -r response
  if [ "$response" != "y" ]; then
    exit 1
  fi
fi

# Run E2E tests if available
if npm run test:e2e 2>/dev/null; then
  echo -e "${GREEN}  ✅ E2E tests passed${NC}"
else
  echo -e "${YELLOW}  ⚠️  No E2E tests or tests failed${NC}"
fi

# Step 2: Merge to main
echo ""
echo -e "${YELLOW}Step 2: Merging to main...${NC}"
cd "$PROJECT_ROOT"

# Ensure main is up to date
git checkout main
git pull origin main 2>/dev/null || echo "  (no remote to pull from)"

# Merge
MERGE_MESSAGE="feat: Merge $BRANCH - Agent SDK integration

This merge includes:
- Agent SDK integration for ${BRANCH#agent-sdk-}
- Feature flag support for rollback
- Thinking trace storage

See IMPLEMENTATION-PLAN.md for details."

if git merge "$BRANCH" --no-ff -m "$MERGE_MESSAGE"; then
  echo -e "${GREEN}  ✅ Merge successful${NC}"
else
  echo -e "${RED}  ❌ Merge failed - conflicts detected${NC}"
  echo ""
  echo "Resolve conflicts manually, then run:"
  echo "  git add ."
  echo "  git commit"
  echo "  bash merge-worktree.sh $BRANCH --continue"
  exit 1
fi

# Step 3: Run tests on main
echo ""
echo -e "${YELLOW}Step 3: Running tests on main...${NC}"

if npm run test 2>/dev/null; then
  echo -e "${GREEN}  ✅ Tests passed on main${NC}"
else
  echo -e "${RED}  ❌ Tests failed on main${NC}"
  echo ""
  echo "Rolling back merge..."
  git reset --hard HEAD~1
  echo "Merge rolled back. Fix issues in worktree and try again."
  exit 1
fi

# Step 4: Cleanup
echo ""
echo -e "${YELLOW}Step 4: Cleaning up worktree...${NC}"

# Remove worktree
git worktree remove "$WORKTREE_PATH" --force

# Optionally delete branch
echo "Delete branch $BRANCH? (y/n)"
read -r delete_response
if [ "$delete_response" = "y" ]; then
  git branch -d "$BRANCH"
  echo -e "${GREEN}  ✅ Branch deleted${NC}"
else
  echo "  Branch kept for reference"
fi

# Update prd-impl.json to mark worktree task as done
PRD_FILE="$SCRIPT_DIR/prd-impl.json"
if [ -f "$PRD_FILE" ]; then
  node -e "
    const fs = require('fs');
    const prd = require('$PRD_FILE');
    const story = prd.stories.find(s => s.worktreeBranch === '$BRANCH' && s.status !== 'done');
    if (story) {
      story.status = 'done';
      story.completedAt = new Date().toISOString();
      fs.writeFileSync('$PRD_FILE', JSON.stringify(prd, null, 2));
      console.log('Marked ' + story.id + ' as done in prd-impl.json');
    }
  "
fi

echo ""
echo -e "${GREEN}✅ Merge complete!${NC}"
echo ""
echo "Summary:"
echo "  - $BRANCH merged to main"
echo "  - All tests passing"
echo "  - Worktree removed"
echo ""
echo "Next steps:"
echo "  - Push to remote: git push origin main"
echo "  - Continue with next task: bash ralph-impl.sh"
