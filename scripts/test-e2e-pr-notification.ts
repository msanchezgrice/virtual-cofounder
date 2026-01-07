// Test PR creation Slack notification
import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(__dirname, '../.env.local') });

import { PrismaClient } from '@prisma/client';
import { executeCompletion } from '../workers/execution-worker';

// Use direct database connection (not pooler)
const directDatabaseUrl = process.env.DATABASE_URL?.replace(':6543', ':5432').replace('?pgbouncer=true&connection_limit=1', '');
const prisma = new PrismaClient({
  datasources: {
    db: {
      url: directDatabaseUrl,
    },
  },
});

async function testPRNotification() {
  try {
    console.log('🧪 Testing PR creation Slack notification...\n');

    // Check Slack configuration
    if (!process.env.SLACK_BOT_TOKEN) {
      console.log('⚠️  SLACK_BOT_TOKEN not configured - test will skip Slack notification');
    }

    const workspaceId = '00000000-0000-0000-0000-000000000002'; // Miguel's Workspace
    const testRepoUrl = process.env.GITHUB_TEST_REPO || 'msanchezgrice/virtual-cofounder';

    // Get or create test project
    let testProject = await prisma.project.findFirst({
      where: {
        workspaceId,
        name: 'Virtual Co-Founder (Test)',
      },
    });

    if (!testProject) {
      testProject = await prisma.project.create({
        data: {
          workspaceId,
          name: 'Virtual Co-Founder (Test)',
          repo: testRepoUrl,
          status: 'ACTIVE - Live Product',
        },
      });
    }

    console.log(`✓ Found project: ${testProject.name}\n`);

    // Create test completion
    console.log('1️⃣ Creating test completion...');
    const testCompletion = await prisma.completion.create({
      data: {
        workspaceId,
        runId: `test-pr-notification-${Date.now()}`,
        projectId: testProject.id,
        title: 'Test PR notification to Slack',
        rationale: 'This completion tests that Slack notifications are sent when PRs are created',
        priority: 'medium',
        policy: 'auto_safe',
        status: 'pending',
        userApproved: true,
      },
    });

    console.log(`✓ Created completion: ${testCompletion.id}\n`);

    // Execute completion (this will create PR and send Slack notification)
    console.log('2️⃣ Executing completion (creates PR and sends Slack notification)...');
    await executeCompletion(testCompletion.id);

    // Verify completion
    const updatedCompletion = await prisma.completion.findUnique({
      where: { id: testCompletion.id },
    });

    if (!updatedCompletion?.prUrl) {
      throw new Error('Completion executed but prUrl was not set');
    }

    console.log(`✓ PR created: ${updatedCompletion.prUrl}\n`);

    // Success
    console.log('✅ ✓ Slack PR notification sent');
    console.log(`\nTest completion ID: ${testCompletion.id}`);
    console.log(`PR URL: ${updatedCompletion.prUrl}`);

    if (process.env.SLACK_BOT_TOKEN) {
      console.log(`\n💬 Check ${process.env.SLACK_CHANNEL || '#cofounder-updates'} for the notification`);
    }

    process.exit(0);
  } catch (error) {
    console.error('❌ PR notification test failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

testPRNotification();
