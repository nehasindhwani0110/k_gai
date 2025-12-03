/**
 * Persistent Embedding Cache Service
 * 
 * Stores schema embeddings in database so they persist across requests.
 * Schema embeddings are generated once and reused, significantly reducing API costs.
 * 
 * PRODUCTION OPTIMIZATIONS:
 * - LRU cache with size limits to prevent memory exhaustion
 * - Parallel batch processing for embedding generation
 * - Rate limiting to respect OpenAI API limits
 * - Timeout handling for long-running operations
 */

import { PrismaClient } from '@prisma/client';
import { LRUCache } from 'lru-cache';
import { createRateLimiter } from '../utils/rate-limiter';

const prisma = new PrismaClient();

/**
 * In-memory LRU cache for quick access (backed by database)
 * Limits memory usage and automatically evicts least recently used items
 */
const memoryCache = new LRUCache<string, number[]>({
  max: 5000, // Max 5000 embeddings in memory (~30 MB)
  ttl: 1000 * 60 * 60, // 1 hour TTL
  updateAgeOnGet: true, // Refresh TTL on access
});

/**
 * Rate limiter for OpenAI API calls
 * Limits concurrent requests to avoid hitting API rate limits
 * Increased from 10 to 20 for faster processing (OpenAI API can handle this)
 */
const OPENAI_RATE_LIMIT = createRateLimiter(20); // Max 20 concurrent requests

/**
 * Timeout for embedding generation (30 seconds)
 */
const EMBEDDING_TIMEOUT_MS = 30000;

/**
 * Generates a schema hash to detect schema changes
 * Hash changes when tables/columns are added/removed/changed
 */
export function generateSchemaHash(metadata: { tables: Array<{ name: string; columns: Array<{ name: string; type?: string }> }> }): string {
  const crypto = require('crypto');
  const schemaString = JSON.stringify(
    metadata.tables.map(t => ({
      name: t.name,
      columns: t.columns.map(c => ({ name: c.name, type: c.type })).sort((a, b) => a.name.localeCompare(b.name))
    })).sort((a, b) => a.name.localeCompare(b.name))
  );
  return crypto.createHash('sha256').update(schemaString).digest('hex').substring(0, 16);
}

/**
 * Generates a cache key for schema elements or questions
 * Uses hash for long text to avoid database column length limits
 * Questions don't use schemaHash (they're independent of schema)
 */
function getCacheKey(text: string, type: 'table' | 'column' | 'question' = 'table', schemaHash?: string): string {
  const crypto = require('crypto');
  const normalizedText = text.toLowerCase().trim();
  
  // If text is too long (>200 chars), hash it to avoid database column length issues
  // Database cacheKey column is typically VARCHAR(255) or similar
  const MAX_KEY_LENGTH = 200;
  let baseKey: string;
  
  if (normalizedText.length > MAX_KEY_LENGTH) {
    // Hash long text to keep key short
    const hash = crypto.createHash('sha256').update(normalizedText).digest('hex').substring(0, 16);
    baseKey = `${type}:${hash}:${normalizedText.substring(0, 50)}`;
  } else {
    baseKey = `${type}:${normalizedText}`;
  }
  
  // Questions don't use schemaHash (they're independent of schema)
  // Schema elements use schemaHash to detect schema changes
  return (type === 'question' || !schemaHash) ? baseKey : `${schemaHash}:${baseKey}`;
}

/**
 * Gets embedding from cache (for schema elements and questions)
 * Questions are cached by question text (normalized)
 * Schema elements are cached by text + schemaHash
 */
export async function getCachedEmbedding(
  text: string,
  type: 'table' | 'column' | 'question' = 'table',
  schemaHash?: string
): Promise<number[] | null> {
  const cacheKey = getCacheKey(text, type, schemaHash);
  
  // Check memory cache first (LRU cache)
  const cachedInMemory = memoryCache.get(cacheKey);
  if (cachedInMemory) {
    return cachedInMemory;
  }
  
  // Check database cache (only for schema elements)
  try {
    const cached = await prisma.embeddingCache.findUnique({
      where: { cacheKey },
    });
    
    if (cached && cached.embedding) {
      const embedding = JSON.parse(cached.embedding) as number[];
      // Store in memory cache for faster access (LRU will auto-evict if needed)
      memoryCache.set(cacheKey, embedding);
      return embedding;
    }
  } catch (error) {
    console.warn('[EMBEDDING-CACHE] Error reading from database cache:', error);
  }
  
  return null;
}

/**
 * Stores embedding in cache (for schema elements and questions)
 * Questions are cached by question text (normalized)
 * Schema elements are cached by text + schemaHash
 */
export async function setCachedEmbedding(
  text: string,
  embedding: number[],
  type: 'table' | 'column' | 'question' = 'table',
  schemaHash?: string
): Promise<void> {
  const cacheKey = getCacheKey(text, type, schemaHash);
  
  // Store in memory cache
  memoryCache.set(cacheKey, embedding);
  
  // Store in database cache (for both schema elements and questions)
  try {
    await prisma.embeddingCache.upsert({
      where: { cacheKey },
      create: {
        cacheKey,
        embedding: JSON.stringify(embedding),
        type,
        text: text.substring(0, 500), // Store first 500 chars for reference
      },
      update: {
        embedding: JSON.stringify(embedding),
        updatedAt: new Date(),
      },
    });
  } catch (error) {
    console.warn('[EMBEDDING-CACHE] Error writing to database cache:', error);
    // Continue even if database write fails (memory cache still works)
  }
}

