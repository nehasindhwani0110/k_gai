/**
 * Persistent Embedding Cache Service
 * 
 * Stores schema embeddings in database so they persist across requests.
 * Schema embeddings are generated once and reused, significantly reducing API costs.
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * In-memory cache for quick access (backed by database)
 */
const memoryCache = new Map<string, number[]>();

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
 * Generates a cache key for schema elements
 */
function getCacheKey(text: string, type: 'table' | 'column' = 'table', schemaHash?: string): string {
  const baseKey = `${type}:${text.toLowerCase().trim()}`;
  return schemaHash ? `${schemaHash}:${baseKey}` : baseKey;
}

/**
 * Gets embedding from cache (ONLY for schema elements, NOT questions)
 * Questions are never cached - they're generated fresh each time
 */
export async function getCachedEmbedding(
  text: string,
  type: 'table' | 'column' = 'table',
  schemaHash?: string
): Promise<number[] | null> {
  // Never cache questions - they're unique each time
  if (type === 'question') {
    return null;
  }
  
  const cacheKey = getCacheKey(text, type, schemaHash);
  
  // Check memory cache first
  if (memoryCache.has(cacheKey)) {
    return memoryCache.get(cacheKey)!;
  }
  
  // Check database cache (only for schema elements)
  try {
    const cached = await prisma.embeddingCache.findUnique({
      where: { cacheKey },
    });
    
    if (cached && cached.embedding) {
      const embedding = JSON.parse(cached.embedding) as number[];
      // Store in memory cache for faster access
      memoryCache.set(cacheKey, embedding);
      return embedding;
    }
  } catch (error) {
    console.warn('[EMBEDDING-CACHE] Error reading from database cache:', error);
  }
  
  return null;
}

/**
 * Stores embedding in cache (ONLY for schema elements, NOT questions)
 * Questions are never cached - they're generated fresh each time
 */
export async function setCachedEmbedding(
  text: string,
  embedding: number[],
  type: 'table' | 'column' = 'table',
  schemaHash?: string
): Promise<void> {
  // Never cache questions - they're unique each time
  if (type === 'question') {
    return;
  }
  
  const cacheKey = getCacheKey(text, type, schemaHash);
  
  // Store in memory cache
  memoryCache.set(cacheKey, embedding);
  
  // Store in database cache (only for schema elements)
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
 * Pre-generates embeddings for all schema elements
 * This should be called when schema is first loaded
 */
export async function pregenerateSchemaEmbeddings(
  metadata: { tables: Array<{ name: string; columns: Array<{ name: string; type?: string }> }> }
): Promise<void> {
  console.log('[EMBEDDING-CACHE] 🔄 Pre-generating schema embeddings...');
  
  const openai = (await import('openai')).default;
  const client = new openai({ apiKey: process.env.OPENAI_API_KEY });
  
  let generated = 0;
  let cached = 0;
  
  for (const table of metadata.tables) {
    // Generate table embedding
    const tableDescription = `Table: ${table.name}. Columns: ${table.columns.map(c => c.name).join(', ')}`;
    const existingTableEmbedding = await getCachedEmbedding(tableDescription, 'table');
    
    if (!existingTableEmbedding) {
      try {
        const response = await client.embeddings.create({
          model: 'text-embedding-3-small',
          input: tableDescription,
        });
        await setCachedEmbedding(tableDescription, response.data[0].embedding, 'table');
        generated++;
      } catch (error) {
        console.warn(`[EMBEDDING-CACHE] Failed to generate embedding for table ${table.name}:`, error);
      }
    } else {
      cached++;
    }
    
    // Generate column embeddings
    for (const column of table.columns) {
      const columnDescription = `Column ${column.name}${column.type ? ` of type ${column.type}` : ''} in table ${table.name}`;
      const existingColumnEmbedding = await getCachedEmbedding(columnDescription, 'column');
      
      if (!existingColumnEmbedding) {
        try {
          const response = await client.embeddings.create({
            model: 'text-embedding-3-small',
            input: columnDescription,
          });
          await setCachedEmbedding(columnDescription, response.data[0].embedding, 'column');
          generated++;
        } catch (error) {
          console.warn(`[EMBEDDING-CACHE] Failed to generate embedding for column ${table.name}.${column.name}:`, error);
        }
      } else {
        cached++;
      }
    }
  }
  
  console.log(`[EMBEDDING-CACHE] ✅ Pre-generation complete: ${generated} new, ${cached} cached`);
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
      // Clear all schema caches (schema elements only, questions are never cached)
      await prisma.embeddingCache.deleteMany({
        where: {
          type: {
            in: ['table', 'column'],
          },
        },
      });
    }
    // Clear memory cache for schema elements only
    for (const [key] of memoryCache.entries()) {
      if (key.startsWith('table:') || key.startsWith('column:')) {
        memoryCache.delete(key);
      }
    }
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
}> {
  const memorySize = memoryCache.size;
  
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
    };
  } catch (error) {
    return {
      memorySize,
      databaseSize: 0,
      tables: 0,
      columns: 0,
    };
  }
}

