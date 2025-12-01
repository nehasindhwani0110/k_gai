import { DataSourceMetadata, TableMetadata, ColumnMetadata } from '../types';
import * as fs from 'fs/promises';
import * as path from 'path';
import { parse } from 'csv-parse';
import * as XLSX from 'xlsx';

/**
 * Universal file processor - handles CSV, JSON, Excel, and Text files
 */
export async function processFile(
  filePath: string,
  fileType: 'CSV' | 'JSON' | 'EXCEL' | 'TXT',
  tableName?: string
): Promise<DataSourceMetadata> {
  switch (fileType) {
    case 'CSV':
      return processCSVFile(filePath, tableName);
    case 'JSON':
      return processJSONFile(filePath, tableName);
    case 'EXCEL':
      return processExcelFile(filePath, tableName);
    case 'TXT':
      return processTextFile(filePath, tableName);
    default:
      throw new Error(`Unsupported file type: ${fileType}`);
  }
}

/**
 * Processes CSV file
 */
async function processCSVFile(
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
      file_path: filePath,
    };
  } catch (error) {
    throw new Error(`Failed to process CSV file: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Processes JSON file
 */
async function processJSONFile(
  filePath: string,
  tableName?: string
): Promise<DataSourceMetadata> {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    const data = JSON.parse(content);
    
    // Handle array of objects
    let records: any[] = [];
    if (Array.isArray(data)) {
      records = data;
    } else if (typeof data === 'object') {
      // If it's an object, try to find array property
      const arrayKeys = Object.keys(data).filter(key => Array.isArray(data[key]));
      if (arrayKeys.length > 0) {
        records = data[arrayKeys[0]];
      } else {
        // Single object - wrap in array
        records = [data];
      }
    } else {
      throw new Error('JSON file must contain an array of objects or an object');
    }

    if (records.length === 0) {
      throw new Error('JSON file is empty or contains no records');
    }

    // Infer columns from first record
    const firstRecord = records[0];
    const columns: ColumnMetadata[] = Object.keys(firstRecord).map((key, index) => {
      const sampleValue = firstRecord[key];
      const type = inferColumnType(String(sampleValue));
      
      return {
        name: key,
        description: `Column ${index + 1}: ${key}`,
        type,
      };
    });

    const table: TableMetadata = {
      name: tableName || path.basename(filePath, '.json'),
      description: `JSON file: ${path.basename(filePath)}`,
      columns,
    };

    return {
      source_type: 'CSV_FILE', // Use CSV_FILE type for compatibility with query executor
      tables: [table],
      file_path: filePath,
    };
  } catch (error) {
    throw new Error(`Failed to process JSON file: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Processes Excel file
 */
async function processExcelFile(
  filePath: string,
  tableName?: string
): Promise<DataSourceMetadata> {
  try {
    const workbook = XLSX.readFile(filePath);
    const sheetName = workbook.SheetNames[0]; // Use first sheet
    const worksheet = workbook.Sheets[sheetName];
    
    // Convert to JSON
    const data = XLSX.utils.sheet_to_json(worksheet);
    
    if (data.length === 0) {
      throw new Error('Excel file is empty or contains no data');
    }

    // Infer columns from first record
    const firstRecord = data[0] as any;
    const columns: ColumnMetadata[] = Object.keys(firstRecord).map((key, index) => {
      const sampleValue = firstRecord[key];
      const type = inferColumnType(String(sampleValue));
      
      return {
        name: key,
        description: `Column ${index + 1}: ${key}`,
        type,
      };
    });

    const table: TableMetadata = {
      name: tableName || path.basename(filePath, path.extname(filePath)),
      description: `Excel file: ${path.basename(filePath)} (Sheet: ${sheetName})`,
      columns,
    };

    return {
      source_type: 'CSV_FILE', // Use CSV_FILE type for compatibility
      tables: [table],
      file_path: filePath,
    };
  } catch (error) {
    throw new Error(`Failed to process Excel file: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Processes Text file (tab-delimited or space-delimited)
 */
async function processTextFile(
  filePath: string,
  tableName?: string
): Promise<DataSourceMetadata> {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    const lines = content.split('\n').filter(line => line.trim());
    
    if (lines.length === 0) {
      throw new Error('Text file is empty');
    }

    // Try to detect delimiter (tab, comma, or space)
    const firstLine = lines[0];
    let delimiter = '\t';
    if (firstLine.includes('\t')) {
      delimiter = '\t';
    } else if (firstLine.includes(',')) {
      delimiter = ',';
    } else {
      delimiter = /\s{2,}/; // Multiple spaces
    }

    // Parse header row
    const headerRow = lines[0];
    const headers = typeof delimiter === 'string' 
      ? headerRow.split(delimiter).map(h => h.trim())
      : headerRow.split(delimiter).map(h => h.trim()).filter(h => h);
    
    // Infer column types from first data row
    const firstDataRow = lines[1] || '';
    const firstDataValues = typeof delimiter === 'string'
      ? firstDataRow.split(delimiter).map(v => v.trim())
      : firstDataRow.split(delimiter).map(v => v.trim()).filter(v => v);
    
    const columns: ColumnMetadata[] = headers.map((header, index) => {
      const sampleValue = firstDataValues[index] || '';
      const type = inferColumnType(sampleValue);
      
      return {
        name: header || `column_${index + 1}`,
        description: `Column ${index + 1}: ${header || `column_${index + 1}`}`,
        type,
      };
    });

    const table: TableMetadata = {
      name: tableName || path.basename(filePath, '.txt'),
      description: `Text file: ${path.basename(filePath)}`,
      columns,
    };

    return {
      source_type: 'CSV_FILE', // Use CSV_FILE type for compatibility
      tables: [table],
      file_path: filePath,
    };
  } catch (error) {
    throw new Error(`Failed to process text file: ${error instanceof Error ? error.message : String(error)}`);
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
  
  // Check for boolean
  if (/^(true|false|yes|no|1|0)$/i.test(value)) {
    return 'BOOLEAN';
  }
  
  // Default to text
  return 'TEXT';
}

