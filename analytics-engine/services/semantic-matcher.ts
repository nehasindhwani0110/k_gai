/**
 * Semantic Matcher Service
 * 
 * Uses OpenAI embeddings to semantically match user questions with database schema elements.
 * This provides more accurate and efficient matching than keyword-based or LLM-based selection.
 */

import OpenAI from 'openai';
import { createTracedOpenAI } from '../utils/langsmith-tracer';
import { DataSourceMetadata, TableMetadata, ColumnMetadata } from '../types';

// Initialize traced OpenAI client
const openai = createTracedOpenAI();

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
 * Schema embeddings are cached persistently, questions are generated fresh each time
 */
async function generateEmbedding(
  text: string, 
  isQuestion: boolean = false,
  schemaHash?: string
): Promise<number[]> {
  // For questions: always generate fresh (never cache)
  if (isQuestion) {
    try {
      console.log(`[SEMANTIC-MATCHER] 🔄 Generating question embedding (fresh, not cached): "${text.substring(0, 50)}..."`);
      
      const response = await openai.embeddings.create({
        model: 'text-embedding-3-small',
        input: text,
      });

      const embedding = response.data[0].embedding;
      console.log(`[SEMANTIC-MATCHER] ✅ Question embedding generated (dimension: ${embedding.length}, not cached)`);
      return embedding;
    } catch (error) {
      console.error('[SEMANTIC-MATCHER] ❌ Error generating question embedding:', error);
      throw error;
    }
  }
  
  // For schema elements: check cache first, then generate if needed
  const { getCachedEmbedding, setCachedEmbedding } = await import('./embedding-cache');
  const type = text.startsWith('Table:') ? 'table' : 'column';
  
  // Check cache first (only if schema hash provided)
  if (schemaHash) {
    const cachedEmbedding = await getCachedEmbedding(text, type, schemaHash);
    
    if (cachedEmbedding) {
      console.log(`[SEMANTIC-MATCHER] ✅ Cache HIT (${type}) for: "${text.substring(0, 50)}..."`);
      return cachedEmbedding;
    }
  }

  try {
    console.log(`[SEMANTIC-MATCHER] 🔄 Generating schema embedding (${type}): "${text.substring(0, 50)}..."`);
    
    const response = await openai.embeddings.create({
      model: 'text-embedding-3-small', // Cost-effective and fast
      input: text,
    });

    const embedding = response.data[0].embedding;
    
    // Cache schema embeddings (with schema hash)
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
  schemaHash?: string
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

  try {
    // Generate embedding for the question (always fresh, never cached)
    console.log('[SEMANTIC-MATCHER] 📊 Step 1: Generating question embedding (fresh, not cached)...');
    const questionEmbedding = await generateEmbedding(question, true);
    
    // Generate embeddings for all tables and calculate similarities
    const tableMatches: SemanticMatch[] = [];
    
    console.log(`[SEMANTIC-MATCHER] 📊 Step 2: Processing ${tables.length} tables (using cached schema embeddings)...`);
    
    // Process tables in batches to avoid overwhelming the API
    const batchSize = 10;
    let batchNum = 1;
    for (let i = 0; i < tables.length; i += batchSize) {
      const batch = tables.slice(i, i + batchSize);
      console.log(`[SEMANTIC-MATCHER]   Processing batch ${batchNum} (tables ${i + 1}-${Math.min(i + batchSize, tables.length)})...`);
      
      const batchPromises = batch.map(async (table) => {
        const tableDescription = createTableDescription(table);
        // Use cached schema embedding (will generate if not cached)
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
      batchNum++;
    }
    
    // Sort by similarity score (descending) and return top N
    tableMatches.sort((a, b) => b.score - a.score);
    const topMatches = tableMatches.slice(0, topN);
    
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
    // Generate embedding for the question (always fresh, never cached)
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
 */
export async function createSemanticallyReducedMetadata(
  question: string,
  metadata: DataSourceMetadata,
  maxTables: number = 5,
  maxColumnsPerTable: number = 15
): Promise<DataSourceMetadata> {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`[SEMANTIC-MATCHER] 🚀 SEMANTIC ANALYSIS ACTIVATED`);
  console.log(`${'='.repeat(80)}`);
  
  // Generate schema hash to detect schema changes
  const { generateSchemaHash } = await import('./embedding-cache');
  const schemaHash = generateSchemaHash(metadata);
  console.log(`[SEMANTIC-MATCHER] 📋 Schema hash: ${schemaHash} (used for cache invalidation)`);
  
  // Pre-generate schema embeddings if not already cached
  // Only generates embeddings for NEW schema elements (not already cached)
  // Automatically detects schema changes and clears old cache
  try {
    const { pregenerateSchemaEmbeddings } = await import('./embedding-cache');
    await pregenerateSchemaEmbeddings(metadata);
  } catch (error) {
    console.warn('[SEMANTIC-MATCHER] Pre-generation failed, will generate on-demand:', error);
  }
  
  try {
    // Step 1: Find most relevant tables (uses cached schema embeddings)
    const relevantTables = await findRelevantTables(question, metadata, maxTables, schemaHash);
    
    if (relevantTables.length === 0) {
      console.log('[SEMANTIC-MATCHER] ⚠️ No relevant tables found, returning original metadata');
      return metadata;
    }
    
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
    console.log(`[SEMANTIC-MATCHER]   Note: Question embeddings are generated fresh each time (not cached)`);
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
  const { pregenerateSchemaEmbeddings: pregen } = await import('./embedding-cache');
  await pregen(metadata);
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

