import { PrismaClient } from '@prisma/client';

// Prevent multiple instances of Prisma Client in development
declare global {
  var prisma: PrismaClient | undefined;
}

export const db = globalThis.prisma || new PrismaClient();

// Also export as prisma for compatibility
export const prisma = db;

if (process.env.NODE_ENV !== 'production') {
  globalThis.prisma = db;
}
