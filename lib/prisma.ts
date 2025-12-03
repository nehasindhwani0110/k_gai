import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

/**
 * Prisma Client with connection pooling configuration
 * 
 * Connection pool settings:
 * - connection_limit: Maximum number of connections in the pool (default: 20)
 * - pool_timeout: Maximum time to wait for a connection (default: 20 seconds)
 * 
 * PRODUCTION: Connection pooling is enforced via DATABASE_URL parameters.
 * If not present, we append them automatically to ensure proper pooling.
 */
function getDatabaseUrlWithPooling(): string {
  const dbUrl = process.env.DATABASE_URL || '';
  
  // Check if connection pool parameters already exist
  if (dbUrl.includes('connection_limit') || dbUrl.includes('pool_timeout')) {
    return dbUrl; // Already configured
  }
  
  // Append connection pool parameters if not present
  const separator = dbUrl.includes('?') ? '&' : '?';
  return `${dbUrl}${separator}connection_limit=20&pool_timeout=20`;
}

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
    datasources: {
      db: {
        url: getDatabaseUrlWithPooling(), // Enforce connection pooling
      },
    },
  });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

