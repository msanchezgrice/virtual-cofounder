// E2E test for vc-033: Full orchestrator pipeline validation
import { db } from '../lib/db';
import { spawn } from 'child_process';

async function testE2EOrchestratorPipeline() {
  try {
    console.log('🧪 E2E Test: Full orchestrator pipeline\n');

    // Step 1: Verify scans exist
    console.log('[1/6] Checking for existing scans...');
    const cutoffTime = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const recentScans = await db.scan.findMany({
      where: {
        scannedAt: {
          gte: cutoffTime,
        },
      },
    });

    if (recentScans.length === 0) {
      console.log('⚠️  No recent scans found. Run scans first: npm run test:e2e:scans');
      console.log('Continuing with test...');
    } else {
      console.log(`✓ Found ${recentScans.length} recent scans`);
    }

    // Step 2: Start dev server
    console.log('\n[2/6] Starting Next.js dev server...');
    const server = spawn('npm', ['run', 'dev'], {
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: false,
    });

    // Wait for server to be ready
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Server startup timeout'));
      }, 30000);

      server.stdout?.on('data', (data) => {
        const output = data.toString();
        if (output.includes('Ready') || output.includes('Local:')) {
          clearTimeout(timeout);
          console.log('✓ Dev server started');
          resolve();
        }
      });

      server.stderr?.on('data', (data) => {
        console.error('Server error:', data.toString());
      });
    });

    // Give server extra time to be fully ready
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Step 3: Trigger orchestrator via API
    console.log('\n[3/6] Triggering orchestrator via API...');
    const response = await fetch('http://localhost:3000/api/orchestrator/run', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
    });

    if (!response.ok) {
      throw new Error(`API returned ${response.status}: ${await response.text()}`);
    }

    const result = await response.json();
    console.log(`✓ Orchestrator API responded`);
    console.log(`  - Run ID: ${result.run_id}`);
    console.log(`  - Findings: ${result.findings_count}`);
    console.log(`  - Completions: ${result.completions_count}`);

    if (!result.run_id) {
      throw new Error('No run_id returned from API');
    }

    // Step 4: Verify orchestrator run was recorded
    console.log('\n[4/6] Verifying orchestrator run record...');
    const orchestratorRun = await db.orchestratorRun.findUnique({
      where: { runId: result.run_id },
    });

    if (!orchestratorRun) {
      throw new Error('Orchestrator run not found in database');
    }

    console.log(`✓ Orchestrator run recorded`);
    console.log(`  - Status: ${orchestratorRun.status}`);
    console.log(`  - Findings count: ${orchestratorRun.findingsCount}`);
    console.log(`  - Stories count: ${orchestratorRun.storiesCount}`);

    // Step 5: Verify agent findings were created
    console.log('\n[5/6] Verifying agent findings...');
    const findings = await db.agentFinding.findMany({
      where: { runId: result.run_id },
    });

    if (findings.length === 0) {
      console.log('⚠️  No findings created (this may be expected if no issues were found)');
    } else {
      console.log(`✓ Found ${findings.length} agent findings`);
      const agentCounts = findings.reduce((acc, f) => {
        acc[f.agent] = (acc[f.agent] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);
      console.log(`  - By agent: ${JSON.stringify(agentCounts)}`);
    }

    // Step 6: Verify stories were created
    console.log('\n[6/6] Verifying stories...');
    const stories = await db.story.findMany({
      where: { runId: result.run_id },
    });

    if (stories.length === 0) {
      console.log('⚠️  No stories created (this may be expected if no actionable items were found)');
    } else {
      console.log(`✓ Found ${stories.length} stories`);
      const priorityCounts = stories.reduce((acc, s) => {
        acc[s.priority] = (acc[s.priority] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);
      console.log(`  - By priority: ${JSON.stringify(priorityCounts)}`);
    }

    // Cleanup: Kill server
    console.log('\n🧹 Cleaning up...');
    server.kill('SIGTERM');
    await new Promise(resolve => setTimeout(resolve, 1000));

    console.log('\n✅ ✓ Full orchestrator pipeline complete\n');
    process.exit(0);

  } catch (error) {
    console.error('\n❌ E2E test failed:', error);
    process.exit(1);
  }
}

testE2EOrchestratorPipeline();
