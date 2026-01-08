#!/bin/bash
# Setup Parallel Worktrees for High-Risk Phase 2 Tasks
#
# This script creates isolated working directories for risky changes:
# - agent-sdk-orchestrator: Refactoring lib/orchestrator.ts
# - agent-sdk-execution: Refactoring workers/execution-worker.ts  
# - agent-sdk-security: Converting security agent to SDK
# - agent-sdk-codegen: Creating code generation agent
#
# Usage:
#   bash setup-worktrees.sh           # Create all worktrees
#   bash setup-worktrees.sh clean     # Remove all worktrees

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
WORKTREE_ROOT="$(cd "$PROJECT_ROOT/.." && pwd)/vc-worktrees"

echo -e "${BLUE}🌳 Parallel Worktrees Setup${NC}"
echo "Project root: $PROJECT_ROOT"
echo "Worktrees will be created in: $WORKTREE_ROOT"
echo ""

# Define worktrees
BRANCHES=(
  "agent-sdk-orchestrator"
  "agent-sdk-execution"
  "agent-sdk-security"
  "agent-sdk-codegen"
)

# Clean mode
if [ "$1" = "clean" ]; then
  echo -e "${YELLOW}Cleaning up worktrees...${NC}"
  
  cd "$PROJECT_ROOT"
  
  for branch in "${BRANCHES[@]}"; do
    worktree_path="$WORKTREE_ROOT/$branch"
    if [ -d "$worktree_path" ]; then
      echo "  Removing $worktree_path..."
      git worktree remove "$worktree_path" --force 2>/dev/null || rm -rf "$worktree_path"
    fi
    
    # Delete branch if exists
    git branch -D "$branch" 2>/dev/null || true
  done
  
  echo -e "${GREEN}✅ Worktrees cleaned up${NC}"
  exit 0
fi

# Check we're in a git repo
cd "$PROJECT_ROOT"
if [ ! -d ".git" ]; then
  echo -e "${RED}Error: Not a git repository${NC}"
  exit 1
fi

# Ensure we're on main and up to date
echo "Ensuring main branch is up to date..."
git checkout main
git pull origin main 2>/dev/null || echo "  (no remote to pull from)"

# Create worktrees directory
mkdir -p "$WORKTREE_ROOT"

# Create each worktree
for branch in "${BRANCHES[@]}"; do
  echo ""
  echo -e "${BLUE}Setting up: $branch${NC}"
  
  worktree_path="$WORKTREE_ROOT/$branch"
  
  # Remove existing worktree if present
  if [ -d "$worktree_path" ]; then
    echo "  Removing existing worktree..."
    git worktree remove "$worktree_path" --force 2>/dev/null || rm -rf "$worktree_path"
  fi
  
  # Delete branch if exists, then create fresh from main
  git branch -D "$branch" 2>/dev/null || true
  git checkout -b "$branch"
  git checkout main
  
  # Create worktree
  echo "  Creating worktree at $worktree_path..."
  git worktree add "$worktree_path" "$branch"
  
  # Setup worktree
  echo "  Installing dependencies..."
  cd "$worktree_path"
  npm install --silent
  
  # Copy env file if exists
  if [ -f "$PROJECT_ROOT/.env" ]; then
    cp "$PROJECT_ROOT/.env" .env
    echo "  Copied .env file"
  fi
  
  cd "$PROJECT_ROOT"
  
  echo -e "  ${GREEN}✅ $branch ready${NC}"
done

# Return to main
git checkout main

echo ""
echo -e "${GREEN}✅ All worktrees created!${NC}"
echo ""
echo "Worktree locations:"
git worktree list
echo ""
echo "Usage:"
echo "  1. Work on a feature:"
echo "     cd $WORKTREE_ROOT/agent-sdk-orchestrator"
echo "     # make changes"
echo "     npm run test"
echo ""
echo "  2. Merge back to main when ready:"
echo "     cd $PROJECT_ROOT"
echo "     bash explorations/final-spec/merge-worktree.sh agent-sdk-orchestrator"
echo ""
echo "  3. Clean up all worktrees:"
echo "     bash explorations/final-spec/setup-worktrees.sh clean"
