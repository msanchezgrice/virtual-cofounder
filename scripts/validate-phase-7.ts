/**
 * Phase 7 E2E Validation Script
 *
 * Validates the complete Phase 7 advanced scanning pipeline:
 * 1. Triggers scans for all 5 new scanners (Vercel, Performance, Screenshot, NPM, Secrets)
 * 2. Verifies all results are stored in database
 * 3. Outputs validation status for each scanner
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
const TEST_REPO_PATH = process.cwd();

async function validateScanner(
  scannerName: string,
  scanType: string,
  runScan: () => Promise<any>
): Promise<boolean> {
  try {
    // Find workspace and project
    const workspace = await db.workspace.findFirst();
    if (!workspace) {
      console.error(`  ✗ ${scannerName}: No workspace found`);
      return false;
    }

    let project = await db.project.findFirst({
      where: { domain: TEST_DOMAIN }
    });

    if (!project) {
      // Create test project if it doesn't exist
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

    // Run the scanner
    const result = await runScan();

    // Save to database
    await db.scan.create({
      data: {
        workspaceId: workspace.id,
        projectId: project.id,
        scanType,
        status: result.status || 'ok',
        vercelData: scanType === 'vercel' ? (result.latestDeployment || {}) : undefined,
        playwrightMetrics: scanType === 'performance' ? (result.metrics || {}) :
                          scanType === 'screenshot' ? {
                            screenshotUrl: result.screenshotUrl,
                            screenshotPath: result.screenshotPath,
                            viewport: result.viewport
                          } : undefined,
        securityIssues: scanType === 'npm_audit' ? {
                          vulnerabilities: result.vulnerabilities || [],
                          metadata: result.metadata || {}
                        } : scanType === 'secrets' ? {
                          findings: result.findings || [],
                          scannedFile: result.fileName
                        } : undefined,
        scannedAt: new Date(),
        durationMs: 0
      } as any
    });

    // Verify it was saved
    const saved = await db.scan.findFirst({
      where: {
        projectId: project.id,
        scanType
      },
      orderBy: {
        scannedAt: 'desc'
      }
    });

    if (!saved) {
      console.log(`  ✗ ${scannerName}: Failed to save to database`);
      return false;
    }

    console.log(`✓ ${scannerName}`);
    return true;

  } catch (error) {
    console.log(`  ✗ ${scannerName}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    return false;
  }
}

async function main() {
  console.log('Phase 7 E2E Validation\n');

  const results: boolean[] = [];

  // 1. Vercel scanner
  results.push(await validateScanner(
    'Vercel scanner',
    'vercel',
    async () => await scanVercelDeployment(TEST_PROJECT_NAME)
  ));

  // 2. Performance scanner
  results.push(await validateScanner(
    'Performance scanner',
    'performance',
    async () => await scanPerformance(`https://${TEST_DOMAIN}`)
  ));

  // 3. Screenshot capture
  results.push(await validateScanner(
    'Screenshot capture',
    'screenshot',
    async () => await captureScreenshot(`https://${TEST_DOMAIN}`)
  ));

  // 4. NPM audit
  results.push(await validateScanner(
    'NPM audit',
    'npm_audit',
    async () => await scanNpmAudit(TEST_REPO_PATH)
  ));

  // 5. Secrets detection
  results.push(await validateScanner(
    'Secrets detection',
    'secrets',
    async () => {
      const testCode = `
        const API_KEY = "sk_test_1234567890abcdef";
        const SECRET = "secret_token_xyz";
      `;
      return await scanSecrets(testCode, 'test-file.ts');
    }
  ));

  // Summary
  const passedCount = results.filter(r => r).length;
  const totalCount = results.length;

  console.log(`\n${passedCount}/${totalCount} scanners validated`);

  await db.$disconnect();

  if (passedCount === totalCount) {
    process.exit(0);
  } else {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('Validation failed:', error);
  db.$disconnect();
  process.exit(1);
});
