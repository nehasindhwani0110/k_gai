import { prisma } from '@/lib/prisma';
import { DataSourceMetadata, TableMetadata, ColumnMetadata } from '../types';

/**
 * Service for managing canonical schema mapping for multi-tenant SQL databases
 */

export interface DataSourceInput {
  name: string;
  sourceType: 'SQL_DB' | 'CSV_FILE';
  connectionString?: string;
  description?: string;
}

export interface SchemaMappingInput {
  dataSourceId: string;
  sourceTable: string;
  sourceColumn: string;
  canonicalTable: string;
  canonicalColumn: string;
  transformationRule?: string;
}

/**
 * Register a new data source (SQL database or file)
 */
export async function registerDataSource(input: DataSourceInput): Promise<string> {
  const dataSource = await prisma.dataSource.create({
    data: {
      name: input.name,
      sourceType: input.sourceType,
      connectionString: input.connectionString || null,
      description: input.description || null,
      isActive: true,
    },
  });

  return dataSource.id;
}

/**
 * Get all active data sources
 */
export async function getAllDataSources() {
  return await prisma.dataSource.findMany({
    where: { isActive: true },
    orderBy: { name: 'asc' },
  });
}

/**
 * Get data source by ID
 */
export async function getDataSourceById(id: string) {
  return await prisma.dataSource.findUnique({
    where: { id },
    include: {
      schemaMappings: true,
      schemaRegistry: true,
    },
  });
}

/**
 * Register schema mappings for a data source
 * This maps source-specific table/column names to canonical names
 */
export async function registerSchemaMappings(
  dataSourceId: string,
  mappings: Array<{
    sourceTable: string;
    sourceColumn: string;
    canonicalTable: string;
    canonicalColumn: string;
    dataType?: string;
    transformationRule?: string;
  }>
): Promise<void> {
  // Delete existing mappings for this data source
  await prisma.schemaMapping.deleteMany({
    where: { dataSourceId },
  });

  // Create new mappings
  await prisma.schemaMapping.createMany({
    data: mappings.map(m => ({
      dataSourceId,
      sourceTable: m.sourceTable,
      sourceColumn: m.sourceColumn,
      canonicalTable: m.canonicalTable,
      canonicalColumn: m.canonicalColumn,
      transformationRule: m.transformationRule || null,
    })),
  });

  // Also update schema registry
  await prisma.schemaRegistry.deleteMany({
    where: { dataSourceId },
  });

  await prisma.schemaRegistry.createMany({
    data: mappings.map(m => ({
      dataSourceId,
      tableName: m.sourceTable,
      columnName: m.sourceColumn,
      canonicalTableName: m.canonicalTable,
      canonicalColumnName: m.canonicalColumn,
      dataType: m.dataType || 'TEXT',
      description: `Mapped from ${m.sourceTable}.${m.sourceColumn}`,
    })),
  });
}

/**
 * Translate canonical query to source-specific query
 * Example: "SELECT student_id FROM students" → "SELECT stu_id FROM tbl_students"
 */
