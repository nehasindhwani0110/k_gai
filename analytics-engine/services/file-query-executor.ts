import * as fs from 'fs/promises';
import { parse } from 'csv-parse';
import * as XLSX from 'xlsx';
import { executeSQLOnCSV } from './query-executor';
import { parseDate, extractYear, extractMonth, extractDay, extractDate, isDate } from '../utils/date-utils';

/**
 * Universal file query executor - handles CSV, JSON, Excel, and Text files
 */
export async function executeFileQuery(
  filePath: string,
  fileType: 'CSV' | 'JSON' | 'EXCEL' | 'TXT',
  query: string
): Promise<any[]> {
  // For now, convert all file types to CSV-like format and use CSV executor
  // In future, we can optimize each file type separately
  
  switch (fileType) {
    case 'CSV':
      return executeSQLOnCSV(filePath, query);
    case 'JSON':
      return executeJSONQuery(filePath, query);
    case 'EXCEL':
      return executeExcelQuery(filePath, query);
    case 'TXT':
      return executeTextQuery(filePath, query);
    default:
      throw new Error(`Unsupported file type: ${fileType}`);
  }
}

/**
 * Executes query on JSON file
 */
async function executeJSONQuery(
  filePath: string,
  query: string
): Promise<any[]> {
  try {
    // Read and parse JSON
    const content = await fs.readFile(filePath, 'utf-8');
    const data = JSON.parse(content);
    
    // Convert to array format
    let records: any[] = [];
    if (Array.isArray(data)) {
      records = data;
    } else if (typeof data === 'object') {
      const arrayKeys = Object.keys(data).filter(key => Array.isArray(data[key]));
      if (arrayKeys.length > 0) {
        records = data[arrayKeys[0]];
      } else {
        records = [data];
      }
    }
    
    // Convert JSON to CSV-like format and use CSV executor
    // Create temporary CSV representation
    if (records.length === 0) {
      return [];
    }
    
    // Convert JSON records to CSV-like format and execute query
    return executeCSVQueryOnRecords(records, query);
  } catch (error) {
    throw new Error(`JSON query execution failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Executes query on Excel file
 */
async function executeExcelQuery(
  filePath: string,
  query: string
): Promise<any[]> {
  try {
    const workbook = XLSX.readFile(filePath);
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const records = XLSX.utils.sheet_to_json(worksheet) as any[];
    
    if (records.length === 0) {
      return [];
    }
    
    // Convert Excel data to records format and execute query
    return executeCSVQueryOnRecords(records, query);
  } catch (error) {
    throw new Error(`Excel query execution failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Executes query on Text file
 */
async function executeTextQuery(
  filePath: string,
  query: string
): Promise<any[]> {
  try {
    // Read text file
    const content = await fs.readFile(filePath, 'utf-8');
    const lines = content.split('\n').filter(line => line.trim());
    
    if (lines.length === 0) {
      return [];
    }
    
    // Detect delimiter
    const firstLine = lines[0];
    let delimiter = '\t';
    if (firstLine.includes('\t')) {
      delimiter = '\t';
    } else if (firstLine.includes(',')) {
      delimiter = ',';
    } else {
      delimiter = /\s{2,}/ as any;
    }
    
    // Parse as CSV-like format
    const records = await new Promise<any[]>((resolve, reject) => {
      parse(content, {
        columns: true,
        skip_empty_lines: true,
        trim: true,
        delimiter: delimiter as any,
      }, (err, data) => {
        if (err) reject(err);
        else resolve(data);
      });
    });
    
    return executeCSVQueryOnRecords(records, query);
  } catch (error) {
    throw new Error(`Text file query execution failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Execute SQL query directly on records array (for JSON/Excel/Text files)
 */
function executeCSVQueryOnRecords(records: any[], query: string): any[] {
  // Parse SELECT clause
  const selectMatch = query.match(/SELECT\s+(.+?)\s+FROM/i);
  if (!selectMatch) {
    return records.slice(0, 100);
  }
  
  const selectFields = selectMatch[1].trim();
  const isSelectAll = selectFields === '*';
  
  // Parse WHERE clause
  const whereMatch = query.match(/WHERE\s+(.+?)(?:\s+GROUP|\s+ORDER|\s+LIMIT|$)/i);
  let filteredRecords = records;
  if (whereMatch) {
    filteredRecords = applyWhereClause(records, whereMatch[1].trim());
  }
  
  // Parse GROUP BY
  const hasGroupBy = /GROUP\s+BY/i.test(query);
  const hasAggregate = /(COUNT|SUM|AVG|MAX|MIN)\(/i.test(query);
  const hasDateFunction = /(YEAR|MONTH|DAY|DATE|EXTRACT)\(/i.test(query);
  
  if (hasGroupBy || hasAggregate) {
    return applyAggregates(filteredRecords, query, selectFields);
  }
  
  // Select fields (with date function support)
  if (!isSelectAll) {
    const fields = selectFields.split(',').map(f => f.trim());
    filteredRecords = filteredRecords.map(record => {
      const result: any = {};
      fields.forEach(field => {
        // Handle date functions: YEAR(column), MONTH(column), DAY(column), DATE(column)
        const yearMatch = field.match(/YEAR\((\w+)\)(?:\s+AS\s+(\w+))?/i);
        if (yearMatch) {
          const column = yearMatch[1];
          const alias = yearMatch[2] || `year_${column}`;
          result[alias] = extractYear(record[column]);
          return;
        }
        
        const monthMatch = field.match(/MONTH\((\w+)\)(?:\s+AS\s+(\w+))?/i);
        if (monthMatch) {
          const column = monthMatch[1];
          const alias = monthMatch[2] || `month_${column}`;
          result[alias] = extractMonth(record[column]);
          return;
        }
        
        const dayMatch = field.match(/DAY\((\w+)\)(?:\s+AS\s+(\w+))?/i);
        if (dayMatch) {
          const column = dayMatch[1];
          const alias = dayMatch[2] || `day_${column}`;
          result[alias] = extractDay(record[column]);
          return;
        }
        
        const dateMatch = field.match(/DATE\((\w+)\)(?:\s+AS\s+(\w+))?/i);
        if (dateMatch) {
          const column = dateMatch[1];
          const alias = dateMatch[2] || `date_${column}`;
          result[alias] = extractDate(record[column]);
          return;
        }
        
        const aliasMatch = field.match(/(\w+)\s+AS\s+(\w+)/i);
        if (aliasMatch) {
          result[aliasMatch[2]] = record[aliasMatch[1]];
        } else {
          result[field] = record[field];
        }
      });
      return result;
    });
  }
  
  // Parse ORDER BY
  const orderMatch = query.match(/ORDER\s+BY\s+(\w+)(?:\s+(ASC|DESC))?/i);
  if (orderMatch) {
    const orderField = orderMatch[1].trim();
    const direction = (orderMatch[2]?.toUpperCase() || 'ASC') as 'ASC' | 'DESC';
    filteredRecords.sort((a, b) => {
      const aVal = a[orderField];
      const bVal = b[orderField];
      const aNum = parseFloat(aVal);
      const bNum = parseFloat(bVal);
      
      if (!isNaN(aNum) && !isNaN(bNum)) {
        return direction === 'ASC' ? aNum - bNum : bNum - aNum;
      }
      
      const aStr = String(aVal || '').toLowerCase();
      const bStr = String(bVal || '').toLowerCase();
      return direction === 'ASC' ? aStr.localeCompare(bStr) : bStr.localeCompare(aStr);
    });
  }
  
  // Parse LIMIT
  const limitMatch = query.match(/LIMIT\s+(\d+)/i);
  if (limitMatch) {
    const limit = parseInt(limitMatch[1], 10);
    filteredRecords = filteredRecords.slice(0, limit);
  }
  
  return filteredRecords;
}

function applyWhereClause(records: any[], whereClause: string): any[] {
  // Simple WHERE clause parser
  return records.filter(record => {
    // Handle basic comparisons: column = value, column > value, etc.
    const conditions = whereClause.split(/AND|OR/i).map(c => c.trim());
    
    return conditions.every(condition => {
      if (condition.includes('=')) {
        const [field, value] = condition.split('=').map(s => s.trim());
        const cleanValue = value.replace(/['"]/g, '');
        return String(record[field]) === cleanValue;
      }
      if (condition.includes('>')) {
        const [field, value] = condition.split('>').map(s => s.trim());
        return parseFloat(record[field]) > parseFloat(value);
      }
      if (condition.includes('<')) {
        const [field, value] = condition.split('<').map(s => s.trim());
        return parseFloat(record[field]) < parseFloat(value);
      }
      return true;
    });
  });
}

function applyAggregates(records: any[], query: string, selectFields: string): any[] {
  // Similar to CSV query executor's applyAggregates
  const groupByMatch = query.match(/GROUP\s+BY\s+((?:YEAR|MONTH|DAY|DATE)\([\w_]+\)|[\w_]+)/i);
  const hasGroupBy = !!groupByMatch;
  const groupByField = groupByMatch ? groupByMatch[1].trim() : null;
  
  if (!hasGroupBy) {
    // Single aggregate
    const avgMatch = selectFields.match(/AVG\((\w+)\)(?:\s+AS\s+(\w+))?/i);
    if (avgMatch) {
      const field = avgMatch[1];
      const alias = avgMatch[2] || `avg_${field}`;
      const values = records.map(r => parseFloat(r[field])).filter(v => !isNaN(v));
      const avg = values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : 0;
      return [{ [alias]: parseFloat(avg.toFixed(2)) }];
    }
    
    const countMatch = selectFields.match(/COUNT\((\w+|\*)\)(?:\s+AS\s+(\w+))?/i);
    if (countMatch) {
      const alias = countMatch[2] || 'count';
      return [{ [alias]: records.length }];
    }
    
    const sumMatch = selectFields.match(/SUM\((\w+)\)(?:\s+AS\s+(\w+))?/i);
    if (sumMatch) {
      const field = sumMatch[1];
      const alias = sumMatch[2] || `sum_${field}`;
      const sum = records.reduce((acc, r) => acc + (parseFloat(r[field]) || 0), 0);
      return [{ [alias]: sum }];
    }
    
    return records;
  }
  
  // GROUP BY logic - handle date functions
  const yearMatch = groupByField!.match(/YEAR\((\w+)\)/i);
  const monthMatch = groupByField!.match(/MONTH\((\w+)\)/i);
  const dateMatch = groupByField!.match(/DATE\((\w+)\)/i);
  
  const groups: { [key: string]: any[] } = {};
  records.forEach(record => {
    let groupKey: string;
    
    if (yearMatch) {
      const column = yearMatch[1];
      const year = extractYear(record[column]);
      groupKey = year !== null ? String(year) : 'NULL';
    } else if (monthMatch) {
      const column = monthMatch[1];
      const month = extractMonth(record[column]);
      groupKey = month !== null ? String(month).padStart(2, '0') : 'NULL';
    } else if (dateMatch) {
      const column = dateMatch[1];
      const date = extractDate(record[column]);
      groupKey = date || 'NULL';
    } else {
      const fieldValue = record[groupByField!];
      if (isDate(fieldValue)) {
        const yearMonth = extractDate(fieldValue);
        groupKey = yearMonth || String(fieldValue || 'NULL');
      } else {
        groupKey = String(fieldValue || 'NULL');
      }
    }
    
    if (!groups[groupKey]) {
      groups[groupKey] = [];
    }
    groups[groupKey].push(record);
  });
  
  const results: any[] = [];
  Object.keys(groups).sort().forEach(groupKey => {
    const groupRecords = groups[groupKey];
    
    // Determine the actual group by field name (handle date functions)
    let actualGroupByField = groupByField!;
    if (yearMatch) {
      actualGroupByField = yearMatch[0];
    } else if (monthMatch) {
      actualGroupByField = monthMatch[0];
    } else if (dateMatch) {
      actualGroupByField = dateMatch[0];
    }
    
    const resultRow: any = { [actualGroupByField]: groupKey === 'NULL' ? null : groupKey };
    
    // Handle aggregates
    const avgMatch = selectFields.match(/AVG\((\w+)\)(?:\s+AS\s+(\w+))?/i);
    if (avgMatch) {
      const field = avgMatch[1];
      const alias = avgMatch[2] || `avg_${field}`;
      const values = groupRecords.map(r => parseFloat(r[field])).filter(v => !isNaN(v));
      const avg = values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : 0;
      resultRow[alias] = parseFloat(avg.toFixed(2));
    }
    
    const countMatch = selectFields.match(/COUNT\((\w+|\*)\)(?:\s+AS\s+(\w+))?/i);
    if (countMatch) {
      const alias = countMatch[2] || 'count';
      resultRow[alias] = groupRecords.length;
    }
    
    const sumMatch = selectFields.match(/SUM\((\w+)\)(?:\s+AS\s+(\w+))?/i);
    if (sumMatch) {
      const field = sumMatch[1];
      const alias = sumMatch[2] || `sum_${field}`;
      const sum = groupRecords.reduce((acc, r) => acc + (parseFloat(r[field]) || 0), 0);
      resultRow[alias] = sum;
    }
    
    results.push(resultRow);
  });
  
  return results;
}

