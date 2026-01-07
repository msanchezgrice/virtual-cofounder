// Test safety policy enforcement
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

async function testPolicyEnforcement() {
  try {
    console.log('🧪 Testing safety policy enforcement...\n');

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

    // Test 1: suggest_only policy - should skip execution but mark as completed
    console.log('1️⃣ Testing suggest_only policy...');
    const suggestOnlyCompletion = await prisma.completion.create({
      data: {
        workspaceId,
        runId: `test-suggest-${Date.now()}`,
        projectId: testProject.id,
        title: 'Test suggest_only policy',
        rationale: 'This should skip execution and just mark as completed',
        priority: 'low',
        policy: 'suggest_only',
        status: 'pending',
        userApproved: false, // Not approved but shouldn't matter for suggest_only
      },
    });

    await executeCompletion(suggestOnlyCompletion.id);

    const suggestResult = await prisma.completion.findUnique({
      where: { id: suggestOnlyCompletion.id },
    });

    if (suggestResult?.status !== 'completed') {
      throw new Error(`suggest_only: Expected status 'completed', got '${suggestResult?.status}'`);
    }
    if (suggestResult?.prUrl) {
      throw new Error('suggest_only: Should not create PR');
    }
    console.log('   ✓ suggest_only skipped execution and marked completed\n');

    // Test 2: approval_required without approval - should skip
    console.log('2️⃣ Testing approval_required without approval...');
    const unapprovedCompletion = await prisma.completion.create({
      data: {
        workspaceId,
        runId: `test-unapproved-${Date.now()}`,
        projectId: testProject.id,
        title: 'Test approval_required without approval',
        rationale: 'This should skip execution',
        priority: 'medium',
        policy: 'approval_required',
        status: 'pending',
        userApproved: false, // Not approved
      },
    });

    await executeCompletion(unapprovedCompletion.id);

    const unapprovedResult = await prisma.completion.findUnique({
      where: { id: unapprovedCompletion.id },
    });

    if (unapprovedResult?.status !== 'pending') {
      throw new Error(`approval_required (unapproved): Expected status 'pending', got '${unapprovedResult?.status}'`);
    }
    console.log('   ✓ approval_required without approval skipped execution\n');

    // Test 3: approval_required with approval - should execute
    console.log('3️⃣ Testing approval_required with approval...');
    const approvedCompletion = await prisma.completion.create({
      data: {
        workspaceId,
        runId: `test-approved-${Date.now()}`,
        projectId: testProject.id,
        title: 'Test approval_required with approval',
        rationale: 'This should execute and create PR',
        priority: 'medium',
        policy: 'approval_required',
        status: 'pending',
        userApproved: true, // Approved
      },
    });

    await executeCompletion(approvedCompletion.id);

    const approvedResult = await prisma.completion.findUnique({
      where: { id: approvedCompletion.id },
    });

    if (approvedResult?.status !== 'completed') {
      throw new Error(`approval_required (approved): Expected status 'completed', got '${approvedResult?.status}'`);
    }
    if (!approvedResult?.prUrl) {
      throw new Error('approval_required (approved): Should create PR');
    }
    console.log(`   ✓ approval_required with approval executed and created PR\n`);

    // Success
    console.log('✅ ✓ Policy enforcement works');
    process.exit(0);
  } catch (error) {
    console.error('❌ Policy enforcement test failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

testPolicyEnforcement();
