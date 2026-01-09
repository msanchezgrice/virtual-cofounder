import { PrismaClient } from '@prisma/client';

// Prevent multiple instances of Prisma Client in development
declare global {
  var prisma: PrismaClient | undefined;
}

/**
 * Get the database URL optimized for serverless
 * Always use direct connection (port 5432) instead of pooler (port 6543)
 * The pooler causes timeout issues in serverless functions
 */
function getDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  
  if (!url) {
    throw new Error('DATABASE_URL is not set');
  }

  // Always convert pooler URL (port 6543) to direct connection (port 5432)
  // for serverless functions to avoid connection timeout issues
  // The pooler (pgbouncer) doesn't work well with Prisma in serverless
  if (url.includes(':6543')) {
    const directUrl = url
      .replace(':6543', ':5432')
      .replace('?pgbouncer=true', '')
      .replace('&pgbouncer=true', '')
      .replace('&connection_limit=1', '')
      .replace('?connection_limit=1', '')
      .replace(/[?&]$/, ''); // Clean up trailing ? or &
    
    console.log('[DB] Using direct connection (port 5432) for serverless');
    return directUrl;
  }

  return url;
}

// Configure Prisma for serverless environment
const prismaClientSingleton = () => {
  const databaseUrl = getDatabaseUrl();
  
  return new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
    datasources: {
      db: {
        url: databaseUrl,
      },
    },
  });
};

export const db = globalThis.prisma ?? prismaClientSingleton();

// Also export as prisma for compatibility
export const prisma = db;

if (process.env.NODE_ENV !== 'production') {
  globalThis.prisma = db;
}
