/**
 * Data Enrichment Service
 * 
 * Enriches query results with proper names, formatted dates, and descriptive labels
 * Schema-agnostic - works with any database structure
 * 
 * CRITICAL: Automatically fetches names from related tables when IDs are detected
 */

import { DataSourceMetadata } from '../types';

/**
 * Enriches data by:
 * 1. Adding entity names when IDs are present (by JOINing with related tables)
 * 2. Formatting dates/times properly
 * 3. Converting month numbers to month names
 * 4. Adding descriptive labels
 */
export async function enrichQueryResults(
  data: any[],
  metadata: DataSourceMetadata,
  query: string,
  connectionString?: string
): Promise<any[]> {
  if (!data || data.length === 0) return data;

  let enrichedData = [...data];
  const columns = Object.keys(data[0] || {});

  // CRITICAL: Detect ID columns (including UUIDs) and automatically fetch names from related tables
  const idColumns = columns.filter(col => {
    const lowerCol = col.toLowerCase();
    const sampleValue = data[0]?.[col];
    
    // Check column name patterns
    const isIDPattern = lowerCol.endsWith('_id') || lowerCol.endsWith('id') || lowerCol.includes('_id_');
    
    // Check if value looks like an ID (UUID, GUID, long alphanumeric)
    const isUUID = sampleValue && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(sampleValue));
    const looksLikeID = sampleValue && (
      isUUID ||
      (typeof sampleValue === 'string' && sampleValue.length > 10 && /^[0-9a-f-]+$/i.test(sampleValue)) ||
      (typeof sampleValue === 'string' && /^[a-z0-9]{8,}/i.test(sampleValue))
    );
    
    return isIDPattern || looksLikeID;
  });

  // CRITICAL: For each ID column, try to find and fetch names from related tables
  if (idColumns.length > 0 && connectionString) {
    console.log(`[DATA-ENRICHMENT] 🔍 Detected ${idColumns.length} ID columns: ${idColumns.join(', ')}`);
    
    for (const idColumn of idColumns) {
      try {
        // Extract entity name from column (e.g., "studentId" -> "student", "quiz_id" -> "quiz")
        const entityName = idColumn
          .replace(/_id$/i, '')
          .replace(/id$/i, '')
          .replace(/_/g, '')
          .toLowerCase();
        
        // Try to find related table from metadata first
        let relatedTable: any = null;
        let nameColumn: any = null;
        
        if (metadata.tables && metadata.tables.length > 0) {
          relatedTable = metadata.tables.find(table => {
            const tableNameLower = table.name.toLowerCase();
            return tableNameLower === entityName || 
                   tableNameLower === entityName + 's' ||
                   tableNameLower.includes(entityName) ||
                   (entityName.endsWith('s') && tableNameLower === entityName.slice(0, -1));
          });
          
          if (relatedTable) {
            // Find name column in related table
            nameColumn = relatedTable.columns?.find((col: any) => {
              const colNameLower = col.name.toLowerCase();
              return colNameLower.includes('name') || 
                     colNameLower === 'name' ||
                     (colNameLower.includes(entityName) && colNameLower.includes('name'));
            });
          }
        }
        
        // If not found in metadata, try common table name patterns
        if (!relatedTable) {
          const possibleTableNames = [
            entityName,
            entityName + 's',
            entityName.slice(0, -1), // Remove 's' if present
            entityName + 'es',
          ];
          
          // Try to find table by querying INFORMATION_SCHEMA
          for (const possibleTableName of possibleTableNames) {
            try {
              const { executeSQLQuery } = await import('./query-executor');
              // Try to query the table to see if it exists and has a name column
              const testQuery = `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = '${possibleTableName}' AND COLUMN_NAME LIKE '%name%' LIMIT 1`;
              const testResults = await executeSQLQuery(connectionString, testQuery);
              
              if (testResults && testResults.length > 0) {
                relatedTable = { name: possibleTableName };
                nameColumn = { name: testResults[0].COLUMN_NAME };
                console.log(`[DATA-ENRICHMENT] ✅ Discovered table "${possibleTableName}" with name column "${nameColumn.name}"`);
                break;
              }
            } catch {
              continue; // Try next table name
            }
          }
        }
        
        if (relatedTable && nameColumn) {
          console.log(`[DATA-ENRICHMENT] ✅ Found related table "${relatedTable.name}" with name column "${nameColumn.name}"`);
          
          // Get unique IDs from data
          const uniqueIds = Array.from(new Set(data.map(row => row[idColumn]).filter(id => id != null)));
          
          if (uniqueIds.length > 0 && uniqueIds.length <= 1000) { // Limit to prevent huge queries
            // Fetch names from related table
            const nameMapping = await fetchNamesFromTable(
              connectionString,
              relatedTable.name,
              idColumn,
              nameColumn.name,
              uniqueIds
            );
            
            // Add names to enriched data
            enrichedData = enrichedData.map(row => {
              const idValue = row[idColumn];
              if (idValue && nameMapping[String(idValue)]) {
                // Add name column (replace ID column name with name)
                const nameColumnName = idColumn.replace(/_id$/i, '_name').replace(/id$/i, 'Name');
                return {
                  ...row,
                  [nameColumnName]: nameMapping[String(idValue)],
                  // Keep original ID but prioritize name for display
                  [`${idColumn}_name`]: nameMapping[String(idValue)],
                };
              }
              return row;
            });
            
            console.log(`[DATA-ENRICHMENT] ✅ Enriched ${uniqueIds.length} IDs with names from "${relatedTable.name}"`);
          }
        } else {
          console.log(`[DATA-ENRICHMENT] ⚠️ Could not find related table for ID column "${idColumn}"`);
        }
      } catch (error) {
        console.warn(`[DATA-ENRICHMENT] ⚠️ Failed to enrich ID column "${idColumn}":`, error);
        // Continue with other columns
      }
    }
  }

  // Detect date/time columns
  const dateColumns = columns.filter(col => {
    const lowerCol = col.toLowerCase();
    return lowerCol.includes('date') || lowerCol.includes('time') || 
           lowerCol.includes('created') || lowerCol.includes('updated') ||
           lowerCol.includes('year') || lowerCol.includes('month') || lowerCol.includes('day');
  });

  // Detect month number columns
  const monthColumns = columns.filter(col => {
    const lowerCol = col.toLowerCase();
    if (lowerCol.includes('month') && !lowerCol.includes('name')) {
      const sampleValue = data[0]?.[col];
      return typeof sampleValue === 'number' && sampleValue >= 1 && sampleValue <= 12;
    }
    return false;
  });

  // Format dates
  dateColumns.forEach(col => {
    enrichedData.forEach(row => {
      if (row[col]) {
        const formatted = formatDateValue(row[col], col);
        if (formatted !== row[col]) {
          row[`${col}_formatted`] = formatted;
        }
      }
    });
  });

  // Convert month numbers to names
  monthColumns.forEach(col => {
    enrichedData.forEach(row => {
      if (row[col] && typeof row[col] === 'number') {
        const monthName = getMonthName(row[col]);
        row[`${col}_name`] = monthName;
      }
    });
  });

  return enrichedData;
}

