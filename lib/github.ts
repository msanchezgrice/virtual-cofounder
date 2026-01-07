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
 * Get authenticated Octokit instance using GitHub App
 */
async function getOctokit(): Promise<Octokit> {
  const appIdStr = process.env.GITHUB_APP_ID;
  const privateKeyPath = process.env.GITHUB_APP_PRIVATE_KEY_PATH;

  if (!appIdStr || !privateKeyPath) {
    throw new Error('Missing GITHUB_APP_ID or GITHUB_APP_PRIVATE_KEY_PATH in environment');
  }

  const appId = parseInt(appIdStr, 10);
  if (isNaN(appId)) {
    throw new Error(`Invalid GITHUB_APP_ID: ${appIdStr} (must be a number)`);
  }

  // Read private key from file
  const privateKey = readFileSync(privateKeyPath, 'utf-8');

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

/**
 * Get installation ID for the GitHub App
 * For now, uses the first installation found
 * TODO: Make this configurable per project in vc-044
 */
async function getInstallationId(): Promise<number> {
  const appIdStr = process.env.GITHUB_APP_ID;
  const privateKeyPath = process.env.GITHUB_APP_PRIVATE_KEY_PATH;

  if (!appIdStr || !privateKeyPath) {
    throw new Error('Missing GitHub App credentials');
  }

  const appId = parseInt(appIdStr, 10);
  if (isNaN(appId)) {
    throw new Error(`Invalid GITHUB_APP_ID: ${appIdStr} (must be a number)`);
  }

  const privateKey = readFileSync(privateKeyPath, 'utf-8');

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

  // Return first installation
  const installationId = installations[0].id;
  console.log(`[GitHub] Using installation ID: ${installationId}`);

  return installationId;
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
 * @param repoUrl Repository URL (e.g., https://github.com/user/repo or user/repo)
 * @returns { owner, repo }
 */
export function parseRepoUrl(repoUrl: string): { owner: string; repo: string } {
  // Handle both full URLs and shorthand (owner/repo)
  const match = repoUrl.match(/(?:github\.com\/)?([^\/]+)\/([^\/\.]+)/);

  if (!match) {
    throw new Error(`Invalid GitHub repository URL: ${repoUrl}`);
  }

  return {
    owner: match[1],
    repo: match[2],
  };
}
