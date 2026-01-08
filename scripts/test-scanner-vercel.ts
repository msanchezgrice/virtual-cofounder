/**
 * Test Vercel Scanner
 *
 * Validates that the Vercel deployment scanner works correctly
 */

import { config } from 'dotenv';
config({ path: '.env.local' });

import { scanVercelDeployment } from '../lib/scanners/vercel';

async function main() {
  console.log('Testing Vercel deployment scanner...\n');

  // Test 1: Scan a known project (warmstart)
  console.log('Test 1: Scanning warmstart project...');
  const result1 = await scanVercelDeployment('warmstart');

  if (result1.status === 'error') {
    console.error(`❌ Error: ${result1.error}`);
    process.exit(1);
  }

  if (result1.status === 'no_deployment') {
    console.log('⚠️  No deployment found for warmstart');
    console.log('   (This is okay if the project is not deployed on Vercel)');
  } else {
    console.log(`✓ Latest deployment found:`);
    console.log(`  - URL: ${result1.latestDeployment?.url}`);
    console.log(`  - State: ${result1.latestDeployment?.state}`);
    console.log(`  - Build duration: ${result1.latestDeployment?.buildDurationMs}ms`);
  }

  // Test 2: Test error handling with invalid project
  console.log('\nTest 2: Testing error handling...');
  const result2 = await scanVercelDeployment('');

  if (result2.status === 'error' && result2.error?.includes('required')) {
    console.log('✓ Error handling works correctly');
  } else {
    console.error('❌ Error handling failed');
    process.exit(1);
  }

  // Test 3: Verify function export
  console.log('\nTest 3: Verifying scanner exports...');
  if (typeof scanVercelDeployment === 'function') {
    console.log('✓ scanVercelDeployment function exported correctly');
  } else {
    console.error('❌ scanVercelDeployment not exported');
    process.exit(1);
  }

  console.log('\n✓ Vercel scanner test passed');
  process.exit(0);
}

main().catch((error) => {
  console.error('Test failed:', error);
  process.exit(1);
});
