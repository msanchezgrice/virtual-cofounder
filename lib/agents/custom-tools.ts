/**
 * Custom Tool Implementations for Agent SDK
 * 
 * These tools extend the built-in Agent SDK tools with project-specific capabilities.
 * Each tool must implement the execute() function that returns a string result.
 */

import { createLinearTask, addLinearComment, updateLinearTaskStatus } from '@/lib/linear';
import { sendSlackNotification } from '@/lib/slack';
import { runDomainScanner } from '@/lib/scanners/domain';
import { runSEOScanner } from '@/lib/scanners/seo';
import { runPerformanceScanner } from '@/lib/scanners/performance';
import { runSecurityScanner } from '@/lib/scanners/security';

// ============================================================================
// TOOL INTERFACES
// ============================================================================

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, any>;
  execute: (input: Record<string, any>, context: ToolContext) => Promise<string>;
}

export interface ToolContext {
  projectId?: string;
  storyId?: string;
  workspaceId?: string;
  linearTaskId?: string;
  workingDirectory?: string;
}

// ============================================================================
// LINEAR TOOLS
// ============================================================================

export const createLinearTaskTool: ToolDefinition = {
  name: 'CreateLinearTask',
  description: 'Create a new task in Linear to track work',
  inputSchema: {
    type: 'object',
    properties: {
      title: { type: 'string', description: 'Task title' },
      description: { type: 'string', description: 'Task description' },
      priority: { type: 'number', description: 'Priority 0-4 (0=none, 1=urgent, 4=low)' },
    },
    required: ['title'],
  },
  async execute(input, context) {
    try {
      const task = await createLinearTask({
        title: input.title,
        description: input.description || '',
        priority: input.priority || 2,
        projectId: context.projectId,
      });
      return JSON.stringify({ success: true, taskId: task.id, url: task.url, identifier: task.identifier });
    } catch (error) {
      return JSON.stringify({ success: false, error: (error as Error).message });
    }
  },
};

export const addLinearCommentTool: ToolDefinition = {
  name: 'AddLinearComment',
  description: 'Add a comment to an existing Linear task',
  inputSchema: {
    type: 'object',
    properties: {
      issueId: { type: 'string', description: 'Linear issue ID' },
      body: { type: 'string', description: 'Comment body (supports markdown)' },
    },
    required: ['issueId', 'body'],
  },
  async execute(input, context) {
    try {
      const issueId = input.issueId || context.linearTaskId;
      if (!issueId) throw new Error('No Linear issue ID provided');
      
      await addLinearComment(issueId, input.body);
      return JSON.stringify({ success: true });
    } catch (error) {
      return JSON.stringify({ success: false, error: (error as Error).message });
    }
  },
};

export const updateLinearTaskTool: ToolDefinition = {
  name: 'UpdateLinearTask',
  description: 'Update the status of a Linear task',
  inputSchema: {
    type: 'object',
    properties: {
      issueId: { type: 'string', description: 'Linear issue ID' },
      status: { type: 'string', description: 'New status: pending, in_progress, completed' },
    },
    required: ['status'],
  },
  async execute(input, context) {
    try {
      const issueId = input.issueId || context.linearTaskId;
      if (!issueId) throw new Error('No Linear issue ID provided');
      
      await updateLinearTaskStatus(issueId, input.status);
      return JSON.stringify({ success: true });
    } catch (error) {
      return JSON.stringify({ success: false, error: (error as Error).message });
    }
  },
};

// ============================================================================
// SLACK TOOLS
// ============================================================================

export const sendSlackMessageTool: ToolDefinition = {
  name: 'SendSlackMessage',
  description: 'Send a notification message to the Slack channel',
  inputSchema: {
    type: 'object',
    properties: {
      message: { type: 'string', description: 'Message to send' },
      channel: { type: 'string', description: 'Channel ID (optional, uses default)' },
    },
    required: ['message'],
  },
  async execute(input, context) {
    try {
      await sendSlackNotification({
        completionId: context.storyId || 'agent-message',
        projectName: 'Agent',
        title: 'Agent Message',
        rationale: input.message,
      });
      return JSON.stringify({ success: true });
    } catch (error) {
      return JSON.stringify({ success: false, error: (error as Error).message });
    }
  },
};

// ============================================================================
// SCANNER TOOLS
// ============================================================================

export const scanDomainTool: ToolDefinition = {
  name: 'ScanDomain',
  description: 'Scan a domain for SSL, DNS, and availability issues',
  inputSchema: {
    type: 'object',
    properties: {
      domain: { type: 'string', description: 'Domain to scan (e.g., example.com)' },
    },
    required: ['domain'],
  },
  async execute(input, _context) {
    try {
      const result = await runDomainScanner({ domain: input.domain });
      return JSON.stringify(result);
    } catch (error) {
      return JSON.stringify({ success: false, error: (error as Error).message });
    }
  },
};

export const scanSEOTool: ToolDefinition = {
  name: 'ScanSEO',
  description: 'Scan a URL for SEO issues (meta tags, headings, etc)',
  inputSchema: {
    type: 'object',
    properties: {
      url: { type: 'string', description: 'URL to scan' },
    },
    required: ['url'],
  },
  async execute(input, _context) {
    try {
      const result = await runSEOScanner({ url: input.url });
      return JSON.stringify(result);
    } catch (error) {
      return JSON.stringify({ success: false, error: (error as Error).message });
    }
  },
};

