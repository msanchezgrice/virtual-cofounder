#!/usr/bin/env tsx
/**
 * Test secrets scanner
 *
 * Tests the secrets scanner against sample code with exposed secrets
 */

import { scanSecrets } from '../lib/scanners/security-secrets';

async function testSecretsScanner() {
  console.log('Testing secrets scanner...\n');

  // Test 1: Code with exposed API key
  console.log('Test 1: Code with exposed API_KEY');
  const codeWithApiKey = `
    const config = {
      API_KEY = "sk-1234567890abcdef",
      dbHost: "localhost"
    };
  `;
  const result1 = await scanSecrets(codeWithApiKey);
  console.log(`Status: ${result1.status}`);
  console.log(`Findings: ${result1.totalFindings}`);

  if (result1.totalFindings === 0) {
    console.error('✗ Test 1 failed: Expected to find API_KEY');
    process.exit(1);
  }

  if (result1.findings[0]?.type !== 'api_key') {
    console.error('✗ Test 1 failed: Expected finding type "api_key"');
    process.exit(1);
  }

  // Test 2: Code with exposed SECRET
  console.log('\nTest 2: Code with exposed SECRET');
  const codeWithSecret = `
    export const SECRET = "my-super-secret-password-12345";
    const username = "admin";
  `;
  const result2 = await scanSecrets(codeWithSecret);
  console.log(`Status: ${result2.status}`);
  console.log(`Findings: ${result2.totalFindings}`);

  if (result2.totalFindings === 0) {
    console.error('✗ Test 2 failed: Expected to find SECRET');
    process.exit(1);
  }

  if (result2.findings[0]?.type !== 'secret') {
    console.error('✗ Test 2 failed: Expected finding type "secret"');
    process.exit(1);
  }

  // Test 3: Code with exposed TOKEN
  console.log('\nTest 3: Code with exposed TOKEN');
  const codeWithToken = `
    const AUTH_TOKEN = "ghp_1234567890abcdefghijklmnopqrstuv";
    const config = require('./config');
  `;
  const result3 = await scanSecrets(codeWithToken);
  console.log(`Status: ${result3.status}`);
  console.log(`Findings: ${result3.totalFindings}`);

  if (result3.totalFindings === 0) {
    console.error('✗ Test 3 failed: Expected to find TOKEN');
    process.exit(1);
  }

  if (result3.findings[0]?.type !== 'token') {
    console.error('✗ Test 3 failed: Expected finding type "token"');
    process.exit(1);
  }

  // Test 4: Code with exposed PASSWORD
  console.log('\nTest 4: Code with exposed PASSWORD');
  const codeWithPassword = `
    const dbConfig = {
      host: "db.example.com",
      PASSWORD = "SuperSecret123!@#",
      port: 5432
    };
  `;
  const result4 = await scanSecrets(codeWithPassword);
  console.log(`Status: ${result4.status}`);
  console.log(`Findings: ${result4.totalFindings}`);

  if (result4.totalFindings === 0) {
    console.error('✗ Test 4 failed: Expected to find PASSWORD');
    process.exit(1);
  }

  if (result4.findings[0]?.type !== 'password') {
    console.error('✗ Test 4 failed: Expected finding type "password"');
    process.exit(1);
  }

  // Test 5: Clean code (no secrets)
  console.log('\nTest 5: Clean code (no secrets)');
  const cleanCode = `
    const config = {
      dbHost: "localhost",
      dbPort: 5432,
      username: "admin"
    };

    function getUserData(id) {
      return fetchUser(id);
    }
  `;
  const result5 = await scanSecrets(cleanCode);
  console.log(`Status: ${result5.status}`);
  console.log(`Findings: ${result5.totalFindings}`);

  if (result5.totalFindings !== 0) {
    console.error('✗ Test 5 failed: Expected no findings');
    process.exit(1);
  }

  if (result5.status !== 'ok') {
    console.error('✗ Test 5 failed: Expected status "ok"');
    process.exit(1);
  }

  // Test 6: Empty content
  console.log('\nTest 6: Empty content');
  const result6 = await scanSecrets('');
  console.log(`Status: ${result6.status}`);

  if (result6.status !== 'ok') {
    console.error('✗ Test 6 failed: Expected status "ok" for empty content');
    process.exit(1);
  }

  console.log('\n✓ Secrets scanner test passed');
  process.exit(0);
}

testSecretsScanner().catch((error) => {
  console.error('✗ Test failed:', error);
  process.exit(1);
});
