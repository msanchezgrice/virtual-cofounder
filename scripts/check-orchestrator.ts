import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL
    }
  }
});

async function main() {
  // Get all orchestrator runs ordered by most recent
  const runs = await prisma.orchestratorRun.findMany({
    orderBy: { startedAt: 'desc' },
    take: 5
  });

  console.log('\nRecent Orchestrator Runs:');
  console.log('='.repeat(80));

  runs.forEach((run, i) => {
    console.log(`\n${i + 1}. Run ID: ${run.runId}`);
    console.log(`   Started: ${run.startedAt}`);
    console.log(`   Completed: ${run.completedAt || 'In progress'}`);
    console.log(`   Status: ${run.status}`);
    console.log(`   Completions Count: ${run.completionsCount}`);
    console.log(`   Findings Count: ${run.findingsCount}`);
  });

  // Get total completion count
  const totalCompletions = await prisma.completion.count();
  console.log(`\n\nTotal Completions in Database: ${totalCompletions}`);

  // Get completions from most recent run
  if (runs.length > 0) {
    const latestRun = runs[0];
    const completions = await prisma.completion.findMany({
      where: { runId: latestRun.runId },
      select: {
        id: true,
        title: true,
        priority: true,
        createdAt: true,
        project: { select: { name: true } }
      },
      orderBy: { createdAt: 'desc' }
    });

    console.log(`\n\nCompletions from Most Recent Run (${latestRun.runId}):`);
    console.log('='.repeat(80));
    if (completions.length === 0) {
      console.log('No completions found for this run.');
    } else {
      completions.forEach((c, i) => {
        console.log(`${i + 1}. [${c.priority}] ${c.project.name}: ${c.title}`);
        console.log(`   Created: ${c.createdAt}`);
      });
    }
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
