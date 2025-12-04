'use client';

import { useState } from 'react';
import { parseDate, formatDate, formatDateReadable } from '@/analytics-engine/utils/date-utils';

interface TableProps {
  data: any[];
  title?: string;
}

const ROWS_PER_PAGE = 5;

function formatColumnName(columnName: string): string {
  let formatted = columnName.replace(/_/g, ' ');
  formatted = formatted.split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
  formatted = formatted.replace(/\bId\b/g, 'ID');
  formatted = formatted.replace(/\bAvg\b/g, 'Average');
  formatted = formatted.replace(/\bCnt\b/g, 'Count');
  return formatted;
}

function formatValue(value: any, columnName: string): string {
  if (value === null || value === undefined || value === '') {
    return '—';
  }
  
  // Check for formatted date columns (date_label, month_name, etc.)
  const lowerCol = columnName.toLowerCase();
  if (lowerCol.includes('_label') || lowerCol.includes('_name') || lowerCol.includes('_formatted')) {
    return String(value);
  }
  
  // Check for month number columns - convert to month name if possible
  if (lowerCol.includes('month') && !lowerCol.includes('name') && typeof value === 'number' && value >= 1 && value <= 12) {
    const months = ['January', 'February', 'March', 'April', 'May', 'June',
                    'July', 'August', 'September', 'October', 'November', 'December'];
    return months[value - 1] || String(value);
  }
  
  const date = parseDate(value);
  if (date) {
    return formatDateReadable(date) || formatDate(date) || String(value);
  }
  
  if (typeof value === 'number' || !isNaN(parseFloat(value))) {
    const num = typeof value === 'number' ? value : parseFloat(value);
    if (num % 1 === 0) {
      return num.toLocaleString();
    } else {
      return num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }
  }
  
  return String(value);
}

function isDateColumn(data: any[], columnName: string): boolean {
  if (!data || data.length === 0) return false;
  const sampleValues = data.slice(0, 10).map(row => row[columnName]).filter(v => v != null && v !== '');
  if (sampleValues.length === 0) return false;
  return sampleValues.some(val => {
    const date = parseDate(val);
    return date !== null;
  });
}

function isNumericColumn(data: any[], columnName: string): boolean {
  if (!data || data.length === 0) return false;
  const sampleValues = data.slice(0, 10).map(row => row[columnName]).filter(v => v != null && v !== '');
  if (sampleValues.length === 0) return false;
  return sampleValues.every(val => {
    return typeof val === 'number' || !isNaN(parseFloat(val));
  });
}

// Helper function to check if data is effectively empty (all null/empty values)
function isDataEffectivelyEmpty(data: any[]): boolean {
  if (!Array.isArray(data) || data.length === 0) return true;
  
  // Check if all rows have all null/empty/undefined values
  return data.every(row => {
    if (!row || typeof row !== 'object') return true;
    const values = Object.values(row);
    return values.every(val => 
      val === null || 
      val === undefined || 
      val === '' || 
      (typeof val === 'string' && val.trim() === '') ||
      (typeof val === 'number' && isNaN(val))
    );
  });
}

