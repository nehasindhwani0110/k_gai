/**
 * Redis Cache Service
 * 
 * High-performance caching layer for:
 * - System catalog metadata (with smart invalidation)
 * - Query results (for common queries)
 * - Semantic matching results
 * 
 * REDIS BENEFITS:
 * - Sub-millisecond access times
 * - Shared across multiple instances
 * - Persistent (optional)
 * - Automatic expiration
 * - Memory efficient
 */

import { DataSourceMetadata } from '../types';

let redisClient: any = null;
let isRedisAvailable = false;
let connectionAttempted = false;
let connectionPromise: Promise<any> | null = null;

/**
 * Initialize Redis client (lazy initialization with better logging)
 * Uses dynamic import for Next.js compatibility
 */
async function getRedisClient(): Promise<any> {
  // Return existing client if already connected
  if (redisClient && isRedisAvailable) {
    return redisClient;
  }

  // If connection is in progress, wait for it
  if (connectionPromise) {
    return connectionPromise;
  }

  const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
  
  // Start connection attempt
  connectionPromise = (async () => {
    if (connectionAttempted && redisClient) {
      return redisClient;
    }

    connectionAttempted = true;
    console.log(`[REDIS] 🔄 Attempting to connect to Redis at ${redisUrl}...`);
  
    try {
      // Dynamic import for Next.js compatibility
      const { createClient } = await import('redis');
      redisClient = createClient({ url: redisUrl });
      
      // Set up event handlers BEFORE connecting
      redisClient.on('error', (err: any) => {
        console.error('[REDIS] ❌ Redis Client Error:', err.message || err);
        isRedisAvailable = false;
      });

      redisClient.on('connect', () => {
        console.log('[REDIS] ✅ Connected to Redis successfully!');
        isRedisAvailable = true;
      });

      redisClient.on('ready', () => {
        console.log('[REDIS] ✅ Redis client ready to accept commands');
        isRedisAvailable = true;
      });

      redisClient.on('reconnecting', () => {
        console.log('[REDIS] 🔄 Reconnecting to Redis...');
      });

      // Attempt connection
      await redisClient.connect();
      
      // Verify connection with a ping
      try {
        const pong = await redisClient.ping();
        if (pong === 'PONG') {
          console.log('[REDIS] ✅ Redis connection verified (PING/PONG successful)');
          isRedisAvailable = true;
        }
      } catch (pingError) {
        console.warn('[REDIS] ⚠️ Redis PING failed:', pingError);
      }

      return redisClient;
    } catch (error: any) {
      const errorMsg = error?.message || String(error);
      console.error(`[REDIS] ❌ Failed to connect to Redis: ${errorMsg}`);
      console.warn('[REDIS] ⚠️ Falling back to in-memory cache (no Redis)');
      isRedisAvailable = false;
      redisClient = null;
      return null;
    } finally {
      connectionPromise = null;
    }
  })();

  return connectionPromise;
}

/**
 * Cache system catalog metadata with smart invalidation
 * TTL: 5 minutes (schema changes are rare)
 */
export async function cacheSystemCatalogMetadata(
  dataSourceId: string,
  metadata: DataSourceMetadata,
  ttlSeconds: number = 300 // 5 minutes
): Promise<void> {
  try {
    const client = await getRedisClient();
    if (!client || !isRedisAvailable) {
      console.log('[REDIS] ⚠️ Redis not available, skipping cache (using in-memory fallback)');
      return;
    }

    const cacheKey = `metadata:system-catalog:${dataSourceId}`;
    await client.setEx(cacheKey, ttlSeconds, JSON.stringify(metadata));
    console.log(`[REDIS] ✅ Cached system catalog metadata for ${dataSourceId} (TTL: ${ttlSeconds}s)`);
  } catch (error: any) {
    console.warn(`[REDIS] ⚠️ Failed to cache metadata: ${error?.message || error}`);
    isRedisAvailable = false;
  }
}

/**
 * Get cached system catalog metadata
 */
export async function getCachedSystemCatalogMetadata(
  dataSourceId: string
): Promise<DataSourceMetadata | null> {
  try {
    const client = await getRedisClient();
    if (!client || !isRedisAvailable) {
      return null; // Silent return - Redis not available, will use database
    }

    const cacheKey = `metadata:system-catalog:${dataSourceId}`;
    const cached = await client.get(cacheKey);
    
    if (cached) {
      console.log(`[REDIS] ✅ Cache HIT for system catalog metadata: ${dataSourceId}`);
      return JSON.parse(cached) as DataSourceMetadata;
    }
    
    console.log(`[REDIS] ⚪ Cache MISS for system catalog metadata: ${dataSourceId}`);
    return null;
  } catch (error: any) {
    console.warn(`[REDIS] ⚠️ Failed to get cached metadata: ${error?.message || error}`);
    isRedisAvailable = false;
    return null;
  }
}

