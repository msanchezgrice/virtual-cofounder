import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: 'postgresql://postgres.wklvmptaapqowjubsgse:Allornothing12345!@aws-0-us-west-2.pooler.supabase.com:5432/postgres',
    },
  },
});

async function main() {
  const projects = await prisma.project.findMany({
    take: 5,
    select: { id: true, name: true, repo: true },
  });

  console.log('Sample projects:');
  console.log(JSON.stringify(projects, null, 2));
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
  });
