/**
 * Phase 7 Advanced Scanners Validation Test
 *
 * Validates all Phase 7 scanners work correctly:
 * - Vercel deployment scanner
 * - Performance scanner (Core Web Vitals)
 * - Screenshot capture
 * - NPM audit security scanner
 * - Secrets detection scanner
 *
 * Tests against warmstart.it and verifies results are stored in database
 */

import { config } from 'dotenv';
config({ path: '.env.local' });

import { PrismaClient } from '@prisma/client';
import { scanVercelDeployment } from '../lib/scanners/vercel';
import { scanPerformance } from '../lib/scanners/performance';
import { captureScreenshot } from '../lib/scanners/screenshot';
import { scanNpmAudit } from '../lib/scanners/security-npm';
import { scanSecrets } from '../lib/scanners/security-secrets';

// Create Prisma client with direct connection
const directDatabaseUrl = process.env.DATABASE_URL?.replace(':6543', ':5432').replace('?pgbouncer=true&connection_limit=1', '');
const db = new PrismaClient({
  datasources: {
    db: {
      url: directDatabaseUrl
    }
  }
});

const TEST_DOMAIN = 'warmstart.it';
const TEST_PROJECT_NAME = 'warmstart';
const TEST_REPO_PATH = process.cwd(); // Current project for npm audit and secrets tests

interface TestResult {
  scanner: string;
  success: boolean;
  error?: string;
  scanId?: string;
}

