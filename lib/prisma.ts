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
 * For production, configure these via DATABASE_URL:
 * mysql://user:pass@host:port/db?connection_limit=20&pool_timeout=20
 * 
 * Or use a connection pooler like PgBouncer (PostgreSQL) or ProxySQL (MySQL)
 */
export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
    datasources: {
      db: {
        url: process.env.DATABASE_URL,
      },
    },
  });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

