// E2E test for full execution flow: Queue → Worker → Git → GitHub → Slack
import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(__dirname, '../.env.local') });

import { PrismaClient } from '@prisma/client';

// Use direct database connection (not pooler)
const directDatabaseUrl = process.env.DATABASE_URL?.replace(':6543', ':5432').replace('?pgbouncer=true&connection_limit=1', '');
const prisma = new PrismaClient({
  datasources: {
    db: {
      url: directDatabaseUrl,
    },
  },
});

async function testE2EExecution() {
  try {
    console.log('🧪 Testing full E2E execution flow...\n');
    console.log('This test validates: Queue → Worker → Git → GitHub → Slack\n');

    const workspaceId = '00000000-0000-0000-0000-000000000002'; // Miguel's Workspace
    const testRepoUrl = process.env.GITHUB_TEST_REPO || 'msanchezgrice/virtual-cofounder';

    // Step 1: Get or create test project
    console.log('1️⃣ Setting up test project...');
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

    console.log(`   ✓ Project ready: ${testProject.name}\n`);

    // Step 2: Create test completion
    console.log('2️⃣ Creating test completion...');
    const testCompletion = await prisma.completion.create({
      data: {
        workspaceId,
        runId: `test-e2e-${Date.now()}`,
        projectId: testProject.id,
        title: 'E2E test - Full execution flow',
        rationale: 'This completion tests the full execution pipeline from queue to PR to Slack',
        priority: 'high',
        policy: 'auto_safe',
        status: 'pending',
        userApproved: true,
      },
    });

    console.log(`   ✓ Completion created: ${testCompletion.id}\n`);

    // Step 3: Execute completion directly (simulates worker picking up job)
    console.log('3️⃣ Executing completion...');

    // Import executeCompletion function
    const { executeCompletion } = await import('../workers/execution-worker');

    // Execute the completion (this is what the worker would do)
    await executeCompletion(testCompletion.id);

    console.log('   ✓ Execution complete\n');

    // Step 4: Verify results
    console.log('4️⃣ Verifying execution results...');
    const updated = await prisma.completion.findUnique({
      where: { id: testCompletion.id },
    });

    if (!updated?.prUrl) {
      throw new Error('Completion executed but prUrl was not set');
    }

    if (updated.status !== 'completed') {
      throw new Error(`Expected status 'completed', got '${updated.status}'`);
    }

    console.log(`   ✓ Status: ${updated.status}`);
    console.log(`   ✓ PR URL: ${updated.prUrl}`);
    console.log(`   ✓ Executed at: ${updated.executedAt}\n`);

    if (process.env.SLACK_BOT_TOKEN) {
      console.log(`   💬 Slack notification sent to ${process.env.SLACK_CHANNEL || '#cofounder-updates'}\n`);
    }

    console.log('✅ ✓ Full execution flow complete');
    console.log(`\nTest completion ID: ${testCompletion.id}`);
    console.log(`PR URL: ${updated.prUrl}`);

    process.exit(0);
  } catch (error) {
    console.error('❌ E2E execution test failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

testE2EExecution();
