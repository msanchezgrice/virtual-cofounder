/**
 * Test Performance Scanner
 *
 * Validates that the Core Web Vitals performance scanner works correctly
 */

import { config } from 'dotenv';
config({ path: '.env.local' });

import { scanPerformance } from '../lib/scanners/performance';

async function main() {
  console.log('Testing Core Web Vitals performance scanner...\n');

  // Test 1: Scan warmstart.it (known good target)
  console.log('Test 1: Scanning warmstart.it for Core Web Vitals...');
  const result1 = await scanPerformance('warmstart.it', 30000);

  if (result1.status === 'error') {
    console.error(`❌ Error: ${result1.error}`);
    process.exit(1);
  }

  if (result1.status === 'timeout') {
    console.error('❌ Timeout: Page load took too long');
    process.exit(1);
  }

  console.log(`✓ Successfully scanned: ${result1.url}`);
  console.log(`  Load time: ${result1.loadTimeMs}ms`);
  console.log(`  Metrics:`);
  if (result1.metrics) {
    console.log(`    - LCP: ${result1.metrics.lcp !== undefined ? result1.metrics.lcp + 'ms' : 'N/A'}`);
    console.log(`    - FID: ${result1.metrics.fid !== undefined ? result1.metrics.fid + 'ms' : 'N/A'}`);
    console.log(`    - CLS: ${result1.metrics.cls !== undefined ? result1.metrics.cls.toFixed(3) : 'N/A'}`);
    console.log(`    - FCP: ${result1.metrics.fcp !== undefined ? result1.metrics.fcp + 'ms' : 'N/A'}`);
    console.log(`    - TTFB: ${result1.metrics.ttfb !== undefined ? result1.metrics.ttfb + 'ms' : 'N/A'}`);
  }

  // Test 2: Test error handling with invalid URL
  console.log('\nTest 2: Testing error handling with invalid domain...');
  const result2 = await scanPerformance('invalid-domain-that-does-not-exist-12345.test');

  if (result2.status === 'error' || result2.status === 'timeout') {
    console.log(`✓ Error handling works correctly (status: ${result2.status})`);
  } else {
    console.error('❌ Error handling failed - should have reported error for invalid domain');
    process.exit(1);
  }

  // Test 3: Test error handling with empty URL
  console.log('\nTest 3: Testing error handling with empty URL...');
  const result3 = await scanPerformance('');

  if (result3.status === 'error' && result3.error?.includes('required')) {
    console.log('✓ Error handling works correctly for empty URL');
  } else {
    console.error('❌ Error handling failed for empty URL');
    process.exit(1);
  }

  // Test 4: Verify function export
  console.log('\nTest 4: Verifying scanner exports...');
  if (typeof scanPerformance === 'function') {
    console.log('✓ scanPerformance function exported correctly');
  } else {
    console.error('❌ scanPerformance not exported');
    process.exit(1);
  }

  console.log('\n✓ Performance scanner test passed');
  process.exit(0);
}

main().catch((error) => {
  console.error('Test failed:', error);
  process.exit(1);
});
