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
  const story = await db.story.findFirst({
    where: { status: 'pending' },
    include: { project: true },
  });

  if (!story) {
    console.log('❌ No pending stories found');
    process.exit(1);
  }

  console.log('🧪 Testing Slack notification for story:', story.id);
  console.log('   Project:', story.project.name);
  console.log('   Title:', story.title);
  console.log('   Priority:', story.priority);
  console.log('   Policy:', story.policy);
  console.log();

  await sendCompletionNotification({
    projectName: story.project.name,
    title: story.title,
    rationale: story.rationale,
    priority: story.priority as 'low' | 'medium' | 'high',
    policy: story.policy as 'auto_safe' | 'approval_required' | 'suggest_only',
    completionId: story.id,
  });

  console.log('✅ Notification sent to Slack!');
  console.log('   Check your Slack channel for the message');
  console.log('   Try clicking the buttons: [Approve & Merge] [View Details] [Snooze]');

  await db.$disconnect();
}

test();
