#!/bin/bash
set -e

echo "=========================================="
echo "Railway Chat Worker Deployment"
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
echo "🔨 Creating chat-worker service..."
railway service create chat-worker
echo ""

# Set environment variables
echo "⚙️  Setting environment variables..."

echo "   Setting DATABASE_URL..."
railway variables set DATABASE_URL="$DATABASE_URL" --service chat-worker

echo "   Setting REDIS_URL..."
railway variables set REDIS_URL="$REDIS_URL" --service chat-worker

echo "   Setting ANTHROPIC_API_KEY..."
railway variables set ANTHROPIC_API_KEY="$ANTHROPIC_API_KEY" --service chat-worker

echo "   Setting AGENT_SDK_ENABLED..."
railway variables set AGENT_SDK_ENABLED="true" --service chat-worker

echo "   Setting Slack credentials..."
railway variables set SLACK_BOT_TOKEN="$SLACK_BOT_TOKEN" --service chat-worker
railway variables set SLACK_CHANNEL="#cofounder-updates" --service chat-worker

echo ""
echo "✓ Environment variables configured"
echo ""

# Deploy
echo "🚀 Deploying chat worker..."
railway up --service chat-worker

echo ""
echo "=========================================="
echo "✅ Deployment complete!"
echo "=========================================="
echo ""
echo "Monitor logs with:"
echo "  railway logs --service chat-worker"
echo ""
echo "Check status with:"
echo "  railway status --service chat-worker"
echo ""
echo "The chat worker will:"
echo "  - Listen to the 'chat' BullMQ queue"
echo "  - Process messages using Claude Agent SDK"
echo "  - Stream responses via Redis pub/sub"
echo ""