export const scanPerformanceTool: ToolDefinition = {
  name: 'ScanPerformance',
  description: 'Scan a URL for performance metrics (Core Web Vitals)',
  inputSchema: {
    type: 'object',
    properties: {
      url: { type: 'string', description: 'URL to scan' },
    },
    required: ['url'],
  },
  async execute(input, _context) {
    try {
      const result = await runPerformanceScanner({ url: input.url });
      return JSON.stringify(result);
    } catch (error) {
      return JSON.stringify({ success: false, error: (error as Error).message });
    }
  },
};

export const scanSecurityTool: ToolDefinition = {
  name: 'ScanSecurity',
  description: 'Scan a repository for security issues (npm audit, secrets)',
  inputSchema: {
    type: 'object',
    properties: {
      repoPath: { type: 'string', description: 'Path to repository' },
    },
    required: ['repoPath'],
  },
  async execute(input, context) {
    try {
      const repoPath = input.repoPath || context.workingDirectory;
      if (!repoPath) throw new Error('No repository path provided');
      
      const result = await runSecurityScanner({ repoPath });
      return JSON.stringify(result);
    } catch (error) {
      return JSON.stringify({ success: false, error: (error as Error).message });
    }
  },
};

// ============================================================================
// QUALITY TOOLS
// ============================================================================

export const runTestsTool: ToolDefinition = {
  name: 'RunTests',
  description: 'Run the test suite for a project',
  inputSchema: {
    type: 'object',
    properties: {
      command: { type: 'string', description: 'Test command (default: npm test)' },
    },
  },
  async execute(input, context) {
    // This tool is a hint to the agent - actual execution happens via Bash
    const cmd = input.command || 'npm test';
    return JSON.stringify({
      hint: `Run "${cmd}" via the Bash tool to execute tests`,
      workingDirectory: context.workingDirectory,
    });
  },
};

export const runLinterTool: ToolDefinition = {
  name: 'RunLinter',
  description: 'Run the linter for a project',
  inputSchema: {
    type: 'object',
    properties: {
      command: { type: 'string', description: 'Lint command (default: npm run lint)' },
    },
  },
  async execute(input, context) {
    // This tool is a hint to the agent - actual execution happens via Bash
    const cmd = input.command || 'npm run lint';
    return JSON.stringify({
      hint: `Run "${cmd}" via the Bash tool to lint code`,
      workingDirectory: context.workingDirectory,
    });
  },
};

// ============================================================================
// OUTPUT TOOLS
// ============================================================================

export const hostOutputTool: ToolDefinition = {
  name: 'HostOutput',
  description: 'Host a file (image, HTML, markdown) and get a public URL',
  inputSchema: {
    type: 'object',
    properties: {
      content: { type: 'string', description: 'Content to host (base64 for images)' },
      filename: { type: 'string', description: 'Filename with extension' },
      contentType: { type: 'string', description: 'MIME type (e.g., text/html, image/png)' },
    },
    required: ['content', 'filename'],
  },
  async execute(input, context) {
    // TODO: Implement Supabase Storage upload
    // For now, return a placeholder
    return JSON.stringify({
      success: false,
      error: 'HostOutput not yet implemented - will upload to Supabase Storage',
      filename: input.filename,
      projectId: context.projectId,
    });
  },
};

export const takeScreenshotTool: ToolDefinition = {
  name: 'TakeScreenshot',
  description: 'Take a screenshot of a URL using Browserless',
  inputSchema: {
    type: 'object',
    properties: {
      url: { type: 'string', description: 'URL to screenshot' },
      fullPage: { type: 'boolean', description: 'Capture full page (default: false)' },
    },
    required: ['url'],
  },
  async execute(input, _context) {
    try {
      // Dynamic import to avoid loading browserless in all contexts
      const { takeScreenshot } = await import('@/lib/browserless');
      const result = await takeScreenshot(input.url, { fullPage: input.fullPage });
      return JSON.stringify({
        success: true,
        imageBase64: result.base64?.slice(0, 100) + '...',
        message: 'Screenshot captured. Use HostOutput to save.',
      });
    } catch (error) {
      return JSON.stringify({ success: false, error: (error as Error).message });
    }
  },
};

// ============================================================================
// TOOL REGISTRY
// ============================================================================

export const customTools: Record<string, ToolDefinition> = {
  CreateLinearTask: createLinearTaskTool,
  AddLinearComment: addLinearCommentTool,
  UpdateLinearTask: updateLinearTaskTool,
  SendSlackMessage: sendSlackMessageTool,
  ScanDomain: scanDomainTool,
  ScanSEO: scanSEOTool,
  ScanPerformance: scanPerformanceTool,
  ScanSecurity: scanSecurityTool,
  RunTests: runTestsTool,
  RunLinter: runLinterTool,
  HostOutput: hostOutputTool,
  TakeScreenshot: takeScreenshotTool,
};

/**
 * Get custom tool definitions in Anthropic format
 */
export function getCustomToolDefinitions(): Array<{
  name: string;
  description: string;
  input_schema: Record<string, any>;
}> {
  return Object.values(customTools).map(tool => ({
    name: tool.name,
    description: tool.description,
    input_schema: tool.inputSchema,
  }));
}

/**
 * Execute a custom tool by name
 */
export async function executeCustomTool(
  toolName: string,
  input: Record<string, any>,
  context: ToolContext
): Promise<string> {
  const tool = customTools[toolName];
  if (!tool) {
    return JSON.stringify({ error: `Unknown tool: ${toolName}` });
  }
  return tool.execute(input, context);
}
