/**
 * Hybrid Metadata Service
 * 
 * Combines multiple metadata sources for optimal performance:
 * 1. System Catalog (INFORMATION_SCHEMA) - Fast, accurate structure
 * 2. SchemaRegistry - Canonical mappings and cached metadata
 * 3. Embeddings - Semantic search for relevance
 * 4. Table Statistics - Row counts, sizes for query planning
 * 
 * Benefits:
 * - Real-time accuracy from system catalog
 * - Cost-efficient (minimal LLM calls)
 * - Fast semantic filtering with embeddings
 * - Works efficiently with 200+ tables
 */

import { DataSourceMetadata, TableMetadata, ColumnMetadata } from '../types';
import { getSystemCatalogMetadata, getTablesMetadata, getTableStatistics } from './system-catalog-service';
import { getCanonicalSchema } from './canonical-mapping-service';
import { findRelevantTables, findRelevantColumns } from './semantic-matcher';
import { prisma } from '@/lib/prisma';
import { 
  cacheSystemCatalogMetadata, 
  getCachedSystemCatalogMetadata,
  invalidateSystemCatalogCache 
} from './redis-cache';
import { deduplicateRequest } from './performance-optimizer';

interface HybridMetadataOptions {
  dataSourceId: string;
  userQuestion?: string;
  maxTables?: number;
  useSystemCatalog?: boolean;
  useSemanticSearch?: boolean;
  includeStatistics?: boolean;
  forceRefresh?: boolean; // Force refresh - skip cache even for registry-based metadata
}

interface MetadataCache {
  lastUpdated: Date;
  metadata: DataSourceMetadata;
  statistics?: Map<string, { rowCount: number; sizeBytes: number }>;
}

// In-memory cache for metadata (TTL: 5 minutes)
const metadataCache = new Map<string, MetadataCache>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Gets hybrid metadata combining system catalog and cached registry
 */