export async function translateCanonicalQuery(
  dataSourceId: string,
  canonicalQuery: string
): Promise<string> {
  // Try SchemaMapping first (explicit mappings)
  let mappings = await prisma.schemaMapping.findMany({
    where: { dataSourceId },
  });

  // If no explicit mappings, use SchemaRegistry (auto-detected schema)
  if (mappings.length === 0) {
    console.log(`[CANONICAL-MAPPING] No explicit mappings found, checking SchemaRegistry...`);
    const registry = await prisma.schemaRegistry.findMany({
      where: { dataSourceId },
    });

    if (registry.length === 0) {
      console.error(`[CANONICAL-MAPPING] ❌ No schema mappings or registry found for dataSourceId: ${dataSourceId}`);
      console.error(`[CANONICAL-MAPPING] ❌ Query will fail because canonical table names don't exist in database`);
      console.error(`[CANONICAL-MAPPING] Original query: ${canonicalQuery.substring(0, 200)}`);
      return canonicalQuery;
    }

    // Convert SchemaRegistry to mapping format
    // Create a simplified mapping structure compatible with the rest of the function
    mappings = registry.map(r => ({
      id: r.id,
      dataSourceId: r.dataSourceId,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      canonicalTable: r.canonicalTableName,
      sourceTable: r.tableName,
      canonicalColumn: r.canonicalColumnName,
      sourceColumn: r.columnName,
      transformationRule: null,
    })) as any[];
    
    console.log(`[CANONICAL-MAPPING] ✅ Found ${mappings.length} mappings from SchemaRegistry for dataSourceId: ${dataSourceId}`);
  } else {
    console.log(`[CANONICAL-MAPPING] ✅ Found ${mappings.length} explicit mappings for dataSourceId: ${dataSourceId}`);
  }

  let translatedQuery = canonicalQuery;

  // Replace canonical table names with source table names
  // Create case-insensitive mappings: normalize to lowercase for key, store original source
  const tableMappings = new Map<string, string>(); // canonical (normalized) -> source
  const canonicalVariations = new Map<string, string>(); // normalized -> original canonical (for logging)
  
  mappings.forEach(m => {
    const canonicalTable = m.canonicalTable || (m as any).canonicalTableName;
    const sourceTable = m.sourceTable || (m as any).tableName;
    
    if (canonicalTable && sourceTable) {
      // Normalize canonical table name to lowercase for case-insensitive matching
      const normalizedCanonical = canonicalTable.toLowerCase();
      
      // Only add if not already mapped (first mapping wins)
      if (!tableMappings.has(normalizedCanonical)) {
        tableMappings.set(normalizedCanonical, sourceTable);
        canonicalVariations.set(normalizedCanonical, canonicalTable);
      }
    }
  });

  console.log(`[CANONICAL-MAPPING] Table mappings:`, Array.from(tableMappings.entries()).slice(0, 5).map(([canon, source]) => {
    const origCanon = canonicalVariations.get(canon) || canon;
    return [origCanon, source];
  }));

  // Sort table mappings by length (longest first) to avoid partial replacements
  // e.g., replace "aiquiz_attempt" before "aiquiz" to avoid replacing part of "aiquiz_attempt"
  const sortedTableMappings = Array.from(tableMappings.entries()).sort((a, b) => b[0].length - a[0].length);
  
  // First, identify which tables are actually used in the query (case-insensitive check)
  const usedTables = new Set<string>(); // Store normalized canonical names
  sortedTableMappings.forEach(([normalizedCanonical]) => {
    // Check if table name appears in query (case-insensitive) - check all case variations
    const escaped = normalizedCanonical.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // Match any case variation: aiquiz, AIQuiz, AIQUIZ, etc.
    const tablePattern = new RegExp(`\\b${escaped}\\b`, 'i');
    if (tablePattern.test(translatedQuery)) {
      usedTables.add(normalizedCanonical);
    }
  });
  
  if (usedTables.size === 0) {
    console.log(`[CANONICAL-MAPPING] No canonical table names found in query, skipping translation`);
    return canonicalQuery;
  }
  
  const usedTableNames = Array.from(usedTables).map(norm => canonicalVariations.get(norm) || norm);
  console.log(`[CANONICAL-MAPPING] Found ${usedTables.size} table(s) to translate: ${usedTableNames.join(', ')}`);
  
  sortedTableMappings.forEach(([normalizedCanonical, sourceTable]) => {
    // Skip tables not used in query
    if (!usedTables.has(normalizedCanonical)) {
      return;
    }
    
    const originalCanonical = canonicalVariations.get(normalizedCanonical) || normalizedCanonical;
    
    // Skip replacement if canonical and source table names are identical (case-insensitive)
    if (normalizedCanonical.toLowerCase() === sourceTable.toLowerCase()) {
      return; // No replacement needed
    }
    
    // Escape special regex characters in table names
    const escapedCanonical = normalizedCanonical.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    
    // Use a comprehensive pattern that matches table names in various SQL contexts:
    // 1. After FROM/JOIN keywords (most common)
    // 2. In UPDATE/SET clauses
    // 3. As schema.table_name
    // 4. Standalone identifiers
    
    // Pattern: Match table names after FROM/JOIN/UPDATE keywords or as schema.table
    // CRITICAL: Use case-insensitive matching ('i' flag) to catch ALL case variations
    // This handles: aiquiz, AIQuiz, AIQUIZ, AiQuiz, etc.
    const patterns = [
      // Pattern 1: FROM table_name (most common) - case-insensitive
      new RegExp(`(\\bFROM\\s+)${escapedCanonical}\\b`, 'gi'),
      new RegExp(`(\\bJOIN\\s+)${escapedCanonical}\\b`, 'gi'),
      new RegExp(`(\\bUPDATE\\s+)${escapedCanonical}\\b`, 'gi'),
      new RegExp(`(\\bINTO\\s+)${escapedCanonical}\\b`, 'gi'),
      // Pattern 2: schema.table_name (case-insensitive)
      new RegExp(`(\\w+\\.)${escapedCanonical}\\b`, 'gi'),
    ];
    
    // Use the first pattern for main replacement
    const tablePattern = patterns[0];
    
    // Check if pattern matches before attempting replacement (case-insensitive)
    const matches = translatedQuery.match(tablePattern);
    // Only log if canonical and source are different (replacement is needed)
    if (matches && normalizedCanonical.toLowerCase() !== sourceTable.toLowerCase()) {
      console.log(`[CANONICAL-MAPPING] Translating table "${originalCanonical}" -> "${sourceTable}" (${matches.length} occurrence(s), case-insensitive)`);
    }
    
    const beforeReplace = translatedQuery;
    let replacementHappened = false;
    
    // Try each pattern in order
    for (let i = 0; i < patterns.length; i++) {
      const pattern = patterns[i];
      const beforePatternReplace = translatedQuery;
      
      translatedQuery = translatedQuery.replace(pattern, (match, prefix) => {
        const replacement = `${prefix}${sourceTable}`;
        replacementHappened = true;
        return replacement;
      });
      
      if (beforePatternReplace !== translatedQuery) {
        console.log(`[CANONICAL-MAPPING] ✅ Replaced "${originalCanonical}" -> "${sourceTable}" (case-insensitive)`);
        break; // Stop after first successful replacement
      }
    }
    
    // If no pattern matched, log debug info
    if (!replacementHappened && beforeReplace === translatedQuery) {
      const testPattern = new RegExp(`\\b${escapedCanonical}\\b`, 'i');
      if (testPattern.test(translatedQuery)) {
        console.log(`[CANONICAL-MAPPING] ⚠️ Table '${originalCanonical}' found in query but no pattern matched (case-insensitive check)`);
        // Find the actual occurrence in query (case-insensitive)
        const match = translatedQuery.match(new RegExp(`\\b${escapedCanonical}\\b`, 'i'));
        if (match) {
          const index = match.index || 0;
          console.log(`[CANONICAL-MAPPING] ⚠️ Query snippet: ${translatedQuery.substring(Math.max(0, index - 20), Math.min(translatedQuery.length, index + 30))}`);
        }
      }
    }
    
    // If replacement didn't happen, try standalone replacement (for edge cases)
    if (beforeReplace === translatedQuery) {
      // Check if table name exists in query
      const tableExists = new RegExp(`\\b${escapedCanonical}\\b`, 'i').test(translatedQuery);
      if (tableExists) {
        // Capture variables for use in callback
        const canonicalName = originalCanonical;
        const sourceName = sourceTable;
        
        // Try replacing standalone occurrences (but be careful not to replace column names)
        // Only replace if it appears in contexts that suggest it's a table name
        const standalonePattern = new RegExp(`\\b${escapedCanonical}\\b`, 'gi');
        // Use replace with a function that receives (match, p1, p2, ..., offset, string)
        // Since we have no capture groups, offset is the second parameter
        translatedQuery = translatedQuery.replace(standalonePattern, (match, ...args) => {
          // In replace callback: (match, p1, p2, ..., offset, string)
          // Since no capture groups, offset is args[0], string is args[1]
          const offset = args[args.length - 2] || 0;
          const string = args[args.length - 1] || translatedQuery;
          
          const before = string.substring(Math.max(0, offset - 30), offset);
          const after = string.substring(offset + match.length, Math.min(string.length, offset + match.length + 10));
          
          // Replace if:
          // 1. It's after FROM/JOIN/UPDATE keywords
          // 2. It's before a dot (table.column)
          // 3. It's in a context that suggests it's a table name
          if (/\b(FROM|JOIN|UPDATE|INTO|TABLE)\s+$/i.test(before) || 
              /^\./.test(after) ||
              (/\s+$/.test(before) && /(\s|$|,|;)/.test(after))) {
            console.log(`[CANONICAL-MAPPING] Replacing standalone table: ${canonicalName} -> ${sourceName} (case-insensitive)`);
            return sourceName;
          }
          return match;
        });
      }
    }
    
    // Verify replacement worked (only log if replacement actually happened)
    if (beforeReplace !== translatedQuery) {
      console.log(`[CANONICAL-MAPPING] ✅ Table replacement successful: ${originalCanonical} -> ${sourceTable} (case-insensitive)`);
    } else {
      // Final fallback: aggressive replacement if table name still exists (case-insensitive)
      const tableStillExists = new RegExp(`\\b${escapedCanonical}\\b`, 'i').test(translatedQuery);
      if (tableStillExists) {
        // Only log warning if canonical and source are different (should have been replaced)
        if (normalizedCanonical.toLowerCase() !== sourceTable.toLowerCase()) {
          console.warn(`[CANONICAL-MAPPING] ⚠️ Table '${originalCanonical}' found in query but replacement didn't work (case-insensitive check)`);
          console.warn(`[CANONICAL-MAPPING] ⚠️ Query: ${translatedQuery.substring(0, 200)}`);
        }
        
        // Last resort: replace all occurrences after FROM/JOIN keywords specifically (case-insensitive)
        // Try a simpler, more direct approach - match any case variation
        const simplePattern = new RegExp(`\\bFROM\\s+${escapedCanonical}\\b`, 'gi');
        const simpleBefore = translatedQuery;
        translatedQuery = translatedQuery.replace(simplePattern, (match) => {
          // Preserve the case of FROM keyword, replace table name
          return match.replace(new RegExp(`${escapedCanonical}\\b`, 'i'), sourceTable);
        });
        
        if (simpleBefore !== translatedQuery) {
          console.log(`[CANONICAL-MAPPING] ✅ Simple FROM replacement successful: ${originalCanonical} -> ${sourceTable} (case-insensitive)`);
        } else {
          // Ultimate fallback: replace all word-boundary occurrences (case-insensitive)
          const aggressivePattern = new RegExp(`\\b${escapedCanonical}\\b`, 'gi');
          const aggressiveBefore = translatedQuery;
          translatedQuery = translatedQuery.replace(aggressivePattern, sourceTable);
          if (aggressiveBefore !== translatedQuery) {
            console.log(`[CANONICAL-MAPPING] ✅ Aggressive replacement successful: ${originalCanonical} -> ${sourceTable} (case-insensitive)`);
          } else if (normalizedCanonical.toLowerCase() !== sourceTable.toLowerCase()) {
            // Only log critical error if replacement was actually needed
            console.error(`[CANONICAL-MAPPING] ❌ CRITICAL: Replacement failed completely for ${originalCanonical} (tried case-insensitive)`);
          }
        }
      }
    }
  });

  // Replace canonical column names with source column names (case-insensitive)
  // Create normalized column mappings for case-insensitive matching
  const columnMappings = new Map<string, { source: string; originalCanonical: string }>();
  mappings.forEach(mapping => {
    const canonicalColumn = mapping.canonicalColumn || (mapping as any).canonicalColumnName;
    const sourceColumn = mapping.sourceColumn || (mapping as any).columnName;
    
    if (canonicalColumn && sourceColumn) {
      const normalizedCanonical = canonicalColumn.toLowerCase();
      // Only add if not already mapped (first mapping wins)
      if (!columnMappings.has(normalizedCanonical)) {
        columnMappings.set(normalizedCanonical, {
          source: sourceColumn,
          originalCanonical: canonicalColumn,
        });
      }
    }
  });
  
  columnMappings.forEach(({ source: sourceColumn, originalCanonical }, normalizedCanonical) => {
    // Skip if canonical and source are identical (case-insensitive)
    if (normalizedCanonical.toLowerCase() === sourceColumn.toLowerCase()) {
      return;
    }
    
    // Escape special regex characters
    const escapedCanonical = normalizedCanonical.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    
    // Replace column names (but not table names) - use word boundary and case-insensitive matching
    // CRITICAL: Use 'gi' flag for case-insensitive matching to catch ALL case variations
    const columnRegex = new RegExp(`\\b${escapedCanonical}\\b`, 'gi');
    
    // Check if this column appears in the query (case-insensitive)
    if (columnRegex.test(translatedQuery)) {
      let replacement = sourceColumn;
      
      // Note: We don't apply transformation rules here as they're stored per mapping
      // If transformation is needed, it should be in the mapping itself
      
      const beforeColumnReplace = translatedQuery;
      // Replace ALL case variations with the source column name
      translatedQuery = translatedQuery.replace(columnRegex, replacement);
      
      // Only log if replacement actually changed something
      if (beforeColumnReplace !== translatedQuery && normalizedCanonical.toLowerCase() !== sourceColumn.toLowerCase()) {
        console.log(`[CANONICAL-MAPPING] Replaced column: ${originalCanonical} -> ${replacement} (case-insensitive)`);
      }
    }
  });

  console.log(`[CANONICAL-MAPPING] ✅ Translation complete. Original: ${canonicalQuery.substring(0, 100)}...`);
  console.log(`[CANONICAL-MAPPING] ✅ Translated: ${translatedQuery.substring(0, 100)}...`);
  
  // Verify translation: check if any canonical table names remain (case-insensitive check)
  // Check for any case variation of canonical names that weren't replaced
  const remainingCanonicalTables: string[] = [];
  tableMappings.forEach((sourceTable, normalizedCanonical) => {
    const originalCanonical = canonicalVariations.get(normalizedCanonical) || normalizedCanonical;
    const escapedCanonical = normalizedCanonical.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    
    // Use case-insensitive regex to check for ANY case variation of canonical name
    const canonicalRegex = new RegExp(`\\b${escapedCanonical}\\b`, 'i');
    if (canonicalRegex.test(translatedQuery)) {
      // Double-check: make sure the source table isn't already in the query (replacement worked)
      const sourceEscaped = sourceTable.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const sourceRegex = new RegExp(`\\b${sourceEscaped}\\b`, 'i');
      // Only warn if canonical name exists AND source name doesn't exist
      if (!sourceRegex.test(translatedQuery)) {
        remainingCanonicalTables.push(originalCanonical);
      }
    }
  });
  
  if (remainingCanonicalTables.length > 0) {
    console.warn(`[CANONICAL-MAPPING] ⚠️ WARNING: Some canonical table names were not replaced: ${remainingCanonicalTables.join(', ')}`);
    console.warn(`[CANONICAL-MAPPING] ⚠️ This will cause query execution to fail. Translated query: ${translatedQuery.substring(0, 300)}`);
  }

  return translatedQuery;
}

