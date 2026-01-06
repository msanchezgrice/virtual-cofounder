// Test script for vc-032: Verify orchestrator creates completions
import { db } from '../lib/db';

async function testOrchestratorCompletions() {
  try {
    console.log('🧪 Testing: Orchestrator creates completions\n');

    // Check if any completions exist in the database
    const completions = await db.completion.findMany({
      take: 5,
      orderBy: {
        createdAt: 'desc',
      },
    });

    if (completions.length === 0) {
      console.log('❌ No completions found in database');
      console.log('💡 Run orchestrator first: curl -X POST http://localhost:3000/api/orchestrator/run');
      process.exit(1);
    }

    console.log(`✓ Found ${completions.length} completions in database`);

    // Verify structure of completions
    const firstCompletion = completions[0];
    const requiredFields = ['title', 'rationale', 'priority', 'policy', 'status'];
    const missingFields = requiredFields.filter(field => !(field in firstCompletion));

    if (missingFields.length > 0) {
      console.log(`❌ Missing required fields: ${missingFields.join(', ')}`);
      process.exit(1);
    }

    console.log('✓ Completions have correct structure');
    console.log(`  - Title: ${firstCompletion.title.substring(0, 60)}...`);
    console.log(`  - Priority: ${firstCompletion.priority}`);
    console.log(`  - Policy: ${firstCompletion.policy}`);
    console.log(`  - Status: ${firstCompletion.status}`);

    // Verify policy values are valid
    const validPolicies = ['auto_safe', 'approval_required', 'suggest_only'];
    if (!validPolicies.includes(firstCompletion.policy)) {
      console.log(`❌ Invalid policy: ${firstCompletion.policy}`);
      process.exit(1);
    }

    console.log('✓ Completion policies are valid');

    console.log('\n✅ ✓ Completions created\n');
    process.exit(0);
  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  }
}

testOrchestratorCompletions();
