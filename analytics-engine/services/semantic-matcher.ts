/**
 * Semantic Matcher Service
 * 
 * Uses OpenAI embeddings to semantically match user questions with database schema elements.
 * This provides more accurate and efficient matching than keyword-based or LLM-based selection.
 * 
 * PRODUCTION OPTIMIZATIONS:
 * - Uses rate limiting from embedding-cache service
 * - Includes timeout handling
 * - Leverages cached embeddings for performance
 */

import OpenAI from 'openai';
import { createTracedOpenAI } from '../utils/langsmith-tracer';
import { DataSourceMetadata, TableMetadata, ColumnMetadata } from '../types';
import { createRateLimiter } from '../utils/rate-limiter';

// Initialize traced OpenAI client
const openai = createTracedOpenAI();

/**
 * Rate limiter for question embeddings (separate from schema embeddings)
 * Questions are generated fresh each time, so we need rate limiting here too
 */
const QUESTION_RATE_LIMIT = createRateLimiter(10); // Max 10 concurrent question embeddings

/**
 * Timeout for embedding generation (30 seconds)
 */
const EMBEDDING_TIMEOUT_MS = 30000;

/**
 * Interface for semantic match results
 */
interface SemanticMatch {
  name: string;
  score: number;
  description?: string;
}

/**
 * Generates embedding for a text using OpenAI
 * Schema embeddings are cached persistently, questions are also cached for reuse
 */
async function generateEmbedding(
  text: string, 
  isQuestion: boolean = false,
  schemaHash?: string
): Promise<number[]> {
  // For questions: check cache first, then generate if needed
  if (isQuestion) {
    const { getCachedEmbedding, setCachedEmbedding } = await import('./embedding-cache');
    
    // Check cache first (questions don't use schemaHash)
    const cachedEmbedding = await getCachedEmbedding(text, 'question');
    if (cachedEmbedding) {
      console.log(`[SEMANTIC-MATCHER] ✅ Question embedding CACHE HIT: "${text.substring(0, 50)}..."`);
      return cachedEmbedding;
    }
    
    try {
      console.log(`[SEMANTIC-MATCHER] 🔄 Generating question embedding (not cached): "${text.substring(0, 50)}..."`);
      
      const embedding = await QUESTION_RATE_LIMIT(async () => {
        // Create timeout promise
        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error('Question embedding generation timeout')), EMBEDDING_TIMEOUT_MS);
        });
        
        // Create embedding promise
        const embeddingPromise = openai.embeddings.create({
          model: 'text-embedding-3-small',
          input: text,
        });
        
        // Race between embedding generation and timeout
        const response = await Promise.race([embeddingPromise, timeoutPromise]);
        return response.data[0].embedding;
      });
      
      // Cache the question embedding for future use
      await setCachedEmbedding(text, embedding, 'question');
      console.log(`[SEMANTIC-MATCHER] ✅ Question embedding generated and cached (dimension: ${embedding.length})`);
      return embedding;
    } catch (error) {
      console.error('[SEMANTIC-MATCHER] ❌ Error generating question embedding:', error);
      throw error;
    }
  }
  
  // For schema elements: check cache first, then generate if needed
  const { getCachedEmbedding, setCachedEmbedding } = await import('./embedding-cache');
  const type = text.startsWith('Table:') ? 'table' : 'column';
  
  // OPTIMIZATION: Check cache with schema hash first, then without schema hash as fallback
  // This handles cases where metadata was filtered (schema hash changed) but embeddings exist from original schema
  if (schemaHash) {
    const cachedEmbedding = await getCachedEmbedding(text, type, schemaHash);
    
    if (cachedEmbedding) {
      console.log(`[SEMANTIC-MATCHER] ✅ Cache HIT (${type}) for: "${text.substring(0, 50)}..."`);
      return cachedEmbedding;
    }
    
    // Fallback: Check cache WITHOUT schema hash (for filtered metadata where hash changed)
    // Embeddings are cached by text content, so they should still be found
    const cachedWithoutHash = await getCachedEmbedding(text, type);
    if (cachedWithoutHash) {
      console.log(`[SEMANTIC-MATCHER] ✅ Cache HIT (${type}, no hash) for: "${text.substring(0, 50)}..."`);
      return cachedWithoutHash;
    }
  } else {
    // No schema hash - check cache without hash
    const cachedEmbedding = await getCachedEmbedding(text, type);
    if (cachedEmbedding) {
      console.log(`[SEMANTIC-MATCHER] ✅ Cache HIT (${type}) for: "${text.substring(0, 50)}..."`);
      return cachedEmbedding;
    }
  }

  try {
    console.log(`[SEMANTIC-MATCHER] 🔄 Generating schema embedding (${type}): "${text.substring(0, 50)}..."`);
    
    // Generate embedding directly (rate limiting is handled by the cache service when storing)
    const response = await openai.embeddings.create({
      model: 'text-embedding-3-small', // Cost-effective and fast
      input: text,
    });

    const embedding = response.data[0].embedding;
    
    // Cache schema embeddings (with schema hash)
    // The cache service handles rate limiting internally
    if (schemaHash) {
      await setCachedEmbedding(text, embedding, type, schemaHash);
      console.log(`[SEMANTIC-MATCHER] ✅ Schema embedding cached (dimension: ${embedding.length})`);
    }
    
    return embedding;
  } catch (error) {
    console.error('[SEMANTIC-MATCHER] ❌ Error generating schema embedding:', error);
    throw error;
  }
}

