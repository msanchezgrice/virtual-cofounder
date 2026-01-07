/**
 * Linear Integration Library
 *
 * Handles Linear API interactions for task creation and management
 */

interface LinearTeam {
  id: string;
  name: string;
  key: string;
}

interface LinearTask {
  id: string;
  identifier: string;
  title: string;
  url: string;
  state?: {
    id: string;
    name: string;
  };
}

interface CreateTaskOptions {
  teamId: string;
  title: string;
  description: string;
  priority?: number; // 0 (no priority), 1 (urgent), 2 (high), 3 (medium), 4 (low)
  labelIds?: string[]; // Linear label IDs for filtering
  projectId?: string; // Linear project ID
  stateId?: string; // Linear workflow state ID for kanban status
}

/**
 * Get Linear client using OAuth token from environment
 */
function getLinearClient() {
  const apiKey = process.env.LINEAR_API_KEY;

  if (!apiKey) {
    throw new Error('LINEAR_API_KEY not configured');
  }

  return {
    apiKey,
    baseUrl: 'https://api.linear.app/graphql',
  };
}

/**
 * Execute GraphQL query against Linear API
 */
async function executeQuery<T>(query: string, variables?: Record<string, any>): Promise<T> {
  const client = getLinearClient();

  const response = await fetch(client.baseUrl, {
    method: 'POST',
    headers: {
      'Authorization': client.apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query, variables }),
  });

  const result = await response.json();

  if (result.errors) {
    throw new Error(`Linear API error: ${JSON.stringify(result.errors)}`);
  }

  return result.data as T;
}

/**
 * Fetch all teams in the workspace
 */
export async function getLinearTeams(): Promise<LinearTeam[]> {
  const query = `
    query {
      teams {
        nodes {
          id
          name
          key
        }
      }
    }
  `;

  const data = await executeQuery<{ teams: { nodes: LinearTeam[] } }>(query);
  return data.teams.nodes;
}

/**
 * Create a Linear task
 */
export async function createLinearTask(options: CreateTaskOptions): Promise<LinearTask> {
  const query = `
    mutation CreateIssue($teamId: String!, $title: String!, $description: String!, $priority: Int, $labelIds: [String!], $projectId: String, $stateId: String) {
      issueCreate(
        input: {
          teamId: $teamId
          title: $title
          description: $description
          priority: $priority
          labelIds: $labelIds
          projectId: $projectId
          stateId: $stateId
        }
      ) {
        success
        issue {
          id
          identifier
          title
          url
          state {
            id
            name
          }
        }
      }
    }
  `;

  const variables = {
    teamId: options.teamId,
    title: options.title,
    description: options.description,
    priority: options.priority || 0,
    labelIds: options.labelIds || [],
    projectId: options.projectId || null,
    stateId: options.stateId || null,
  };

  const data = await executeQuery<{
    issueCreate: {
      success: boolean;
      issue: LinearTask;
    };
  }>(query, variables);

  if (!data.issueCreate.success) {
    throw new Error('Failed to create Linear task');
  }

  return data.issueCreate.issue;
}

/**
 * Update Linear task status
 */
export async function updateLinearTaskStatus(
  taskId: string,
  stateId: string
): Promise<boolean> {
  const query = `
    mutation UpdateIssue($issueId: String!, $stateId: String!) {
      issueUpdate(
        id: $issueId
        input: {
          stateId: $stateId
        }
      ) {
        success
      }
    }
  `;

  const data = await executeQuery<{
    issueUpdate: {
      success: boolean;
    };
  }>(query, { issueId: taskId, stateId });

  return data.issueUpdate.success;
}

/**
 * Add a comment to a Linear task
 */
export async function addLinearComment(
  taskId: string,
  body: string
): Promise<boolean> {
  const query = `
    mutation CreateComment($issueId: String!, $body: String!) {
      commentCreate(
        input: {
          issueId: $issueId
          body: $body
        }
      ) {
        success
      }
    }
  `;

  const data = await executeQuery<{
    commentCreate: {
      success: boolean;
    };
  }>(query, { issueId: taskId, body });

  return data.commentCreate.success;
}

/**
 * Get workflow states for a team
 */
export async function getTeamWorkflowStates(teamId: string) {
  const query = `
    query GetTeamStates($teamId: String!) {
      team(id: $teamId) {
        states {
          nodes {
            id
            name
            type
          }
        }
      }
    }
  `;

  const data = await executeQuery<{
    team: {
      states: {
        nodes: Array<{
          id: string;
          name: string;
          type: string;
        }>;
      };
    };
  }>(query, { teamId });

  return data.team.states.nodes;
}

