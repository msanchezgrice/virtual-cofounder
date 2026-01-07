#!/bin/bash
set -e

echo "=========================================="
echo "Railway Orchestrator Worker Deployment"
echo "=========================================="
echo ""

# Check if logged in
if ! railway whoami &> /dev/null; then
    echo "❌ Not logged into Railway. Please run:"
    echo "   railway login"
    echo ""
    echo "Then run this script again."
    exit 1
fi

echo "✓ Logged into Railway as: $(railway whoami)"
echo ""

# Check if linked to project
if ! railway status &> /dev/null; then
    echo "⚠️  Not linked to a Railway project."
    echo "   Linking to project..."
    railway link
fi

echo "✓ Linked to project: $(railway status 2>&1 | grep 'Project:' | cut -d: -f2 | xargs)"
echo ""

# List existing services
echo "📋 Existing services:"
railway service list
echo ""

# Create new service
echo "🔨 Creating orchestrator-worker service..."
railway service create orchestrator-worker
echo ""

# Set environment variables
echo "⚙️  Setting environment variables..."

echo "   Setting DATABASE_URL..."
railway variables set DATABASE_URL="$DATABASE_URL" --service orchestrator-worker

echo "   Setting REDIS_URL..."
railway variables set REDIS_URL="$REDIS_URL" --service orchestrator-worker

echo "   Setting ANTHROPIC_API_KEY..."
railway variables set ANTHROPIC_API_KEY="$ANTHROPIC_API_KEY" --service orchestrator-worker

echo "   Setting WORKSPACE_ID..."
railway variables set WORKSPACE_ID="$WORKSPACE_ID" --service orchestrator-worker

echo "   Setting Slack credentials..."
railway variables set SLACK_BOT_TOKEN="$SLACK_BOT_TOKEN" --service orchestrator-worker
railway variables set SLACK_CHANNEL="#cofounder-updates" --service orchestrator-worker

echo "   Setting Linear credentials..."
railway variables set LINEAR_API_KEY="$LINEAR_API_KEY" --service orchestrator-worker

echo ""
echo "✓ Environment variables configured"
echo ""

# Create railway.json for orchestrator worker
cat > railway.orchestrator.json <<EOF
{
  "\$schema": "https://railway.app/railway.schema.json",
  "build": {
    "builder": "NIXPACKS"
  },
  "deploy": {
    "startCommand": "npm run worker:orchestrator",
    "restartPolicyType": "ON_FAILURE",
    "restartPolicyMaxRetries": 10
  }
}
EOF

echo "📝 Created railway.orchestrator.json configuration"
echo ""

# Deploy
echo "🚀 Deploying orchestrator worker..."
railway up --service orchestrator-worker

echo ""
echo "=========================================="
echo "✅ Deployment complete!"
echo "=========================================="
echo ""
echo "Monitor logs with:"
echo "  railway logs --service orchestrator-worker"
echo ""
echo "Check status with:"
echo "  railway status --service orchestrator-worker"
echo ""
