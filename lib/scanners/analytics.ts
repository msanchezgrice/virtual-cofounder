/**
 * Analytics Detection Scanner
 *
 * Detects PostHog, Google Analytics, Plausible, Fathom, Tag Manager
 * Ported from: /Users/miguel/Reboot/dashboard-archive/scripts/scan_projects.js (detectPosthog function)
 */

export interface AnalyticsScanResult {
  status: 'ok' | 'error';
  analyticsData: {
    posthog: boolean;
    googleAnalytics: boolean;
    plausible: boolean;
    fathom: boolean;
    googleTagManager: boolean;
  };
  detected: string[];
  missing: string[];
}

export async function scanAnalytics(domain: string): Promise<AnalyticsScanResult> {
  if (!domain) {
    return {
      status: 'error',
      analyticsData: {
        posthog: false,
        googleAnalytics: false,
        plausible: false,
        fathom: false,
        googleTagManager: false
      },
      detected: [],
      missing: ['Domain']
    };
  }

  try {
    // Fetch HTML
    const url = domain.startsWith('http') ? domain : `https://${domain}`;
    const response = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      headers: { 'User-Agent': 'VirtualCofounderScanner/1.0' },
      signal: AbortSignal.timeout(8000)
    });

    if (!response.ok) {
      return {
        status: 'error',
        analyticsData: {
          posthog: false,
          googleAnalytics: false,
          plausible: false,
          fathom: false,
          googleTagManager: false
        },
        detected: [],
        missing: ['HTML']
      };
    }

    const html = await response.text();
    const lower = html.toLowerCase();

    // Detect analytics platforms
    const posthog = lower.includes('posthog') || lower.includes('ph.js') || lower.includes('posthog.com');
    const googleAnalytics = lower.includes('google-analytics.com') || lower.includes('gtag') || lower.includes('ga(');
    const plausible = lower.includes('plausible.io') || lower.includes('plausible.js');
    const fathom = lower.includes('fathom') || lower.includes('usefathom.com');
    const googleTagManager = lower.includes('googletagmanager.com') || lower.includes('gtm.js');

    const detected: string[] = [];
    const missing: string[] = [];

    if (posthog) detected.push('PostHog'); else missing.push('PostHog');
    if (googleAnalytics) detected.push('Google Analytics'); else missing.push('Google Analytics');
    if (plausible) detected.push('Plausible'); else missing.push('Plausible');
    if (fathom) detected.push('Fathom'); else missing.push('Fathom');
    if (googleTagManager) detected.push('Google Tag Manager'); else missing.push('Google Tag Manager');

    return {
      status: 'ok',
      analyticsData: {
        posthog,
        googleAnalytics,
        plausible,
        fathom,
        googleTagManager
      },
      detected,
      missing
    };

  } catch (error: any) {
    return {
      status: 'error',
      analyticsData: {
        posthog: false,
        googleAnalytics: false,
        plausible: false,
        fathom: false,
        googleTagManager: false
      },
      detected: [],
      missing: ['Error: ' + (error?.message || 'unknown')]
    };
  }
}
