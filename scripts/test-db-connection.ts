import { db } from '../lib/db';

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
