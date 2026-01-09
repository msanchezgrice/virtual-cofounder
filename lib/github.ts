// GitHub API integration using GitHub App authentication
import { Octokit } from '@octokit/rest';
import { createAppAuth } from '@octokit/auth-app';
import { readFileSync } from 'fs';

interface PullRequestParams {
  owner: string;
  repo: string;
  head: string; // branch name
  base: string; // base branch (e.g., 'main')
  title: string;
  body: string;
}

/**
 * Get GitHub App private key from environment
 * Supports both direct key (GITHUB_APP_PRIVATE_KEY) and file path (GITHUB_APP_PRIVATE_KEY_PATH)
 */
function getPrivateKey(): string {
  const privateKeyPath = process.env.GITHUB_APP_PRIVATE_KEY_PATH;
  const privateKeyDirect = process.env.GITHUB_APP_PRIVATE_KEY;

  if (privateKeyDirect) {
    // Use key directly from environment (Railway, production)
    return privateKeyDirect;
  }

  if (privateKeyPath) {
    // Read key from file (local development)
    return readFileSync(privateKeyPath, 'utf-8');
  }

  throw new Error('Missing GITHUB_APP_PRIVATE_KEY or GITHUB_APP_PRIVATE_KEY_PATH in environment');
}

/**
 * Get authenticated Octokit instance using GitHub App
 */
async function getOctokit(): Promise<Octokit> {
  const appIdStr = process.env.GITHUB_APP_ID;

  if (!appIdStr) {
    throw new Error('Missing GITHUB_APP_ID in environment');
  }

  const appId = parseInt(appIdStr, 10);
  if (isNaN(appId)) {
    throw new Error(`Invalid GITHUB_APP_ID: ${appIdStr} (must be a number)`);
  }

  // Get private key from environment
  const privateKey = getPrivateKey();

  // Create GitHub App auth
  const auth = createAppAuth({
    appId,
    privateKey,
  });

  // Get installation access token
  // Note: This will be updated to use specific installationId in vc-044
  const { token } = await auth({
    type: 'installation',
    installationId: await getInstallationId(),
  });

  // Create Octokit instance with installation token
  return new Octokit({
    auth: token,
  });
}

// Cache for installation info to avoid repeated API calls
let cachedInstallation: { id: number; owner: string } | null = null;

/**
 * Get installation info (ID and owner) for the GitHub App
 * Returns cached result if available
 */
async function getInstallationInfo(): Promise<{ id: number; owner: string }> {
  if (cachedInstallation) {
    return cachedInstallation;
  }

  const appIdStr = process.env.GITHUB_APP_ID;

  if (!appIdStr) {
    throw new Error('Missing GITHUB_APP_ID in environment');
  }

  const appId = parseInt(appIdStr, 10);
  if (isNaN(appId)) {
    throw new Error(`Invalid GITHUB_APP_ID: ${appIdStr} (must be a number)`);
  }

  const privateKey = getPrivateKey();

  // Create app-level auth to list installations
  const appAuth = createAppAuth({
    appId,
    privateKey,
  });

  const { token: appToken } = await appAuth({
    type: 'app',
  });

  const appOctokit = new Octokit({
    auth: appToken,
  });

  // List installations
  const { data: installations } = await appOctokit.rest.apps.listInstallations();

  if (installations.length === 0) {
    throw new Error('No GitHub App installations found');
  }

  // Get first installation's account (owner)
  const installation = installations[0];
  const owner = installation.account?.login || '';
  
  if (!owner) {
    throw new Error('GitHub App installation has no associated account');
  }

  cachedInstallation = {
    id: installation.id,
    owner,
  };
  
  console.log(`[GitHub] Using installation ID: ${cachedInstallation.id}, owner: ${cachedInstallation.owner}`);

  return cachedInstallation;
}

/**
 * Get installation ID for the GitHub App
 * @deprecated Use getInstallationInfo() instead to get both ID and owner
 */
async function getInstallationId(): Promise<number> {
  const { id } = await getInstallationInfo();
  return id;
}

/**
 * Get the GitHub owner/org from the app installation
 */
export async function getInstallationOwner(): Promise<string> {
  const { owner } = await getInstallationInfo();
  return owner;
}

