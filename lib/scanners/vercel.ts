/**
 * Vercel Deployment Scanner
 *
 * Uses Vercel API to check deployment status, build duration, and URLs
 */

const VERCEL_API_BASE = 'https://api.vercel.com';

export interface VercelScanResult {
  status: 'ok' | 'error' | 'no_deployment';
  latestDeployment?: {
    id: string;
    url: string;
    state: 'BUILDING' | 'READY' | 'ERROR' | 'CANCELED';
    createdAt: number;
    buildDurationMs?: number;
    domain?: string;
  };
  deploymentCount?: number;
  error?: string;
}

/**
 * Scan Vercel deployment status for a project
 * @param projectName - Vercel project name (or GitHub repo name to search)
 * @param vercelToken - Vercel API token from environment
 */
export async function scanVercelDeployment(
  projectName: string,
  vercelToken?: string
): Promise<VercelScanResult> {
  const token = vercelToken || process.env.VERCEL_TOKEN;

  if (!token) {
    return {
      status: 'error',
      error: 'VERCEL_TOKEN not configured'
    };
  }

  if (!projectName) {
    return {
      status: 'error',
      error: 'Project name is required'
    };
  }

  try {
    // First, search for the project by name
    const projectsUrl = `${VERCEL_API_BASE}/v9/projects`;
    const projectsResponse = await fetch(projectsUrl, {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });

    if (!projectsResponse.ok) {
      return {
        status: 'error',
        error: `Vercel API error: ${projectsResponse.status}`
      };
    }

    const projectsData = await projectsResponse.json();
    const projects = projectsData.projects || [];

    // Find project by exact name match or partial match
    const project = projects.find((p: any) =>
      p.name === projectName ||
      p.name.includes(projectName.toLowerCase()) ||
      projectName.toLowerCase().includes(p.name)
    );

    if (!project) {
      return {
        status: 'no_deployment',
        deploymentCount: 0
      };
    }

    // Fetch deployments for the project
    const deploymentsUrl = `${VERCEL_API_BASE}/v6/deployments?projectId=${project.id}&limit=1`;
    const deploymentsResponse = await fetch(deploymentsUrl, {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });

    if (!deploymentsResponse.ok) {
      return {
        status: 'error',
        error: `Failed to fetch deployments: ${deploymentsResponse.status}`
      };
    }

    const deploymentsData = await deploymentsResponse.json();
    const deployments = deploymentsData.deployments || [];

    if (deployments.length === 0) {
      return {
        status: 'no_deployment',
        deploymentCount: 0
      };
    }

    const latest = deployments[0];
    const buildDuration = latest.buildingAt && latest.ready
      ? latest.ready - latest.buildingAt
      : undefined;

    return {
      status: 'ok',
      latestDeployment: {
        id: latest.uid,
        url: latest.url,
        state: latest.state || latest.readyState || 'READY',
        createdAt: latest.created,
        buildDurationMs: buildDuration,
        domain: latest.alias?.[0] || latest.url
      },
      deploymentCount: deploymentsData.pagination?.count || deployments.length
    };
  } catch (error) {
    return {
      status: 'error',
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}
