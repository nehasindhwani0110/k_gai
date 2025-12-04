'use client';

import { useEffect, useState } from 'react';

const ROWS_PER_PAGE = 5;

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

interface EnhancedDataModalProps {
  title: string;
  query?: string;
  data: any[];
  insightSummary?: string;
  onClose: () => void;
}

export default function EnhancedDataModal({
  title,
  query,
  data,
  insightSummary,
  onClose,
}: EnhancedDataModalProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [stats, setStats] = useState<any>(null);
  const [visibleRows, setVisibleRows] = useState(ROWS_PER_PAGE);

  useEffect(() => {
    setIsVisible(true);
    calculateStats();
  }, []);

  const calculateStats = () => {
    if (!data || data.length === 0) return;

    const columns = Object.keys(data[0] || {});
    const columnStats: Record<string, any> = {};

    columns.forEach((col) => {
      const values = data.map((row) => row[col]).filter((v) => v !== null && v !== undefined);
      const numericValues = values.filter((v) => typeof v === 'number' || !isNaN(Number(v))).map((v) => Number(v));

      if (numericValues.length > 0) {
        columnStats[col] = {
          type: 'numeric',
          min: Math.min(...numericValues),
          max: Math.max(...numericValues),
          sum: numericValues.reduce((a, b) => a + b, 0),
          avg: numericValues.reduce((a, b) => a + b, 0) / numericValues.length,
          count: numericValues.length,
        };
      } else {
        const uniqueValues = new Set(values.map((v) => String(v)));
        columnStats[col] = {
          type: 'categorical',
          uniqueCount: uniqueValues.size,
          totalCount: values.length,
          topValues: Array.from(uniqueValues).slice(0, 5),
        };
      }
    });

    setStats(columnStats);
  };

  const handleClose = () => {
    setIsVisible(false);
    setTimeout(onClose, 300);
  };

  if (!data || data.length === 0 || isDataEffectivelyEmpty(data)) {
    return null;
  }

  const columns = Object.keys(data[0] || {});

  return (
    <div
      className={`fixed inset-0 bg-black bg-opacity-60 backdrop-blur-sm flex items-center justify-center z-50 p-4 transition-opacity duration-300 ${
        isVisible ? 'opacity-100' : 'opacity-0'
      }`}
      onClick={handleClose}
    >
      <div
        className={`bg-white rounded-2xl shadow-2xl max-w-7xl w-full max-h-[95vh] overflow-hidden flex flex-col transform transition-all duration-300 ${
          isVisible ? 'scale-100 opacity-100' : 'scale-95 opacity-0'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Enhanced Modal Header */}
        <div className="bg-gradient-to-br from-blue-600 via-purple-600 to-pink-600 text-white p-6 relative overflow-hidden">
          <div className="absolute inset-0 bg-black opacity-10"></div>
          <div className="relative z-10 flex items-start justify-between">
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-12 h-12 bg-white bg-opacity-20 rounded-xl flex items-center justify-center backdrop-blur-sm">
                  <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                  </svg>
                </div>
                <div>
                  <h2 className="text-3xl font-bold mb-1">{title}</h2>
                  <div className="flex items-center gap-4 text-sm text-blue-100">
                    <span className="flex items-center gap-1">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      {data.length} {data.length === 1 ? 'record' : 'records'}
                    </span>
                    <span className="flex items-center gap-1">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7h16M4 12h16M4 17h16" />
                      </svg>
                      {columns.length} {columns.length === 1 ? 'column' : 'columns'}
                    </span>
                  </div>
                </div>
              </div>
              {insightSummary && (
                <div className="mt-4 p-4 bg-white bg-opacity-10 rounded-xl backdrop-blur-sm border border-white border-opacity-20">
                  <p className="text-white text-sm leading-relaxed">{insightSummary}</p>
                </div>
              )}
            </div>
            <button
              onClick={handleClose}
              className="text-white hover:bg-white hover:bg-opacity-20 rounded-full p-2 transition-all duration-200 hover:scale-110 ml-4"
              aria-label="Close modal"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Modal Content */}
        <div className="flex-1 overflow-auto bg-gradient-to-br from-gray-50 to-white">
          <div className="p-6 space-y-6">
            {/* Statistics Cards */}
            {stats && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {Object.entries(stats).slice(0, 6).map(([col, stat]: [string, any]) => (
                  <div
                    key={col}
                    className="bg-white rounded-xl p-4 shadow-md border border-gray-200 hover:shadow-lg transition-shadow"
                  >
                    <h4 className="text-sm font-semibold text-gray-700 mb-3 uppercase tracking-wide">{col}</h4>
                    {stat.type === 'numeric' ? (
                      <div className="space-y-2">
                        <div className="flex justify-between items-center">
                          <span className="text-xs text-gray-500">Average</span>
                          <span className="text-lg font-bold text-blue-600">{stat.avg.toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-xs text-gray-500">Min</span>
                          <span className="text-sm font-semibold text-green-600">{stat.min.toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-xs text-gray-500">Max</span>
                          <span className="text-sm font-semibold text-red-600">{stat.max.toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between items-center pt-2 border-t border-gray-100">
                          <span className="text-xs text-gray-500">Sum</span>
                          <span className="text-sm font-bold text-purple-600">{stat.sum.toLocaleString()}</span>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <div className="flex justify-between items-center">
                          <span className="text-xs text-gray-500">Unique Values</span>
                          <span className="text-lg font-bold text-blue-600">{stat.uniqueCount}</span>
                        </div>
                        <div className="pt-2 border-t border-gray-100">
                          <p className="text-xs text-gray-500 mb-1">Top Values:</p>
                          <div className="flex flex-wrap gap-1">
                            {stat.topValues.map((val: string, idx: number) => (
                              <span
                                key={idx}
                                className="px-2 py-1 bg-blue-50 text-blue-700 text-xs rounded-full font-medium"
                              >
                                {val.substring(0, 15)}
                              </span>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Query Info */}
            {query && (
              <div className="bg-white rounded-xl shadow-md border border-gray-200 overflow-hidden">
                <div className="bg-gradient-to-r from-gray-50 to-gray-100 px-6 py-4 border-b border-gray-200">
                  <div className="flex items-center gap-2">
                    <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    <h3 className="text-lg font-bold text-gray-800">Generated Query</h3>
                  </div>
                </div>
                <div className="p-4 bg-gray-900">
                  <pre className="text-green-400 text-sm font-mono overflow-x-auto whitespace-pre-wrap">
                    {query}
                  </pre>
                </div>
              </div>
            )}

            {/* Enhanced Data Table */}
            <div className="bg-white rounded-xl shadow-md border border-gray-200 overflow-hidden">
              <div className="bg-gradient-to-r from-gray-50 to-gray-100 px-6 py-4 border-b border-gray-200">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                    <h3 className="text-lg font-bold text-gray-800">
                      Data Table ({data.length} {data.length === 1 ? 'row' : 'rows'})
                    </h3>
                  </div>
                  <button
                    onClick={() => {
                      const csv = [
                        columns.join(','),
                        ...data.map((row) => columns.map((col) => JSON.stringify(row[col] || '')).join(',')),
                      ].join('\n');
                      const blob = new Blob([csv], { type: 'text/csv' });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement('a');
                      a.href = url;
                      a.download = `${title.replace(/\s+/g, '_')}_data.csv`;
                      a.click();
                      URL.revokeObjectURL(url);
                    }}
                    className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    Export CSV
                  </button>
                </div>
              </div>
              <div className="overflow-x-auto max-h-[500px]">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 sticky top-0 z-10">
                    <tr>
                      {columns.map((key, idx) => (
                        <th
                          key={key}
                          className={`px-6 py-4 text-left text-xs font-bold text-gray-700 uppercase tracking-wider border-b-2 border-gray-300 ${
                            idx === 0 ? 'sticky left-0 bg-gray-50 z-20' : ''
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            {key}
                            {stats?.[key]?.type === 'numeric' && (
                              <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-xs rounded-full">
                                #
                              </span>
                            )}
                          </div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 bg-white">
                    {data.slice(0, visibleRows).map((row, index) => (
                      <tr
                        key={index}
                        className="hover:bg-gradient-to-r hover:from-blue-50 hover:to-purple-50 transition-all duration-200 group"
                      >
                        {columns.map((key, cellIdx) => {
                          const value = row[key];
                          const isNumeric = typeof value === 'number' || (!isNaN(Number(value)) && value !== '');
                          return (
                            <td
                              key={cellIdx}
                              className={`px-6 py-4 text-gray-700 whitespace-nowrap ${
                                cellIdx === 0 ? 'sticky left-0 bg-white group-hover:bg-blue-50 z-10 font-medium' : ''
                              } ${isNumeric ? 'text-right font-mono' : ''}`}
                            >
                              {isNumeric ? (
                                <span className="font-semibold text-gray-900">
                                  {typeof value === 'number' ? value.toLocaleString() : Number(value).toLocaleString()}
                                </span>
                              ) : (
                                <span className="text-gray-700">{String(value || '-')}</span>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {data.length > ROWS_PER_PAGE && (
                <div className="px-6 py-4 border-t border-gray-200 bg-gray-50 flex items-center justify-between">
                  <div className="text-sm text-gray-600">
                    <span className="font-medium">Showing {Math.min(visibleRows, data.length)} of {data.length} rows</span>
                  </div>
                  {visibleRows < data.length ? (
                    <button
                      onClick={() => setVisibleRows(data.length)}
                      className="px-4 py-2 bg-gradient-to-r from-blue-600 to-purple-600 text-white text-sm rounded-lg hover:from-blue-700 hover:to-purple-700 transition-all duration-200 font-semibold shadow-md hover:shadow-lg flex items-center gap-2"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                      Show All ({data.length - visibleRows} remaining)
                    </button>
                  ) : (
                    <button
                      onClick={() => setVisibleRows(ROWS_PER_PAGE)}
                      className="px-4 py-2 bg-gray-200 text-gray-700 text-sm rounded-lg hover:bg-gray-300 transition-colors font-medium"
                    >
                      Show Less
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Enhanced Modal Footer */}
        <div className="bg-gradient-to-r from-gray-50 to-gray-100 px-6 py-4 border-t border-gray-200 flex items-center justify-between">
          <div className="text-sm text-gray-600">
            <span className="font-medium">Total Records:</span> {data.length} •{' '}
            <span className="font-medium">Columns:</span> {columns.length}
          </div>
          <button
            onClick={handleClose}
            className="px-6 py-2.5 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-lg hover:from-blue-700 hover:to-purple-700 transition-all duration-200 font-semibold shadow-lg hover:shadow-xl transform hover:scale-105"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

