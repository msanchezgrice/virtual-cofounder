#!/usr/bin/env tsx
/**
 * Test domain scanner
 *
 * Tests the domain scanner against a known domain
 */

import { scanDomain } from '../lib/scanners/domain';

async function testDomainScanner() {
  console.log('Testing domain scanner...\n');

  // Test 1: Valid HTTPS domain
  console.log('Test 1: Valid HTTPS domain');
  const result1 = await scanDomain('google.com');
  console.log(`Status: ${result1.status}`);
  console.log(`Status Code: ${result1.statusCode}`);
  console.log(`Final URL: ${result1.finalUrl}`);
  console.log(`Response Time: ${result1.responseTimeMs}ms`);

  if (result1.status !== 'ok') {
    console.error('✗ Test 1 failed: Expected status "ok"');
    process.exit(1);
  }

  // Test 2: No domain
  console.log('\nTest 2: No domain');
  const result2 = await scanDomain('');
  console.log(`Status: ${result2.status}`);

  if (result2.status !== 'error') {
    console.error('✗ Test 2 failed: Expected status "error"');
    process.exit(1);
  }

  // Test 3: Invalid domain
  console.log('\nTest 3: Invalid domain');
  const result3 = await scanDomain('this-domain-definitely-does-not-exist-12345.com');
  console.log(`Status: ${result3.status}`);

  if (result3.status !== 'timeout' && result3.status !== 'unreachable') {
    console.error('✗ Test 3 failed: Expected status "timeout" or "unreachable"');
    process.exit(1);
  }

  console.log('\n✓ Domain scanner test passed');
  process.exit(0);
}

testDomainScanner().catch((error) => {
  console.error('✗ Test failed:', error);
  process.exit(1);
});