export async function getHybridMetadata(
  options: HybridMetadataOptions
): Promise<DataSourceMetadata> {
  const {
    dataSourceId,
    userQuestion,
    maxTables = 50,
    useSystemCatalog = true,
    useSemanticSearch = true,
    includeStatistics = false,
    forceRefresh = false,
  } = options;

  // Get data source info
  const dataSource = await prisma.dataSource.findUnique({
    where: { id: dataSourceId },
  });

  if (!dataSource || !dataSource.connectionString) {
    throw new Error(`Data source not found or missing connection string: ${dataSourceId}`);
  }

  // OPTIMIZATION: Use Redis cache for system catalog (with smart invalidation)
  // Cache TTL: 5 minutes (schema changes are rare, but we want fresh data)
  const cacheKey = `${dataSourceId}-${useSystemCatalog}-${includeStatistics}`;
  
  // Try Redis cache first (fastest)
  if (!forceRefresh && useSystemCatalog && dataSource.sourceType === 'SQL_DB') {
    const cached = await getCachedSystemCatalogMetadata(dataSourceId);
    if (cached) {
      console.log(`[HYBRID-METADATA] ⚡ Redis cache HIT for ${dataSourceId} (instant)`);
      // Apply semantic filtering if question provided
      if (userQuestion && useSemanticSearch) {
        return applySemanticFiltering(cached, userQuestion, maxTables, useSemanticSearch, dataSourceId);
      }
      return cached;
    }
  }
  
  // Fallback to in-memory cache for registry-based metadata
  if (!forceRefresh && (!useSystemCatalog || dataSource.sourceType !== 'SQL_DB')) {
    const cached = metadataCache.get(cacheKey);
    if (cached && Date.now() - cached.lastUpdated.getTime() < CACHE_TTL_MS && !userQuestion) {
      console.log(`[HYBRID-METADATA] Using in-memory cached metadata for ${dataSourceId} (registry-based)`);
      return cached.metadata;
    }
  } else if (forceRefresh) {
    console.log(`[HYBRID-METADATA] 🔄 Force refresh requested - skipping cache to get fresh schema`);
  }
  
  // Use request deduplication to prevent concurrent duplicate requests
  const requestKey = `metadata:${dataSourceId}:${userQuestion || 'no-question'}`;
  return deduplicateRequest(requestKey, async () => {
    return await fetchAndCacheMetadata();
  });
  
  async function fetchAndCacheMetadata(): Promise<DataSourceMetadata> {
  let metadata: DataSourceMetadata;
  let statistics: Map<string, { rowCount: number; sizeBytes: number }> | undefined;

    if (!dataSource || !dataSource.connectionString) {
      throw new Error(`Data source not found or missing connection string: ${dataSourceId}`);
    }

  if (useSystemCatalog && dataSource.sourceType === 'SQL_DB') {
    // OPTIMIZATION: For large databases (100+ tables) with user question, do semantic search FIRST
    // Then fetch ONLY relevant tables from system catalog (much faster!)
    const shouldOptimizeWithSemanticFirst = userQuestion && useSemanticSearch;
    
    if (shouldOptimizeWithSemanticFirst) {
      try {
        // Step 1: Get table names from system catalog directly (actual names, not canonical)
        // We need table names first for semantic filtering
        console.log(`[HYBRID-METADATA] 🚀 Optimized path: Semantic search FIRST, then fetch only relevant tables`);
        
        // Get table names directly from system catalog (actual database names)
        // Use a lightweight query to get just table names
        const { getSystemCatalogMetadata } = await import('./system-catalog-service');
        const fullMetadata = await getSystemCatalogMetadata({
          connectionString: dataSource.connectionString,
        });
        const allTableNames = fullMetadata.tables?.map(t => t.name) || [];
        
        // If we have many tables, use semantic search to filter BEFORE fetching full metadata
        if (allTableNames.length > 50) {
          console.log(`[HYBRID-METADATA] 📊 Large database (${allTableNames.length} tables) - filtering with semantic search first`);
          
          // Create minimal metadata with just table names for semantic search
          const minimalMetadata: DataSourceMetadata = {
            ...fullMetadata,
            tables: fullMetadata.tables?.map((t: any) => ({ ...t, columns: [] })) || [],
          };
          
          // Semantic search on table names only (fast - no column embeddings needed)
          const { findRelevantTables } = await import('./semantic-matcher');
          const { generateSchemaHash } = await import('./embedding-cache');
          const schemaHash = generateSchemaHash(minimalMetadata);
          const relevantTableMatches = await findRelevantTables(userQuestion, minimalMetadata, maxTables, schemaHash, dataSourceId);
          const relevantTableNames = relevantTableMatches.map(match => match.name);
          
          console.log(`[HYBRID-METADATA] ✅ Semantic filtering: ${allTableNames.length} → ${relevantTableNames.length} tables`);
          
          // Step 2: Fetch ONLY relevant tables from system catalog (much faster!)
          if (relevantTableNames.length > 0) {
            const { getTablesMetadata } = await import('./system-catalog-service');
            const relevantTables = await getTablesMetadata(
              { connectionString: dataSource.connectionString },
              relevantTableNames
            );
            
            metadata = {
              source_type: 'SQL_DB',
              tables: relevantTables,
            };
            
            console.log(`[HYBRID-METADATA] ✅ Fetched ${relevantTables.length} relevant tables from system catalog`);
          } else {
            // Fallback: fetch all tables if semantic search found nothing
            console.warn(`[HYBRID-METADATA] ⚠️ Semantic search found no tables, fetching all tables`);
            metadata = await getSystemCatalogMetadata({
              connectionString: dataSource.connectionString,
            });
          }
        } else {
          // Small database - fetch all tables directly (fast enough)
          console.log(`[HYBRID-METADATA] 📊 Small database (${allTableNames.length} tables) - fetching all tables directly`);
          metadata = await getSystemCatalogMetadata({
            connectionString: dataSource.connectionString,
          });
        }
        
        if (includeStatistics) {
          statistics = await getTableStatistics({
            connectionString: dataSource.connectionString,
          }, metadata.tables?.map(t => t.name));
        }
      } catch (error) {
        console.warn(`[HYBRID-METADATA] Optimized path failed, falling back to standard system catalog:`, error);
        // Fallback to standard approach
        try {
          metadata = await getSystemCatalogMetadata({
            connectionString: dataSource.connectionString,
          });
        } catch (fallbackError) {
          console.warn(`[HYBRID-METADATA] System catalog failed, falling back to registry:`, fallbackError);
          metadata = await getCanonicalSchema(dataSourceId);
        }
      }
    } else {
      // Standard path: Fetch all tables from system catalog
    console.log(`[HYBRID-METADATA] Fetching from system catalog for ${dataSourceId}`);
    
    try {
      metadata = await getSystemCatalogMetadata({
        connectionString: dataSource.connectionString,
      });

      if (includeStatistics) {
        statistics = await getTableStatistics({
          connectionString: dataSource.connectionString,
        });
      }
    } catch (error) {
      console.warn(`[HYBRID-METADATA] System catalog failed, falling back to registry:`, error);
      metadata = await getCanonicalSchema(dataSourceId);
      }
    }
  } else {
    // Use source metadata directly (actual database names, not canonical)
    console.log(`[HYBRID-METADATA] Using source metadata (actual names) for ${dataSourceId}`);
    const { getSourceMetadata } = await import('./canonical-mapping-service');
    metadata = await getSourceMetadata(dataSourceId);
  }

    // Cache metadata appropriately
    if (useSystemCatalog && dataSource && dataSource.sourceType === 'SQL_DB') {
      // Cache system catalog metadata in Redis (with TTL)
      await cacheSystemCatalogMetadata(dataSourceId, metadata, 300); // 5 minutes
      console.log(`[HYBRID-METADATA] ✅ System catalog metadata fetched and cached in Redis`);
    } else {
      // Cache registry-based metadata in memory
    metadataCache.set(cacheKey, {
      lastUpdated: new Date(),
      metadata,
      statistics,
    });
    console.log(`[HYBRID-METADATA] ✅ Cached registry-based metadata for ${dataSourceId}`);
  }

  // Check token count - if already optimized with semantic-first approach, metadata should be safe
  const { estimateMetadataTokens, isMetadataSizeSafe } = await import('../utils/token-counter');
  const model = process.env.OPENAI_MODEL || 'gpt-4-turbo-preview';
  const tokenCount = estimateMetadataTokens(metadata);
  const isSafe = isMetadataSizeSafe(metadata, model);
  
  console.log(`[HYBRID-METADATA] 📊 Metadata size check: ${tokenCount} tokens, Safe: ${isSafe ? '✅' : '❌'} (${metadata.tables?.length || 0} tables)`);
  
    // If metadata is safe, return as-is
  if (isSafe) {
      console.log(`[HYBRID-METADATA] ✅ Metadata size is safe, returning metadata as-is`);
    return metadata;
  }
  
    // Metadata still too large - apply additional semantic filtering on columns
    // This happens if semantic-first optimization already ran but columns are still too many
    console.log(`[HYBRID-METADATA] ⚠️ Metadata still too large (${tokenCount} tokens), applying column-level semantic filtering`);
  if (!userQuestion) {
    console.warn(`[HYBRID-METADATA] ⚠️ No user question provided, limiting to first ${maxTables} tables`);
      const limitedMetadata = {
      ...metadata,
        tables: metadata.tables?.slice(0, maxTables).map(t => ({
          ...t,
          columns: t.columns?.slice(0, 15) || [], // Limit columns too
        })) || [],
      };
      // Cache the limited metadata
      if (useSystemCatalog && dataSource && dataSource.sourceType === 'SQL_DB') {
        await cacheSystemCatalogMetadata(dataSourceId, limitedMetadata, 300);
      }
      return limitedMetadata;
    }
    
    // Apply semantic filtering on columns (tables already filtered if optimized path was used)
    const filteredMetadata = await applySemanticFiltering(metadata, userQuestion, maxTables, useSemanticSearch, dataSourceId);
    // Cache the filtered metadata
    if (useSystemCatalog && dataSource && dataSource.sourceType === 'SQL_DB') {
      await cacheSystemCatalogMetadata(dataSourceId, filteredMetadata, 300);
    }
    return filteredMetadata;
  }
}