/**
 * Fetches names from a related table given IDs
 */
async function fetchNamesFromTable(
  connectionString: string,
  tableName: string,
  idColumnName: string,
  nameColumnName: string,
  ids: any[]
): Promise<Record<string, string>> {
  try {
    // Try different ID column name patterns
    const possibleIdColumns = [
      'id',
      tableName.toLowerCase() + '_id',
      tableName.toLowerCase().replace(/s$/, '') + '_id',
      idColumnName.replace(/^.*_/, ''), // Extract last part after underscore
    ];
    
    let nameMapping: Record<string, string> = {};
    
    // Build query to fetch names
    const { executeSQLQuery } = await import('./query-executor');
    
    // Format IDs for IN clause (handle strings, UUIDs, and numbers)
    const formattedIds = ids.map(id => {
      if (id == null) return null;
      if (typeof id === 'string') {
        return `'${id.replace(/'/g, "''")}'`; // Escape single quotes
      }
      return id;
    }).filter(id => id != null).join(',');
    
    if (!formattedIds) return {};
    
    // Try each possible ID column name
    for (const possibleIdCol of possibleIdColumns) {
      try {
        const fetchQuery = `SELECT \`${possibleIdCol}\`, \`${nameColumnName}\` FROM \`${tableName}\` WHERE \`${possibleIdCol}\` IN (${formattedIds}) LIMIT 1000`;
        
        const results = await executeSQLQuery(connectionString, fetchQuery);
        
        // Build mapping
        results.forEach((row: any) => {
          const id = row[possibleIdCol] || row['id'];
          const name = row[nameColumnName] || row['name'];
          if (id != null && name != null) {
            nameMapping[String(id)] = String(name);
          }
        });
        
        if (Object.keys(nameMapping).length > 0) {
          console.log(`[DATA-ENRICHMENT] ✅ Successfully fetched names using ID column "${possibleIdCol}"`);
          break; // Success, stop trying
        }
      } catch (error) {
        // Try next column name
        continue;
      }
    }
    
    return nameMapping;
  } catch (error) {
    console.warn(`[DATA-ENRICHMENT] Failed to fetch names from ${tableName}:`, error);
    return {};
  }
}

/**
 * Formats date values properly
 */
function formatDateValue(value: any, columnName: string): string {
  if (!value) return value;

  // Check if it's already a formatted date string
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) {
    const date = new Date(value);
    if (!isNaN(date.getTime())) {
      return formatDateReadable(date);
    }
  }

  // Check if it's a date object
  if (value instanceof Date) {
    return formatDateReadable(value);
  }

  // Check if it's a timestamp
  if (typeof value === 'number' && value > 1000000000) {
    const date = new Date(value);
    if (!isNaN(date.getTime())) {
      return formatDateReadable(date);
    }
  }

  return value;
}

/**
 * Formats date to readable format
 */
function formatDateReadable(date: Date): string {
  const months = ['January', 'February', 'March', 'April', 'May', 'June',
                  'July', 'August', 'September', 'October', 'November', 'December'];
  
  const month = months[date.getMonth()];
  const day = date.getDate();
  const year = date.getFullYear();
  
  return `${month} ${day}, ${year}`;
}

/**
 * Converts month number to month name
 */
function getMonthName(monthNumber: number): string {
  const months = ['January', 'February', 'March', 'April', 'May', 'June',
                  'July', 'August', 'September', 'October', 'November', 'December'];
  return months[monthNumber - 1] || `Month ${monthNumber}`;
}

/**
 * Generates descriptive column labels
 */
export function generateColumnLabel(columnName: string, metadata: DataSourceMetadata): string {
  // Try to find column description in metadata
  for (const table of metadata.tables || []) {
    const column = table.columns?.find(c => c.name === columnName);
    if (column?.description) {
      return column.description;
    }
  }

  // Generate label from column name
  let label = columnName
    .replace(/_/g, ' ')
    .replace(/([A-Z])/g, ' $1')
    .trim()
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');

  // Replace common abbreviations
  label = label.replace(/\bId\b/g, 'ID');
  label = label.replace(/\bAvg\b/g, 'Average');
  label = label.replace(/\bCnt\b/g, 'Count');
  label = label.replace(/\bPct\b/g, 'Percentage');
  label = label.replace(/\bNum\b/g, 'Number');

  return label;
}