/**
 * Get the Backlog state ID for a team (for new tasks)
 */
export async function getBacklogStateId(teamId: string): Promise<string | undefined> {
  const states = await getTeamWorkflowStates(teamId);
  const backlogState = states.find((s) => s.type === 'backlog' || s.name.toLowerCase() === 'backlog');
  return backlogState?.id;
}

/**
 * Map completion priority to Linear priority
 */
export function mapPriorityToLinear(priority: string): number {
  switch (priority.toLowerCase()) {
    case 'urgent':
      return 1;
    case 'high':
      return 2;
    case 'medium':
      return 3;
    case 'low':
      return 4;
    default:
      return 0; // No priority
  }
}

/**
 * Get the default team ID (Virtual cofounder team)
 */
export async function getDefaultTeamId(): Promise<string> {
  const teams = await getLinearTeams();
  const defaultTeam = teams.find((t) => t.name === 'Virtual cofounder');

  if (!defaultTeam) {
    throw new Error('Virtual cofounder team not found in Linear workspace');
  }

  return defaultTeam.id;
}

/**
 * Get all labels for a team
 */
export async function getTeamLabels(teamId: string): Promise<Array<{ id: string; name: string }>> {
  const query = `
    query GetTeamLabels($teamId: String!) {
      team(id: $teamId) {
        labels {
          nodes {
            id
            name
          }
        }
      }
    }
  `;

  const data = await executeQuery<{
    team: {
      labels: {
        nodes: Array<{ id: string; name: string }>;
      };
    };
  }>(query, { teamId });

  return data.team.labels.nodes;
}

/**
 * Create a label for a team
 */
export async function createLabel(teamId: string, name: string): Promise<{ id: string; name: string }> {
  const query = `
    mutation CreateLabel($teamId: String!, $name: String!) {
      issueLabelCreate(
        input: {
          teamId: $teamId
          name: $name
        }
      ) {
        success
        issueLabel {
          id
          name
        }
      }
    }
  `;

  const data = await executeQuery<{
    issueLabelCreate: {
      success: boolean;
      issueLabel: { id: string; name: string };
    };
  }>(query, { teamId, name });

  if (!data.issueLabelCreate.success) {
    throw new Error(`Failed to create label: ${name}`);
  }

  return data.issueLabelCreate.issueLabel;
}

/**
 * Get or create a label by name
 */
export async function getOrCreateLabel(teamId: string, name: string): Promise<string> {
  const existingLabels = await getTeamLabels(teamId);
  const existing = existingLabels.find((l) => l.name.toLowerCase() === name.toLowerCase());

  if (existing) {
    return existing.id;
  }

  const newLabel = await createLabel(teamId, name);
  return newLabel.id;
}

/**
 * Get all projects for a team
 */
export async function getTeamProjects(teamId: string): Promise<Array<{ id: string; name: string }>> {
  const query = `
    query GetTeamProjects($teamId: String!) {
      team(id: $teamId) {
        projects {
          nodes {
            id
            name
          }
        }
      }
    }
  `;

  const data = await executeQuery<{
    team: {
      projects: {
        nodes: Array<{ id: string; name: string }>;
      };
    };
  }>(query, { teamId });

  return data.team.projects.nodes;
}

/**
 * Create a project for a team
 */
export async function createProject(teamId: string, name: string): Promise<{ id: string; name: string }> {
  const query = `
    mutation CreateProject($teamId: String!, $name: String!) {
      projectCreate(
        input: {
          teamId: $teamId
          name: $name
        }
      ) {
        success
        project {
          id
          name
        }
      }
    }
  `;

  const data = await executeQuery<{
    projectCreate: {
      success: boolean;
      project: { id: string; name: string };
    };
  }>(query, { teamId, name });

  if (!data.projectCreate.success) {
    throw new Error(`Failed to create project: ${name}`);
  }

  return data.projectCreate.project;
}

/**
 * Get or create a Linear project by name
 */
export async function getOrCreateProject(teamId: string, name: string): Promise<string> {
  const existingProjects = await getTeamProjects(teamId);
  const existing = existingProjects.find((p) => p.name.toLowerCase() === name.toLowerCase());

  if (existing) {
    return existing.id;
  }

  const newProject = await createProject(teamId, name);
  return newProject.id;
}
