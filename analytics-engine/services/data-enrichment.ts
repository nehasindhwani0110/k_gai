/**
 * Data Enrichment Service
 * 
 * Enriches query results with proper names, formatted dates, and descriptive labels
 * Schema-agnostic - works with any database structure
 */

import { DataSourceMetadata } from '../types';

/**
 * Enriches data by:
 * 1. Adding entity names when IDs are present
 * 2. Formatting dates/times properly
 * 3. Converting month numbers to month names
 * 4. Adding descriptive labels
 */
export async function enrichQueryResults(
  data: any[],
  metadata: DataSourceMetadata,
  query: string
): Promise<any[]> {
  if (!data || data.length === 0) return data;

  const enrichedData = [...data];
  const columns = Object.keys(data[0] || {});

  // Detect ID columns and try to find corresponding name columns
  const idColumns = columns.filter(col => {
    const lowerCol = col.toLowerCase();
    return lowerCol.endsWith('_id') || lowerCol.endsWith('id') || lowerCol.includes('_id_');
  });

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

