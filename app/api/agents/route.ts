import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { agents } from '@/lib/agents';

export async function GET() {
  try {
    // Fetch all stories with their findings
    const stories = await prisma.story.findMany({
      include: {
        project: {
          select: {
            name: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    // Group findings by agent role
    const agentActivity: Record<string, any> = {};

    // Initialize all agents
    Object.entries(agents).forEach(([role, config]) => {
      agentActivity[role] = {
        name: config.name,
        role,
        model: config.model,
        status: 'idle',
        lastRun: null,
        findingsCount: 0,
        recentFindings: [],
      };
    });

    // Process stories to extract agent findings
    stories.forEach((story) => {
      // Try to parse rationale to extract agent findings
      // The rationale might contain structured data about which agent found what
      try {
        // For now, we'll estimate based on the story title and rationale
        const text = `${story.title} ${story.rationale}`.toLowerCase();

        // Map keywords to agents
        const agentKeywords = {
          security: ['security', 'secret', 'api key', 'vulnerability', 'credential'],
          analytics: ['analytics', 'tracking', 'posthog', 'ga', 'event'],
          domain: ['domain', 'ssl', 'certificate', 'dns', 'unreachable'],
          seo: ['seo', 'meta', 'og tag', 'sitemap', 'robots.txt', 'canonical'],
          deployment: ['deployment', 'vercel', 'build', 'env var', 'failed deploy'],
        };

        // Find which agent this story is most related to
        let matchedAgent: string | null = null;
        let maxMatches = 0;

        Object.entries(agentKeywords).forEach(([agent, keywords]) => {
          const matches = keywords.filter(keyword => text.includes(keyword)).length;
          if (matches > maxMatches) {
            maxMatches = matches;
            matchedAgent = agent;
          }
        });

        if (matchedAgent && agentActivity[matchedAgent]) {
          const agent = agentActivity[matchedAgent];
          agent.findingsCount++;

          // Update last run time
          if (!agent.lastRun || new Date(story.createdAt) > new Date(agent.lastRun)) {
            agent.lastRun = story.createdAt;
          }

          // Update status
          if (story.status === 'in_progress' || story.status === 'pending') {
            agent.status = 'active';
          }

          // Add to recent findings (limit to 5 per agent)
          if (agent.recentFindings.length < 5) {
            // Extract severity from priority
            const severityMap: Record<string, 'high' | 'medium' | 'low'> = {
              high: 'high',
              medium: 'medium',
              low: 'low',
            };

            agent.recentFindings.push({
              id: story.id,
              issue: story.title,
              action: story.rationale.split('\n')[0].substring(0, 150),
              severity: severityMap[story.priority] || 'medium',
              projectName: story.project.name,
              createdAt: story.createdAt,
            });
          }
        }
      } catch (error) {
        console.error('Error processing story for agents:', error);
      }
    });

    // Convert to array
    const agentList = Object.values(agentActivity);

    return NextResponse.json({
      agents: agentList,
    });
  } catch (error) {
    console.error('Failed to fetch agents:', error);
    return NextResponse.json(
      { error: 'Failed to fetch agents' },
      { status: 500 }
    );
  }
}