/**
 * Calculates cosine similarity between two vectors
 */
function cosineSimilarity(vecA: number[], vecB: number[]): number {
  if (vecA.length !== vecB.length) {
    throw new Error('Vectors must have the same length');
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }

  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  return denominator === 0 ? 0 : dotProduct / denominator;
}

/**
 * Creates a semantic description for a table
 */
function createTableDescription(table: TableMetadata): string {
  const columns = table.columns || [];
  const columnNames = columns.map(col => col.name).join(', ');
  const columnTypes = columns
    .filter(col => col.type)
    .map(col => `${col.name}(${col.type})`)
    .join(', ');
  
  return `Table: ${table.name}. Columns: ${columnNames}. Types: ${columnTypes}`;
}

/**
 * Creates a semantic description for a column
 */
function createColumnDescription(column: ColumnMetadata, tableName: string): string {
  const typeInfo = column.type ? ` of type ${column.type}` : '';
  return `Column ${column.name}${typeInfo} in table ${tableName}`;
}

/**
 * Semantically matches user question to tables
 * Returns top N most relevant tables with similarity scores
 */
export async function findRelevantTables(
  question: string,
  metadata: DataSourceMetadata,
  topN: number = 5,
  schemaHash?: string,
  dataSourceId?: string
): Promise<SemanticMatch[]> {
  const tables = metadata.tables || [];
  
  console.log(`\n[SEMANTIC-MATCHER] 🎯 Starting semantic table matching`);
  console.log(`[SEMANTIC-MATCHER] Question: "${question}"`);
  console.log(`[SEMANTIC-MATCHER] Total tables available: ${tables.length}`);
  console.log(`[SEMANTIC-MATCHER] Looking for top ${topN} matches\n`);
  
  if (tables.length === 0) {
    console.log('[SEMANTIC-MATCHER] ⚠️ No tables available');
    return [];
  }

  // If few tables, return all with perfect scores
  if (tables.length <= topN) {
    console.log(`[SEMANTIC-MATCHER] ℹ️ Few tables (${tables.length} <= ${topN}), returning all`);
    return tables.map(table => ({
      name: table.name,
      score: 1.0,
      description: createTableDescription(table),
    }));
  }

  // OPTIMIZATION: Check Redis cache for semantic match results first
  if (dataSourceId && schemaHash) {
    try {
      const crypto = require('crypto');
      const questionHash = crypto.createHash('sha256').update(question.toLowerCase().trim()).digest('hex').substring(0, 16);
      const { getCachedSemanticMatch } = await import('./redis-cache');
      const cachedMatches = await getCachedSemanticMatch(questionHash, dataSourceId);
      
      if (cachedMatches && cachedMatches.length > 0) {
        console.log(`[SEMANTIC-MATCHER] ⚡ Redis cache HIT for semantic match (${cachedMatches.length} matches)`);
        // Return cached matches, but limit to topN
        return cachedMatches.slice(0, topN);
      }
      console.log(`[SEMANTIC-MATCHER] ⚪ Redis cache MISS for semantic match`);
    } catch (error) {
      console.warn('[SEMANTIC-MATCHER] ⚠️ Failed to check Redis cache, proceeding with semantic matching:', error);
    }
  }

  try {
    // Generate embedding for the question (cached if previously asked)
    console.log('[SEMANTIC-MATCHER] 📊 Step 1: Getting question embedding (checking cache first)...');
    const questionEmbedding = await generateEmbedding(question, true);
    
    // For very large databases (100+ tables), use name-based pre-filtering
    // This reduces the number of tables we need to check semantically
    let tablesToCheck = tables;
    const isVeryLargeDatabase = tables.length > 100;
    
    if (isVeryLargeDatabase) {
      console.log(`[SEMANTIC-MATCHER] ⚡ Very large database (${tables.length} tables) - using name-based pre-filtering`);
      // Extract keywords from question (simple approach)
      const questionLower = question.toLowerCase();
      const questionWords = questionLower.split(/\s+/).filter(w => w.length > 3); // Words longer than 3 chars
      
      // Pre-filter tables based on name matching
      const preFiltered = tables.filter(table => {
        const tableNameLower = table.name.toLowerCase();
        // Check if any question word appears in table name
        return questionWords.some(word => tableNameLower.includes(word)) ||
               // Or check if table name contains common patterns from question
               questionWords.some(word => {
                 // Try plural/singular variations
                 const singular = word.replace(/s$/, '');
                 const plural = word + 's';
                 return tableNameLower.includes(singular) || tableNameLower.includes(plural);
               });
      });
      
      // If pre-filtering found reasonable number of candidates, use them
      // Otherwise fall back to checking all tables (but limit to top 100 by name similarity)
      if (preFiltered.length > 0 && preFiltered.length < tables.length * 0.5) {
        tablesToCheck = preFiltered;
        console.log(`[SEMANTIC-MATCHER] ✅ Pre-filtered to ${preFiltered.length} candidate tables`);
      } else {
        // Too many or too few matches - use first 100 tables (sorted by name similarity)
        const scored = tables.map(table => {
          const tableNameLower = table.name.toLowerCase();
          let score = 0;
          questionWords.forEach(word => {
            if (tableNameLower.includes(word)) score += 2;
            if (tableNameLower.startsWith(word)) score += 1;
          });
          return { table, score };
        });
        scored.sort((a, b) => b.score - a.score);
        tablesToCheck = scored.slice(0, Math.min(100, tables.length)).map(s => s.table);
        console.log(`[SEMANTIC-MATCHER] ✅ Pre-filtered to top ${tablesToCheck.length} tables by name similarity`);
      }
    }
    
    // Generate embeddings for filtered tables and calculate similarities
    const tableMatches: SemanticMatch[] = [];
    
    console.log(`[SEMANTIC-MATCHER] 📊 Step 2: Processing ${tablesToCheck.length} tables (using cached schema embeddings)...`);
    
    // Process tables in batches with parallel processing
    // OPTIMIZATION: Larger batch size for cached embeddings (much faster)
    const batchSize = 50; // Increased batch size - embeddings are cached, so parallel processing is safe
    let batchNum = 1;
    const startTime = Date.now();
    
    for (let i = 0; i < tablesToCheck.length; i += batchSize) {
      const batch = tablesToCheck.slice(i, i + batchSize);
      const batchStartTime = Date.now();
      console.log(`[SEMANTIC-MATCHER]   Processing batch ${batchNum} (tables ${i + 1}-${Math.min(i + batchSize, tablesToCheck.length)})...`);
      
      const batchPromises = batch.map(async (table) => {
        const tableDescription = createTableDescription(table);
        // Use cached schema embedding (will generate if not cached - lazy loading)
        // Database cache lookup is fast, and Redis cache will speed this up further
        const tableEmbedding = await generateEmbedding(tableDescription, false, schemaHash);
        const similarity = cosineSimilarity(questionEmbedding, tableEmbedding);
        
        return {
          name: table.name,
          score: similarity,
          description: tableDescription,
        };
      });
      
      const batchResults = await Promise.all(batchPromises);
      tableMatches.push(...batchResults);
      const batchTime = ((Date.now() - batchStartTime) / 1000).toFixed(2);
      console.log(`[SEMANTIC-MATCHER]   ✅ Batch ${batchNum} complete (${batchResults.length} tables, ${batchTime}s)`);
      batchNum++;
    }
    
    const totalTime = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`[SEMANTIC-MATCHER] ⚡ Processed ${tablesToCheck.length} tables in ${totalTime}s (${(tablesToCheck.length / parseFloat(totalTime)).toFixed(1)} tables/sec)`);
    
    // Sort by similarity score (descending) and return top N
    tableMatches.sort((a, b) => b.score - a.score);
    const topMatches = tableMatches.slice(0, topN);
    
    // OPTIMIZATION: Cache semantic match results in Redis
    if (dataSourceId && schemaHash) {
      try {
        const crypto = require('crypto');
        const questionHash = crypto.createHash('sha256').update(question.toLowerCase().trim()).digest('hex').substring(0, 16);
        const { cacheSemanticMatch } = await import('./redis-cache');
        await cacheSemanticMatch(questionHash, dataSourceId, topMatches, 1800); // 30 min TTL
        console.log(`[SEMANTIC-MATCHER] ✅ Cached semantic match results in Redis`);
      } catch (error) {
        console.warn('[SEMANTIC-MATCHER] ⚠️ Failed to cache semantic match in Redis:', error);
      }
    }
    
    console.log(`\n[SEMANTIC-MATCHER] ✅ Semantic matching complete!`);
    console.log(`[SEMANTIC-MATCHER] Top ${topMatches.length} matches:`);
    topMatches.forEach((match, index) => {
      const bar = '█'.repeat(Math.floor(match.score * 20));
      console.log(`[SEMANTIC-MATCHER]   ${index + 1}. ${match.name.padEnd(30)} Score: ${match.score.toFixed(3)} ${bar}`);
    });
    const cacheStats = await getCacheStats();
    console.log(`[SEMANTIC-MATCHER] Cache stats: ${cacheStats.databaseSize} schema embeddings cached (${cacheStats.tables} tables, ${cacheStats.columns} columns)\n`);
    
    return topMatches;
  } catch (error) {
    console.error('[SEMANTIC-MATCHER] ❌ Error finding relevant tables:', error);
    // Fallback: return first N tables
    console.log('[SEMANTIC-MATCHER] ⚠️ Falling back to first N tables');
    return tables.slice(0, topN).map(table => ({
      name: table.name,
      score: 0.5,
      description: createTableDescription(table),
    }));
  }
}