/**
 * Get authenticated clone URL for GitHub repository
 * Uses GitHub App installation token for authentication
 * Automatically resolves owner from GitHub App installation if only repo name is provided
 * @param repoUrl Repository URL (e.g., 'user/repo', 'https://github.com/user/repo', or just 'repo')
 * @returns Authenticated HTTPS URL for git operations
 */
export async function getAuthenticatedCloneUrl(repoUrl: string): Promise<string> {
  const appIdStr = process.env.GITHUB_APP_ID;

  if (!appIdStr) {
    throw new Error('Missing GITHUB_APP_ID in environment');
  }

  const appId = parseInt(appIdStr, 10);
  const privateKey = getPrivateKey();

  // Create GitHub App auth
  const auth = createAppAuth({
    appId,
    privateKey,
  });

  // Get installation info (includes owner)
  const installationInfo = await getInstallationInfo();

  // Get installation access token
  const { token } = await auth({
    type: 'installation',
    installationId: installationInfo.id,
  });

  // Parse repo to get owner/repo - use installation owner as fallback for repo-only format
  const { owner, repo } = parseRepoUrl(repoUrl, installationInfo.owner);

  // Return authenticated URL: https://x-access-token:<token>@github.com/owner/repo.git
  return `https://x-access-token:${token}@github.com/${owner}/${repo}.git`;
}

/**
 * Create a pull request
 * @param params Pull request parameters (owner, repo, head, base, title, body)
 * @returns PR number and URL
 */
export async function createPullRequest(params: PullRequestParams): Promise<{
  number: number;
  url: string;
}> {
  const { owner, repo, head, base, title, body } = params;

  console.log(`[GitHub] Creating PR: ${owner}/${repo} ${head} -> ${base}`);

  const octokit = await getOctokit();

  // Create pull request
  const { data: pr } = await octokit.rest.pulls.create({
    owner,
    repo,
    head,
    base,
    title,
    body,
  });

  console.log(`[GitHub] PR created: ${pr.html_url}`);

  return {
    number: pr.number,
    url: pr.html_url,
  };
}

/**
 * Parse GitHub repository URL to extract owner and repo
 * @param repoUrl Repository URL (e.g., https://github.com/user/repo or user/repo or just repo)
 * @param defaultOwner Optional default owner for repo-only format
 * @returns { owner, repo }
 * 
 * Supports formats:
 * - Full URL: https://github.com/owner/repo or https://github.com/owner/repo.git
 * - Shorthand: owner/repo
 * - Repo only: repo (uses defaultOwner parameter or GITHUB_OWNER env var)
 */
export function parseRepoUrl(repoUrl: string, defaultOwner?: string): { owner: string; repo: string } {
  // Handle full URLs and shorthand (owner/repo)
  const match = repoUrl.match(/(?:github\.com\/)?([^\/]+)\/([^\/\.]+)/);

  if (match) {
    return {
      owner: match[1],
      repo: match[2],
    };
  }

  // Handle repo-only format (no slash) - use provided defaultOwner or GITHUB_OWNER env var
  const owner = defaultOwner || process.env.GITHUB_OWNER;
  
  // Extract just the repo name, removing any URL prefix or .git suffix
  const repoOnlyMatch = repoUrl.match(/([^\/\.]+?)(?:\.git)?$/);
  
  if (repoOnlyMatch && owner) {
    const repoName = repoOnlyMatch[1];
    console.log(`[GitHub] Using owner '${owner}' for repo '${repoName}'`);
    return {
      owner,
      repo: repoName,
    };
  }

  // No owner found and no default configured
  throw new Error(
    `Invalid GitHub repository URL: ${repoUrl}. ` +
    `Expected format: 'owner/repo' or provide default owner.`
  );
}

/**
 * Parse repo URL with automatic owner detection from GitHub App installation
 * Use this when you have a repo-only string and need to resolve the owner
 */
export async function parseRepoUrlWithInstallation(repoUrl: string): Promise<{ owner: string; repo: string }> {
  // First try standard parsing
  try {
    return parseRepoUrl(repoUrl);
  } catch {
    // If that fails, get owner from GitHub App installation
    const installationOwner = await getInstallationOwner();
    return parseRepoUrl(repoUrl, installationOwner);
  }
}
