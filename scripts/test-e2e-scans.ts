#!/usr/bin/env tsx
/**
 * E2E Test: Scans to DB to Dashboard
 *
 * Tests the full scan pipeline:
 * 1. Trigger scan via API
 * 2. Worker executes scans
 * 3. Results saved to DB
 * 4. Verify all 3 scan types work
 */

import { spawn, ChildProcess } from 'child_process';
import { PrismaClient } from '@prisma/client';

// Use direct connection for test scripts
const directDatabaseUrl = process.env.DATABASE_URL?.replace(':6543/', ':5432/').replace('?pgbouncer=true&connection_limit=1', '');

const db = new PrismaClient({
  datasources: {
    db: {
      url: directDatabaseUrl
    }
  }
});

let workerProcess: ChildProcess | null = null;

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function startWorker(): Promise<void> {
  console.log('Starting worker...');
  workerProcess = spawn('npm', ['run', 'worker:scan'], {
    stdio: ['pipe', 'pipe', 'pipe'],
    shell: true
  });

  return new Promise((resolve) => {
    let output = '';

    workerProcess!.stdout?.on('data', (data) => {
      output += data.toString();
      if (output.includes('Worker started')) {
        console.log('✓ Worker started');
        resolve();
      }
    });

    workerProcess!.stderr?.on('data', (data) => {
      // Ignore stderr for now
    });

    // Timeout after 10 seconds
    setTimeout(() => {
      if (!output.includes('Worker started')) {
        console.error('✗ Worker failed to start');
        process.exit(1);
      }
    }, 10000);
  });
}

function stopWorker(): void {
  if (workerProcess) {
    console.log('Stopping worker...');
    workerProcess.kill('SIGTERM');
    setTimeout(() => {
      if (workerProcess && !workerProcess.killed) {
        workerProcess.kill('SIGKILL');
      }
    }, 2000);
  }
}

async function triggerScans(): Promise<void> {
  console.log('Triggering scans via API...');

  try {
    const response = await fetch('http://localhost:3000/api/scans/trigger', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}'
    });

    if (!response.ok) {
      throw new Error(`API returned ${response.status}`);
    }

    const data = await response.json();
    console.log(`✓ Enqueued ${data.jobs} scan jobs for ${data.projects} projects`);
  } catch (error) {
    console.error('✗ Failed to trigger scans:', error);
    process.exit(1);
  }
}

async function waitForScans(): Promise<void> {
  console.log('Waiting for scans to complete...');

  const maxWaitTime = 30000; // 30 seconds
  const checkInterval = 2000; // Check every 2 seconds
  const startTime = Date.now();

  while (Date.now() - startTime < maxWaitTime) {
    // Check how many scans have completed
    const scanCount = await db.scan.count();

    if (scanCount >= 3) { // At least 3 scans (domain, seo, analytics for one project)
      console.log(`✓ Found ${scanCount} completed scans`);

      // Verify all 3 scan types are present
      const domainScans = await db.scan.count({ where: { scanType: 'domain' } });
      const seoScans = await db.scan.count({ where: { scanType: 'seo' } });
      const analyticsScans = await db.scan.count({ where: { scanType: 'analytics' } });

      if (domainScans > 0 && seoScans > 0 && analyticsScans > 0) {
        console.log(`✓ All 3 scan types present (domain: ${domainScans}, seo: ${seoScans}, analytics: ${analyticsScans})`);
        return;
      }
    }

    await sleep(checkInterval);
  }

  console.error('✗ Scans did not complete within timeout');
  process.exit(1);
}

async function runE2ETest(): Promise<void> {
  try {
    // Start worker
    await startWorker();

    // Wait a moment for worker to be ready
    await sleep(1000);

    // Trigger scans
    await triggerScans();

    // Wait for scans to complete
    await waitForScans();

    // Success!
    console.log('\n✓ All scans completed successfully');
    console.log('E2E test passed!\n');

    // Cleanup
    stopWorker();
    await db.$disconnect();
    process.exit(0);

  } catch (error) {
    console.error('✗ E2E test failed:', error);
    stopWorker();
    await db.$disconnect();
    process.exit(1);
  }
}

// Handle cleanup on exit
process.on('SIGINT', () => {
  stopWorker();
  process.exit(1);
});

process.on('SIGTERM', () => {
  stopWorker();
  process.exit(1);
});

runE2ETest();
