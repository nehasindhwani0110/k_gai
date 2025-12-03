/**
 * Metadata Formatter Utility
 * 
 * Formats database metadata in a compact way to reduce token usage.
 * Removes unnecessary fields and uses concise representations.
 */

import { DataSourceMetadata, TableMetadata, ColumnMetadata } from '../types';

/**
 * Creates a compact representation of column metadata
 */
function formatColumnCompact(column: ColumnMetadata): string {
  const parts: string[] = [column.name];
  
  if (column.type) {
    parts.push(`(${column.type})`);
  }
  
  return parts.join(' ');
}

/**
 * Creates a compact representation of table metadata
 */
function formatTableCompact(table: TableMetadata): string {
  const columns = table.columns || [];
  const columnList = columns.map(formatColumnCompact).join(', ');
  
  return `Table: ${table.name}\n  Columns: ${columnList}`;
}

/**
 * Formats metadata in a compact text format (much smaller than JSON)
 */
export function formatMetadataCompact(metadata: DataSourceMetadata): string {
  const parts: string[] = [];
  
  parts.push(`Data Source: ${metadata.source_type || 'UNKNOWN'}`);
  
  if (metadata.tables && metadata.tables.length > 0) {
    parts.push(`\nTables (${metadata.tables.length}):`);
    metadata.tables.forEach((table, index) => {
      parts.push(`\n${index + 1}. ${formatTableCompact(table)}`);
    });
  } else {
    parts.push('\nNo tables available');
  }
  
  return parts.join('');
}

/**
 * Formats metadata as minimal JSON (removes unnecessary fields)
 */
export function formatMetadataMinimalJSON(metadata: DataSourceMetadata): string {
  const minimal: any = {
    source_type: metadata.source_type,
    tables: metadata.tables?.map(table => ({
      name: table.name,
      columns: table.columns?.map(col => ({
        name: col.name,
        type: col.type,
      })),
    })),
  };
  
  return JSON.stringify(minimal, null, 1); // Compact JSON with minimal indentation
}

/**
 * Formats metadata optimally based on size
 * Uses compact text format for very large schemas, JSON for smaller ones
 */
export function formatMetadataOptimal(metadata: DataSourceMetadata): string {
  const totalColumns = metadata.tables?.reduce((sum, t) => sum + (t.columns?.length || 0), 0) || 0;
  
  // For very large schemas (>100 columns), use compact text format
  // For smaller schemas, use minimal JSON (more structured)
  if (totalColumns > 100) {
    return formatMetadataCompact(metadata);
  }
  
  return formatMetadataMinimalJSON(metadata);
}

