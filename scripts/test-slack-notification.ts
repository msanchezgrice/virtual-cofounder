import { PrismaClient } from '@prisma/client';
import { sendCompletionNotification } from '../lib/slack.js';

const db = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DIRECT_URL || process.env.DATABASE_URL,
    },
  },
});

async function test() {
  const completion = await db.completion.findFirst({
    where: { status: 'pending' },
    include: { project: true },
  });

  if (!completion) {
    console.log('❌ No pending completions found');
    process.exit(1);
  }

  console.log('🧪 Testing Slack notification for completion:', completion.id);
  console.log('   Project:', completion.project.name);
  console.log('   Title:', completion.title);
  console.log('   Priority:', completion.priority);
  console.log('   Policy:', completion.policy);
  console.log();

  await sendCompletionNotification({
    projectName: completion.project.name,
    title: completion.title,
    rationale: completion.rationale,
    priority: completion.priority as 'low' | 'medium' | 'high',
    policy: completion.policy as 'auto_safe' | 'approval_required' | 'suggest_only',
    completionId: completion.id,
  });

  console.log('✅ Notification sent to Slack!');
  console.log('   Check your Slack channel for the message');
  console.log('   Try clicking the buttons: [Approve & Merge] [View Details] [Snooze]');

  await db.$disconnect();
}

test();
