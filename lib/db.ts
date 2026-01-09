import { PrismaClient } from '@prisma/client';

// Prevent multiple instances of Prisma Client in development
declare global {
  var prisma: PrismaClient | undefined;
}

// Configure Prisma for serverless environment
// Uses the DATABASE_URL directly - should be the pooler URL with pgbouncer=true
const prismaClientSingleton = () => {
  return new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  });
};

export const db = globalThis.prisma ?? prismaClientSingleton();

// Also export as prisma for compatibility
export const prisma = db;

if (process.env.NODE_ENV !== 'production') {
  globalThis.prisma = db;
}
