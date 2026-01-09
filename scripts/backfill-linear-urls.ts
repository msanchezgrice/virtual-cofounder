/**
 * Backfill Linear URLs and Identifiers
 * 
 * This script fetches Linear issue details for all stories that have a linearTaskId
 * but are missing linearIssueUrl or linearIdentifier, and updates them.
 * 
 * Run with: npx tsx scripts/backfill-linear-urls.ts
 */

import { PrismaClient } from '@prisma/client';
import { getLinearIssue } from '../lib/linear';

const prisma = new PrismaClient();

async function backfillLinearUrls() {
  console.log('🔄 Starting Linear URL backfill...\n');

  // Find all stories with linearTaskId but missing URL or identifier
  const stories = await prisma.story.findMany({
    where: {
      linearTaskId: { not: null },
      OR: [
        { linearIssueUrl: null },
        { linearIdentifier: null },
      ],
    },
    select: {
      id: true,
      title: true,
      linearTaskId: true,
      linearIssueUrl: true,
      linearIdentifier: true,
    },
  });

  console.log(`Found ${stories.length} stories to backfill\n`);

  let updated = 0;
  let failed = 0;

  for (const story of stories) {
    try {
      console.log(`Processing: ${story.title.substring(0, 50)}...`);
      console.log(`  Linear Task ID: ${story.linearTaskId}`);

      if (!story.linearTaskId) continue;

      // Fetch issue details from Linear
      const issue = await getLinearIssue(story.linearTaskId);

      // Update story with URL and identifier
      await prisma.story.update({
        where: { id: story.id },
        data: {
          linearIssueUrl: issue.url,
          linearIdentifier: issue.identifier,
        },
      });

      console.log(`  ✅ Updated: ${issue.identifier} → ${issue.url}`);
      updated++;

      // Small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 200));
    } catch (error) {
      console.error(`  ❌ Failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      failed++;
    }
  }

  console.log('\n📊 Backfill Summary:');
  console.log(`  Total stories processed: ${stories.length}`);
  console.log(`  Successfully updated: ${updated}`);
  console.log(`  Failed: ${failed}`);

  await prisma.$disconnect();
}

// Run the script
backfillLinearUrls().catch(console.error);
