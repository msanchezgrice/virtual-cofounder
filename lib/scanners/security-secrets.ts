/**
 * Secrets Detection Scanner
 *
 * Scans code for exposed secrets (API keys, tokens, passwords)
 * Uses regex patterns to detect common secret patterns
 */

export interface SecretFinding {
  type: 'api_key' | 'secret' | 'token' | 'password';
  pattern: string;
  lineNumber: number;
  lineContent: string;
  severity: 'critical';
}

export interface SecretsScanResult {
  status: 'ok' | 'error' | 'secrets_found';
  findings: SecretFinding[];
  totalFindings: number;
  error?: string;
}

const SECRET_PATTERNS = [
  {
    name: 'api_key',
    patterns: [
      /[A-Z_]*API[_-]?KEY\s*=\s*["']([^"']+)["']/gi,
      /[A-Z_]*APIKEY\s*=\s*["']([^"']+)["']/gi,
      /[A-Z_]*API_SECRET\s*=\s*["']([^"']+)["']/gi,
    ]
  },
  {
    name: 'secret',
    patterns: [
      /[A-Z_]*SECRET\s*=\s*["']([^"']+)["']/gi,
      /[A-Z_]*PRIVATE_KEY\s*=\s*["']([^"']+)["']/gi,
    ]
  },
  {
    name: 'token',
    patterns: [
      /[A-Z_]*TOKEN\s*=\s*["']([^"']+)["']/gi,
      /[A-Z_]*AUTH_TOKEN\s*=\s*["']([^"']+)["']/gi,
      /[A-Z_]*BEARER_TOKEN\s*=\s*["']([^"']+)["']/gi,
      /[A-Z_]*ACCESS_TOKEN\s*=\s*["']([^"']+)["']/gi,
      /[A-Z_]*REFRESH_TOKEN\s*=\s*["']([^"']+)["']/gi,
    ]
  },
  {
    name: 'password',
    patterns: [
      /[A-Z_]*PASSWORD\s*=\s*["']([^"']+)["']/gi,
      /[A-Z_]*PASSWD\s*=\s*["']([^"']+)["']/gi,
      /[A-Z_]*PWD\s*=\s*["']([^"']+)["']/gi,
    ]
  }
];

export async function scanSecrets(fileContent: string, fileName: string = 'unknown'): Promise<SecretsScanResult> {
  if (!fileContent) {
    return {
      status: 'ok',
      findings: [],
      totalFindings: 0
    };
  }

  try {
    const findings: SecretFinding[] = [];
    const lines = fileContent.split('\n');

    for (let lineNumber = 0; lineNumber < lines.length; lineNumber++) {
      const line = lines[lineNumber];
      const lineContent = line.substring(0, 100); // Limit to 100 chars for safety

      // Check API keys
      for (const pattern of SECRET_PATTERNS[0].patterns) {
        if (pattern.test(line)) {
          findings.push({
            type: 'api_key',
            pattern: 'API_KEY',
            lineNumber: lineNumber + 1,
            lineContent,
            severity: 'critical'
          });
          pattern.lastIndex = 0; // Reset regex
        }
      }

      // Check secrets
      for (const pattern of SECRET_PATTERNS[1].patterns) {
        if (pattern.test(line)) {
          findings.push({
            type: 'secret',
            pattern: 'SECRET',
            lineNumber: lineNumber + 1,
            lineContent,
            severity: 'critical'
          });
          pattern.lastIndex = 0;
        }
      }

      // Check tokens
      for (const pattern of SECRET_PATTERNS[2].patterns) {
        if (pattern.test(line)) {
          findings.push({
            type: 'token',
            pattern: 'TOKEN',
            lineNumber: lineNumber + 1,
            lineContent,
            severity: 'critical'
          });
          pattern.lastIndex = 0;
        }
      }

      // Check passwords
      for (const pattern of SECRET_PATTERNS[3].patterns) {
        if (pattern.test(line)) {
          findings.push({
            type: 'password',
            pattern: 'PASSWORD',
            lineNumber: lineNumber + 1,
            lineContent,
            severity: 'critical'
          });
          pattern.lastIndex = 0;
        }
      }
    }

    if (findings.length > 0) {
      return {
        status: 'secrets_found',
        findings,
        totalFindings: findings.length
      };
    }

    return {
      status: 'ok',
      findings: [],
      totalFindings: 0
    };
  } catch (error) {
    return {
      status: 'error',
      findings: [],
      totalFindings: 0,
      error: error instanceof Error ? error.message : 'Unknown error during secrets scan'
    };
  }
}
