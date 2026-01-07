/**
 * NPM Audit Security Scanner
 *
 * Runs npm audit on cloned repositories to detect package vulnerabilities.
 * Parses audit JSON output and extracts critical/high severity vulnerabilities.
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const execAsync = promisify(exec);

export interface NpmVulnerability {
  package: string;
  severity: 'critical' | 'high' | 'moderate' | 'low';
  vulnerable_versions: string;
  patched_versions?: string;
  via: string[];
  advisoryUrl?: string;
}

export interface NpmAuditResult {
  status: 'ok' | 'error' | 'vulnerabilities_found' | 'no_package_json';
  vulnerabilities: NpmVulnerability[];
  metadata?: {
    total_vulnerabilities?: number;
    critical_count?: number;
    high_count?: number;
    moderate_count?: number;
    low_count?: number;
  };
  error?: string;
}

/**
 * Scan a repository for npm vulnerabilities
 * @param repoPath - Path to the cloned repository
 */
export async function scanNpmAudit(repoPath: string): Promise<NpmAuditResult> {
  if (!repoPath) {
    return {
      status: 'error',
      vulnerabilities: [],
      error: 'Repository path is required'
    };
  }

  // Check if package.json exists
  const packageJsonPath = path.join(repoPath, 'package.json');
  if (!fs.existsSync(packageJsonPath)) {
    return {
      status: 'no_package_json',
      vulnerabilities: [],
      error: 'No package.json found in repository'
    };
  }

  try {
    // Run npm audit with JSON output
    let auditOutput: string;
    try {
      const { stdout } = await execAsync('npm audit --json', {
        cwd: repoPath,
        timeout: 30000,
        maxBuffer: 10 * 1024 * 1024 // 10MB buffer for large audit outputs
      });
      auditOutput = stdout;
    } catch (error: any) {
      // npm audit returns exit code 1 if vulnerabilities found
      // The JSON output is still in the error.stdout
      auditOutput = error.stdout || error.message;
    }

    // Parse JSON output
    let auditData: any;
    try {
      auditData = JSON.parse(auditOutput);
    } catch {
      return {
        status: 'error',
        vulnerabilities: [],
        error: 'Failed to parse npm audit output'
      };
    }

    // Extract vulnerabilities
    const vulnerabilities: NpmVulnerability[] = [];
    const metadata = {
      total_vulnerabilities: 0,
      critical_count: 0,
      high_count: 0,
      moderate_count: 0,
      low_count: 0
    };

    if (auditData.vulnerabilities) {
      for (const [packageName, vulnData] of Object.entries(auditData.vulnerabilities)) {
        // Handle both direct dependencies and nested vulnerabilities
        if (vulnData && typeof vulnData === 'object' && 'via' in vulnData) {
          const via = (vulnData as any).via || [];
          const viaArray = Array.isArray(via) ? via : [via];

          // Process each vulnerability entry
          for (const v of viaArray) {
            if (typeof v === 'string') {
              continue; // Skip string references
            }

            if (v && typeof v === 'object') {
              const severity = (v as any).severity || 'moderate';

              // Only include critical and high severity vulnerabilities
              if (severity === 'critical' || severity === 'high') {
                vulnerabilities.push({
                  package: packageName,
                  severity,
                  vulnerable_versions: (v as any).vulnerable_versions || '*',
                  patched_versions: (v as any).patched_versions,
                  via: [(v as any).title || (v as any).id || 'Unknown'],
                  advisoryUrl: (v as any).url
                });

                // Update counts
                metadata.total_vulnerabilities++;
                if (severity === 'critical') {
                  metadata.critical_count++;
                } else if (severity === 'high') {
                  metadata.high_count++;
                }
              } else {
                metadata.total_vulnerabilities++;
                if (severity === 'moderate') {
                  metadata.moderate_count++;
                } else {
                  metadata.low_count++;
                }
              }
            }
          }
        }
      }
    }

    // Determine result status
    const hasCriticalOrHigh = vulnerabilities.length > 0;
    const status = hasCriticalOrHigh ? 'vulnerabilities_found' : 'ok';

    return {
      status,
      vulnerabilities,
      metadata
    };

  } catch (error) {
    return {
      status: 'error',
      vulnerabilities: [],
      error: error instanceof Error ? error.message : 'Unknown error during npm audit'
    };
  }
}

/**
 * Scan the current project for npm vulnerabilities
 */
export async function scanNpmAuditCurrent(): Promise<NpmAuditResult> {
  return scanNpmAudit(process.cwd());
}
