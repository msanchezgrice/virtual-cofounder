/**
 * Browserless Connection Utilities
 *
 * Provides connection to Browserless cloud service for headless browser operations
 */

import { chromium, Browser, Page } from 'playwright';

const BROWSERLESS_TIMEOUT = 30000; // 30 seconds

export interface BrowserlessConfig {
  apiKey?: string;
  timeout?: number;
}

/**
 * Get Browserless WebSocket endpoint
 */
export function getBrowserlessEndpoint(apiKey?: string): string {
  const key = apiKey || process.env.BROWSERLESS_API_KEY;

  if (!key) {
    throw new Error('BROWSERLESS_API_KEY not configured');
  }

  return `wss://chrome.browserless.io?token=${key}`;
}

/**
 * Connect to Browserless and get a browser instance
 */
export async function connectBrowserless(
  config: BrowserlessConfig = {}
): Promise<Browser> {
  const endpoint = getBrowserlessEndpoint(config.apiKey);
  const timeout = config.timeout || BROWSERLESS_TIMEOUT;

  try {
    const browser = await chromium.connect(endpoint, {
      timeout
    });

    return browser;
  } catch (error) {
    throw new Error(
      `Failed to connect to Browserless: ${
        error instanceof Error ? error.message : 'Unknown error'
      }`
    );
  }
}

/**
 * Create a new page with Browserless
 */
export async function createBrowserlessPage(
  config: BrowserlessConfig = {}
): Promise<{ browser: Browser; page: Page }> {
  const browser = await connectBrowserless(config);
  const page = await browser.newPage();

  return { browser, page };
}

/**
 * Execute a function with a Browserless page and auto-cleanup
 */
export async function withBrowserlessPage<T>(
  fn: (page: Page) => Promise<T>,
  config: BrowserlessConfig = {}
): Promise<T> {
  let browser: Browser | null = null;

  try {
    const { browser: b, page } = await createBrowserlessPage(config);
    browser = b;

    const result = await fn(page);

    return result;
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}