/**
 * Generates embedding with rate limiting and timeout
 */
async function generateEmbeddingWithRateLimit(
  client: any,
  text: string,
  timeoutMs: number = EMBEDDING_TIMEOUT_MS
): Promise<number[]> {
  return OPENAI_RATE_LIMIT(async () => {
    // Create timeout promise
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('Embedding generation timeout')), timeoutMs);
    });
    
    // Race between embedding generation and timeout
    const embeddingPromise = client.embeddings.create({
      model: 'text-embedding-3-small',
      input: text,
    });
    
    const response = await Promise.race([embeddingPromise, timeoutPromise]);
    return response.data[0].embedding;
  });
}

/**
 * Pre-generates embeddings for all schema elements
 * Uses parallel batch processing for efficiency
 * This should be called when schema is first loaded
 */
/**
 * Quick check if embeddings exist for a schema hash
 * Returns approximate count of cached embeddings for this schema
 */
async function checkSchemaEmbeddingsExist(schemaHash: string): Promise<number> {
  try {
    const count = await prisma.embeddingCache.count({
      where: {
        cacheKey: {
          startsWith: `${schemaHash}:`,
        },
        type: {
          in: ['table', 'column'],
        },
      },
    });
    return count;
  } catch (error) {
    console.warn('[EMBEDDING-CACHE] Error checking schema embeddings:', error);
    return 0;
  }
}

export async function pregenerateSchemaEmbeddings(
  metadata: { tables: Array<{ name: string; columns: Array<{ name: string; type?: string }> }> },
  schemaHash?: string
): Promise<void> {
  console.log('[EMBEDDING-CACHE] 🔄 Checking schema embeddings...');
  console.log(`[EMBEDDING-CACHE] Processing ${metadata.tables.length} tables...`);
  
  // OPTIMIZATION: If metadata is already filtered (30 tables or less), skip pre-generation
  // These embeddings should already be cached from the first semantic search
  // Pre-generation is only needed for the FULL database schema
  if (metadata.tables.length <= 30) {
    console.log(`[EMBEDDING-CACHE] ⚡ Metadata already filtered (${metadata.tables.length} tables) - skipping pre-generation`);
    console.log(`[EMBEDDING-CACHE] ⚡ Embeddings should already be cached from previous semantic search`);
    console.log(`[EMBEDDING-CACHE] ⚡ Using lazy loading for any missing embeddings`);
    return;
  }
  
  // Generate schema hash if not provided
  const currentSchemaHash = schemaHash || generateSchemaHash(metadata);
  console.log(`[EMBEDDING-CACHE] Schema hash: ${currentSchemaHash}`);
  
  // Quick check: count existing embeddings for this schema hash
  const existingCount = await checkSchemaEmbeddingsExist(currentSchemaHash);
  const totalExpected = metadata.tables.length + metadata.tables.reduce((sum, t) => sum + t.columns.length, 0);
  
  // If we have most embeddings cached (90%+), skip detailed check and use lazy loading
  if (existingCount > 0 && existingCount >= totalExpected * 0.9) {
    console.log(`[EMBEDDING-CACHE] ✅ Schema embeddings mostly cached (${existingCount}/${totalExpected})`);
    console.log(`[EMBEDDING-CACHE] ⚡ Using lazy loading - will generate missing embeddings on-demand`);
    return;
  }
  
  // Check if we have embeddings for this schema hash
  // If schema hash changed, old embeddings are invalid and need regeneration
  const openai = (await import('openai')).default;
  const client = new openai({ apiKey: process.env.OPENAI_API_KEY });
  
  // Collect all items that need embedding generation
  interface EmbeddingTask {
    text: string;
    type: 'table' | 'column';
    description: string;
  }
  
  const tasks: EmbeddingTask[] = [];
  let cachedCount = 0;
  
  // Collect table tasks (check cache with schema hash)
  for (const table of metadata.tables) {
    const tableDescription = `Table: ${table.name}. Columns: ${table.columns.map(c => c.name).join(', ')}`;
    const existingTableEmbedding = await getCachedEmbedding(tableDescription, 'table', currentSchemaHash);
    
    if (!existingTableEmbedding) {
      tasks.push({
        text: tableDescription,
        type: 'table',
        description: `table ${table.name}`,
      });
    } else {
      cachedCount++;
    }
    
    // Collect column tasks (check cache with schema hash)
    for (const column of table.columns) {
      const columnDescription = `Column ${column.name}${column.type ? ` of type ${column.type}` : ''} in table ${table.name}`;
      const existingColumnEmbedding = await getCachedEmbedding(columnDescription, 'column', currentSchemaHash);
      
      if (!existingColumnEmbedding) {
        tasks.push({
          text: columnDescription,
          type: 'column',
          description: `column ${table.name}.${column.name}`,
        });
      } else {
        cachedCount++;
      }
    }
  }
  
  const totalTasks = tasks.length;
  const totalItems = metadata.tables.length + metadata.tables.reduce((sum, t) => sum + t.columns.length, 0);
  
  if (totalTasks === 0) {
    console.log(`[EMBEDDING-CACHE] ✅ All embeddings already cached for this schema (${cachedCount}/${totalItems} items)`);
    console.log(`[EMBEDDING-CACHE] ✅ No new embeddings needed - schema unchanged`);
    return;
  }
  
  console.log(`[EMBEDDING-CACHE] 📊 Cache status: ${cachedCount}/${totalItems} cached, ${totalTasks} new needed`);
  console.log(`[EMBEDDING-CACHE] 🔄 Generating ${totalTasks} new embeddings (schema changed or new columns detected)`);
  console.log(`[EMBEDDING-CACHE] ⚡ Using parallel processing with rate limiting (max 20 concurrent requests)`);
  
  // Process in batches to avoid overwhelming the system
  // Increased batch size for better throughput
  const BATCH_SIZE = 100;
  let generated = 0;
  let failed = 0;
  const startTime = Date.now();
  
  for (let i = 0; i < tasks.length; i += BATCH_SIZE) {
    const batch = tasks.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(tasks.length / BATCH_SIZE);
    
    console.log(`[EMBEDDING-CACHE] Processing batch ${batchNum}/${totalBatches} (${batch.length} items)...`);
    
    // Process batch in parallel with rate limiting
    // Use Promise.allSettled to handle errors gracefully and continue processing
    const batchPromises = batch.map(async (task) => {
      try {
        const embedding = await generateEmbeddingWithRateLimit(client, task.text);
        // Cache with schema hash to ensure proper versioning
        await setCachedEmbedding(task.text, embedding, task.type, currentSchemaHash);
        generated++;
        return { success: true, task, embedding };
      } catch (error) {
        failed++;
        console.warn(`[EMBEDDING-CACHE] Failed to generate embedding for ${task.description}:`, error instanceof Error ? error.message : String(error));
        return { success: false, task, error };
      }
    });
    
    // Wait for batch to complete (with rate limiting built-in)
    // All requests run concurrently (up to rate limit), then wait for all to finish
    await Promise.allSettled(batchPromises);
    
    // Log progress
    const elapsedSeconds = (Date.now() - startTime) / 1000;
    const elapsed = elapsedSeconds.toFixed(1);
    const rate = (generated / elapsedSeconds).toFixed(1);
    console.log(`[EMBEDDING-CACHE] Progress: ${generated}/${totalTasks} generated, ${failed} failed (${rate} embeddings/sec)`);
  }
  
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`[EMBEDDING-CACHE] ✅ Pre-generation complete: ${generated} new, ${cachedCount} cached, ${failed} failed (${elapsed}s total)`);
}

