/**
 * System Catalog Service
 * 
 * Queries database system catalogs (INFORMATION_SCHEMA) directly for:
 * - Real-time, accurate metadata
 * - Better performance than full introspection
 * - Cost-efficient (no LLM calls needed for structure)
 * - Works with 200+ tables efficiently
 */

import { DataSourceMetadata, TableMetadata, ColumnMetadata } from '../types';

interface SystemCatalogConfig {
  connectionString: string;
  databaseName?: string;
  schemaName?: string;
  includeSystemTables?: boolean;
}

interface TableInfo {
  tableName: string;
  tableComment?: string;
  rowCount?: number;
}

interface ColumnInfo {
  columnName: string;
  dataType: string;
  isNullable: boolean;
  isPrimaryKey: boolean;
  columnDefault?: string;
  columnComment?: string;
  ordinalPosition: number;
}

/**
 * Detects database type from connection string
 */
function detectDatabaseType(connectionString: string): 'mysql' | 'postgresql' | 'sqlserver' | 'unknown' {
  const connStr = connectionString.toLowerCase();
  if (connStr.includes('mysql') || connStr.includes('mariadb')) return 'mysql';
  if (connStr.includes('postgresql') || connStr.includes('postgres')) return 'postgresql';
  if (connStr.includes('sqlserver') || connStr.includes('mssql')) return 'sqlserver';
  return 'unknown';
}

/**
 * Gets system catalog metadata directly from database
 * Uses INFORMATION_SCHEMA queries for efficiency
 */
export async function getSystemCatalogMetadata(
  config: SystemCatalogConfig
): Promise<DataSourceMetadata> {
  const dbType = detectDatabaseType(config.connectionString);
  
  if (dbType === 'unknown') {
    throw new Error('Unsupported database type. Supported: MySQL, PostgreSQL, SQL Server');
  }

  // Call Python backend to execute INFORMATION_SCHEMA queries
  const pythonBackendUrl = process.env.PYTHON_BACKEND_URL || 'http://localhost:8000';
  
  const response = await fetch(`${pythonBackendUrl}/system-catalog`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      connection_string: config.connectionString,
      database_name: config.databaseName,
      schema_name: config.schemaName,
      include_system_tables: config.includeSystemTables || false,
      database_type: dbType,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`System catalog query failed: ${response.status} - ${errorText}`);
  }

  const result = await response.json();
  
  if (result.error) {
    throw new Error(result.error);
  }

  return result.metadata;
}

/**
 * Gets metadata for specific tables only (efficient for large databases)
 */
export async function getTablesMetadata(
  config: SystemCatalogConfig,
  tableNames: string[]
): Promise<TableMetadata[]> {
  const dbType = detectDatabaseType(config.connectionString);
  const pythonBackendUrl = process.env.PYTHON_BACKEND_URL || 'http://localhost:8000';
  
  const response = await fetch(`${pythonBackendUrl}/system-catalog/tables`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      connection_string: config.connectionString,
      database_name: config.databaseName,
      schema_name: config.schemaName,
      table_names: tableNames,
      database_type: dbType,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`System catalog query failed: ${response.status} - ${errorText}`);
  }

  const result = await response.json();
  
  if (result.error) {
    throw new Error(result.error);
  }

  return result.tables;
}

/**
 * Gets table statistics (row counts, sizes) for better query planning
 */
export async function getTableStatistics(
  config: SystemCatalogConfig,
  tableNames?: string[]
): Promise<Map<string, { rowCount: number; sizeBytes: number }>> {
  const dbType = detectDatabaseType(config.connectionString);
  const pythonBackendUrl = process.env.PYTHON_BACKEND_URL || 'http://localhost:8000';
  
  const response = await fetch(`${pythonBackendUrl}/system-catalog/statistics`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      connection_string: config.connectionString,
      database_name: config.databaseName,
      schema_name: config.schemaName,
      table_names: tableNames,
      database_type: dbType,
    }),
  });

  if (!response.ok) {
    // Statistics are optional, return empty map if not available
    return new Map();
  }

  const result = await response.json();
  
  if (result.error || !result.statistics) {
    return new Map();
  }

  const statsMap = new Map<string, { rowCount: number; sizeBytes: number }>();
  Object.entries(result.statistics).forEach(([tableName, stats]: [string, any]) => {
    statsMap.set(tableName, {
      rowCount: stats.row_count || 0,
      sizeBytes: stats.size_bytes || 0,
    });
  });

  return statsMap;
}

/**
 * Checks if table/column exists in database (fast validation)
 */
export async function validateTableExists(
  config: SystemCatalogConfig,
  tableName: string
): Promise<boolean> {
  const dbType = detectDatabaseType(config.connectionString);
  const pythonBackendUrl = process.env.PYTHON_BACKEND_URL || 'http://localhost:8000';
  
  const response = await fetch(`${pythonBackendUrl}/system-catalog/validate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      connection_string: config.connectionString,
      database_name: config.databaseName,
      schema_name: config.schemaName,
      table_name: tableName,
      database_type: dbType,
    }),
  });

  if (!response.ok) {
    return false;
  }

  const result = await response.json();
  return result.exists === true;
}

