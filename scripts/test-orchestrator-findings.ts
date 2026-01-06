// Test script for vc-031: Verify orchestrator creates agent findings
import { db } from '../lib/db';

async function testOrchestratorFindings() {
  try {
    console.log('🧪 Testing: Orchestrator creates agent findings\n');

    // Check if any agent findings exist in the database
    const findings = await db.agentFinding.findMany({
      take: 5,
      orderBy: {
        createdAt: 'desc',
      },
    });

    if (findings.length === 0) {
      console.log('❌ No agent findings found in database');
      console.log('💡 Run orchestrator first: curl -X POST http://localhost:3000/api/orchestrator/run');
      process.exit(1);
    }

    console.log(`✓ Found ${findings.length} agent findings in database`);

    // Verify structure of findings
    const firstFinding = findings[0];
    const requiredFields = ['agent', 'issue', 'action', 'severity', 'effort', 'impact', 'confidence'];
    const missingFields = requiredFields.filter(field => !(field in firstFinding));

    if (missingFields.length > 0) {
      console.log(`❌ Missing required fields: ${missingFields.join(', ')}`);
      process.exit(1);
    }

    console.log('✓ Agent findings have correct structure');
    console.log(`  - Agent: ${firstFinding.agent}`);
    console.log(`  - Severity: ${firstFinding.severity}`);
    console.log(`  - Effort: ${firstFinding.effort}`);
    console.log(`  - Impact: ${firstFinding.impact}`);
    console.log(`  - Confidence: ${firstFinding.confidence}`);

    console.log('\n✅ ✓ Agent findings created\n');
    process.exit(0);
  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  }
}

testOrchestratorFindings();
