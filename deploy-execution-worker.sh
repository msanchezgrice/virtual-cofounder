#!/bin/bash
set -e

echo "=========================================="
echo "Railway Execution Worker Deployment"
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
echo "🔨 Creating execution-worker service..."
railway service create execution-worker
echo ""

# Set environment variables
echo "⚙️  Setting environment variables..."

# Copy from existing scan worker (if possible) or use defaults
echo "   Setting DATABASE_URL..."
railway variables set DATABASE_URL="$DATABASE_URL" --service execution-worker

echo "   Setting REDIS_URL..."
railway variables set REDIS_URL="$REDIS_URL" --service execution-worker

echo "   Setting GitHub App credentials..."
railway variables set GITHUB_APP_ID="2607680" --service execution-worker
railway variables set GITHUB_APP_CLIENT_ID="Iv23lisQHcRl6N2mPImG" --service execution-worker
railway variables set GITHUB_APP_CLIENT_SECRET="025d2fdea45165462615a9002cc3243b6bce2704" --service execution-worker
railway variables set GITHUB_TEST_REPO="msanchezgrice/virtual-cofounder" --service execution-worker

echo "   Setting GitHub private key..."
if [ -f "/Users/miguel/Downloads/virtual-cofounder.2026-01-06.private-key.pem" ]; then
    railway variables set GITHUB_APP_PRIVATE_KEY="$(cat /Users/miguel/Downloads/virtual-cofounder.2026-01-06.private-key.pem)" --service execution-worker
else
    echo "   ⚠️  Warning: Private key file not found. Set manually with:"
    echo "   railway variables set GITHUB_APP_PRIVATE_KEY=\"\$(cat path/to/key.pem)\" --service execution-worker"
fi

echo "   Setting Slack credentials..."
railway variables set SLACK_BOT_TOKEN="$SLACK_BOT_TOKEN" --service execution-worker
railway variables set SLACK_CHANNEL="#cofounder-updates" --service execution-worker

echo ""
echo "✓ Environment variables configured"
echo ""

# Deploy
echo "🚀 Deploying execution worker..."
railway up --service execution-worker

echo ""
echo "=========================================="
echo "✅ Deployment complete!"
echo "=========================================="
echo ""
echo "Monitor logs with:"
echo "  railway logs --service execution-worker"
echo ""
echo "Check status with:"
echo "  railway status --service execution-worker"
echo ""
