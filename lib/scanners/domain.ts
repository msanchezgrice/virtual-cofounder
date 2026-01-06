/**
 * Domain Scanner
 *
 * Checks HTTP/HTTPS reachability, SSL, DNS, redirects, and response time
 * Ported from: /Users/miguel/Reboot/dashboard-archive/scripts/scan_projects.js
 */

const TIMEOUT_MS = 8000;
const USER_AGENT = 'VirtualCofounderScanner/1.0';

export interface DomainScanResult {
  status: 'ok' | 'error' | 'timeout' | 'blocked' | 'unreachable';
  statusCode: number;
  finalUrl: string;
  responseTimeMs?: number;
  error?: string;
  domainData?: {
    protocol: 'https' | 'http';
    redirectCount: number;
    sslValid: boolean;
  };
}

function buildUrl(domain: string, preferHttps = true): string {
  if (!domain) return '';
  if (domain.startsWith('http://') || domain.startsWith('https://')) return domain;
  return `${preferHttps ? 'https' : 'http'}://${domain}`;
}

async function fetchWithTimeout(url: string): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      headers: { 'User-Agent': USER_AGENT },
      signal: controller.signal
    });
    return response;
  } finally {
    clearTimeout(timeout);
  }
}

export async function scanDomain(domain: string): Promise<DomainScanResult> {
  if (!domain) {
    return {
      status: 'error',
      statusCode: 0,
      finalUrl: '',
      error: 'no-domain'
    };
  }

  const startTime = Date.now();
  const primaryUrl = buildUrl(domain, true); // HTTPS first
  const fallbackUrl = buildUrl(domain, false); // HTTP fallback

  // Try HTTPS first
  try {
    const response = await fetchWithTimeout(primaryUrl);
    const responseTimeMs = Date.now() - startTime;
    const status = response.status;

    if (!response.ok) {
      // Check for blocks
      if (status === 403 || status === 429) {
        return {
          status: 'blocked',
          statusCode: status,
          finalUrl: response.url || primaryUrl,
          responseTimeMs,
          error: 'blocked'
        };
      }

      // Try HTTP fallback
      try {
        const fallbackResponse = await fetchWithTimeout(fallbackUrl);
        const fallbackTime = Date.now() - startTime;

        if (fallbackResponse.ok) {
          return {
            status: 'ok',
            statusCode: fallbackResponse.status,
            finalUrl: fallbackResponse.url || fallbackUrl,
            responseTimeMs: fallbackTime,
            domainData: {
              protocol: 'http',
              redirectCount: 0, // TODO: track redirect count
              sslValid: false
            }
          };
        }
      } catch {
        // Fallback also failed
      }

      return {
        status: 'unreachable',
        statusCode: status,
        finalUrl: response.url || primaryUrl,
        responseTimeMs,
        error: `HTTP ${status}`
      };
    }

    // Success with HTTPS
    return {
      status: 'ok',
      statusCode: status,
      finalUrl: response.url || primaryUrl,
      responseTimeMs,
      domainData: {
        protocol: 'https',
        redirectCount: 0, // TODO: track redirect count
        sslValid: response.url.startsWith('https://')
      }
    };

  } catch (error: any) {
    // Handle timeout
    if (error && error.name === 'AbortError') {
      return {
        status: 'timeout',
        statusCode: 0,
        finalUrl: primaryUrl,
        error: 'timeout'
      };
    }

    // Try HTTP fallback after HTTPS error
    try {
      const fallbackResponse = await fetchWithTimeout(fallbackUrl);
      const fallbackTime = Date.now() - startTime;

      if (fallbackResponse.ok) {
        return {
          status: 'ok',
          statusCode: fallbackResponse.status,
          finalUrl: fallbackResponse.url || fallbackUrl,
          responseTimeMs: fallbackTime,
          domainData: {
            protocol: 'http',
            redirectCount: 0,
            sslValid: false
          }
        };
      }
    } catch {
      // Both attempts failed
    }

    return {
      status: 'unreachable',
      statusCode: 0,
      finalUrl: primaryUrl,
      error: error?.message || 'unknown-error'
    };
  }
}
