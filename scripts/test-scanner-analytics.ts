#!/usr/bin/env tsx
/**
 * Test analytics scanner
 *
 * Tests the analytics scanner against a known domain
 */

import { scanAnalytics } from '../lib/scanners/analytics';

async function testAnalyticsScanner() {
  console.log('Testing analytics scanner...\n');

  // Test 1: Valid domain with analytics (Google has GA)
  console.log('Test 1: Valid domain (google.com)');
  const result1 = await scanAnalytics('google.com');
  console.log(`Status: ${result1.status}`);
  console.log(`Detected: ${result1.detected.join(', ') || 'None'}`);
  console.log(`Missing: ${result1.missing.join(', ')}`);

  if (result1.status !== 'ok') {
    console.error('✗ Test 1 failed: Expected status "ok"');
    process.exit(1);
  }

  // Test 2: No domain
  console.log('\nTest 2: No domain');
  const result2 = await scanAnalytics('');
  console.log(`Status: ${result2.status}`);

  if (result2.status !== 'error') {
    console.error('✗ Test 2 failed: Expected status "error"');
    process.exit(1);
  }

  console.log('\n✓ Analytics scanner test passed');
  process.exit(0);
}

testAnalyticsScanner().catch((error) => {
  console.error('✗ Test failed:', error);
  process.exit(1);
});
