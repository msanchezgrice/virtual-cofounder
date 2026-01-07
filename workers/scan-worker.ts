#!/usr/bin/env tsx
/**
 * Scan Worker
 *
 * Processes scan jobs from Redis queue (BullMQ)
 * Executes all scanners: domain, SEO, analytics, Vercel, performance, screenshot, npm_audit, secrets
 * Saves results to database
 */

// Load environment variables from .env.local when running locally
import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(__dirname, '../.env.local') });

import { Worker } from 'bullmq';
import Redis from 'ioredis';
import { PrismaClient } from '@prisma/client';
import { scanDomain } from '../lib/scanners/domain';
import { scanSEO } from '../lib/scanners/seo';
import { scanAnalytics } from '../lib/scanners/analytics';
import { scanVercelDeployment } from '../lib/scanners/vercel';
import { scanPerformance } from '../lib/scanners/performance';
import { captureScreenshot } from '../lib/scanners/screenshot';
import { scanNpmAudit } from '../lib/scanners/security-npm';
import { scanSecrets } from '../lib/scanners/security-secrets';

// Create fresh Prisma client for worker with direct connection (no pgBouncer)
// PgBouncer in transaction mode doesn't support prepared statements
const directDatabaseUrl = process.env.DATABASE_URL?.replace(':6543', ':5432').replace('?pgbouncer=true&connection_limit=1', '');
const db = new PrismaClient({
  datasources: {
    db: {
      url: directDatabaseUrl
    }
  }
});

// Redis connection for BullMQ worker
const connection = new Redis(
  process.env.REDIS_URL || 'redis://localhost:6379',
  {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    // TLS for Upstash (rediss://)
    tls: (process.env.REDIS_URL || '').startsWith('rediss://') ? {} : undefined,
    retryStrategy: (times) => {
      const delay = Math.min(times * 50, 2000);
      return delay;
    }
  }
);

interface ScanJob {
  projectId: string;
  projectName: string;
  domain: string;
  repo?: string; // For npm_audit and secrets scanners
  scanType: 'domain' | 'seo' | 'analytics' | 'vercel' | 'performance' | 'screenshot' | 'npm_audit' | 'secrets';
  workspaceId: string;
}