/**
 * Enriches system catalog metadata with canonical names from registry
 */
async function enrichWithCanonicalNames(
  dataSourceId: string,
  systemMetadata: DataSourceMetadata
): Promise<DataSourceMetadata> {
  const registry = await prisma.schemaRegistry.findMany({
    where: { dataSourceId },
  });

  if (registry.length === 0) {
    return systemMetadata;
  }

  // Create mapping: source table/column -> canonical
  const tableMapping = new Map<string, string>();
  const columnMapping = new Map<string, Map<string, string>>();

  registry.forEach(entry => {
    if (!tableMapping.has(entry.tableName)) {
      tableMapping.set(entry.tableName, entry.canonicalTableName);
    }
    
    if (!columnMapping.has(entry.tableName)) {
      columnMapping.set(entry.tableName, new Map());
    }
    columnMapping.get(entry.tableName)!.set(entry.columnName, entry.canonicalColumnName);
  });

  // Transform metadata to use canonical names where available
  const enrichedTables = systemMetadata.tables.map(table => {
    const canonicalTableName = tableMapping.get(table.name) || table.name;
    const tableColumnMapping = columnMapping.get(table.name) || new Map();

    const enrichedColumns = table.columns.map(column => {
      const canonicalColumnName = tableColumnMapping.get(column.name) || column.name;
      
      return {
        ...column,
        name: canonicalColumnName, // Use canonical name
        description: column.description || `Column ${canonicalColumnName}`,
      };
    });

    return {
      ...table,
      name: canonicalTableName, // Use canonical name
      description: table.description || `Table ${canonicalTableName}`,
      columns: enrichedColumns,
    };
  });

  // Return metadata with ACTUAL database table/column names (not canonical)
  // This avoids the need for translation - LLM will generate queries with real names
  return {
    ...systemMetadata,
    source_type: 'SQL_DB', // Use SQL_DB instead of CANONICAL_DB - no translation needed
    tables: systemMetadata.tables, // Use original tables with actual names, not enriched canonical names
  };
}

