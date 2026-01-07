#!/usr/bin/env tsx
/**
 * Test NPM audit security scanner
 *
 * Tests the security scanner against the current project
 */

import { scanNpmAuditCurrent } from '../lib/scanners/security-npm';

async function testNpmSecurityScanner() {
  console.log('Testing NPM security scanner...\n');

  // Test 1: Scan current project
  console.log('Test 1: Scan current project for npm vulnerabilities');
  const result = await scanNpmAuditCurrent();
  console.log(`Status: ${result.status}`);
  console.log(`Total vulnerabilities checked: ${result.metadata?.total_vulnerabilities || 0}`);

  if (result.metadata) {
    if ((result.metadata.critical_count || 0) > 0) {
      console.log(`Critical vulnerabilities: ${result.metadata.critical_count}`);
    }
    if ((result.metadata.high_count || 0) > 0) {
      console.log(`High vulnerabilities: ${result.metadata.high_count}`);
    }
    if ((result.metadata.moderate_count || 0) > 0) {
      console.log(`Moderate vulnerabilities: ${result.metadata.moderate_count}`);
    }
    if ((result.metadata.low_count || 0) > 0) {
      console.log(`Low vulnerabilities: ${result.metadata.low_count}`);
    }
  }

  if (result.vulnerabilities.length > 0) {
    console.log(`\nCritical/High vulnerabilities found:`);
    result.vulnerabilities.slice(0, 5).forEach((vuln, i) => {
      console.log(`  ${i + 1}. ${vuln.package} (${vuln.severity})`);
      if (vuln.via && vuln.via.length > 0) {
        console.log(`     Issue: ${vuln.via[0]}`);
      }
    });
    if (result.vulnerabilities.length > 5) {
      console.log(`  ... and ${result.vulnerabilities.length - 5} more`);
    }
  }

  // Test 2: Verify correct status field
  console.log(`\nTest 2: Verify result structure`);
  if (!result.status) {
    console.error('✗ Test 2 failed: Missing status field');
    process.exit(1);
  }

  if (!Array.isArray(result.vulnerabilities)) {
    console.error('✗ Test 2 failed: vulnerabilities is not an array');
    process.exit(1);
  }

  if (!result.metadata) {
    console.error('✗ Test 2 failed: Missing metadata field');
    process.exit(1);
  }

  console.log('✓ Result structure is valid');

  // Test 3: Verify status is one of expected values
  console.log('\nTest 3: Verify status value');
  const validStatuses = ['ok', 'error', 'vulnerabilities_found', 'no_package_json'];
  if (!validStatuses.includes(result.status)) {
    console.error(`✗ Test 3 failed: Invalid status "${result.status}"`);
    process.exit(1);
  }
  console.log(`✓ Status is valid: ${result.status}`);

  // Test 4: If vulnerabilities found, verify structure
  if (result.vulnerabilities.length > 0) {
    console.log('\nTest 4: Verify vulnerability structure');
    const firstVuln = result.vulnerabilities[0];

    if (!firstVuln.package) {
      console.error('✗ Test 4 failed: Vulnerability missing package field');
      process.exit(1);
    }
    if (!firstVuln.severity) {
      console.error('✗ Test 4 failed: Vulnerability missing severity field');
      process.exit(1);
    }
    if (!Array.isArray(firstVuln.via)) {
      console.error('✗ Test 4 failed: Vulnerability via is not an array');
      process.exit(1);
    }
    console.log('✓ Vulnerability structure is valid');
  }

  console.log('\n✓ NPM security scanner test passed');
  process.exit(0);
}

testNpmSecurityScanner().catch((error) => {
  console.error('✗ Test failed:', error);
  process.exit(1);
});