async function main() {
  console.log('🧪 Phase 7 Advanced Scanners Validation Test\n');
  console.log(`Test Domain: ${TEST_DOMAIN}`);
  console.log(`Test Project: ${TEST_PROJECT_NAME}\n`);

  const results: TestResult[] = [];

  // Find or create test workspace and project
  let workspace = await db.workspace.findFirst();
  if (!workspace) {
    console.log('⚠️  No workspace found, creating test workspace...');
    const user = await db.user.findFirst();
    if (!user) {
      console.error('❌ No user found in database. Please create a user first.');
      process.exit(1);
    }
    workspace = await db.workspace.create({
      data: {
        name: 'Test Workspace',
        slug: 'test-workspace',
        ownerUserId: user.id
      }
    });
  }

  let project = await db.project.findFirst({
    where: { domain: TEST_DOMAIN }
  });

  if (!project) {
    console.log(`⚠️  Project not found, creating test project for ${TEST_DOMAIN}...`);
    project = await db.project.create({
      data: {
        workspaceId: workspace.id,
        name: TEST_PROJECT_NAME,
        domain: TEST_DOMAIN,
        repo: 'magicseth/warmstart',
        status: 'ACTIVE - Live Product'
      }
    });
  }

  console.log(`✓ Test project found: ${project.name} (${project.id})\n`);

  // Test 1: Vercel Scanner
  console.log('Test 1: Vercel Deployment Scanner...');
  try {
    const result = await scanVercelDeployment(TEST_PROJECT_NAME);

    const scan = await db.scan.create({
      data: {
        workspaceId: workspace.id,
        projectId: project.id,
        scanType: 'vercel',
        status: result.status,
        vercelData: result.latestDeployment || {},
        scannedAt: new Date(),
        durationMs: 0
      }
    });

    results.push({ scanner: 'Vercel', success: true, scanId: scan.id });
    console.log(`  ✓ Vercel scanner: ${result.status}`);
    if (result.latestDeployment) {
      console.log(`    - URL: ${result.latestDeployment.url}`);
      console.log(`    - State: ${result.latestDeployment.state}`);
    }
  } catch (error) {
    results.push({
      scanner: 'Vercel',
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    console.error(`  ✗ Vercel scanner failed:`, error);
  }

  // Test 2: Performance Scanner (Core Web Vitals)
  console.log('\nTest 2: Performance Scanner (Core Web Vitals)...');
  try {
    const result = await scanPerformance(`https://${TEST_DOMAIN}`);

    const scan = await db.scan.create({
      data: {
        workspaceId: workspace.id,
        projectId: project.id,
        scanType: 'performance',
        status: result.status,
        playwrightMetrics: result.metrics || {},
        scannedAt: new Date(),
        durationMs: 0
      }
    });

    results.push({ scanner: 'Performance', success: true, scanId: scan.id });
    console.log(`  ✓ Performance scanner: ${result.status}`);
    if (result.metrics) {
      console.log(`    - LCP: ${result.metrics.lcp}ms`);
      console.log(`    - FCP: ${result.metrics.fcp}ms`);
      console.log(`    - CLS: ${result.metrics.cls}`);
    }
  } catch (error) {
    results.push({
      scanner: 'Performance',
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    console.error(`  ✗ Performance scanner failed:`, error);
  }

  // Test 3: Screenshot Capture
  console.log('\nTest 3: Screenshot Capture...');
  try {
    const result = await captureScreenshot(`https://${TEST_DOMAIN}`);

    const scan = await db.scan.create({
      data: {
        workspaceId: workspace.id,
        projectId: project.id,
        scanType: 'screenshot',
        status: result.status,
        playwrightMetrics: {
          screenshotUrl: result.screenshotUrl,
          screenshotPath: result.screenshotPath,
          viewport: result.viewport
        },
        scannedAt: new Date(),
        durationMs: 0
      }
    });

    results.push({ scanner: 'Screenshot', success: true, scanId: scan.id });
    console.log(`  ✓ Screenshot scanner: ${result.status}`);
    console.log(`    - URL: ${result.screenshotUrl}`);
    console.log(`    - Path: ${result.screenshotPath}`);
  } catch (error) {
    results.push({
      scanner: 'Screenshot',
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    console.error(`  ✗ Screenshot scanner failed:`, error);
  }

  // Test 4: NPM Audit Security Scanner
  console.log('\nTest 4: NPM Audit Security Scanner...');
  try {
    const result = await scanNpmAudit(TEST_REPO_PATH);

    const scan = await db.scan.create({
      data: {
        workspaceId: workspace.id,
        projectId: project.id,
        scanType: 'npm_audit',
        status: result.status,
        securityIssues: {
          vulnerabilities: result.vulnerabilities || [],
          metadata: result.metadata || {}
        },
        scannedAt: new Date(),
        durationMs: 0
      }
    });

    results.push({ scanner: 'NPM Audit', success: true, scanId: scan.id });
    console.log(`  ✓ NPM audit scanner: ${result.status}`);
    console.log(`    - Vulnerabilities: ${result.vulnerabilities?.length || 0}`);
  } catch (error) {
    results.push({
      scanner: 'NPM Audit',
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    console.error(`  ✗ NPM audit scanner failed:`, error);
  }

  // Test 5: Secrets Detection Scanner
  console.log('\nTest 5: Secrets Detection Scanner...');
  try {
    // Test with a sample code snippet containing secrets
    const testCode = `
      const API_KEY = "sk_test_1234567890abcdef";
      const SECRET_TOKEN = "secret_abc123xyz";
      const password = "my_password_123";
    `;
    const result = await scanSecrets(testCode, 'test-file.ts');

    const scan = await db.scan.create({
      data: {
        workspaceId: workspace.id,
        projectId: project.id,
        scanType: 'secrets',
        status: result.status,
        securityIssues: {
          findings: result.findings || [],
          scannedFile: result.fileName
        },
        scannedAt: new Date(),
        durationMs: 0
      }
    });

    results.push({ scanner: 'Secrets', success: true, scanId: scan.id });
    console.log(`  ✓ Secrets scanner: ${result.status}`);
    console.log(`    - Findings: ${result.findings?.length || 0}`);
  } catch (error) {
    results.push({
      scanner: 'Secrets',
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    console.error(`  ✗ Secrets scanner failed:`, error);
  }

  // Verify database entries
  console.log('\nVerifying database entries...');
  const scanCount = await db.scan.count({
    where: {
      projectId: project.id,
      scanType: {
        in: ['vercel', 'performance', 'screenshot', 'npm_audit', 'secrets']
      }
    }
  });

  console.log(`  ✓ Database entries created: ${scanCount} scans\n`);

  // Summary
  console.log('═══════════════════════════════════════');
  console.log('Test Results:');
  console.log('═══════════════════════════════════════');

  const successCount = results.filter(r => r.success).length;
  const totalCount = results.length;

  results.forEach(result => {
    const icon = result.success ? '✓' : '✗';
    const status = result.success ? 'PASS' : `FAIL (${result.error})`;
    console.log(`${icon} ${result.scanner}: ${status}`);
  });

  console.log('═══════════════════════════════════════');
  console.log(`${successCount}/${totalCount} scanners passed`);

  if (successCount === totalCount) {
    console.log('\n✓ All Phase 7 scanners validated\n');
    await db.$disconnect();
    process.exit(0);
  } else {
    console.log('\n✗ Some scanners failed validation\n');
    await db.$disconnect();
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('Test suite failed:', error);
  db.$disconnect();
  process.exit(1);
});
