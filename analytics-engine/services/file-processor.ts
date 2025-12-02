import { DataSourceMetadata, TableMetadata, ColumnMetadata } from '../types';
import * as fs from 'fs/promises';
import * as path from 'path';
import { parse } from 'csv-parse';
import * as XLSX from 'xlsx';
import { existsSync } from 'fs';

/**
 * Universal file processor - handles CSV, JSON, Excel, and Text files
 */
export async function processFile(
  filePath: string,
  fileType: 'CSV' | 'JSON' | 'EXCEL' | 'TXT',
  tableName?: string
): Promise<DataSourceMetadata> {
  // Resolve file path - handle both absolute and relative paths
  const resolvedPath = path.isAbsolute(filePath) 
    ? filePath 
    : path.resolve(process.cwd(), filePath);
  
  // Check if file exists
  if (!existsSync(resolvedPath)) {
    throw new Error(`File not found: ${resolvedPath}. Please ensure the file exists and the path is correct.`);
  }

  // Verify file is readable
  try {
    await fs.access(resolvedPath, fs.constants.R_OK);
  } catch (error) {
    throw new Error(`Cannot access file: ${resolvedPath}. ${error instanceof Error ? error.message : String(error)}`);
  }

  switch (fileType) {
    case 'CSV':
      return processCSVFile(resolvedPath, tableName);
    case 'JSON':
      return processJSONFile(resolvedPath, tableName);
    case 'EXCEL':
      return processExcelFile(resolvedPath, tableName);
    case 'TXT':
      return processTextFile(resolvedPath, tableName);
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
    if (!existsSync(filePath)) {
      throw new Error(`CSV file not found: ${filePath}`);
    }

    const content = await fs.readFile(filePath, 'utf-8');
    const lines = content.split('\n').filter(line => line.trim());
    
    if (lines.length === 0) {
      throw new Error('CSV file is empty');
    }

    // Parse header row
    const headerRow = lines[0];
    const headers = headerRow.split(',').map(h => h.trim().replace(/"/g, ''));
    
    if (headers.length === 0) {
      throw new Error('CSV file has no headers');
    }
    
    // Infer column types from first data row
    const firstDataRow = lines[1] || '';
    const firstDataValues = firstDataRow.split(',').map(v => v.trim().replace(/"/g, ''));
    
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
      name: tableName || path.basename(filePath, path.extname(filePath)),
      description: `CSV file: ${path.basename(filePath)}`,
      columns,
    };

    return {
      source_type: 'CSV_FILE',
      tables: [table],
      file_path: filePath,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to process CSV file "${path.basename(filePath)}": ${errorMessage}`);
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
    if (!existsSync(filePath)) {
      throw new Error(`JSON file not found: ${filePath}`);
    }

    const content = await fs.readFile(filePath, 'utf-8');
    
    if (!content.trim()) {
      throw new Error('JSON file is empty');
    }

    let data: any;
    try {
      data = JSON.parse(content);
    } catch (parseError) {
      throw new Error(`Invalid JSON format: ${parseError instanceof Error ? parseError.message : String(parseError)}`);
    }
    
    // Handle array of objects
    let records: any[] = [];
    if (Array.isArray(data)) {
      records = data;
    } else if (typeof data === 'object' && data !== null) {
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
    if (!firstRecord || typeof firstRecord !== 'object') {
      throw new Error('JSON file first record must be an object');
    }

    const columns: ColumnMetadata[] = Object.keys(firstRecord).map((key, index) => {
      const sampleValue = firstRecord[key];
      const type = inferColumnType(String(sampleValue || ''));
      
      return {
        name: key,
        description: `Column ${index + 1}: ${key}`,
        type,
      };
    });

    if (columns.length === 0) {
      throw new Error('JSON file contains no columns');
    }

    const table: TableMetadata = {
      name: tableName || path.basename(filePath, path.extname(filePath)),
      description: `JSON file: ${path.basename(filePath)}`,
      columns,
    };

    return {
      source_type: 'JSON_FILE', // Return correct source type for JSON files
      tables: [table],
      file_path: filePath,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to process JSON file "${path.basename(filePath)}": ${errorMessage}`);
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
    // Verify file exists and is readable before processing
    if (!existsSync(filePath)) {
      throw new Error(`Excel file not found: ${filePath}`);
    }

    // Read file as buffer first (more reliable than direct file read)
    const fileBuffer = await fs.readFile(filePath);
    
    // Parse Excel file from buffer
    const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
    
    if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
      throw new Error('Excel file contains no sheets');
    }

    const sheetName = workbook.SheetNames[0]; // Use first sheet
    const worksheet = workbook.Sheets[sheetName];
    
    if (!worksheet) {
      throw new Error(`Sheet "${sheetName}" not found in Excel file`);
    }
    
    // OPTIMIZATION: For schema introspection, only read first few rows (header + 2 sample rows)
    // This dramatically speeds up processing for large Excel files
    const originalRef = worksheet['!ref'];
    if (!originalRef) {
      throw new Error('Excel worksheet has no data range');
    }
    
    const range = XLSX.utils.decode_range(originalRef);
    const maxRowsForSchema = Math.min(range.e.r + 1, 3); // Header + 2 sample rows max
    
    // Temporarily limit the worksheet range to speed up processing
    const limitedRange = XLSX.utils.encode_range({
      s: { r: 0, c: 0 },
      e: { r: maxRowsForSchema - 1, c: range.e.c }
    });
    
    // Temporarily modify worksheet range for faster processing
    worksheet['!ref'] = limitedRange;
    
    try {
      // Convert only limited rows to JSON for schema introspection
      const limitedWorksheet = XLSX.utils.sheet_to_json(worksheet, { 
        defval: null,
        raw: false
      });
      
      if (limitedWorksheet.length === 0) {
        throw new Error('Excel file is empty or contains no data rows');
      }

      // Infer columns from first record
      const firstRecord = limitedWorksheet[0] as any;
      if (!firstRecord || Object.keys(firstRecord).length === 0) {
        throw new Error('Excel file first row contains no columns');
      }

      const columns: ColumnMetadata[] = Object.keys(firstRecord).map((key, index) => {
        const sampleValue = firstRecord[key];
        const type = inferColumnType(String(sampleValue || ''));
        
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
        source_type: 'EXCEL_FILE', // Return correct source type for Excel files
        tables: [table],
        file_path: filePath,
      };
    } finally {
      // Restore original worksheet range
      if (originalRef) {
        worksheet['!ref'] = originalRef;
      }
    }
  } catch (error) {
    // Provide more detailed error information
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to process Excel file "${path.basename(filePath)}": ${errorMessage}. Please ensure the file is not corrupted and is a valid Excel file (.xlsx or .xls).`);
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
    if (!existsSync(filePath)) {
      throw new Error(`Text file not found: ${filePath}`);
    }

    const content = await fs.readFile(filePath, 'utf-8');
    const lines = content.split('\n').filter(line => line.trim());
    
    if (lines.length === 0) {
      throw new Error('Text file is empty');
    }

    // Try to detect delimiter (tab, comma, or space)
    const firstLine = lines[0];
    let delimiter: string | RegExp = '\t';
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
      ? headerRow.split(delimiter).map(h => h.trim()).filter(h => h)
      : headerRow.split(delimiter).map(h => h.trim()).filter(h => h);
    
    if (headers.length === 0) {
      throw new Error('Text file has no headers');
    }
    
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
      name: tableName || path.basename(filePath, path.extname(filePath)),
      description: `Text file: ${path.basename(filePath)}`,
      columns,
    };

    return {
      source_type: 'TXT_FILE', // Return correct source type for Text files
      tables: [table],
      file_path: filePath,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to process text file "${path.basename(filePath)}": ${errorMessage}`);
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