/**
 * Get canonical schema for a data source
 * Returns metadata using canonical names
 */
export async function getCanonicalSchema(dataSourceId: string): Promise<DataSourceMetadata> {
  const registry = await prisma.schemaRegistry.findMany({
    where: { dataSourceId },
    orderBy: [
      { canonicalTableName: 'asc' },
      { canonicalColumnName: 'asc' },
    ],
  });

  // Group by canonical table name
  const tablesMap = new Map<string, ColumnMetadata[]>();

  registry.forEach(entry => {
    if (!tablesMap.has(entry.canonicalTableName)) {
      tablesMap.set(entry.canonicalTableName, []);
    }

    tablesMap.get(entry.canonicalTableName)!.push({
      name: entry.canonicalColumnName,
      description: entry.description || `Column ${entry.canonicalColumnName}`,
      type: entry.dataType,
    });
  });

  // Convert to TableMetadata array
  const tables: TableMetadata[] = Array.from(tablesMap.entries()).map(([tableName, columns]) => ({
    name: tableName,
    description: `Canonical table: ${tableName}`,
    columns,
  }));

  const dataSource = await prisma.dataSource.findUnique({
    where: { id: dataSourceId },
  });

  return {
    source_type: 'CANONICAL_DB',
    tables,
    connection_string: dataSource?.connectionString || undefined,
    data_source_id: dataSourceId, // Include data_source_id for query translation
  };
}

