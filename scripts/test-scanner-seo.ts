#!/usr/bin/env tsx
/**
 * Test SEO scanner
 *
 * Tests the SEO scanner against a known domain
 */

import { scanSEO } from '../lib/scanners/seo';

async function testSeoScanner() {
  console.log('Testing SEO scanner...\n');

  // Test 1: Valid domain with SEO
  console.log('Test 1: Valid domain (google.com)');
  const result1 = await scanSEO('google.com');
  console.log(`Status: ${result1.status}`);
  console.log(`SEO Score: ${result1.seoScore}`);
  console.log(`Present: ${result1.present.join(', ')}`);
  console.log(`Missing: ${result1.missing.join(', ')}`);

  if (result1.status !== 'ok') {
    console.error('✗ Test 1 failed: Expected status "ok"');
    process.exit(1);
  }

  if (!result1.seoDetail.title) {
    console.error('✗ Test 1 failed: Expected to find title tag');
    process.exit(1);
  }

  // Test 2: No domain
  console.log('\nTest 2: No domain');
  const result2 = await scanSEO('');
  console.log(`Status: ${result2.status}`);
  console.log(`SEO Score: ${result2.seoScore}`);

  if (result2.status !== 'error') {
    console.error('✗ Test 2 failed: Expected status "error"');
    process.exit(1);
  }

  console.log('\n✓ SEO scanner test passed');
  process.exit(0);
}

testSeoScanner().catch((error) => {
  console.error('✗ Test failed:', error);
  process.exit(1);
});
