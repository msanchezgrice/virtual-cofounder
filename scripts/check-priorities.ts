import { PrismaClient } from '@prisma/client';

const db = new PrismaClient();

async function checkPriorities() {
  try {
    const workspaceId = process.env.WORKSPACE_ID || 'default';

    console.log('🔍 Checking stored priorities...\n');

    const priorities = await db.userPriority.findMany({
      where: {
        workspaceId,
        expiresAt: {
          gte: new Date(), // Not expired
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    if (priorities.length === 0) {
      console.log('❌ No priorities found in database');
      console.log('   This could mean:');
      console.log('   1. Slack event webhook not working');
      console.log('   2. Priority parsing failed');
      console.log('   3. Database connection issue');
      process.exit(1);
    }

    console.log(`✅ Found ${priorities.length} active priority/priorities\n`);

    priorities.forEach((p, i) => {
      console.log(`Priority ${i + 1}:`);
      console.log(`  User input: "${p.userInput}"`);
      console.log(`  Parsed intent:`, JSON.stringify(p.parsedIntent, null, 2));
      console.log(`  Created: ${p.createdAt.toISOString()}`);
      console.log(`  Expires: ${p.expiresAt.toISOString()}`);
      console.log();
    });

    console.log('✅ Priority parsing and storage working correctly!\n');
    process.exit(0);

  } catch (error) {
    console.error('❌ Error checking priorities:', error);
    process.exit(1);
  } finally {
    await db.$disconnect();
  }
}

checkPriorities();
