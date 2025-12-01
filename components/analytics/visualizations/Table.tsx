'use client';

import { parseDate, formatDate, formatDateReadable } from '@/analytics-engine/utils/date-utils';

interface TableProps {
  data: any[];
  title?: string;
}

/**
 * Formats column name to be human-readable
 */
function formatColumnName(columnName: string): string {
  // Replace underscores with spaces
  let formatted = columnName.replace(/_/g, ' ');
  
  // Capitalize first letter of each word
  formatted = formatted.split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
  
  // Handle common abbreviations
  formatted = formatted.replace(/\bId\b/g, 'ID');
  formatted = formatted.replace(/\bAvg\b/g, 'Average');
  formatted = formatted.replace(/\bCnt\b/g, 'Count');
  
  return formatted;
}

/**
 * Formats a value for display
 */
function formatValue(value: any, columnName: string): string {
  if (value === null || value === undefined || value === '') {
    return '—';
  }
  
  // Check if it's a date
  const date = parseDate(value);
  if (date) {
    // Format dates nicely
    return formatDateReadable(date) || formatDate(date) || String(value);
  }
  
  // Check if it's a number
  if (typeof value === 'number' || !isNaN(parseFloat(value))) {
    const num = typeof value === 'number' ? value : parseFloat(value);
    // Format numbers with appropriate decimal places
    if (num % 1 === 0) {
      return num.toLocaleString();
    } else {
      return num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }
  }
  
  return String(value);
}

/**
 * Checks if a column contains dates
 */
function isDateColumn(data: any[], columnName: string): boolean {
  if (!data || data.length === 0) return false;
  const sampleValues = data.slice(0, 10).map(row => row[columnName]).filter(v => v != null && v !== '');
  if (sampleValues.length === 0) return false;
  
  return sampleValues.some(val => {
    const date = parseDate(val);
    return date !== null;
  });
}

/**
 * Checks if a column is numeric
 */
function isNumericColumn(data: any[], columnName: string): boolean {
  if (!data || data.length === 0) return false;
  const sampleValues = data.slice(0, 10).map(row => row[columnName]).filter(v => v != null && v !== '');
  if (sampleValues.length === 0) return false;
  
  return sampleValues.every(val => {
    return typeof val === 'number' || !isNaN(parseFloat(val));
  });
}

export default function Table({ data, title }: TableProps) {
  if (!data || data.length === 0) {
    return (
      <div className="w-full min-h-[400px] flex items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100 rounded-lg border border-gray-200">
        <div className="text-center">
          <p className="text-gray-400 text-lg">No data to display</p>
        </div>
      </div>
    );
  }

  const columns = Object.keys(data[0]);
  
  // Calculate statistics for numeric columns
  const stats: Record<string, { total?: number; avg?: number; count: number }> = {};
  columns.forEach(col => {
    const isNumeric = isNumericColumn(data, col);
    if (isNumeric) {
      const values = data.map(row => {
        const val = row[col];
        return typeof val === 'number' ? val : parseFloat(val) || 0;
      }).filter(v => !isNaN(v) && v !== 0);
      
      if (values.length > 0) {
        const total = values.reduce((sum, v) => sum + v, 0);
        const avg = total / values.length;
        stats[col] = {
          total,
          avg,
          count: values.length
        };
      }
    } else {
      stats[col] = { count: data.length };
    }
  });

  return (
    <div className="w-full bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden">
      {title && (
        <div className="px-6 py-4 bg-gradient-to-r from-blue-50 to-indigo-50 border-b border-gray-200">
          <h4 className="text-xl font-bold text-gray-800 mb-3">{title}</h4>
          {Object.keys(stats).length > 0 && (
            <div className="flex flex-wrap gap-4 text-sm">
              {Object.entries(stats).map(([col, stat]) => {
                const isNumeric = stat.total !== undefined;
                return (
                  <div key={col} className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-lg shadow-sm border border-gray-100">
                    <span className="text-gray-600 font-medium">{formatColumnName(col)}:</span>
                    {isNumeric && stat.total !== undefined && (
                      <>
                        <span className="font-bold text-green-600">Total: {stat.total.toLocaleString()}</span>
                        {stat.avg !== undefined && (
                          <span className="text-gray-500">|</span>
                        )}
                      </>
                    )}
                    {stat.avg !== undefined && (
                      <span className="font-semibold text-blue-600">Avg: {stat.avg.toFixed(2)}</span>
                    )}
                    {!isNumeric && (
                      <span className="font-semibold text-gray-700">Count: {stat.count}</span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
      <div className="overflow-x-auto max-h-[600px]">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gradient-to-r from-blue-600 to-indigo-600 sticky top-0 z-10">
            <tr>
              {columns.map((col, idx) => {
                const isNumeric = isNumericColumn(data, col);
                const isDate = isDateColumn(data, col);
                return (
                  <th
                    key={col}
                    className={`px-6 py-4 text-left text-xs font-bold text-white uppercase tracking-wider ${
                      isNumeric ? 'text-right' : ''
                    } ${
                      idx === 0 ? 'pl-6' : ''
                    } ${
                      idx === columns.length - 1 ? 'pr-6' : ''
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      {isDate && (
                        <span className="text-blue-200">📅</span>
                      )}
                      {isNumeric && (
                        <span className="text-blue-200">🔢</span>
                      )}
                      <span>{formatColumnName(col)}</span>
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {data.slice(0, 100).map((row, idx) => (
              <tr 
                key={idx} 
                className="hover:bg-blue-50 transition-colors duration-150"
              >
                {columns.map((col) => {
                  const val = row[col];
                  const isNumeric = isNumericColumn(data, col);
                  const isDate = isDateColumn(data, col);
                  const formattedValue = formatValue(val, col);
                  
                  return (
                    <td
                      key={col}
                      className={`px-6 py-4 text-sm ${
                        isNumeric ? 'text-right font-medium text-gray-800' : 'text-left text-gray-700'
                      } ${
                        isDate ? 'font-mono' : ''
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        {formattedValue}
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {data.length > 100 && (
        <div className="px-6 py-3 bg-gray-50 border-t border-gray-200 text-sm text-gray-600 text-center">
          Showing 100 of {data.length} rows
        </div>
      )}
      {data.length <= 100 && data.length > 0 && (
        <div className="px-6 py-3 bg-gray-50 border-t border-gray-200 text-sm text-gray-600 text-center">
          Showing all {data.length} {data.length === 1 ? 'row' : 'rows'}
        </div>
      )}
    </div>
  );
}
