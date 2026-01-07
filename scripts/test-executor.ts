// Test execution worker's PR creation flow
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

async function testExecutor() {
  try {
    console.log('🧪 Testing execution worker PR creation flow...\n');

    // Step 1: Get or create test project
    console.log('1️⃣ Finding or creating test project...');

    const testRepoUrl = process.env.GITHUB_TEST_REPO || 'msanchezgrice/virtual-cofounder';
    const workspaceId = '00000000-0000-0000-0000-000000000002'; // Miguel's Workspace

    let testProject = await prisma.project.findFirst({
      where: {
        workspaceId,
        name: 'Virtual Co-Founder (Test)',
      },
    });

    if (!testProject) {
      console.log('   Creating test project...');
      testProject = await prisma.project.create({
        data: {
          workspaceId,
          name: 'Virtual Co-Founder (Test)',
          repo: testRepoUrl,
          status: 'ACTIVE - Live Product',
        },
      });
    }

    console.log(`✓ Found project: ${testProject.name} (repo: ${testProject.repo})\n`);

    // Step 2: Create test completion
    console.log('2️⃣ Creating test completion...');
    const testRunId = `test-run-${Date.now()}`;
    const testCompletion = await prisma.completion.create({
      data: {
        workspaceId,
        runId: testRunId,
        projectId: testProject.id,
        title: 'Test completion for executor validation',
        rationale: 'This is a test completion to verify PR creation works. It will create a real branch and PR.',
        priority: 'medium',
        policy: 'auto_safe',
        status: 'pending',
        userApproved: true, // Auto-approve for test
      },
    });

    console.log(`✓ Created completion: ${testCompletion.id}\n`);

    // Step 3: Execute completion
    console.log('3️⃣ Executing completion (this will create a real PR)...');
    console.log('   Note: This creates a real branch and PR in the repository\n');

    await executeCompletion(testCompletion.id);

    // Step 4: Verify PR was created
    console.log('4️⃣ Verifying PR creation...');
    const updatedCompletion = await prisma.completion.findUnique({
      where: { id: testCompletion.id },
    });

    if (!updatedCompletion?.prUrl) {
      throw new Error('Completion executed but prUrl was not set');
    }

    console.log(`✓ PR created: ${updatedCompletion.prUrl}\n`);

    // Success
    console.log('✅ ✓ PR created');
    console.log(`\nTest completion ID: ${testCompletion.id}`);
    console.log(`PR URL: ${updatedCompletion.prUrl}`);
    process.exit(0); // Exit cleanly after success
  } catch (error) {
    console.error('❌ Executor test failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

testExecutor();