/**
 * Auto-register schema mappings from introspected schema
 * This automatically creates mappings when a new SQL database is connected
 */
export async function autoRegisterSchemaFromIntrospection(
  dataSourceId: string,
  introspectedMetadata: DataSourceMetadata
): Promise<void> {
  const mappings: Array<{
    sourceTable: string;
    sourceColumn: string;
    canonicalTable: string;
    canonicalColumn: string;
    dataType?: string;
  }> = [];

  introspectedMetadata.tables.forEach(table => {
    // Generate canonical names (normalize table/column names)
    const canonicalTable = normalizeToCanonical(table.name);
    
    table.columns.forEach(column => {
      const canonicalColumn = normalizeToCanonical(column.name);
      
      mappings.push({
        sourceTable: table.name,
        sourceColumn: column.name,
        canonicalTable: canonicalTable,
        canonicalColumn: canonicalColumn,
        dataType: column.type,
      });
    });
  });

  await registerSchemaMappings(dataSourceId, mappings);
}

/**
 * Normalize table/column names to canonical format
 * Examples:
 * - "tbl_students" → "students"
 * - "stu_id" → "student_id"
 * - "StudentName" → "student_name"
 */
function normalizeToCanonical(name: string): string {
  // Remove common prefixes
  let normalized = name
    .replace(/^tbl_/i, '')
    .replace(/^tb_/i, '')
    .replace(/^table_/i, '')
    .replace(/^t_/i, '');

  // Convert camelCase/PascalCase to snake_case
  normalized = normalized.replace(/([a-z])([A-Z])/g, '$1_$2').toLowerCase();

  // Expand common abbreviations
  normalized = normalized
    .replace(/\bstu\b/g, 'student')
    .replace(/\bstd\b/g, 'student')
    .replace(/\bid\b/g, 'id')
    .replace(/\bname\b/g, 'name')
    .replace(/\bnum\b/g, 'number')
    .replace(/\bamt\b/g, 'amount')
    .replace(/\bqty\b/g, 'quantity');

  return normalized;
}

