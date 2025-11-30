import * as fs from 'fs/promises';
import { parse } from 'csv-parse';

/**
 * Executes SQL-like queries on CSV files
 * Supports basic SELECT queries with WHERE, GROUP BY, ORDER BY, LIMIT
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
      // If no SELECT found, return all records
      return records.slice(0, 100); // Limit to 100 for safety
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

    // Extract LIMIT clause
    let limit: number | null = null;
    const limitMatch = query.match(/LIMIT\s+(\d+)/i);
    if (limitMatch) {
      limit = parseInt(limitMatch[1], 10);
    }

    // Extract GROUP BY and aggregate functions
    const hasGroupBy = /GROUP\s+BY/i.test(query);
    const hasAggregate = /(COUNT|SUM|AVG|MAX|MIN|AVG)\(/i.test(query);

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

    // Select fields
    let result = filteredRecords;
    if (!isSelectAll) {
      result = selectSpecificFields(filteredRecords, selectFields);
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

function selectSpecificFields(records: any[], selectFields: string): any[] {
  const fields = selectFields.split(',').map(f => f.trim());
  return records.map(record => {
    const result: any = {};
    fields.forEach(field => {
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
    
    // Try numeric comparison first
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
  // Check if there's a GROUP BY clause
  const groupByMatch = query.match(/GROUP\s+BY\s+(\w+)/i);
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
  const groups: { [key: string]: any[] } = {};
  records.forEach(record => {
    const groupKey = String(record[groupByField!] || 'NULL');
    if (!groups[groupKey]) {
      groups[groupKey] = [];
    }
    groups[groupKey].push(record);
  });

  // Process each group
  const results: any[] = [];
  Object.keys(groups).forEach(groupKey => {
    const groupRecords = groups[groupKey];
    const resultRow: any = { [groupByField!]: groupKey === 'NULL' ? null : groupKey };

    // Extract all aggregate functions from selectFields
    const fieldParts = selectFields.split(',').map(f => f.trim());
    
    fieldParts.forEach(fieldPart => {
      // Skip the GROUP BY field itself
      if (fieldPart === groupByField) {
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

