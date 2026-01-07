import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: "postgresql://postgres.wklvmptaapqowjubsgse:Allornothing12345!@aws-0-us-west-2.pooler.supabase.com:5432/postgres"
    }
  }
});

async function main() {
  const completionId = process.argv[2] || '3d205127-3ace-4b03-8f22-7dd47a3c9c7e';

  const completion = await prisma.completion.findUnique({
    where: { id: completionId },
    select: {
      id: true,
      title: true,
      status: true,
      prUrl: true,
      executedAt: true,
      createdAt: true
    }
  });

  if (!completion) {
    console.log(`❌ Completion ${completionId} not found`);
  } else {
    console.log('✅ Completion found:');
    console.log(`   Status: ${completion.status}`);
    console.log(`   PR URL: ${completion.prUrl || 'Not created yet'}`);
    console.log(`   Executed: ${completion.executedAt || 'Not executed yet'}`);
    console.log(`   Created: ${completion.createdAt}`);
  }

  await prisma.$disconnect();
}

main().catch(e => {
  console.error('Error:', e.message);
  process.exit(1);
});
