import { PrismaClient } from '@prisma/client';

// Prevent multiple instances of Prisma Client in development
declare global {
  var prisma: PrismaClient | undefined;
}

/**
 * Get the database URL optimized for the current environment
 * - Vercel serverless functions: Use direct connection (port 5432) to avoid pooler timeouts
 * - Workers: Can use pooler (port 6543) for better connection management
 */
function getDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  
  if (!url) {
    throw new Error('DATABASE_URL is not set');
  }

  // For Vercel serverless functions, use direct connection to avoid pooler timeouts
  // The VERCEL environment variable is set by Vercel during deployment
  if (process.env.VERCEL) {
    // Convert pooler URL (port 6543) to direct connection (port 5432)
    // Also remove pgbouncer params that cause issues with direct connections
    const directUrl = url
      .replace(':6543', ':5432')
      .replace('?pgbouncer=true', '')
      .replace('&pgbouncer=true', '')
      .replace('&connection_limit=1', '')
      .replace('?connection_limit=1', '');
    
    // Clean up any leftover ? or & at the end
    return directUrl.replace(/[?&]$/, '');
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
