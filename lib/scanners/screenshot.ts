/**
 * Screenshot Capture Scanner
 *
 * Uses Playwright + Browserless to capture screenshots of project homepages.
 * Saves screenshots locally to public/screenshots/ for MVP.
 */

import * as fs from 'fs';
import * as path from 'path';
import { withBrowserlessPage } from '../browserless';

export interface ScreenshotScanResult {
  status: 'ok' | 'error' | 'timeout';
  screenshotUrl?: string;
  screenshotPath?: string;
  fileName?: string;
  dimensions?: {
    width: number;
    height: number;
  };
  capturedAt?: string;
  durationMs?: number;
  error?: string;
}

/**
 * Capture a screenshot of a website
 * @param url - The URL to capture
 * @param options - Configuration options for screenshot capture
 */
export async function captureScreenshot(
  url: string,
  options: {
    viewportWidth?: number;
    viewportHeight?: number;
    waitForSelector?: string;
    timeout?: number;
  } = {}
): Promise<ScreenshotScanResult> {
  const startTime = Date.now();

  if (!url) {
    return {
      status: 'error',
      error: 'URL is required'
    };
  }

  // Ensure URL has protocol
  const fullUrl = url.startsWith('http') ? url : `https://${url}`;

  const viewportWidth = options.viewportWidth || 1280;
  const viewportHeight = options.viewportHeight || 720;
  const pageTimeout = options.timeout || 30000;

  try {
    // Ensure screenshots directory exists
    const screenshotsDir = path.join(process.cwd(), 'public', 'screenshots');
    if (!fs.existsSync(screenshotsDir)) {
      fs.mkdirSync(screenshotsDir, { recursive: true });
    }

    const result = await withBrowserlessPage(
      async (page) => {
        // Set viewport size
        await page.setViewportSize({
          width: viewportWidth,
          height: viewportHeight
        });

        // Navigate to the URL with timeout
        try {
          await page.goto(fullUrl, {
            waitUntil: 'networkidle',
            timeout: pageTimeout
          });
        } catch (error) {
          // Try with a simpler wait condition if networkidle times out
          if (error instanceof Error && error.message.includes('timeout')) {
            await page.goto(fullUrl, {
              waitUntil: 'domcontentloaded',
              timeout: pageTimeout
            });
          } else {
            throw error;
          }
        }

        // Wait for optional selector if provided
        if (options.waitForSelector) {
          try {
            await page.waitForSelector(options.waitForSelector, {
              timeout: 5000
            });
          } catch {
            // If selector not found, continue anyway
          }
        }

        // Generate filename based on URL and timestamp
        const urlSlug = new URL(fullUrl).hostname
          .replace(/[^a-z0-9]/gi, '-')
          .toLowerCase();
        const timestamp = new Date().toISOString().split('T')[0];
        const fileName = `${urlSlug}-${timestamp}.png`;
        const screenshotPath = path.join(screenshotsDir, fileName);

        // Capture screenshot
        await page.screenshot({
          path: screenshotPath,
          fullPage: true
        });

        // Get page dimensions
        const dimensions = await page.evaluate(() => ({
          width: window.innerWidth,
          height: window.innerHeight
        }));

        const durationMs = Date.now() - startTime;

        return {
          status: 'ok' as const,
          screenshotPath,
          screenshotUrl: `/screenshots/${fileName}`,
          fileName,
          dimensions,
          capturedAt: new Date().toISOString(),
          durationMs
        };
      },
      { timeout: pageTimeout + 5000 }
    );

    return result;
  } catch (error) {
    const durationMs = Date.now() - startTime;

    // Check if it's a timeout error
    if (error instanceof Error && error.message.includes('timeout')) {
      return {
        status: 'timeout',
        error: `Screenshot capture timed out after ${options.timeout || 30000}ms`,
        durationMs
      };
    }

    return {
      status: 'error',
      error: error instanceof Error ? error.message : 'Unknown error',
      durationMs
    };
  }
}

/**
 * Capture screenshots for multiple URLs
 * @param urls - Array of URLs to capture
 * @param options - Configuration options
 */
export async function captureMultipleScreenshots(
  urls: string[],
  options: {
    viewportWidth?: number;
    viewportHeight?: number;
    waitForSelector?: string;
    timeout?: number;
  } = {}
): Promise<ScreenshotScanResult[]> {
  const results: ScreenshotScanResult[] = [];

  for (const url of urls) {
    const result = await captureScreenshot(url, options);
    results.push(result);

    // Small delay between captures to avoid overwhelming the browser
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  return results;
}
