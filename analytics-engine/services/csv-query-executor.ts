import * as fs from 'fs/promises';
import { parse } from 'csv-parse';
import { parseDate, extractYear, extractMonth, extractDay, extractDate, getYearMonth, getYear, isDate } from '../utils/date-utils';

/**
 * Maximum number of rows to return from a CSV query (prevents memory exhaustion)
 */
const MAX_RESULT_ROWS = 10000;

/**
 * Executes SQL-like queries on CSV files
 * Supports basic SELECT queries with WHERE, GROUP BY, ORDER BY, LIMIT
 * Enforces maximum result limit to prevent memory exhaustion
 */
export async function executeCSVQuery(
  filePath: string,
  query: string
): Promise<any[]> {
  try {
    // Read CSV file
    const fileContent = await fs.readFile(filePath, 'utf-8');
    
    // Parse CSV using promise-based API
    const records = await new Promise<any[]>((resolve, reject) => {
      parse(fileContent, {
        columns: true,
        skip_empty_lines: true,
        trim: true,
      }, (err, data) => {
        if (err) {
          reject(err);
        } else {
          resolve(data);
        }
      });
    });

    if (records.length === 0) {
      return [];
    }

    // Parse SQL query (basic implementation)
    const upperQuery = query.toUpperCase().trim();
    
    // Extract SELECT clause - handle both SELECT ... FROM and SELECT without FROM
    let selectMatch = query.match(/SELECT\s+(.+?)\s+FROM/i);
    if (!selectMatch) {
      // Try without FROM clause (for simple SELECT statements)
      selectMatch = query.match(/SELECT\s+(.+?)(?:\s+WHERE|\s+ORDER|\s+GROUP|\s+LIMIT|$)/i);
    }
    
    if (!selectMatch) {
      // If no SELECT found, return limited records
      return records.slice(0, Math.min(100, MAX_RESULT_ROWS)); // Limit to 100 for safety
    }

    const selectFields = selectMatch[1].trim();
    const isSelectAll = selectFields === '*' || selectFields.trim() === '*';

    // Extract FROM clause (table name)
    const fromMatch = query.match(/FROM\s+(\w+)/i);
    // We'll use all records regardless of table name for CSV

    // Extract WHERE clause
    let whereClause: string | null = null;
    const whereMatch = query.match(/WHERE\s+(.+?)(?:\s+GROUP|\s+ORDER|\s+LIMIT|$)/i);
    if (whereMatch) {
      whereClause = whereMatch[1].trim();
    }

    // Extract ORDER BY clause - handle aliases and complex expressions
    let orderBy: { field: string; direction: 'ASC' | 'DESC' } | null = null;
    // Match ORDER BY with optional ASC/DESC, handle aliases
    const orderMatch = query.match(/ORDER\s+BY\s+(\w+)(?:\s+(ASC|DESC))?/i);
    if (orderMatch) {
      orderBy = {
        field: orderMatch[1].trim(),
        direction: (orderMatch[2]?.toUpperCase() as 'ASC' | 'DESC') || 'ASC',
      };
    }

    // Extract LIMIT clause and enforce maximum
    let limit: number | null = null;
    const limitMatch = query.match(/LIMIT\s+(\d+)/i);
    if (limitMatch) {
      limit = parseInt(limitMatch[1], 10);
      // Enforce maximum result limit
      if (limit > MAX_RESULT_ROWS) {
        console.warn(`[CSV-QUERY] ⚠️ LIMIT ${limit} exceeds maximum ${MAX_RESULT_ROWS}, enforcing limit`);
        limit = MAX_RESULT_ROWS;
      }
    } else {
      // No LIMIT specified - enforce default maximum
      limit = MAX_RESULT_ROWS;
    }

    // Extract GROUP BY and aggregate functions
    const hasGroupBy = /GROUP\s+BY/i.test(query);
    const hasAggregate = /(COUNT|SUM|AVG|MAX|MIN|AVG)\(/i.test(query);
    
    // Check for date functions in SELECT and GROUP BY
    const hasDateFunction = /(YEAR|MONTH|DAY|DATE|EXTRACT)\(/i.test(query);

    let filteredRecords = records;

    // Apply WHERE clause
    if (whereClause) {
      filteredRecords = applyWhereClause(records, whereClause);
    }

    // Apply GROUP BY and aggregates
    if (hasGroupBy || hasAggregate) {
      let aggregatedResults = applyAggregates(filteredRecords, query, selectFields);
      
      // Apply ORDER BY on aggregated results if specified
      if (orderBy && aggregatedResults.length > 0) {
        // Check if orderBy field exists in results (might be an alias)
        const orderField = orderBy.field.toLowerCase();
        let sortField: string | null = null;
        
        // First, check exact match (case-insensitive)
        const exactMatch = Object.keys(aggregatedResults[0]).find(key => 
          key.toLowerCase() === orderField
        );
        if (exactMatch) {
          sortField = exactMatch;
        } else {
          // Try partial match (for cases like "student_count" matching "count" or vice versa)
          const partialMatch = Object.keys(aggregatedResults[0]).find(key => 
            key.toLowerCase().includes(orderField) || orderField.includes(key.toLowerCase())
          );
          if (partialMatch) {
            sortField = partialMatch;
          } else {
            // Last resort: use first numeric column if ORDER BY field not found
            const numericKeys = Object.keys(aggregatedResults[0]).filter(key => {
              const val = aggregatedResults[0][key];
              return typeof val === 'number' || !isNaN(Number(val));
            });
            if (numericKeys.length > 0) {
              sortField = numericKeys[0];
            } else {
              // Use first available key
              sortField = Object.keys(aggregatedResults[0])[0];
            }
          }
        }
        
        if (sortField) {
          // Sort the results
          aggregatedResults = sortRecords(aggregatedResults, sortField, orderBy.direction);
        }
      }
      
      // Apply LIMIT on aggregated results AFTER sorting (CRITICAL: Must be after ORDER BY)
      if (limit !== null && limit > 0) {
        aggregatedResults = aggregatedResults.slice(0, limit);
      }
      
      return aggregatedResults;
    }

    // Select fields (with date function support)
    let result = filteredRecords;
    if (!isSelectAll) {
      result = selectSpecificFields(filteredRecords, selectFields, hasDateFunction);
    }

    // Apply ORDER BY
    if (orderBy) {
      result = sortRecords(result, orderBy.field, orderBy.direction);
    }

    // Apply LIMIT
    if (limit !== null) {
      result = result.slice(0, limit);
    }

    return result;
  } catch (error) {
    // If query parsing fails, try to return a simple result
    console.error('CSV query parsing error:', error);
    
    // Try to read the file and return first few rows as fallback
    try {
      const fileContent = await fs.readFile(filePath, 'utf-8');
      const records = await new Promise<any[]>((resolve, reject) => {
        parse(fileContent, {
          columns: true,
          skip_empty_lines: true,
          trim: true,
        }, (err, data) => {
          if (err) {
            reject(err);
          } else {
            resolve(data);
          }
        });
      });
      
      // Return first 10 records as fallback
      return records.slice(0, 10);
    } catch (fallbackError) {
      throw new Error(`CSV query execution failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

function applyWhereClause(records: any[], whereClause: string): any[] {
  // Simple WHERE clause parser (supports basic comparisons)
  return records.filter((record) => {
    try {
      // Handle common WHERE patterns
      // Split by AND/OR but preserve them
      const andParts = whereClause.split(/\s+AND\s+/i);
      const orParts = whereClause.split(/\s+OR\s+/i);
      
      // If contains OR, handle OR logic
      if (orParts.length > 1) {
        return orParts.some(part => evaluateCondition(record, part.trim()));
      }
      
      // Handle AND logic
      return andParts.every(part => evaluateCondition(record, part.trim()));
    } catch {
      return true; // If parsing fails, include the record
    }
  });
}

function evaluateCondition(record: any, condition: string): boolean {
  const trimmed = condition.trim();
  
  // Handle = comparisons
  if (trimmed.includes('=') && !trimmed.includes('!=') && !trimmed.includes('<>')) {
    const [field, value] = trimmed.split('=').map(s => s.trim());
    const cleanValue = value.replace(/['"]/g, '');
    return String(record[field]).toLowerCase() === cleanValue.toLowerCase();
  }
  // Handle != or <> comparisons
  else if (trimmed.includes('!=') || trimmed.includes('<>')) {
    const [field, value] = trimmed.split(/!=|<>/).map(s => s.trim());
    const cleanValue = value.replace(/['"]/g, '');
    return String(record[field]).toLowerCase() !== cleanValue.toLowerCase();
  }
  // Handle > comparisons
  else if (trimmed.includes('>') && !trimmed.includes('>=')) {
    const [field, value] = trimmed.split('>').map(s => s.trim());
    const numValue = parseFloat(value);
    const fieldValue = parseFloat(record[field]);
    return !isNaN(fieldValue) && !isNaN(numValue) && fieldValue > numValue;
  }
  // Handle >= comparisons
  else if (trimmed.includes('>=')) {
    const [field, value] = trimmed.split('>=').map(s => s.trim());
    const numValue = parseFloat(value);
    const fieldValue = parseFloat(record[field]);
    return !isNaN(fieldValue) && !isNaN(numValue) && fieldValue >= numValue;
  }
  // Handle < comparisons
  else if (trimmed.includes('<') && !trimmed.includes('<=')) {
    const [field, value] = trimmed.split('<').map(s => s.trim());
    const numValue = parseFloat(value);
    const fieldValue = parseFloat(record[field]);
    return !isNaN(fieldValue) && !isNaN(numValue) && fieldValue < numValue;
  }
  // Handle <= comparisons
  else if (trimmed.includes('<=')) {
    const [field, value] = trimmed.split('<=').map(s => s.trim());
    const numValue = parseFloat(value);
    const fieldValue = parseFloat(record[field]);
    return !isNaN(fieldValue) && !isNaN(numValue) && fieldValue <= numValue;
  }
  // Handle IS NOT NULL
  else if (trimmed.includes('IS NOT NULL')) {
    const field = trimmed.replace('IS NOT NULL', '').trim();
    return record[field] !== null && record[field] !== undefined && record[field] !== '';
  }
  // Handle IS NULL
  else if (trimmed.includes('IS NULL')) {
    const field = trimmed.replace('IS NULL', '').trim();
    return record[field] === null || record[field] === undefined || record[field] === '';
  }
  
  // Default: if we can't parse, return true (include the record)
  return true;
}

function selectSpecificFields(records: any[], selectFields: string, hasDateFunction: boolean = false): any[] {
  const fields = selectFields.split(',').map(f => f.trim());
  return records.map(record => {
    const result: any = {};
    fields.forEach(field => {
      // Handle date functions: YEAR(column), MONTH(column), DAY(column), DATE(column)
      const yearMatch = field.match(/YEAR\((\w+)\)(?:\s+AS\s+(\w+))?/i);
      if (yearMatch) {
        const column = yearMatch[1];
        const alias = yearMatch[2] || `year_${column}`;
        const year = extractYear(record[column]);
        result[alias] = year;
        return;
      }
      
      const monthMatch = field.match(/MONTH\((\w+)\)(?:\s+AS\s+(\w+))?/i);
      if (monthMatch) {
        const column = monthMatch[1];
        const alias = monthMatch[2] || `month_${column}`;
        const month = extractMonth(record[column]);
        result[alias] = month;
        return;
      }
      
      const dayMatch = field.match(/DAY\((\w+)\)(?:\s+AS\s+(\w+))?/i);
      if (dayMatch) {
        const column = dayMatch[1];
        const alias = dayMatch[2] || `day_${column}`;
        const day = extractDay(record[column]);
        result[alias] = day;
        return;
      }
      
      const dateMatch = field.match(/DATE\((\w+)\)(?:\s+AS\s+(\w+))?/i);
      if (dateMatch) {
        const column = dateMatch[1];
        const alias = dateMatch[2] || `date_${column}`;
        const date = extractDate(record[column]);
        result[alias] = date;
        return;
      }
      
      // Handle aliases (field AS alias)
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

function sortRecords(records: any[], field: string, direction: 'ASC' | 'DESC'): any[] {
  return [...records].sort((a, b) => {
    const aVal = a[field];
    const bVal = b[field];
    
    // Try date comparison first
    const aDate = parseDate(aVal);
    const bDate = parseDate(bVal);
    
    if (aDate && bDate) {
      const diff = aDate.getTime() - bDate.getTime();
      return direction === 'ASC' ? diff : -diff;
    }
    
    // Try numeric comparison
    const aNum = parseFloat(aVal);
    const bNum = parseFloat(bVal);
    
    if (!isNaN(aNum) && !isNaN(bNum)) {
      return direction === 'ASC' ? aNum - bNum : bNum - aNum;
    }
    
    // String comparison
    const aStr = String(aVal || '').toLowerCase();
    const bStr = String(bVal || '').toLowerCase();
    
    if (direction === 'ASC') {
      return aStr.localeCompare(bStr);
    } else {
      return bStr.localeCompare(aStr);
    }
  });
}

function applyAggregates(records: any[], query: string, selectFields: string): any[] {
  // Debug: log the query being executed
  console.log('[DEBUG GROUP BY] Executing query:', query);
  
  // Check if there's a GROUP BY clause - handle date functions too
  // Match GROUP BY with multiple fields separated by commas (e.g., GROUP BY MONTH(date_col), YEAR(date_col))
  const groupByMatch = query.match(/GROUP\s+BY\s+((?:(?:YEAR|MONTH|DAY|DATE)\([\w_]+\)|[\w_]+)(?:\s*,\s*(?:(?:YEAR|MONTH|DAY|DATE)\([\w_]+\)|[\w_]+))*)/i);
  const hasGroupBy = !!groupByMatch;
  const groupByField = groupByMatch ? groupByMatch[1].trim() : null;

  // If no GROUP BY, handle single aggregate result
  if (!hasGroupBy) {
    // Handle COUNT(*)
    if (selectFields.includes('COUNT(*)')) {
      return [{ 'count': records.length }];
    }

    // Handle AVG(field) with alias
    const avgMatch = selectFields.match(/AVG\((\w+)\)(?:\s+AS\s+(\w+))?/i);
    if (avgMatch) {
      const field = avgMatch[1];
      const alias = avgMatch[2] || `avg_${field}`;
      const values = records.map(r => parseFloat(r[field])).filter(v => !isNaN(v));
      const avg = values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : 0;
      return [{ [alias]: parseFloat(avg.toFixed(2)) }];
    }

    // Handle SUM(field) with alias
    const sumMatch = selectFields.match(/SUM\((\w+)\)(?:\s+AS\s+(\w+))?/i);
    if (sumMatch) {
      const field = sumMatch[1];
      const alias = sumMatch[2] || `sum_${field}`;
      const sum = records.reduce((acc, r) => acc + (parseFloat(r[field]) || 0), 0);
      return [{ [alias]: sum }];
    }

    // Handle MAX(field) with alias
    const maxMatch = selectFields.match(/MAX\((\w+)\)(?:\s+AS\s+(\w+))?/i);
    if (maxMatch) {
      const field = maxMatch[1];
      const alias = maxMatch[2] || `max_${field}`;
      const values = records.map(r => parseFloat(r[field])).filter(v => !isNaN(v));
      const max = values.length > 0 ? Math.max(...values) : 0;
      return [{ [alias]: max }];
    }

    // Handle MIN(field) with alias
    const minMatch = selectFields.match(/MIN\((\w+)\)(?:\s+AS\s+(\w+))?/i);
    if (minMatch) {
      const field = minMatch[1];
      const alias = minMatch[2] || `min_${field}`;
      const values = records.map(r => parseFloat(r[field])).filter(v => !isNaN(v));
      const min = values.length > 0 ? Math.min(...values) : 0;
      return [{ [alias]: min }];
    }

    // Handle COUNT(field) with alias
    const countMatch = selectFields.match(/COUNT\((\w+)\)(?:\s+AS\s+(\w+))?/i);
    if (countMatch) {
      const field = countMatch[1];
      const alias = countMatch[2] || `count_${field}`;
      const count = records.filter(r => r[field] !== null && r[field] !== undefined && r[field] !== '').length;
      return [{ [alias]: count }];
    }

    // Default: return records as-is
    return records;
  }

  // Handle GROUP BY - group records by the specified field
  // Check if GROUP BY uses a date function
  // Handle multiple GROUP BY fields (e.g., "MONTH(date_col), YEAR(date_col)")
  const groupByFields = groupByField!.split(',').map(f => f.trim());
  
  // Check each field for date functions - fix the matching logic
  let yearMatch: RegExpMatchArray | null = null;
  let monthMatch: RegExpMatchArray | null = null;
  let dayMatch: RegExpMatchArray | null = null;
  let dateMatch: RegExpMatchArray | null = null;
  
  for (const field of groupByFields) {
    const trimmedField = field.trim();
    if (!yearMatch) {
      const match = trimmedField.match(/YEAR\((\w+)\)/i);
      if (match) yearMatch = match;
    }
    if (!monthMatch) {
      const match = trimmedField.match(/MONTH\((\w+)\)/i);
      if (match) monthMatch = match;
    }
    if (!dayMatch) {
      const match = trimmedField.match(/DAY\((\w+)\)/i);
      if (match) dayMatch = match;
    }
    if (!dateMatch) {
      const match = trimmedField.match(/DATE\((\w+)\)/i);
      if (match) dateMatch = match;
    }
  }
  
  // Debug: log what we found
  console.log('[DEBUG GROUP BY] Fields:', groupByFields);
  console.log('[DEBUG GROUP BY] Matches:', { 
    year: yearMatch ? yearMatch[1] : null, 
    month: monthMatch ? monthMatch[1] : null,
    day: dayMatch ? dayMatch[1] : null,
    date: dateMatch ? dateMatch[1] : null
  });
  
  const groups: { [key: string]: any[] } = {};
  let debugCount = 0;
  records.forEach(record => {
    // Build composite group key for multiple GROUP BY fields
    const groupKeyParts: string[] = [];
    
    if (yearMatch) {
      // GROUP BY YEAR(column)
      const column = yearMatch[1];
      // Try exact match first, then case-insensitive match
      let dateValue = record[column];
      if (dateValue === undefined || dateValue === null) {
        // Try case-insensitive match
        const matchingKey = Object.keys(record).find(k => k.toLowerCase() === column.toLowerCase());
        if (matchingKey) {
          dateValue = record[matchingKey];
        }
      }
      const year = extractYear(dateValue);
      groupKeyParts.push(`YEAR:${year !== null ? String(year) : 'NULL'}`);
    }
    
    if (monthMatch) {
      // GROUP BY MONTH(column)
      const column = monthMatch[1];
      // Try exact match first, then case-insensitive match
      let dateValue = record[column];
      if (dateValue === undefined || dateValue === null) {
        // Try case-insensitive match
        const matchingKey = Object.keys(record).find(k => k.toLowerCase() === column.toLowerCase());
        if (matchingKey) {
          dateValue = record[matchingKey];
        }
      }
      const month = extractMonth(dateValue);
      groupKeyParts.push(`MONTH:${month !== null ? String(month).padStart(2, '0') : 'NULL'}`);
    }
    
    if (dayMatch) {
      // GROUP BY DAY(column)
      const column = dayMatch[1];
      // Try exact match first, then case-insensitive match
      let dateValue = record[column];
      if (dateValue === undefined || dateValue === null) {
        const matchingKey = Object.keys(record).find(k => k.toLowerCase() === column.toLowerCase());
        if (matchingKey) {
          dateValue = record[matchingKey];
        }
      }
      const day = extractDay(dateValue);
      groupKeyParts.push(`DAY:${day !== null ? String(day).padStart(2, '0') : 'NULL'}`);
    }
    
    if (dateMatch) {
      // GROUP BY DATE(column)
      const column = dateMatch[1];
      // Try exact match first, then case-insensitive match
      let dateValue = record[column];
      if (dateValue === undefined || dateValue === null) {
        const matchingKey = Object.keys(record).find(k => k.toLowerCase() === column.toLowerCase());
        if (matchingKey) {
          dateValue = record[matchingKey];
        }
      }
      const date = extractDate(dateValue);
      groupKeyParts.push(`DATE:${date || 'NULL'}`);
    }
    
    // Handle regular (non-date-function) GROUP BY fields
    groupByFields.forEach(field => {
      if (!/(YEAR|MONTH|DAY|DATE)\(/i.test(field)) {
        const fieldValue = record[field];
        if (isDate(fieldValue)) {
          const yearMonth = getYearMonth(fieldValue);
          groupKeyParts.push(`${field}:${yearMonth || String(fieldValue || 'NULL')}`);
        } else {
          groupKeyParts.push(`${field}:${String(fieldValue || 'NULL')}`);
        }
      }
    });
    
    // Create composite group key
    let groupKey: string;
    if (groupKeyParts.length > 0) {
      groupKey = groupKeyParts.join('|');
    } else if (!yearMatch && !monthMatch && !dayMatch && !dateMatch && groupByFields.length === 1) {
      // Fallback for single non-date GROUP BY field
      const fieldValue = record[groupByFields[0]];
      if (isDate(fieldValue)) {
        // For date fields, group by year-month for time series
        const yearMonth = getYearMonth(fieldValue);
        groupKey = yearMonth || String(fieldValue || 'NULL');
      } else {
        groupKey = String(fieldValue || 'NULL');
      }
    } else {
      // If no date functions matched but we have GROUP BY fields, use them directly
      groupKey = groupByFields.map(field => {
        const fieldValue = record[field] || 'NULL';
        return String(fieldValue);
      }).join('|');
    }
    
    if (!groups[groupKey]) {
      groups[groupKey] = [];
    }
    groups[groupKey].push(record);
    
    // Debug: log first few records to see what's happening
    if (debugCount < 5) {
      const dateCol = yearMatch?.[1] || monthMatch?.[1] || dayMatch?.[1] || dateMatch?.[1] || 'N/A';
      // Get actual date value with case-insensitive matching
      let actualDateValue = record[dateCol];
      if ((actualDateValue === undefined || actualDateValue === null) && dateCol !== 'N/A') {
        const matchingKey = Object.keys(record).find(k => k.toLowerCase() === dateCol.toLowerCase());
        if (matchingKey) {
          actualDateValue = record[matchingKey];
        }
      }
      console.log(`[DEBUG GROUP] Record ${debugCount}:`, {
        dateColumn: dateCol,
        dateValue: actualDateValue,
        rawValue: String(actualDateValue || 'NULL'),
        year: yearMatch ? extractYear(actualDateValue) : null,
        month: monthMatch ? extractMonth(actualDateValue) : null,
        day: dayMatch ? extractDay(actualDateValue) : null,
        date: dateMatch ? extractDate(actualDateValue) : null,
        groupKey,
        groupKeyParts
      });
      debugCount++;
    }
  });
  
  // Debug: log group summary
  console.log(`[DEBUG GROUP] Total records: ${records.length}`);
  console.log(`[DEBUG GROUP] Total groups created: ${Object.keys(groups).length}`);
  
  // Debug: Show unique date values found (for DATE() queries)
  if (dateMatch) {
    const dateColumn = dateMatch[1];
    const uniqueDates = new Set<string>();
    records.forEach(record => {
      let dateValue = record[dateColumn];
      if (dateValue === undefined || dateValue === null) {
        const matchingKey = Object.keys(record).find(k => k.toLowerCase() === dateColumn.toLowerCase());
        if (matchingKey) {
          dateValue = record[matchingKey];
        }
      }
      const extractedDate = extractDate(dateValue);
      if (extractedDate) {
        uniqueDates.add(extractedDate);
      }
    });
    console.log(`[DEBUG GROUP] Unique dates found in data: ${uniqueDates.size}`, Array.from(uniqueDates).slice(0, 10));
    if (uniqueDates.size === 1) {
      console.log(`[DEBUG GROUP] ⚠️ All records have the same date: ${Array.from(uniqueDates)[0]}`);
    }
  }
  
  if (Object.keys(groups).length <= 20) {
    console.log(`[DEBUG GROUP] All group keys:`, Object.keys(groups));
    Object.keys(groups).forEach(key => {
      console.log(`[DEBUG GROUP]   ${key}: ${groups[key].length} records`);
    });
  } else {
    console.log(`[DEBUG GROUP] First 10 group keys:`, Object.keys(groups).slice(0, 10));
  }
  
  // WARNING: If time-series query returns only 1 group, provide helpful guidance
  const isTimeSeriesQuery = yearMatch || monthMatch || dayMatch || dateMatch;
  if (isTimeSeriesQuery && Object.keys(groups).length === 1 && records.length > 10) {
    if (dateMatch || dayMatch) {
      // Already using most granular date function - data has no date variation
      console.warn(`[WARNING] Time-series query using DATE()/DAY() returned only 1 group. All ${records.length} records have the same date. The query is correct, but the data has no date variation. Consider grouping by a different dimension (e.g., category, state, department) or using a different date column if available.`);
    } else if (monthMatch) {
      console.warn(`[WARNING] Time-series query returned only 1 group. All records appear to be in the same month. Consider using DATE() for day-level breakdown to show daily trends.`);
    } else if (yearMatch) {
      console.warn(`[WARNING] Time-series query returned only 1 group. All records appear to be in the same year. Consider using MONTH() or DATE() for more granular breakdown.`);
    }
  }

  // Process each group
  const results: any[] = [];
  
  // Sort groups properly for date-based queries
  const sortedGroupKeys = Object.keys(groups).sort((a, b) => {
    // For composite keys like "YEAR:2024|MONTH:01", sort by year first, then month
    if (a.includes('|') && b.includes('|')) {
      const aParts = a.split('|');
      const bParts = b.split('|');
      const aYear = parseInt(aParts.find(p => p.startsWith('YEAR:'))?.split(':')[1] || '0');
      const bYear = parseInt(bParts.find(p => p.startsWith('YEAR:'))?.split(':')[1] || '0');
      if (aYear !== bYear) return aYear - bYear;
      const aMonth = parseInt(aParts.find(p => p.startsWith('MONTH:'))?.split(':')[1] || '0');
      const bMonth = parseInt(bParts.find(p => p.startsWith('MONTH:'))?.split(':')[1] || '0');
      return aMonth - bMonth;
    }
    // For DATE keys like "DATE:2025-11-13", parse and sort chronologically
    if (a.startsWith('DATE:') && b.startsWith('DATE:')) {
      const aDateStr = a.replace('DATE:', '');
      const bDateStr = b.replace('DATE:', '');
      const aDate = parseDate(aDateStr);
      const bDate = parseDate(bDateStr);
      if (aDate && bDate) {
        return aDate.getTime() - bDate.getTime();
      }
      return aDateStr.localeCompare(bDateStr);
    }
    // For DAY keys like "DAY:13", sort numerically
    if (a.startsWith('DAY:') && b.startsWith('DAY:')) {
      const aDay = parseInt(a.replace('DAY:', '')) || 0;
      const bDay = parseInt(b.replace('DAY:', '')) || 0;
      return aDay - bDay;
    }
    return a.localeCompare(b);
  });
  
  sortedGroupKeys.forEach(groupKey => {
    const groupRecords = groups[groupKey];
    
    // Determine the actual group by field names (handle date functions and multiple fields)
    // IMPORTANT: Use aliases from SELECT clause, not GROUP BY clause
    const resultRow: any = {};
    
    // Extract aliases from SELECT clause for date functions
    const selectYearMatch = selectFields.match(/YEAR\((\w+)\)(?:\s+AS\s+(\w+))?/i);
    const selectMonthMatch = selectFields.match(/MONTH\((\w+)\)(?:\s+AS\s+(\w+))?/i);
    const selectDayMatch = selectFields.match(/DAY\((\w+)\)(?:\s+AS\s+(\w+))?/i);
    const selectDateMatch = selectFields.match(/DATE\((\w+)\)(?:\s+AS\s+(\w+))?/i);
    
    // Add all GROUP BY fields to result row using SELECT aliases
    if (yearMatch) {
      const yearCol = yearMatch[1];
      const year = extractYear(groupRecords[0]?.[yearCol]);
      // Use alias from SELECT if available, otherwise use default
      const alias = selectYearMatch?.[2] || `year_${yearCol}`;
      resultRow[alias] = year !== null ? year : null;
    }
    if (monthMatch) {
      const monthCol = monthMatch[1];
      const month = extractMonth(groupRecords[0]?.[monthCol]);
      const alias = selectMonthMatch?.[2] || `month_${monthCol}`;
      resultRow[alias] = month !== null ? month : null;
    }
    if (dayMatch) {
      const dayCol = dayMatch[1];
      const day = extractDay(groupRecords[0]?.[dayCol]);
      const alias = selectDayMatch?.[2] || `day_${dayCol}`;
      resultRow[alias] = day !== null ? day : null;
    }
    if (dateMatch) {
      const dateCol = dateMatch[1];
      const date = extractDate(groupRecords[0]?.[dateCol]);
      const alias = selectDateMatch?.[2] || `date_${dateCol}`;
      resultRow[alias] = date || null;
    }
    
    // Add regular GROUP BY fields (use SELECT aliases if available)
    groupByFields.forEach(field => {
      if (!/(YEAR|MONTH|DAY|DATE)\(/i.test(field)) {
        // Check if SELECT has an alias for this field
        const aliasMatch = selectFields.match(new RegExp(`${field}\\s+AS\\s+(\\w+)`, 'i'));
        const fieldName = aliasMatch ? aliasMatch[1] : field;
        resultRow[fieldName] = groupRecords[0]?.[field] || null;
      }
    });

    // Extract all aggregate functions from selectFields
    const fieldParts = selectFields.split(',').map(f => f.trim());
    
    fieldParts.forEach(fieldPart => {
      // Skip GROUP BY fields (check if fieldPart matches any GROUP BY field)
      const isGroupByField = groupByFields.some(gbf => {
        const cleanGbf = gbf.trim();
        const cleanFieldPart = fieldPart.trim();
        return cleanFieldPart === cleanGbf || 
               cleanFieldPart.includes(cleanGbf) ||
               (yearMatch && cleanFieldPart.includes(`YEAR(${yearMatch[1]})`)) ||
               (monthMatch && cleanFieldPart.includes(`MONTH(${monthMatch[1]})`)) ||
               (dayMatch && cleanFieldPart.includes(`DAY(${dayMatch[1]})`)) ||
               (dateMatch && cleanFieldPart.includes(`DATE(${dateMatch[1]})`));
      });
      
      if (isGroupByField) {
        return;
      }

      // Handle COUNT(*)
      if (fieldPart.includes('COUNT(*)')) {
        const aliasMatch = fieldPart.match(/COUNT\(\*\)(?:\s+AS\s+(\w+))?/i);
        const alias = aliasMatch && aliasMatch[1] ? aliasMatch[1] : 'count';
        resultRow[alias] = groupRecords.length;
        return;
      }

      // Handle COUNT(field)
      const countMatch = fieldPart.match(/COUNT\((\w+)\)(?:\s+AS\s+(\w+))?/i);
      if (countMatch) {
        const field = countMatch[1];
        const alias = countMatch[2] || `count_${field}`;
        resultRow[alias] = groupRecords.filter(r => r[field] !== null && r[field] !== undefined && r[field] !== '').length;
        return;
      }

      // Handle AVG(field)
      const avgMatch = fieldPart.match(/AVG\((\w+)\)(?:\s+AS\s+(\w+))?/i);
      if (avgMatch) {
        const field = avgMatch[1];
        const alias = avgMatch[2] || `avg_${field}`;
        const values = groupRecords.map(r => parseFloat(r[field])).filter(v => !isNaN(v));
        const avg = values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : 0;
        resultRow[alias] = parseFloat(avg.toFixed(2));
        return;
      }

      // Handle SUM(field)
      const sumMatch = fieldPart.match(/SUM\((\w+)\)(?:\s+AS\s+(\w+))?/i);
      if (sumMatch) {
        const field = sumMatch[1];
        const alias = sumMatch[2] || `sum_${field}`;
        const sum = groupRecords.reduce((acc, r) => acc + (parseFloat(r[field]) || 0), 0);
        resultRow[alias] = sum;
        return;
      }

      // Handle MAX(field)
      const maxMatch = fieldPart.match(/MAX\((\w+)\)(?:\s+AS\s+(\w+))?/i);
      if (maxMatch) {
        const field = maxMatch[1];
        const alias = maxMatch[2] || `max_${field}`;
        const values = groupRecords.map(r => parseFloat(r[field])).filter(v => !isNaN(v));
        const max = values.length > 0 ? Math.max(...values) : 0;
        resultRow[alias] = max;
        return;
      }

      // Handle MIN(field)
      const minMatch = fieldPart.match(/MIN\((\w+)\)(?:\s+AS\s+(\w+))?/i);
      if (minMatch) {
        const field = minMatch[1];
        const alias = minMatch[2] || `min_${field}`;
        const values = groupRecords.map(r => parseFloat(r[field])).filter(v => !isNaN(v));
        const min = values.length > 0 ? Math.min(...values) : 0;
        resultRow[alias] = min;
        return;
      }

      // If it's just a field name (non-aggregate), use the first value
      if (!fieldPart.includes('(') && !fieldPart.includes(')')) {
        const fieldName = fieldPart.split(/\s+AS\s+/i)[0].trim();
        if (groupRecords.length > 0 && groupRecords[0][fieldName] !== undefined) {
          const aliasMatch = fieldPart.match(/\s+AS\s+(\w+)/i);
          const alias = aliasMatch ? aliasMatch[1] : fieldName;
          resultRow[alias] = groupRecords[0][fieldName];
        }
      }
    });

    results.push(resultRow);
  });

  return results;
}