export default function Table({ data, title }: TableProps) {
  const [visibleRows, setVisibleRows] = useState(ROWS_PER_PAGE);

  if (!data || data.length === 0 || isDataEffectivelyEmpty(data)) {
    return (
      <div className="w-full min-h-[400px] flex flex-col items-center justify-center bg-white rounded-lg border border-gray-200 p-8">
        <div className="text-6xl mb-4">📊</div>
        <p className="text-gray-500 text-lg font-semibold mb-2">No Data Available</p>
        <p className="text-gray-400 text-sm text-center max-w-md">
          This table contains no meaningful data. All values are empty or null.
        </p>
      </div>
    );
  }

  const columns = Object.keys(data[0]);
  const displayedData = data.slice(0, visibleRows);
  const hasMore = data.length > visibleRows;
  const remainingRows = data.length - visibleRows;
  
  const stats: Record<string, { total?: number; avg?: number; count: number }> = {};
  columns.forEach(col => {
    if (isNumericColumn(data, col)) {
      const values = data.map(row => {
        const val = row[col];
        return typeof val === 'number' ? val : parseFloat(String(val)) || 0;
      }).filter(v => !isNaN(v));
      
      if (values.length > 0) {
        stats[col] = {
          total: values.reduce((sum, v) => sum + v, 0),
          avg: values.reduce((sum, v) => sum + v, 0) / values.length,
          count: values.length
        };
      }
    } else {
      stats[col] = { count: data.length };
    }
  });

  // Prefer formatted columns over raw ones (e.g., month_name over month_number, date_label over date)
  const displayColumns = columns.filter(col => {
    const lowerCol = col.toLowerCase();
    // If we have both month_number and month_name, prefer month_name
    if (lowerCol.includes('month_number') && columns.some(c => c.toLowerCase().includes('month_name'))) {
      return false;
    }
    // If we have both date and date_label, prefer date_label
    if (lowerCol === 'date' && columns.some(c => c.toLowerCase().includes('date_label'))) {
      return false;
    }
    return true;
  }).sort((a, b) => {
    // Sort: names/labels first, then IDs, then others
    const aLower = a.toLowerCase();
    const bLower = b.toLowerCase();
    if (aLower.includes('_name') || aLower.includes('_label')) return -1;
    if (bLower.includes('_name') || bLower.includes('_label')) return 1;
    if (aLower.endsWith('_id')) return 1;
    if (bLower.endsWith('_id')) return -1;
    return 0;
  });

  return (
    <div className="w-full h-full min-h-[450px] bg-white rounded-xl border border-gray-200 shadow-lg hover:shadow-xl transition-all duration-300 flex flex-col overflow-hidden">
      {title && (
        <div className="px-6 pt-6 pb-4 border-b border-gray-100 bg-gradient-to-br from-gray-50 via-white to-blue-50">
          <h4 className="text-xl font-bold text-gray-900 mb-2">{title}</h4>
          <div className="flex items-center gap-4 text-xs text-gray-600 mt-2">
            <div className="flex items-center gap-2 px-3 py-1.5 bg-blue-50 rounded-lg">
              <span className="w-2.5 h-2.5 rounded-full bg-blue-500"></span>
              <span className="font-semibold text-gray-900">{data.length}</span>
              <span className="text-gray-500">{data.length === 1 ? 'row' : 'rows'}</span>
            </div>
            <div className="flex items-center gap-2 px-3 py-1.5 bg-purple-50 rounded-lg">
              <span className="w-2.5 h-2.5 rounded-full bg-purple-500"></span>
              <span className="font-semibold text-gray-900">{displayColumns.length}</span>
              <span className="text-gray-500">{displayColumns.length === 1 ? 'column' : 'columns'}</span>
            </div>
          </div>
        </div>
      )}
      <div className="flex-1 overflow-auto bg-gradient-to-br from-gray-50/50 to-white">
        <div className="min-w-full">
          <table className="w-full border-collapse">
            <thead className="bg-gradient-to-r from-gray-50 to-gray-100 sticky top-0 z-10 shadow-md">
              <tr>
                {displayColumns.map((col, index) => {
                  const isNumeric = isNumericColumn(data, col);
                  const lowerCol = col.toLowerCase();
                  const isNameColumn = lowerCol.includes('_name') || lowerCol.includes('_label');
                  return (
                    <th
                      key={col}
                      className={`px-6 py-4 text-xs font-bold text-gray-800 uppercase tracking-wider border-b-2 border-gray-300 ${
                        index === 0 ? 'sticky left-0 bg-gradient-to-r from-gray-50 to-gray-100 z-20 shadow-[2px_0_4px_rgba(0,0,0,0.1)]' : ''
                      } ${isNumeric ? 'text-right' : 'text-left'} ${isNameColumn ? 'bg-blue-50' : ''}`}
                      style={{ minWidth: isNumeric ? '140px' : '180px' }}
                    >
                      <div className={`flex flex-col gap-1 ${isNumeric ? 'items-end' : 'items-start'}`}>
                        <span className="font-bold">{formatColumnName(col)}</span>
                        {stats[col] && (
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs font-normal text-gray-600">
                            {stats[col].total !== undefined && (
                              <span className="whitespace-nowrap">
                                <span className="inline-block w-1.5 h-1.5 rounded-full bg-blue-500 mr-1"></span>
                                Total: {stats[col].total!.toLocaleString()}
                              </span>
                            )}
                            {stats[col].avg !== undefined && (
                              <span className="whitespace-nowrap">
                                <span className="inline-block w-1.5 h-1.5 rounded-full bg-purple-500 mr-1"></span>
                                Avg: {stats[col].avg!.toFixed(2)}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {displayedData.map((row, rowIndex) => (
                <tr
                  key={rowIndex}
                  className="hover:bg-gradient-to-r hover:from-blue-50 hover:to-purple-50 transition-all duration-200 border-b border-gray-100"
                >
                  {displayColumns.map((col, colIndex) => {
                    const value = row[col];
                    const isNumeric = isNumericColumn(data, col);
                    const isDate = isDateColumn(data, col);
                    const lowerCol = col.toLowerCase();
                    const isNameColumn = lowerCol.includes('_name') || lowerCol.includes('_label');
                    
                    return (
                      <td
                        key={col}
                        className={`px-6 py-4 text-sm text-gray-800 border-b border-gray-100 ${
                          colIndex === 0 ? 'sticky left-0 bg-white z-10 shadow-[2px_0_4px_rgba(0,0,0,0.1)] font-semibold' : ''
                        } ${rowIndex % 2 === 0 ? 'bg-white' : 'bg-gray-50/30'} ${
                          isNumeric ? 'text-right font-mono tabular-nums' : isDate ? 'text-left font-mono text-xs' : 'text-left'
                        } ${isNameColumn ? 'font-medium text-gray-900' : ''}`}
                        style={{ minWidth: isNumeric ? '140px' : '180px' }}
                      >
                        <div className={`${isNumeric ? 'text-right' : ''} ${isDate ? 'text-xs' : ''}`}>
                          {formatValue(value, col)}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <div className="px-6 py-4 border-t border-gray-200 bg-gradient-to-r from-gray-50 to-gray-100 flex items-center justify-between">
        <div className="text-xs text-gray-600">
          <span className="font-medium">Showing {displayedData.length} of {data.length} rows</span>
          {displayColumns.length > 3 && (
            <span className="ml-4 text-gray-500">• Scroll horizontally to see more columns</span>
          )}
        </div>
        {hasMore && (
          <button
            onClick={() => setVisibleRows(data.length)}
            className="px-4 py-2 bg-gradient-to-r from-blue-600 to-purple-600 text-white text-sm rounded-lg hover:from-blue-700 hover:to-purple-700 transition-all duration-200 font-semibold shadow-md hover:shadow-lg transform hover:scale-105 flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
            Show All ({remainingRows} remaining)
          </button>
        )}
        {visibleRows >= data.length && data.length > ROWS_PER_PAGE && (
          <button
            onClick={() => setVisibleRows(ROWS_PER_PAGE)}
            className="px-4 py-2 bg-gray-200 text-gray-700 text-sm rounded-lg hover:bg-gray-300 transition-colors font-medium"
          >
            Show Less
          </button>
        )}
      </div>
    </div>
  );
}
