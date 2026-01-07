// Git operations library for execution worker
import simpleGit, { SimpleGit } from 'simple-git';
import { promises as fs } from 'fs';
import { join } from 'path';

/**
 * Clone a repository to a temporary directory
 * @param url Repository URL (e.g., https://github.com/user/repo.git)
 * @param workDir Optional working directory (defaults to /tmp/clones/<timestamp>)
 * @returns Path to cloned repository
 */
export async function cloneRepo(url: string, workDir?: string): Promise<string> {
  const targetDir = workDir || join('/tmp/clones', `repo-${Date.now()}`);

  // Ensure parent directory exists
  await fs.mkdir(join('/tmp/clones'), { recursive: true });

  console.log(`[Git] Cloning ${url} to ${targetDir}`);

  const git: SimpleGit = simpleGit();
  await git.clone(url, targetDir);

  console.log(`[Git] Clone complete: ${targetDir}`);
  return targetDir;
}

/**
 * Create a new branch from current HEAD
 * @param repoPath Path to git repository
 * @param branchName Name of the branch to create
 */
export async function createBranch(repoPath: string, branchName: string): Promise<void> {
  console.log(`[Git] Creating branch ${branchName} in ${repoPath}`);

  const git: SimpleGit = simpleGit(repoPath);
  await git.checkoutLocalBranch(branchName);

  console.log(`[Git] Branch ${branchName} created and checked out`);
}

/**
 * Configure git user identity for commits
 * @param repoPath Path to git repository
 */
async function configureGitIdentity(repoPath: string): Promise<void> {
  const git: SimpleGit = simpleGit(repoPath);

  // Set git user for commits (required for Railway container)
  await git.addConfig('user.name', 'Virtual Cofounder', false, 'local');
  await git.addConfig('user.email', 'noreply@virtualcofounder.app', false, 'local');
}

/**
 * Commit all changes in working directory
 * @param repoPath Path to git repository
 * @param message Commit message
 * @param files Optional array of specific files to commit (defaults to all changes)
 */
export async function commitChanges(
  repoPath: string,
  message: string,
  files?: string[]
): Promise<void> {
  console.log(`[Git] Committing changes in ${repoPath}`);

  const git: SimpleGit = simpleGit(repoPath);

  // Configure git identity (required for Railway container)
  await configureGitIdentity(repoPath);

  // Add files (all if not specified)
  if (files && files.length > 0) {
    await git.add(files);
  } else {
    await git.add('.');
  }

  // Commit
  await git.commit(message);

  console.log(`[Git] Commit created: ${message}`);
}

/**
 * Push branch to remote origin
 * @param repoPath Path to git repository
 * @param branchName Name of the branch to push
 * @param remote Remote name (defaults to 'origin')
 */
export async function pushBranch(
  repoPath: string,
  branchName: string,
  remote: string = 'origin'
): Promise<void> {
  console.log(`[Git] Pushing branch ${branchName} to ${remote}`);

  const git: SimpleGit = simpleGit(repoPath);
  await git.push(remote, branchName, ['--set-upstream']);

  console.log(`[Git] Branch ${branchName} pushed to ${remote}`);
}

/**
 * Apply file changes to repository
 * @param repoPath Path to git repository
 * @param changes Array of file changes {path, content}
 */
export async function applyChanges(
  repoPath: string,
  changes: Array<{ path: string; content: string }>
): Promise<void> {
  console.log(`[Git] Applying ${changes.length} file changes`);

  for (const change of changes) {
    const filePath = join(repoPath, change.path);

    // Ensure parent directory exists
    const dir = join(filePath, '..');
    await fs.mkdir(dir, { recursive: true });

    // Write file
    await fs.writeFile(filePath, change.content, 'utf-8');
    console.log(`[Git] Updated ${change.path}`);
  }

  console.log(`[Git] Applied ${changes.length} changes`);
}

/**
 * Clean up cloned repository
 * @param repoPath Path to git repository to remove
 */
export async function cleanup(repoPath: string): Promise<void> {
  console.log(`[Git] Cleaning up ${repoPath}`);

  try {
    await fs.rm(repoPath, { recursive: true, force: true });
    console.log(`[Git] Cleanup complete`);
  } catch (error) {
    console.error(`[Git] Cleanup failed:`, error);
  }
}
