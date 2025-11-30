'use client';

interface TableProps {
  data: any[];
  title?: string;
}

export default function Table({ data, title }: TableProps) {
  if (!data || data.length === 0) {
    return (
      <div className="w-full h-80 flex items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100 rounded-lg">
        <p className="text-gray-400">No data to display</p>
      </div>
    );
  }

  const columns = Object.keys(data[0]);
  
  // Calculate totals for numeric columns
  const totals: Record<string, number> = {};
  columns.forEach(col => {
    const values = data.map(row => {
      const val = row[col];
      return typeof val === 'number' ? val : parseFloat(val) || 0;
    });
    if (values.some(v => !isNaN(v) && v !== 0)) {
      totals[col] = values.reduce((sum, v) => sum + (isNaN(v) ? 0 : v), 0);
    }
  });

  return (
    <div className="w-full h-80 bg-gradient-to-br from-white to-indigo-50 rounded-xl p-4 shadow-lg border border-indigo-100">
      {title && (
        <div className="mb-4">
          <h4 className="text-lg font-bold text-gray-800 mb-2">{title}</h4>
          {Object.keys(totals).length > 0 && (
            <div className="flex flex-wrap gap-4 text-sm">
              {Object.entries(totals).map(([col, total]) => (
                <div key={col} className="flex items-center gap-2">
                  <span className="text-gray-600">{col}:</span>
                  <span className="font-bold text-indigo-600">{total.toLocaleString()}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      <div className="overflow-x-auto h-full">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gradient-to-r from-indigo-500 to-purple-500">
            <tr>
              {columns.map((col, idx) => (
                <th
                  key={col}
                  className={`px-4 py-3 text-left text-xs font-bold text-white uppercase tracking-wider ${
                    idx === 0 ? 'rounded-tl-lg' : ''
                  } ${
                    idx === columns.length - 1 ? 'rounded-tr-lg' : ''
                  }`}
                >
                  {col.replace(/_/g, ' ')}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {data.slice(0, 10).map((row, idx) => (
              <tr 
                key={idx} 
                className="hover:bg-gradient-to-r hover:from-indigo-50 hover:to-purple-50 transition-colors"
              >
                {columns.map((col) => {
                  const val = row[col];
                  const isNumeric = typeof val === 'number' || !isNaN(parseFloat(val));
                  return (
                    <td
                      key={col}
                      className={`px-4 py-3 text-sm ${
                        isNumeric ? 'text-right font-medium text-gray-800' : 'text-gray-700'
                      }`}
                    >
                      {val !== null && val !== undefined 
                        ? (isNumeric ? Number(val).toLocaleString() : String(val))
                        : '-'
                      }
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
          {Object.keys(totals).length > 0 && (
            <tfoot className="bg-gradient-to-r from-indigo-100 to-purple-100">
              <tr>
                {columns.map((col) => (
                  <td
                    key={col}
                    className={`px-4 py-3 text-sm font-bold ${
                      totals[col] !== undefined ? 'text-right text-indigo-700' : 'text-gray-600'
                    }`}
                  >
                    {totals[col] !== undefined ? totals[col].toLocaleString() : '—'}
                  </td>
                ))}
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      {data.length > 10 && (
        <div className="mt-2 text-sm text-gray-500 text-center">
          Showing 10 of {data.length} rows
        </div>
      )}
    </div>
  );
}
