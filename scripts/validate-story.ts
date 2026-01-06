#!/usr/bin/env tsx
/**
 * Ralph Story Validation Script
 *
 * Validates acceptance criteria for a user story in prd.json
 *
 * Usage: npm run validate:story <story-id>
 * Example: npm run validate:story vc-020
 */

import { readFileSync, existsSync } from 'fs';
import { execSync, spawn } from 'child_process';
import { join } from 'path';

interface AcceptanceCriterion {
  type: 'file_exists' | 'file_contains' | 'command';
  path?: string;
  pattern?: string;
  command?: string;
  expectedOutput?: string;
  mustExist?: boolean;
  mustContain?: boolean;
  mustPass?: boolean;
}

interface Story {
  id: string;
  title: string;
  acceptanceCriteria: AcceptanceCriterion[];
  status: string;
}

interface PRD {
  stories: Story[];
}

async function validateStory(storyId: string): Promise<boolean> {
  const prdPath = join(process.cwd(), 'prd.json');

  if (!existsSync(prdPath)) {
    console.error('❌ prd.json not found');
    return false;
  }

  const prd: PRD = JSON.parse(readFileSync(prdPath, 'utf-8'));
  const story = prd.stories.find(s => s.id === storyId);

  if (!story) {
    console.error(`❌ Story ${storyId} not found in prd.json`);
    return false;
  }

  console.log(`\n🧪 Validating story: ${story.id} - ${story.title}\n`);

  let allPassed = true;

  for (const criterion of story.acceptanceCriteria) {
    const passed = await validateCriterion(criterion);
    if (!passed) {
      allPassed = false;
    }
  }

  if (allPassed) {
    console.log(`\n✅ All acceptance criteria passed for ${storyId}\n`);
    console.log('📝 Next steps:');
    console.log('1. Capture learnings in progress.txt');
    console.log('2. Update prd.json status to "done"');
    console.log('3. Move to next story\n');
  } else {
    console.log(`\n❌ Some acceptance criteria failed for ${storyId}\n`);
  }

  return allPassed;
}

async function validateCriterion(criterion: AcceptanceCriterion): Promise<boolean> {
  try {
    switch (criterion.type) {
      case 'file_exists':
        return validateFileExists(criterion);

      case 'file_contains':
        return validateFileContains(criterion);

      case 'command':
        return await validateCommand(criterion);

      default:
        console.warn(`⚠️  Unknown criterion type: ${criterion.type}`);
        return false;
    }
  } catch (error) {
    console.error(`❌ Error validating criterion:`, error);
    return false;
  }
}

function validateFileExists(criterion: AcceptanceCriterion): boolean {
  const { path, mustExist } = criterion;

  if (!path) {
    console.error('❌ file_exists criterion missing path');
    return false;
  }

  const filePath = join(process.cwd(), path);
  const exists = existsSync(filePath);

  if (mustExist && exists) {
    console.log(`✓ File exists: ${path}`);
    return true;
  } else if (mustExist && !exists) {
    console.error(`✗ File does not exist: ${path}`);
    return false;
  } else if (!mustExist && !exists) {
    console.log(`✓ File correctly does not exist: ${path}`);
    return true;
  } else {
    console.error(`✗ File exists but should not: ${path}`);
    return false;
  }
}

function validateFileContains(criterion: AcceptanceCriterion): boolean {
  const { path, pattern, mustContain } = criterion;

  if (!path || !pattern) {
    console.error('❌ file_contains criterion missing path or pattern');
    return false;
  }

  const filePath = join(process.cwd(), path);

  if (!existsSync(filePath)) {
    console.error(`✗ File not found: ${path}`);
    return false;
  }

  const content = readFileSync(filePath, 'utf-8');
  const regex = new RegExp(pattern);
  const contains = regex.test(content);

  if (mustContain && contains) {
    console.log(`✓ File contains pattern: ${path} ~ /${pattern}/`);
    return true;
  } else if (mustContain && !contains) {
    console.error(`✗ File does not contain pattern: ${path} ~ /${pattern}/`);
    return false;
  } else if (!mustContain && !contains) {
    console.log(`✓ File correctly does not contain pattern: ${path} ~ /${pattern}/`);
    return true;
  } else {
    console.error(`✗ File contains pattern but should not: ${path} ~ /${pattern}/`);
    return false;
  }
}

async function validateCommand(criterion: AcceptanceCriterion): Promise<boolean> {
  const { command, expectedOutput, mustPass } = criterion;

  if (!command) {
    console.error('❌ command criterion missing command');
    return false;
  }

  // Detect long-running commands (workers)
  const isLongRunning = command.includes('worker:') || command.includes('worker-');

  if (isLongRunning && expectedOutput) {
    return await validateLongRunningCommand(command, expectedOutput);
  }

  try {
    const output = execSync(command, {
      encoding: 'utf-8',
      timeout: 30000,
      stdio: ['pipe', 'pipe', 'pipe']
    });

    const combinedOutput = output;

    if (expectedOutput) {
      const contains = combinedOutput.includes(expectedOutput);

      if (contains) {
        console.log(`✓ Command passed: ${command.substring(0, 60)}...`);
        return true;
      } else {
        console.error(`✗ Command output missing expected text: ${expectedOutput}`);
        console.error(`  Output: ${combinedOutput.substring(0, 200)}...`);
        return false;
      }
    } else if (mustPass) {
      console.log(`✓ Command passed: ${command.substring(0, 60)}...`);
      return true;
    }

    return true;

  } catch (error: any) {
    if (mustPass) {
      console.error(`✗ Command failed: ${command.substring(0, 60)}...`);
      if (error.stderr) {
        console.error(`  Error: ${error.stderr.toString().substring(0, 200)}...`);
      }
      return false;
    } else {
      console.log(`✓ Command correctly failed: ${command.substring(0, 60)}...`);
      return true;
    }
  }
}

function validateLongRunningCommand(command: string, expectedOutput: string): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    let output = '';
    let foundExpected = false;

    // Parse command (handle "npm run" format)
    const parts = command.split(' ');
    const proc = spawn(parts[0], parts.slice(1), {
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: true
    });

    proc.stdout?.on('data', (data) => {
      output += data.toString();
      if (output.includes(expectedOutput) && !foundExpected) {
        foundExpected = true;
        console.log(`✓ Command passed: ${command.substring(0, 60)}...`);
        proc.kill('SIGTERM');
        setTimeout(() => proc.kill('SIGKILL'), 1000);
        resolve(true);
      }
    });

    proc.stderr?.on('data', (data) => {
      output += data.toString();
    });

    proc.on('close', (code) => {
      if (!foundExpected) {
        console.error(`✗ Command output missing expected text: ${expectedOutput}`);
        console.error(`  Output: ${output.substring(0, 200)}...`);
        resolve(false);
      }
    });

    // Timeout after 10 seconds if expected output not found
    setTimeout(() => {
      if (!foundExpected) {
        proc.kill('SIGTERM');
        setTimeout(() => proc.kill('SIGKILL'), 1000);
        console.error(`✗ Command timed out waiting for: ${expectedOutput}`);
        console.error(`  Output: ${output.substring(0, 200)}...`);
        resolve(false);
      }
    }, 10000);
  });
}

// Main execution
const storyId = process.argv[2];

if (!storyId) {
  console.error('Usage: npm run validate:story <story-id>');
  console.error('Example: npm run validate:story vc-020');
  process.exit(1);
}

validateStory(storyId).then(success => {
  process.exit(success ? 0 : 1);
});
