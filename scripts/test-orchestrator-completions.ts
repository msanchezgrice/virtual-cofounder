// Test script for vc-032: Verify orchestrator creates stories
import { db } from '../lib/db';

async function testOrchestratorStories() {
  try {
    console.log('🧪 Testing: Orchestrator creates stories\n');

    // Check if any stories exist in the database
    const stories = await db.story.findMany({
      take: 5,
      orderBy: {
        createdAt: 'desc',
      },
    });

    if (stories.length === 0) {
      console.log('❌ No stories found in database');
      console.log('💡 Run orchestrator first: curl -X POST http://localhost:3000/api/orchestrator/run');
      process.exit(1);
    }

    console.log(`✓ Found ${stories.length} stories in database`);

    // Verify structure of stories
    const firstStory = stories[0];
    const requiredFields = ['title', 'rationale', 'priority', 'policy', 'status'];
    const missingFields = requiredFields.filter(field => !(field in firstStory));

    if (missingFields.length > 0) {
      console.log(`❌ Missing required fields: ${missingFields.join(', ')}`);
      process.exit(1);
    }

    console.log('✓ Stories have correct structure');
    console.log(`  - Title: ${firstStory.title.substring(0, 60)}...`);
    console.log(`  - Priority: ${firstStory.priority}`);
    console.log(`  - Policy: ${firstStory.policy}`);
    console.log(`  - Status: ${firstStory.status}`);

    // Verify policy values are valid
    const validPolicies = ['auto_safe', 'approval_required', 'suggest_only'];
    if (!validPolicies.includes(firstStory.policy)) {
      console.log(`❌ Invalid policy: ${firstStory.policy}`);
      process.exit(1);
    }

    console.log('✓ Story policies are valid');

    console.log('\n✅ ✓ Stories created\n');
    process.exit(0);
  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  }
}

testOrchestratorStories();
