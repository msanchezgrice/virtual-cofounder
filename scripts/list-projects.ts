import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: "postgresql://postgres.wklvmptaapqowjubsgse:Allornothing12345!@aws-0-us-west-2.pooler.supabase.com:5432/postgres"
    }
  }
});

async function main() {
  const projects = await prisma.project.findMany({
    select: {
      id: true,
      name: true,
      repo: true,
      status: true,
      workspaceId: true
    }
  });

  console.log('All projects:');
  projects.forEach(p => {
    console.log(`  - ${p.name}: ${p.repo} (${p.status})`);
    console.log(`    ID: ${p.id}`);
    console.log(`    Workspace: ${p.workspaceId}`);
    console.log('');
  });

  await prisma.$disconnect();
}

main();