/**
 * Get source-specific metadata (for query execution)
 */
export async function getSourceMetadata(dataSourceId: string): Promise<DataSourceMetadata> {
  const dataSource = await prisma.dataSource.findUnique({
    where: { id: dataSourceId },
    include: {
      schemaRegistry: true,
    },
  });

  if (!dataSource) {
    throw new Error(`Data source not found: ${dataSourceId}`);
  }

  // Group by source table name
  const tablesMap = new Map<string, ColumnMetadata[]>();

  dataSource.schemaRegistry.forEach(entry => {
    if (!tablesMap.has(entry.tableName)) {
      tablesMap.set(entry.tableName, []);
    }

    tablesMap.get(entry.tableName)!.push({
      name: entry.columnName,
      description: entry.description || `Column ${entry.columnName}`,
      type: entry.dataType,
    });
  });

  const tables: TableMetadata[] = Array.from(tablesMap.entries()).map(([tableName, columns]) => ({
    name: tableName,
    description: `Source table: ${tableName}`,
    columns,
  }));

  return {
    source_type: dataSource.sourceType as 'SQL_DB' | 'CSV_FILE',
    tables,
    connection_string: dataSource.connectionString || undefined,
  };
}

/**
 * Reverse-translate result column names from source names back to canonical names
 * This ensures that query results use canonical column names that match the original query
 * 
 * Example: If query selects "class_name" (canonical) which translates to "SCHOOLID" (source),
 * the results will have "SCHOOLID" as column name, but we want to show "class_name" to the user
 */
