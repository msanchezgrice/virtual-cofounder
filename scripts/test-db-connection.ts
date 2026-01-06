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

async function testConnection() {
  try {
    const start = Date.now();

    // Test connection with a simple query
    await db.$queryRaw`SELECT 1`;

    const duration = Date.now() - start;

    console.log('✓ Connected to Supabase');
    console.log(`✓ Connection time: ${duration}ms`);

    if (duration > 200) {
      console.warn('⚠ Connection slower than expected (>200ms)');
    }

    await db.$disconnect();
    process.exit(0);
  } catch (error) {
    console.error('✗ Database connection failed:', error);
    process.exit(1);
  }
}

testConnection();