async function processScanJob(job: any) {
  const data: ScanJob = job.data;
  const { projectId, projectName, domain, scanType, workspaceId } = data;

  console.log(`[${job.id}] Processing ${scanType} scan for ${projectName} (${domain})`);

  const startTime = Date.now();

  try {
    switch (scanType) {
      case 'domain': {
        const result = await scanDomain(domain);
        const durationMs = Date.now() - startTime;

        await db.scan.create({
          data: {
            workspaceId,
            projectId,
            scanType: 'domain',
            status: result.status,
            domainData: result.domainData || {},
            scannedAt: new Date(),
            durationMs
          }
        });

        console.log(`[${job.id}] ✓ Domain scan complete: ${result.status} (${durationMs}ms)`);
        break;
      }

      case 'seo': {
        const result = await scanSEO(domain);
        const durationMs = Date.now() - startTime;

        await db.scan.create({
          data: {
            workspaceId,
            projectId,
            scanType: 'seo',
            status: result.status,
            seoDetail: result.seoDetail || {},
            scannedAt: new Date(),
            durationMs
          }
        });

        console.log(`[${job.id}] ✓ SEO scan complete: ${result.seoScore} (${durationMs}ms)`);
        break;
      }

      case 'analytics': {
        const result = await scanAnalytics(domain);
        const durationMs = Date.now() - startTime;

        await db.scan.create({
          data: {
            workspaceId,
            projectId,
            scanType: 'analytics',
            status: result.status,
            analyticsData: result.analyticsData || {},
            scannedAt: new Date(),
            durationMs
          }
        });

        console.log(`[${job.id}] ✓ Analytics scan complete: ${result.detected.length} detected (${durationMs}ms)`);
        break;
      }

      case 'vercel': {
        const result = await scanVercelDeployment(projectName);
        const durationMs = Date.now() - startTime;

        await db.scan.create({
          data: {
            workspaceId,
            projectId,
            scanType: 'vercel',
            status: result.status,
            vercelData: result.latestDeployment || {},
            scannedAt: new Date(),
            durationMs
          }
        });

        console.log(`[${job.id}] ✓ Vercel scan complete: ${result.status} (${durationMs}ms)`);
        break;
      }

      case 'performance': {
        const result = await scanPerformance(domain);
        const durationMs = Date.now() - startTime;

        await db.scan.create({
          data: {
            workspaceId,
            projectId,
            scanType: 'performance',
            status: result.status,
            playwrightMetrics: (result.metrics || {}) as any,
            scannedAt: new Date(),
            durationMs
          }
        });

        console.log(`[${job.id}] ✓ Performance scan complete: ${result.status} (${durationMs}ms)`);
        break;
      }

      case 'screenshot': {
        const result = await captureScreenshot(domain);
        const durationMs = Date.now() - startTime;

        await db.scan.create({
          data: {
            workspaceId,
            projectId,
            scanType: 'screenshot',
            status: result.status,
            playwrightMetrics: {
              screenshotUrl: result.screenshotUrl,
              screenshotPath: result.screenshotPath,
              dimensions: result.dimensions
            } as any,
            scannedAt: new Date(),
            durationMs
          }
        });

        console.log(`[${job.id}] ✓ Screenshot capture complete: ${result.screenshotUrl} (${durationMs}ms)`);
        break;
      }

      case 'npm_audit': {
        const { repo } = data;
        if (!repo) {
          throw new Error('Repository path required for npm_audit scan');
        }

        const result = await scanNpmAudit(repo);
        const durationMs = Date.now() - startTime;

        await db.scan.create({
          data: {
            workspaceId,
            projectId,
            scanType: 'npm_audit',
            status: result.status,
            securityIssues: {
              vulnerabilities: result.vulnerabilities || [],
              metadata: result.metadata || {}
            } as any,
            scannedAt: new Date(),
            durationMs
          }
        });

        console.log(`[${job.id}] ✓ NPM audit complete: ${result.vulnerabilities?.length || 0} vulnerabilities (${durationMs}ms)`);
        break;
      }

      case 'secrets': {
        const { repo } = data;
        if (!repo) {
          throw new Error('Repository path required for secrets scan');
        }

        // For secrets scanner, we need to read files from the repo
        // This is a simplified implementation - in production, you'd want to
        // scan multiple files and aggregate results
        const result = await scanSecrets('', repo);
        const durationMs = Date.now() - startTime;

        await db.scan.create({
          data: {
            workspaceId,
            projectId,
            scanType: 'secrets',
            status: result.status,
            securityIssues: {
              findings: result.findings || []
            } as any,
            scannedAt: new Date(),
            durationMs
          }
        });

        console.log(`[${job.id}] ✓ Secrets scan complete: ${result.findings?.length || 0} findings (${durationMs}ms)`);
        break;
      }

      default:
        throw new Error(`Unknown scan type: ${scanType}`);
    }

    return { success: true, scanType, projectName };

  } catch (error) {
    console.error(`[${job.id}] ✗ Scan failed:`, error);

    // Save error scan result
    await db.scan.create({
      data: {
        workspaceId,
        projectId,
        scanType,
        status: 'error',
        scannedAt: new Date(),
        durationMs: Date.now() - startTime
      }
    });

    throw error; // Re-throw for BullMQ retry mechanism
  }
}

// Create worker
const worker = new Worker('scans', processScanJob, {
  connection,
  concurrency: 5, // Process 5 jobs concurrently
  limiter: {
    max: 10, // Max 10 jobs per duration
    duration: 1000 // per second
  }
});

worker.on('ready', () => {
  console.log('🚀 Scan worker started and ready to process jobs');
  console.log(`   Concurrency: 5`);
  console.log(`   Queue: scans`);
});

worker.on('completed', (job) => {
  console.log(`[${job.id}] ✅ Job completed`);
});

worker.on('failed', (job, error) => {
  console.error(`[${job?.id}] ❌ Job failed:`, error.message);
});

worker.on('error', (error) => {
  console.error('Worker error:', error);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, closing worker...');
  await worker.close();
  await connection.quit();
  await db.$disconnect();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('SIGINT received, closing worker...');
  await worker.close();
  await connection.quit();
  await db.$disconnect();
  process.exit(0);
});

console.log('Worker started');
