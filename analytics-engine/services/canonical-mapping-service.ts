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
  const mappings = await prisma.schemaMapping.findMany({
    where: { dataSourceId },
  });

  if (mappings.length === 0) {
    // No mappings, return query as-is
    return canonicalQuery;
  }

  let translatedQuery = canonicalQuery;

  // Replace canonical table names with source table names
  const tableMappings = new Map<string, string>();
  mappings.forEach(m => {
    if (!tableMappings.has(m.canonicalTable)) {
      tableMappings.set(m.canonicalTable, m.sourceTable);
    }
  });

  tableMappings.forEach((sourceTable, canonicalTable) => {
    // Replace table names in FROM/JOIN clauses
    const regex = new RegExp(`\\b${canonicalTable}\\b`, 'gi');
    translatedQuery = translatedQuery.replace(regex, sourceTable);
  });

  // Replace canonical column names with source column names
  mappings.forEach(mapping => {
    // Replace column names (but not table names)
    const columnRegex = new RegExp(`\\b${mapping.canonicalColumn}\\b`, 'gi');
    
    // Check if this column is in SELECT, WHERE, GROUP BY, ORDER BY clauses
    if (
      translatedQuery.includes(mapping.canonicalColumn) ||
      translatedQuery.toLowerCase().includes(`select ${mapping.canonicalColumn}`) ||
      translatedQuery.toLowerCase().includes(`where ${mapping.canonicalColumn}`) ||
      translatedQuery.toLowerCase().includes(`group by ${mapping.canonicalColumn}`) ||
      translatedQuery.toLowerCase().includes(`order by ${mapping.canonicalColumn}`)
    ) {
      let replacement = mapping.sourceColumn;
      
      // Apply transformation if needed
      if (mapping.transformationRule) {
        // Simple transformation rules
        if (mapping.transformationRule === 'UPPER') {
          replacement = `UPPER(${mapping.sourceColumn})`;
        } else if (mapping.transformationRule === 'LOWER') {
          replacement = `LOWER(${mapping.sourceColumn})`;
        } else {
          // Custom transformation (e.g., DATE_FORMAT)
          replacement = mapping.transformationRule.replace('{column}', mapping.sourceColumn);
        }
      }
      
      translatedQuery = translatedQuery.replace(columnRegex, replacement);
    }
  });

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
    connection_string: dataSource?.connectionString,
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

