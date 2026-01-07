import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: "postgresql://postgres.wklvmptaapqowjubsgse:Allornothing12345!@aws-0-us-west-2.pooler.supabase.com:5432/postgres"
    }
  }
});

async function main() {
  const storyId = process.argv[2] || '3d205127-3ace-4b03-8f22-7dd47a3c9c7e';

  const story = await prisma.story.findUnique({
    where: { id: storyId },
    select: {
      id: true,
      title: true,
      status: true,
      prUrl: true,
      executedAt: true,
      createdAt: true
    }
  });

  if (!story) {
    console.log(`❌ Story ${storyId} not found`);
  } else {
    console.log('✅ Story found:');
    console.log(`   Status: ${story.status}`);
    console.log(`   PR URL: ${story.prUrl || 'Not created yet'}`);
    console.log(`   Executed: ${story.executedAt || 'Not executed yet'}`);
    console.log(`   Created: ${story.createdAt}`);
  }

  await prisma.$disconnect();
}

main().catch(e => {
  console.error('Error:', e.message);
  process.exit(1);
});
