// Test Git operations library
import { cloneRepo, createBranch, commitChanges, pushBranch, applyChanges, cleanup } from '../lib/git';
import { promises as fs } from 'fs';
import { join } from 'path';

async function testGitOps() {
  let repoPath: string | null = null;

  try {
    console.log('🧪 Testing Git operations...\n');

    // Test 1: Clone repository
    console.log('1️⃣ Testing cloneRepo()...');
    const testRepo = 'https://github.com/msanchezgrice/virtual-cofounder.git';
    repoPath = await cloneRepo(testRepo);

    // Verify clone worked
    const gitDir = join(repoPath, '.git');
    const gitExists = await fs.stat(gitDir).then(() => true).catch(() => false);
    if (!gitExists) {
      throw new Error('Clone failed: .git directory not found');
    }
    console.log('✓ cloneRepo() passed\n');

    // Test 2: Create branch
    console.log('2️⃣ Testing createBranch()...');
    const branchName = `test-branch-${Date.now()}`;
    await createBranch(repoPath, branchName);
    console.log('✓ createBranch() passed\n');

    // Test 3: Apply changes
    console.log('3️⃣ Testing applyChanges()...');
    const testFile = `test-${Date.now()}.txt`;
    await applyChanges(repoPath, [
      { path: testFile, content: 'Test content from git-ops test' }
    ]);

    // Verify file was created
    const testFilePath = join(repoPath, testFile);
    const fileContent = await fs.readFile(testFilePath, 'utf-8');
    if (!fileContent.includes('Test content')) {
      throw new Error('applyChanges() failed: file content mismatch');
    }
    console.log('✓ applyChanges() passed\n');

    // Test 4: Commit changes
    console.log('4️⃣ Testing commitChanges()...');
    await commitChanges(repoPath, 'Test commit from git-ops test');
    console.log('✓ commitChanges() passed\n');

    // Test 5: Push branch (skip for now - requires auth)
    console.log('5️⃣ Skipping pushBranch() (requires auth)\n');

    // Cleanup
    console.log('🧹 Cleaning up...');
    if (repoPath) {
      await cleanup(repoPath);
    }

    console.log('\n✅ ✓ Git operations test passed');
  } catch (error) {
    console.error('❌ Git operations test failed:', error);

    // Cleanup on error
    if (repoPath) {
      try {
        await cleanup(repoPath);
      } catch (cleanupError) {
        console.error('Cleanup failed:', cleanupError);
      }
    }

    process.exit(1);
  }
}

testGitOps();