/**
 * Semantically matches user question to columns within a table
 * Returns top N most relevant columns with similarity scores
 */
export async function findRelevantColumns(
  question: string,
  table: TableMetadata,
  topN: number = 10,
  schemaHash?: string
): Promise<SemanticMatch[]> {
  const columns = table.columns || [];
  
  if (columns.length === 0) {
    return [];
  }

  // If few columns, return all with perfect scores
  if (columns.length <= topN) {
    return columns.map(column => ({
      name: column.name,
      score: 1.0,
      description: createColumnDescription(column, table.name),
    }));
  }

  try {
    // Generate embedding for the question (cached if previously asked)
    const questionEmbedding = await generateEmbedding(question, true);
    
    // Generate embeddings for all columns and calculate similarities
    const columnMatches: SemanticMatch[] = [];
    
    const columnPromises = columns.map(async (column) => {
      const columnDescription = createColumnDescription(column, table.name);
      // Use cached schema embedding (will generate if not cached)
      const columnEmbedding = await generateEmbedding(columnDescription, false, schemaHash);
      const similarity = cosineSimilarity(questionEmbedding, columnEmbedding);
      
      return {
        name: column.name,
        score: similarity,
        description: columnDescription,
      };
    });
    
    const results = await Promise.all(columnPromises);
    columnMatches.push(...results);
    
    // Sort by similarity score (descending) and return top N
    columnMatches.sort((a, b) => b.score - a.score);
    const topMatches = columnMatches.slice(0, topN);
    
    console.log(`[SEMANTIC-MATCHER]   Top ${topMatches.length} columns for table "${table.name}":`);
    topMatches.forEach((match, index) => {
      console.log(`[SEMANTIC-MATCHER]     ${index + 1}. ${match.name.padEnd(25)} Score: ${match.score.toFixed(3)}`);
    });
    
    return topMatches;
  } catch (error) {
    console.error('[SEMANTIC-MATCHER] ❌ Error finding relevant columns:', error);
    // Fallback: return first N columns
    return columns.slice(0, topN).map(column => ({
      name: column.name,
      score: 0.5,
      description: createColumnDescription(column, table.name),
    }));
  }
}