export async function reverseTranslateResultColumns(
  dataSourceId: string,
  results: any[]
): Promise<any[]> {
  if (!results || results.length === 0) {
    return results;
  }

  try {
    // Get schema mappings
    let mappings = await prisma.schemaMapping.findMany({
      where: { dataSourceId },
    });

    // If no explicit mappings, use SchemaRegistry
    if (mappings.length === 0) {
      const registry = await prisma.schemaRegistry.findMany({
        where: { dataSourceId },
      });

      if (registry.length === 0) {
        console.warn('[REVERSE-TRANSLATE] No mappings found, returning results as-is');
        return results;
      }

      // Convert SchemaRegistry to mapping format
      mappings = registry.map(r => ({
        id: r.id,
        dataSourceId: r.dataSourceId,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
        canonicalTable: r.canonicalTableName,
        sourceTable: r.tableName,
        canonicalColumn: r.canonicalColumnName,
        sourceColumn: r.columnName,
        transformationRule: null,
      })) as any[];
    }

    // Create reverse mapping: sourceColumn -> canonicalColumn
    const columnMapping = new Map<string, string>();
    mappings.forEach(mapping => {
      const sourceColumn = mapping.sourceColumn || (mapping as any).columnName;
      const canonicalColumn = mapping.canonicalColumn || (mapping as any).canonicalColumnName;
      
      if (sourceColumn && canonicalColumn) {
        // Map both uppercase and lowercase versions (MySQL often returns uppercase)
        columnMapping.set(sourceColumn.toUpperCase(), canonicalColumn);
        columnMapping.set(sourceColumn.toLowerCase(), canonicalColumn);
        columnMapping.set(sourceColumn, canonicalColumn); // Original case
      }
    });

    if (columnMapping.size === 0) {
      console.warn('[REVERSE-TRANSLATE] No column mappings found, returning results as-is');
      return results;
    }

    // Get all column names from first result row
    const firstRow = results[0];
    if (!firstRow || typeof firstRow !== 'object') {
      return results;
    }

    const sourceColumns = Object.keys(firstRow);
    const columnRenames: Record<string, string> = {};

    // Build rename map: for each source column, find its canonical name
    sourceColumns.forEach(sourceCol => {
      // Try exact match first
      if (columnMapping.has(sourceCol)) {
        columnRenames[sourceCol] = columnMapping.get(sourceCol)!;
        return;
      }

      // Try case-insensitive match
      const upperCol = sourceCol.toUpperCase();
      const lowerCol = sourceCol.toLowerCase();
      
      if (columnMapping.has(upperCol)) {
        columnRenames[sourceCol] = columnMapping.get(upperCol)!;
      } else if (columnMapping.has(lowerCol)) {
        columnRenames[sourceCol] = columnMapping.get(lowerCol)!;
      } else {
        // Try fuzzy matching for aliases (e.g., AVG_SCORE -> avg_score)
        // Check if sourceCol matches any canonical column name (case-insensitive, underscore-insensitive)
        const sourceColNormalized = sourceCol.toLowerCase().replace(/_/g, '');
        let foundMatch = false;
        
        for (const [sourceKey, canonicalValue] of columnMapping.entries()) {
          const sourceKeyNormalized = sourceKey.toLowerCase().replace(/_/g, '');
          const canonicalNormalized = canonicalValue.toLowerCase().replace(/_/g, '');
          
          // If sourceCol matches sourceKey (fuzzy), use canonicalValue
          if (sourceColNormalized === sourceKeyNormalized) {
            columnRenames[sourceCol] = canonicalValue;
            foundMatch = true;
            break;
          }
          
          // Also check if sourceCol matches canonicalValue (for aliases)
          if (sourceColNormalized === canonicalNormalized) {
            columnRenames[sourceCol] = canonicalValue;
            foundMatch = true;
            break;
          }
        }
        
        if (!foundMatch) {
          // No mapping found, keep original name but try to normalize case
          // If it's uppercase (like AVG_SCORE), convert to lowercase (avg_score)
          if (sourceCol === sourceCol.toUpperCase() && sourceCol.includes('_')) {
            columnRenames[sourceCol] = sourceCol.toLowerCase();
          } else {
            columnRenames[sourceCol] = sourceCol;
          }
        }
      }
    });

    // Apply renames to all result rows
    const translatedResults = results.map(row => {
      const newRow: any = {};
      Object.keys(row).forEach(sourceCol => {
        const canonicalCol = columnRenames[sourceCol] || sourceCol;
        newRow[canonicalCol] = row[sourceCol];
      });
      return newRow;
    });

    console.log('[REVERSE-TRANSLATE] Column name mappings:', columnRenames);
    console.log(`[REVERSE-TRANSLATE] Translated ${results.length} rows`);

    return translatedResults;
  } catch (error) {
    console.error('[REVERSE-TRANSLATE] Error reverse-translating columns:', error);
    return results; // Return original results on error
  }
}