/**
 * Applies semantic filtering to reduce metadata size
 */
async function applySemanticFiltering(
  metadata: DataSourceMetadata,
  userQuestion?: string,
  maxTables: number = 50,
  useSemanticSearch: boolean = true,
  dataSourceId?: string
): Promise<DataSourceMetadata> {
  const allTables = metadata.tables || [];
  
  // If no question provided or semantic search disabled, return limited tables
  if (!userQuestion || !useSemanticSearch || allTables.length <= maxTables) {
    if (allTables.length > maxTables) {
      console.log(`[HYBRID-METADATA] Limiting to first ${maxTables} tables (no semantic filtering)`);
      return {
        ...metadata,
        tables: allTables.slice(0, maxTables),
      };
    }
    return metadata;
  }

  // Use semantic search to find relevant tables
  try {
    console.log(`[HYBRID-METADATA] Applying semantic filtering for question: "${userQuestion}"`);
    
    // findRelevantTables returns SemanticMatch[] with name and score properties
    const { generateSchemaHash } = await import('./embedding-cache');
    const schemaHash = generateSchemaHash(metadata);
    const relevantTableMatches = await findRelevantTables(userQuestion, metadata, maxTables, schemaHash, dataSourceId);
    
    // Extract table names from matches
    const relevantTableNames = relevantTableMatches.map(match => match.name);
    
    // Limit to maxTables most relevant
    const selectedTables = relevantTableNames
      .slice(0, maxTables)
      .map(tableName => allTables.find(t => t.name === tableName))
      .filter((t): t is TableMetadata => t !== undefined);

    // For each selected table, filter columns semantically
    const enrichedTables = await Promise.all(
      selectedTables.map(async table => {
        // findRelevantColumns expects TableMetadata, not ColumnMetadata[]
        const relevantColumnMatches = await findRelevantColumns(
          userQuestion,
          table,
          20 // top 20 columns
        );

        // Extract column names from matches
        const relevantColumnNames = relevantColumnMatches.map(match => match.name);
        
        const selectedColumns = relevantColumnNames
          .map(colName => table.columns?.find(c => c.name === colName))
          .filter((c): c is ColumnMetadata => c !== undefined);

        return {
          ...table,
          columns: selectedColumns.length > 0 ? selectedColumns : table.columns?.slice(0, 15), // Fallback to first 15 columns
        };
      })
    );

    console.log(`[HYBRID-METADATA] ✅ Semantic filtering: ${allTables.length} → ${enrichedTables.length} tables`);

    return {
      ...metadata,
      tables: enrichedTables,
    };
  } catch (error) {
    console.warn(`[HYBRID-METADATA] Semantic filtering failed, using first ${maxTables} tables:`, error);
    return {
      ...metadata,
      tables: allTables.slice(0, maxTables),
    };
  }
}

/**
 * Clears metadata cache for a data source
 */
export function clearMetadataCache(dataSourceId: string): void {
  const keysToDelete: string[] = [];
  metadataCache.forEach((_, key) => {
    if (key.startsWith(dataSourceId)) {
      keysToDelete.push(key);
    }
  });
  
  keysToDelete.forEach(key => metadataCache.delete(key));
  console.log(`[HYBRID-METADATA] Cleared cache for ${dataSourceId}`);
}

/**
 * Gets incremental metadata updates (only changed tables)
 */
export async function getIncrementalMetadata(
  dataSourceId: string,
  lastUpdateTime: Date
): Promise<{ tables: TableMetadata[]; deletedTables: string[] }> {
  // This would compare system catalog with registry to find changes
  // For now, return empty (full refresh)
  return {
    tables: [],
    deletedTables: [],
  };
}

