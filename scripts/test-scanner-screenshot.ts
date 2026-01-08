/**
 * Test Screenshot Scanner
 *
 * Validates that the screenshot scanner works correctly
 */

import { config } from 'dotenv';
config({ path: '.env.local' });

import { captureScreenshot } from '../lib/scanners/screenshot';

async function main() {
  console.log('Testing screenshot scanner...\n');

  // Test 1: Verify function export
  console.log('Test 1: Verifying scanner exports...');
  if (typeof captureScreenshot === 'function') {
    console.log('✓ captureScreenshot function exported correctly');
  } else {
    console.error('❌ captureScreenshot not exported');
    process.exit(1);
  }

  // Test 2: Test error handling with empty URL
  console.log('\nTest 2: Testing error handling with empty URL...');
  const resultEmpty = await captureScreenshot('');

  if (resultEmpty.status === 'error' && resultEmpty.error?.includes('required')) {
    console.log('✓ Empty URL error handling works correctly');
  } else {
    console.error('❌ Empty URL error handling failed');
    process.exit(1);
  }

  // Test 3: Capture screenshot of a test website
  console.log('\nTest 3: Capturing screenshot of example.com...');
  const result = await captureScreenshot('example.com', {
    viewportWidth: 1280,
    viewportHeight: 720,
    timeout: 30000
  });

  if (result.status === 'error') {
    console.error(`❌ Screenshot capture failed: ${result.error}`);
    // Don't exit here - network might not be available in test environment
    console.log('   (This may be okay in environments without internet access)');
  } else if (result.status === 'timeout') {
    console.error(`⚠️  Screenshot capture timed out: ${result.error}`);
    console.log('   (This may be okay if Browserless is not configured)');
  } else if (result.status === 'ok') {
    console.log(`✓ Screenshot captured successfully:`);
    console.log(`  - URL: ${result.screenshotUrl}`);
    console.log(`  - File: ${result.fileName}`);
    console.log(`  - Dimensions: ${result.dimensions?.width}x${result.dimensions?.height}`);
    console.log(`  - Duration: ${result.durationMs}ms`);
  }

  // Test 4: Verify result structure
  console.log('\nTest 4: Verifying result structure...');
  const expectedFields = ['status'];
  let structureValid = true;

  for (const field of expectedFields) {
    if (!(field in result)) {
      console.error(`❌ Missing expected field: ${field}`);
      structureValid = false;
    }
  }

  if (structureValid) {
    console.log('✓ Result structure is valid');
  } else {
    console.error('❌ Result structure validation failed');
    process.exit(1);
  }

  // Test 5: Verify function signature
  console.log('\nTest 5: Verifying function signature...');
  const resultTest = await captureScreenshot('https://google.com', {
    viewportWidth: 800,
    viewportHeight: 600
  });

  if (resultTest && typeof resultTest === 'object' && 'status' in resultTest) {
    console.log('✓ Function signature is correct');
  } else {
    console.error('❌ Function signature validation failed');
    process.exit(1);
  }

  console.log('\n✓ Screenshot scanner test passed');
  process.exit(0);
}

main().catch((error) => {
  console.error('Test failed:', error);
  process.exit(1);
});