/**
 * Clears cache for a specific schema (useful when schema changes)
 */
export async function clearSchemaCache(schemaHash?: string): Promise<void> {
  try {
    if (schemaHash) {
      // Clear specific schema cache
      await prisma.embeddingCache.deleteMany({
        where: {
          cacheKey: {
            startsWith: `${schemaHash}:`,
          },
        },
      });
    } else {
      // Clear all schema caches (schema elements only, questions are cached separately)
      await prisma.embeddingCache.deleteMany({
        where: {
          type: {
            in: ['table', 'column'],
          },
        },
      });
    }
    // Clear memory cache for schema elements only (LRU cache)
    const keysToDelete: string[] = [];
    for (const key of memoryCache.keys()) {
      if (key.startsWith('table:') || key.startsWith('column:')) {
        keysToDelete.push(key);
      }
    }
    keysToDelete.forEach(key => memoryCache.delete(key));
    console.log('[EMBEDDING-CACHE] ✅ Schema cache cleared');
  } catch (error) {
    console.error('[EMBEDDING-CACHE] Error clearing cache:', error);
  }
}

/**
 * Gets cache statistics
 */
export async function getCacheStats(): Promise<{
  memorySize: number;
  databaseSize: number;
  tables: number;
  columns: number;
  memoryLimit: number;
  memoryUsagePercent: number;
}> {
  const memorySize = memoryCache.size;
  const memoryLimit = memoryCache.max || 5000;
  const memoryUsagePercent = Math.round((memorySize / memoryLimit) * 100);
  
  try {
    const dbStats = await prisma.embeddingCache.groupBy({
      by: ['type'],
      _count: true,
    });
    
    const tables = dbStats.find(s => s.type === 'table')?._count || 0;
    const columns = dbStats.find(s => s.type === 'column')?._count || 0;
    const databaseSize = tables + columns;
    
    return {
      memorySize,
      databaseSize,
      tables,
      columns,
      memoryLimit,
      memoryUsagePercent,
    };
  } catch (error) {
    return {
      memorySize,
      databaseSize: 0,
      tables: 0,
      columns: 0,
      memoryLimit,
      memoryUsagePercent,
    };
  }
}

