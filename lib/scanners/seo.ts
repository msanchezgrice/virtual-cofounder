/**
 * SEO Scanner
 *
 * Extracts title, meta description, OG tags, H1, canonical URL, robots.txt, sitemap.xml
 * Ported from: /Users/miguel/Reboot/dashboard-archive/scripts/scan_projects.js (analyzeSeo function)
 */

export interface SeoScanResult {
  status: 'ok' | 'error';
  seoDetail: {
    title?: string;
    metaDescription?: string;
    ogTitle?: string;
    ogDescription?: string;
    ogImage?: string;
    canonical?: string;
    h1?: string;
    robotsTxt?: boolean;
    sitemap?: boolean;
  };
  seoScore: 'Good' | 'Fair' | 'Poor' | 'N/A';
  missing: string[];
  present: string[];
}

function extractFirstMatch(html: string, regex: RegExp): string {
  const match = regex.exec(html);
  return match ? match[1].trim() : '';
}

export async function scanSEO(domain: string): Promise<SeoScanResult> {
  if (!domain) {
    return {
      status: 'error',
      seoDetail: {},
      seoScore: 'N/A',
      missing: ['Domain'],
      present: []
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
        seoDetail: {},
        seoScore: 'N/A',
        missing: ['HTML'],
        present: []
      };
    }

    const html = await response.text();

    // Extract SEO elements
    const title = extractFirstMatch(html, /<title[^>]*>([^<]+)<\/title>/i);
    const metaDescription = extractFirstMatch(html, /<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i);
    const ogTitle = extractFirstMatch(html, /<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i);
    const ogDescription = extractFirstMatch(html, /<meta[^>]*property=["']og:description["'][^>]*content=["']([^"']+)["']/i);
    const ogImage = extractFirstMatch(html, /<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i);
    const canonical = extractFirstMatch(html, /<link[^>]*rel=["']canonical["'][^>]*href=["']([^"']+)["']/i);
    const h1 = extractFirstMatch(html, /<h1[^>]*>([^<]+)<\/h1>/i);

    // Check for robots.txt and sitemap
    const robotsTxt = await checkRobotsTxt(domain);
    const sitemap = await checkSitemap(domain);

    // Categorize present vs missing
    const missing: string[] = [];
    const present: string[] = [];

    if (title) present.push('Title'); else missing.push('Title');
    if (metaDescription) present.push('Meta Desc'); else missing.push('Meta Desc');
    if (ogTitle || ogDescription || ogImage) present.push('OG Tags'); else missing.push('OG Tags');
    if (ogImage) present.push('OG Image'); else if (ogTitle || ogDescription) missing.push('OG Image');
    if (h1) present.push('H1'); else missing.push('H1');
    if (canonical) present.push('Canonical'); else missing.push('Canonical');
    if (robotsTxt) present.push('robots.txt'); else missing.push('robots.txt');
    if (sitemap) present.push('sitemap.xml'); else missing.push('sitemap.xml');

    // Calculate SEO score
    const missingCount = missing.length;
    const seoScore: 'Good' | 'Fair' | 'Poor' =
      missingCount <= 2 ? 'Good' : missingCount <= 4 ? 'Fair' : 'Poor';

    return {
      status: 'ok',
      seoDetail: {
        title,
        metaDescription,
        ogTitle,
        ogDescription,
        ogImage,
        canonical,
        h1,
        robotsTxt,
        sitemap
      },
      seoScore,
      missing,
      present
    };

  } catch (error: any) {
    return {
      status: 'error',
      seoDetail: {},
      seoScore: 'N/A',
      missing: ['Error: ' + (error?.message || 'unknown')],
      present: []
    };
  }
}

async function checkRobotsTxt(domain: string): Promise<boolean> {
  try {
    const url = domain.startsWith('http') ? domain : `https://${domain}`;
    const baseUrl = new URL(url).origin;
    const robotsUrl = `${baseUrl}/robots.txt`;

    const response = await fetch(robotsUrl, {
      method: 'GET',
      signal: AbortSignal.timeout(3000)
    });

    return response.ok;
  } catch {
    return false;
  }
}

async function checkSitemap(domain: string): Promise<boolean> {
  try {
    const url = domain.startsWith('http') ? domain : `https://${domain}`;
    const baseUrl = new URL(url).origin;
    const sitemapUrl = `${baseUrl}/sitemap.xml`;

    const response = await fetch(sitemapUrl, {
      method: 'GET',
      signal: AbortSignal.timeout(3000)
    });

    return response.ok;
  } catch {
    return false;
  }
}