/**
 * Enhanced semantic matching that considers both table and column relevance
 * Returns reduced metadata with only the most relevant tables and columns
 * 
 * Automatically adjusts maxTables and maxColumnsPerTable based on schema size
 * to ensure we stay within token limits
 */
export async function createSemanticallyReducedMetadata(
  question: string,
  metadata: DataSourceMetadata,
  maxTables?: number,
  maxColumnsPerTable?: number
): Promise<DataSourceMetadata> {
  const allTables = metadata.tables || [];
  const totalColumns = allTables.reduce((sum, t) => sum + (t.columns?.length || 0), 0);
  
  // Auto-adjust limits based on schema size
  // For large databases (75+ tables), we need more tables to ensure accuracy
  if (maxTables === undefined) {
    if (allTables.length > 75) {
      maxTables = 7; // Very large (75+): top 7 tables for better accuracy
      console.log(`[SEMANTIC-MATCHER] 📊 Very large database detected (${allTables.length} tables), selecting top ${maxTables} tables`);
    } else if (allTables.length > 50) {
      maxTables = 5; // Large (50-75): top 5 tables
      console.log(`[SEMANTIC-MATCHER] 📊 Large database detected (${allTables.length} tables), selecting top ${maxTables} tables`);
    } else if (allTables.length > 20) {
      maxTables = 5; // Medium-large: top 5 tables
    } else {
      maxTables = Math.min(10, allTables.length); // Medium: up to 10 tables
    }
  }
  
  if (maxColumnsPerTable === undefined) {
    // For very large databases, we need more columns per table to avoid missing relevant ones
    if (totalColumns > 500) {
      maxColumnsPerTable = 20; // Very large: top 20 columns per table (increased from 10)
      console.log(`[SEMANTIC-MATCHER] 📊 Very large schema detected (${totalColumns} total columns), selecting top ${maxColumnsPerTable} columns per table`);
    } else if (totalColumns > 200) {
      maxColumnsPerTable = 15; // Large: top 15 columns per table (increased from 10)
    } else if (totalColumns > 100) {
      maxColumnsPerTable = 20; // Medium-large: top 20 columns per table
    } else {
      maxColumnsPerTable = 25; // Medium: up to 25 columns per table
    }
  }
  console.log(`\n${'='.repeat(80)}`);
  console.log(`[SEMANTIC-MATCHER] 🚀 SEMANTIC ANALYSIS ACTIVATED`);
  console.log(`${'='.repeat(80)}`);
  
  // Generate schema hash to detect schema changes
  const { generateSchemaHash } = await import('./embedding-cache');
  const schemaHash = generateSchemaHash(metadata);
  console.log(`[SEMANTIC-MATCHER] 📋 Schema hash: ${schemaHash} (used for cache invalidation)`);
  
  // OPTIMIZATION: Skip pre-generation if metadata is already filtered (from previous semantic search)
  // If we have 30 tables or less, it means we already did semantic filtering - skip pre-generation
  // Pre-generation is only needed for the FIRST semantic search on full database
  const isAlreadyFiltered = allTables.length <= 30;
  const isVeryLargeDatabase = allTables.length > 100;
  
  if (!isAlreadyFiltered && !isVeryLargeDatabase) {
    // Pre-generate schema embeddings if not already cached (only for smaller databases)
    // Only generates embeddings for NEW schema elements or when schema changes
    // Uses schema hash to detect changes - only regenerates what's needed
    try {
      const { pregenerateSchemaEmbeddings } = await import('./embedding-cache');
      console.log(`[SEMANTIC-MATCHER] 🔄 Pre-generating schema embeddings (${allTables.length} tables)...`);
      await pregenerateSchemaEmbeddings(metadata, schemaHash);
      console.log(`[SEMANTIC-MATCHER] ✅ Schema embeddings ready`);
    } catch (error) {
      console.warn('[SEMANTIC-MATCHER] Pre-generation failed, will generate on-demand:', error);
    }
  } else if (isAlreadyFiltered) {
    console.log(`[SEMANTIC-MATCHER] ⚡ Metadata already filtered (${allTables.length} tables) - skipping pre-generation`);
    console.log(`[SEMANTIC-MATCHER] ⚡ Using lazy loading for column-level filtering (embeddings cached from previous search)`);
  } else {
    console.log(`[SEMANTIC-MATCHER] ⚡ Very large database (${allTables.length} tables) - using lazy loading`);
    console.log(`[SEMANTIC-MATCHER] ⚡ Embeddings will be generated on-demand (much faster for large databases)`);
  }
  
  try {
    // Step 1: Find most relevant tables (uses cached schema embeddings)
    console.log(`[SEMANTIC-MATCHER] 📊 Finding top ${maxTables} relevant tables from ${allTables.length} total tables...`);
    // Note: dataSourceId not available here, but that's okay - Redis cache will work on next call
    const relevantTables = await findRelevantTables(question, metadata, maxTables, schemaHash);
    
    if (relevantTables.length === 0) {
      console.log('[SEMANTIC-MATCHER] ⚠️ No relevant tables found, returning original metadata');
      return metadata;
    }
    
    console.log(`[SEMANTIC-MATCHER] ✅ Selected ${relevantTables.length} relevant tables:`);
    relevantTables.forEach((match, idx) => {
      console.log(`[SEMANTIC-MATCHER]   ${idx + 1}. ${match.name} (score: ${match.score.toFixed(3)})`);
    });
    
    // Step 2: For each relevant table, find most relevant columns (uses cached schema embeddings)
    const reducedTables: TableMetadata[] = [];
    
    console.log(`\n[SEMANTIC-MATCHER] 📊 Step 3: Finding relevant columns for each table (using cached embeddings)...\n`);
    
    for (const tableMatch of relevantTables) {
      const originalTable = metadata.tables.find(t => t.name === tableMatch.name);
      if (!originalTable) continue;
      
      // Find relevant columns within this table (uses cached schema embeddings)
      const relevantColumns = await findRelevantColumns(
        question,
        originalTable,
        maxColumnsPerTable,
        schemaHash
      );
      
      // Create reduced table with only relevant columns
      const columnNames = new Set(relevantColumns.map(c => c.name));
      const reducedColumns = originalTable.columns.filter(col => 
        columnNames.has(col.name)
      );
      
      reducedTables.push({
        ...originalTable,
        columns: reducedColumns,
      });
    }
    
    const originalTableCount = metadata.tables.length;
    const originalColumnCount = metadata.tables.reduce((sum, t) => sum + (t.columns?.length || 0), 0);
    const reducedColumnCount = reducedTables.reduce((sum, t) => sum + (t.columns?.length || 0), 0);
    
    console.log(`\n${'='.repeat(80)}`);
    console.log(`[SEMANTIC-MATCHER] ✅ SEMANTIC ANALYSIS COMPLETE`);
    console.log(`${'='.repeat(80)}`);
    console.log(`[SEMANTIC-MATCHER] 📈 Results Summary:`);
    console.log(`[SEMANTIC-MATCHER]   Original: ${originalTableCount} tables, ${originalColumnCount} columns`);
    console.log(`[SEMANTIC-MATCHER]   Reduced:  ${reducedTables.length} tables, ${reducedColumnCount} columns`);
    console.log(`[SEMANTIC-MATCHER]   Reduction: ${((1 - reducedColumnCount / originalColumnCount) * 100).toFixed(1)}% fewer columns`);
    const cacheStats = await getCacheStats();
    console.log(`[SEMANTIC-MATCHER]   Cache: ${cacheStats.databaseSize} schema embeddings cached (${cacheStats.tables} tables, ${cacheStats.columns} columns)`);
    console.log(`[SEMANTIC-MATCHER]   Note: Question embeddings are cached and reused`);
    console.log(`${'='.repeat(80)}\n`);
    
    return {
      ...metadata,
      tables: reducedTables,
    };
  } catch (error) {
    console.error('[SEMANTIC-MATCHER] ❌ Error creating reduced metadata:', error);
    console.log('[SEMANTIC-MATCHER] ⚠️ Falling back to original metadata');
    // Fallback: return original metadata
    return metadata;
  }
}

/**
 * Pre-generates embeddings for all schema elements
 * Call this when schema is first loaded to populate cache
 */
export async function pregenerateSchemaEmbeddings(
  metadata: DataSourceMetadata
): Promise<void> {
  const { pregenerateSchemaEmbeddings: pregen, generateSchemaHash } = await import('./embedding-cache');
  const schemaHash = generateSchemaHash(metadata);
  await pregen(metadata, schemaHash);
}

/**
 * Clears the embedding cache (useful for testing or when schema changes)
 */
export async function clearEmbeddingCache(schemaHash?: string): Promise<void> {
  const { clearSchemaCache } = await import('./embedding-cache');
  await clearSchemaCache(schemaHash);
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
  const { getCacheStats } = await import('./embedding-cache');
  return await getCacheStats();
}

