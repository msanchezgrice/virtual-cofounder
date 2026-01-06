import { PrismaClient } from '@prisma/client';

// Use direct connection for test scripts (not pooler) to avoid prepared statement issues
const directDatabaseUrl = process.env.DATABASE_URL?.replace(':6543/', ':5432/').replace('?pgbouncer=true&connection_limit=1', '');

const db = new PrismaClient({
  datasources: {
    db: {
      url: directDatabaseUrl
    }
  }
});

async function testTables() {
  try {
    // Expected tables from schema
    const expectedTables = [
      'workspaces',
      'users',
      'workspace_members',
      'projects',
      'scans',
      'completions',
      'user_priorities',
      'agent_findings',
      'linear_tasks',
      'project_agent_config',
      'orchestrator_runs'
    ];

    console.log('Checking for required tables...\n');

    // Query to get all table names in public schema
    const result = await db.$queryRaw<Array<{ tablename: string }>>`
      SELECT tablename
      FROM pg_tables
      WHERE schemaname = 'public'
      ORDER BY tablename
    `;

    const existingTables = result.map(row => row.tablename);

    console.log('Existing tables:', existingTables);
    console.log('');

    // Check each expected table
    let allTablesExist = true;
    for (const table of expectedTables) {
      if (existingTables.includes(table)) {
        console.log(`✓ ${table}`);
      } else {
        console.log(`✗ ${table} (missing)`);
        allTablesExist = false;
      }
    }

    console.log('');

    if (allTablesExist) {
      console.log('✓ All required tables exist');

      // Test row counts
      const projectCount = await db.project.count();
      const workspaceCount = await db.workspace.count();
      const scanCount = await db.scan.count();

      console.log(`✓ Workspaces: ${workspaceCount}`);
      console.log(`✓ Projects: ${projectCount}`);

      if (scanCount > 0) {
        console.log(`✓ Scans table has data (${scanCount} scans)`);
      } else {
        console.log(`✓ Scans table exists (0 scans)`);
      }
    } else {
      console.error('✗ Some tables are missing. Run migration first.');
      process.exit(1);
    }

    await db.$disconnect();
    process.exit(0);
  } catch (error) {
    console.error('✗ Table check failed:', error);
    process.exit(1);
  }
}

testTables();