/**
 * Invalidate system catalog cache (when schema changes)
 */
export async function invalidateSystemCatalogCache(dataSourceId: string): Promise<void> {
  try {
    const client = await getRedisClient();
    if (!client || !isRedisAvailable) return;

    const cacheKey = `metadata:system-catalog:${dataSourceId}`;
    await client.del(cacheKey);
    console.log(`[REDIS] 🗑️ Invalidated system catalog cache for ${dataSourceId}`);
  } catch (error) {
    console.warn('[REDIS] Failed to invalidate cache:', error);
  }
}

/**
 * Cache query results (for common queries)
 * TTL: 1 minute (data changes frequently)
 */
export async function cacheQueryResult(
  queryHash: string,
  result: any[],
  ttlSeconds: number = 60 // 1 minute
): Promise<void> {
  try {
    const client = await getRedisClient();
    if (!client || !isRedisAvailable) return;

    const cacheKey = `query:result:${queryHash}`;
    await client.setEx(cacheKey, ttlSeconds, JSON.stringify(result));
    console.log(`[REDIS] ✅ Cached query result (TTL: ${ttlSeconds}s)`);
  } catch (error) {
    console.warn('[REDIS] Failed to cache query result:', error);
  }
}

/**
 * Get cached query result
 */
export async function getCachedQueryResult(queryHash: string): Promise<any[] | null> {
  try {
    const client = await getRedisClient();
    if (!client || !isRedisAvailable) return null;

    const cacheKey = `query:result:${queryHash}`;
    const cached = await client.get(cacheKey);
    
    if (cached) {
      console.log(`[REDIS] ✅ Cache HIT for query result`);
      return JSON.parse(cached);
    }
    
    return null;
  } catch (error) {
    console.warn('[REDIS] Failed to get cached query result:', error);
    return null;
  }
}

/**
 * Generate hash for query (for caching)
 */
export function hashQuery(query: string, userQuestion?: string): string {
  const crypto = require('crypto');
  const content = `${query}:${userQuestion || ''}`;
  return crypto.createHash('sha256').update(content).digest('hex').substring(0, 16);
}

/**
 * Cache semantic matching results
 */
export async function cacheSemanticMatch(
  questionHash: string,
  dataSourceId: string,
  matches: Array<{ name: string; score: number }>,
  ttlSeconds: number = 1800 // 30 minutes
): Promise<void> {
  try {
    const client = await getRedisClient();
    if (!client || !isRedisAvailable) return;

    const cacheKey = `semantic:match:${dataSourceId}:${questionHash}`;
    await client.setEx(cacheKey, ttlSeconds, JSON.stringify(matches));
  } catch (error) {
    console.warn('[REDIS] Failed to cache semantic match:', error);
  }
}

/**
 * Get cached semantic match
 */
export async function getCachedSemanticMatch(
  questionHash: string,
  dataSourceId: string
): Promise<Array<{ name: string; score: number }> | null> {
  try {
    const client = await getRedisClient();
    if (!client || !isRedisAvailable) return null;

    const cacheKey = `semantic:match:${dataSourceId}:${questionHash}`;
    const cached = await client.get(cacheKey);
    
    if (cached) {
      console.log(`[REDIS] ✅ Cache HIT for semantic match`);
      return JSON.parse(cached);
    }
    
    return null;
  } catch (error) {
    console.warn('[REDIS] Failed to get cached semantic match:', error);
    return null;
  }
}

/**
 * Initialize Redis connection early (call this at app startup)
 * This ensures Redis connection is attempted before first use
 */
export async function initializeRedis(): Promise<void> {
  console.log('[REDIS] 🚀 Initializing Redis connection...');
  try {
    await getRedisClient();
  } catch (error) {
    // Error already logged in getRedisClient
  }
}

/**
 * Get Redis connection status
 */
export function getRedisStatus(): { available: boolean; connected: boolean } {
  return {
    available: isRedisAvailable,
    connected: redisClient !== null && isRedisAvailable,
  };
}

/**
 * Close Redis connection (cleanup)
 */
export async function closeRedisConnection(): Promise<void> {
  if (redisClient) {
    try {
      await redisClient.quit();
      console.log('[REDIS] ✅ Redis connection closed');
    } catch (error) {
      console.warn('[REDIS] ⚠️ Error closing Redis connection:', error);
    }
    redisClient = null;
    isRedisAvailable = false;
    connectionAttempted = false;
  }
}

