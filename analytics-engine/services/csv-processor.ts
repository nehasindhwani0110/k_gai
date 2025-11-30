import { DataSourceMetadata, TableMetadata, ColumnMetadata } from '../types';
import * as fs from 'fs/promises';
import * as path from 'path';

/**
 * Processes CSV file and creates virtual table metadata
 */
export async function processCSVFile(
  filePath: string,
  tableName?: string
): Promise<DataSourceMetadata> {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    const lines = content.split('\n').filter(line => line.trim());
    
    if (lines.length === 0) {
      throw new Error('CSV file is empty');
    }

    // Parse header row
    const headerRow = lines[0];
    const headers = headerRow.split(',').map(h => h.trim().replace(/"/g, ''));
    
    // Infer column types from first data row
    const firstDataRow = lines[1] || '';
    const firstDataValues = firstDataRow.split(',').map(v => v.trim().replace(/"/g, ''));
    
    const columns: ColumnMetadata[] = headers.map((header, index) => {
      const sampleValue = firstDataValues[index] || '';
      const type = inferColumnType(sampleValue);
      
      return {
        name: header,
        description: `Column ${index + 1}: ${header}`,
        type,
      };
    });

    const table: TableMetadata = {
      name: tableName || path.basename(filePath, '.csv'),
      description: `CSV file: ${path.basename(filePath)}`,
      columns,
    };

    return {
      source_type: 'CSV_FILE',
      tables: [table],
      file_path: filePath, // Include file path for query execution
    };
  } catch (error) {
    throw new Error(`Failed to process CSV file: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Infers column type from sample value
 */
function inferColumnType(value: string): string {
  if (!value) return 'TEXT';
  
  // Check for date format
  if (/^\d{4}-\d{2}-\d{2}/.test(value) || /^\d{2}\/\d{2}\/\d{4}/.test(value)) {
    return 'DATE';
  }
  
  // Check for integer
  if (/^-?\d+$/.test(value)) {
    return 'INT';
  }
  
  // Check for decimal
  if (/^-?\d+\.\d+$/.test(value)) {
    return 'DECIMAL';
  }
  
  // Default to text
  return 'TEXT';
}

/**
 * Executes query logic on CSV file using DuckDB
 * This would be implemented in Python backend for better CSV handling
 */
export async function executeCSVQuery(
  filePath: string,
  queryLogic: string
): Promise<any[]> {
  // In a real implementation, this would use DuckDB or Pandas
  // For now, this is a placeholder
  // The actual execution should happen in Python backend
  
  throw new Error('CSV query execution not yet implemented. Use Python backend with DuckDB/Pandas for this.');
}

