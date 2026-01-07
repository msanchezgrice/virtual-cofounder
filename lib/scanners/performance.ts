/**
 * Core Web Vitals Performance Scanner
 *
 * Uses Playwright + Browserless to measure Core Web Vitals (LCP, FID, CLS)
 * Captures performance metrics from actual browser navigation
 */

import { Page } from 'playwright';
import { withBrowserlessPage } from '../browserless';

export interface WebVitalsMetrics {
  lcp?: number; // Largest Contentful Paint (milliseconds)
  fid?: number; // First Input Delay (milliseconds)
  cls?: number; // Cumulative Layout Shift (unitless)
  fcp?: number; // First Contentful Paint (milliseconds)
  ttfb?: number; // Time to First Byte (milliseconds)
  dcl?: number; // DOM Content Loaded (milliseconds)
}

export interface PerformanceScanResult {
  status: 'ok' | 'error' | 'timeout';
  url: string;
  metrics?: WebVitalsMetrics;
  loadTimeMs?: number;
  error?: string;
}

/**
 * Inject Web Vitals measurement script into the page
 */
function injectWebVitalsScript(): string {
  return `
    (function() {
      window.__webVitals = {
        lcp: null,
        fid: null,
        cls: 0,
        fcp: null,
        ttfb: null,
        dcl: null,
        navigationStart: performance.timing.navigationStart
      };

      // Measure LCP (Largest Contentful Paint)
      const lcpObserver = new PerformanceObserver((list) => {
        const entries = list.getEntries();
        const lastEntry = entries[entries.length - 1];
        window.__webVitals.lcp = Math.round(lastEntry.renderTime || lastEntry.loadTime);
      });
      try {
        lcpObserver.observe({ type: 'largest-contentful-paint', buffered: true });
      } catch (e) {
        // LCP observer not supported
      }

      // Measure FCP (First Contentful Paint)
      const fcpObserver = new PerformanceObserver((list) => {
        const entries = list.getEntries();
        for (const entry of entries) {
          if (entry.name === 'first-contentful-paint') {
            window.__webVitals.fcp = Math.round(entry.startTime);
            break;
          }
        }
      });
      try {
        fcpObserver.observe({ type: 'paint', buffered: true });
      } catch (e) {
        // FCP observer not supported
      }

      // Measure CLS (Cumulative Layout Shift)
      const clsObserver = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (!entry.hadRecentInput) {
            window.__webVitals.cls += entry.value;
          }
        }
      });
      try {
        clsObserver.observe({ type: 'layout-shift', buffered: true });
      } catch (e) {
        // CLS observer not supported
      }

      // Measure TTFB (Time to First Byte)
      window.__webVitals.ttfb = Math.round(performance.timing.responseStart - performance.timing.navigationStart);

      // Measure DCL (DOM Content Loaded)
      document.addEventListener('DOMContentLoaded', function() {
        window.__webVitals.dcl = Math.round(performance.timing.domContentLoadedEventEnd - performance.timing.navigationStart);
      });
    })();
  `;
}

/**
 * Scan a URL for Core Web Vitals using Playwright + Browserless
 */
export async function scanPerformance(
  url: string,
  timeoutMs: number = 30000
): Promise<PerformanceScanResult> {
  if (!url) {
    return {
      status: 'error',
      url: '',
      error: 'URL is required'
    };
  }

  // Normalize URL
  const targetUrl = url.startsWith('http') ? url : `https://${url}`;

  const startTime = Date.now();

  try {
    const result = await withBrowserlessPage(
      async (page: Page) => {
        // Set timeout
        page.setDefaultTimeout(timeoutMs);
        page.setDefaultNavigationTimeout(timeoutMs);

        // Inject Web Vitals script before navigation
        await page.addInitScript(injectWebVitalsScript());

        // Navigate to the URL
        try {
          await page.goto(targetUrl, { waitUntil: 'networkidle' });
        } catch (error) {
          // Even if navigation has issues, try to get metrics from what loaded
          if (!page.url().includes('blank')) {
            // Page did load something, continue
          } else {
            throw error;
          }
        }

        // Wait for Web Vitals to stabilize
        await page.waitForTimeout(2000);

        // Extract Web Vitals metrics
        const metrics = await page.evaluate(() => {
          return (window as any).__webVitals;
        });

        // Get additional performance metrics
        const perfMetrics = await page.evaluate(() => {
          const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
          return {
            domContentLoaded: nav?.domContentLoadedEventEnd - nav?.domContentLoadedEventStart,
            loadComplete: nav?.loadEventEnd - nav?.loadEventStart,
            totalDuration: nav?.loadEventEnd - nav?.startTime
          };
        });

        const loadTimeMs = Date.now() - startTime;

        return {
          status: 'ok' as const,
          url: page.url(),
          metrics: {
            lcp: metrics?.lcp,
            fid: metrics?.fid,
            cls: metrics?.cls,
            fcp: metrics?.fcp,
            ttfb: metrics?.ttfb,
            dcl: metrics?.dcl
          },
          loadTimeMs
        };
      },
      { timeout: timeoutMs + 5000 } // Give Browserless extra time
    );

    return result;
  } catch (error) {
    const duration = Date.now() - startTime;
    const isTimeout = duration >= timeoutMs;

    return {
      status: isTimeout ? 'timeout' : 'error',
      url: targetUrl,
      error: error instanceof Error ? error.message : 'Unknown error',
      loadTimeMs: duration
    };
  }
}
