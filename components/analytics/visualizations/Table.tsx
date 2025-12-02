'use client';

import { parseDate, formatDate, formatDateReadable } from '@/analytics-engine/utils/date-utils';

interface TableProps {
  data: any[];
  title?: string;
}

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

export default function Table({ data, title }: TableProps) {
  if (!data || data.length === 0) {
    return (
      <div className="w-full min-h-[400px] flex items-center justify-center bg-white rounded-lg border border-gray-200">
        <p className="text-gray-400 text-sm">No data to display</p>
      </div>
    );
  }

  const columns = Object.keys(data[0]);
  
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

  return (
    <div className="w-full h-full min-h-[450px] bg-white rounded-lg border border-gray-200 shadow-sm hover:shadow-md transition-shadow duration-300 flex flex-col overflow-hidden">
      {title && (
        <div className="px-6 pt-5 pb-3 border-b border-gray-100 bg-gradient-to-r from-gray-50 to-white">
          <h4 className="text-lg font-semibold text-gray-900 mb-1">{title}</h4>
          <div className="flex items-center gap-1 text-xs text-gray-600 mt-2">
            <span className="w-2 h-2 rounded-full bg-blue-500"></span>
            <span>{data.length} {data.length === 1 ? 'row' : 'rows'}</span>
            <span className="mx-2">•</span>
            <span>{columns.length} {columns.length === 1 ? 'column' : 'columns'}</span>
          </div>
        </div>
      )}
      <div className="flex-1 overflow-auto">
        <div className="min-w-full">
          <table className="w-full border-collapse table-fixed">
            <thead className="bg-gray-50 sticky top-0 z-10 shadow-sm">
              <tr>
                {columns.map((col, index) => {
                  const isNumeric = isNumericColumn(data, col);
                  return (
                    <th
                      key={col}
                      className={`px-6 py-4 text-xs font-semibold text-gray-700 uppercase tracking-wider border-b-2 border-gray-300 ${
                        index === 0 ? 'sticky left-0 bg-gray-50 z-20 shadow-[2px_0_4px_rgba(0,0,0,0.05)]' : ''
                      } ${isNumeric ? 'text-right' : 'text-left'}`}
                      style={{ minWidth: isNumeric ? '120px' : '150px' }}
                    >
                      <div className={`flex flex-col gap-1 ${isNumeric ? 'items-end' : 'items-start'}`}>
                        <span className="font-semibold">{formatColumnName(col)}</span>
                        {stats[col] && (
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs font-normal text-gray-500">
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
              {data.map((row, rowIndex) => (
                <tr
                  key={rowIndex}
                  className="hover:bg-blue-50/50 transition-colors duration-150 border-b border-gray-100"
                >
                  {columns.map((col, colIndex) => {
                    const value = row[col];
                    const isNumeric = isNumericColumn(data, col);
                    const isDate = isDateColumn(data, col);
                    
                    return (
                      <td
                        key={col}
                        className={`px-6 py-4 text-sm text-gray-800 border-b border-gray-100 ${
                          colIndex === 0 ? 'sticky left-0 bg-white z-10 shadow-[2px_0_4px_rgba(0,0,0,0.05)] font-medium' : ''
                        } ${rowIndex % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'} ${
                          isNumeric ? 'text-right font-mono tabular-nums' : isDate ? 'text-left font-mono text-xs' : 'text-left'
                        }`}
                        style={{ minWidth: isNumeric ? '120px' : '150px' }}
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
      {data.length > 10 && (
        <div className="px-6 py-3 border-t border-gray-200 bg-gray-50 text-xs text-gray-600">
          Showing all {data.length} rows. Scroll horizontally to see more columns.
        </div>
      )}
    </div>
  );
}
