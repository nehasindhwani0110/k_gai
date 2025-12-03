'use client';

import { ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';

interface ScatterPlotProps {
  data: any[];
  title?: string;
}

const POWERBI_COLORS = [
  '#0078D4', '#107C10', '#8764B8', '#FFB900', '#00BCF2', 
  '#FF8C00', '#E3008C', '#00B294', '#737373'
];

export default function ScatterPlot({ data, title }: ScatterPlotProps) {
  if (!data || data.length === 0) {
    return (
      <div className="w-full h-[400px] flex items-center justify-center bg-white rounded-lg border border-gray-200">
        <p className="text-gray-400 text-sm">No data available</p>
      </div>
    );
  }

  const keys = Object.keys(data[0] || {});
  let xKey = keys[0] || 'x';
  let yKey = keys[1] || 'y';

  // Improved numeric detection - check multiple rows
  const sampleSize = Math.min(5, data.length);
  const numericKeys = keys.filter(key => {
    let numericCount = 0;
    for (let i = 0; i < sampleSize; i++) {
      const val = data[i]?.[key];
      if (val !== null && val !== undefined) {
        if (typeof val === 'number') {
          numericCount++;
        } else if (!isNaN(parseFloat(String(val))) && String(val) !== '') {
          numericCount++;
        }
      }
    }
    return numericCount > sampleSize / 2;
  });

  // Column name patterns for better detection
  const xPatterns = ['count', 'number', 'item_count', 'x', 'first'];
  const yPatterns = ['rating', 'score', 'value', 'amount', 'y', 'second', 'avg', 'average'];

  if (numericKeys.length >= 2) {
    // Try to identify by name patterns
    const xKeyByName = numericKeys.find(key => {
      const lowerKey = key.toLowerCase();
      return xPatterns.some(p => lowerKey.includes(p));
    });
    const yKeyByName = numericKeys.find(key => {
      const lowerKey = key.toLowerCase();
      return yPatterns.some(p => lowerKey.includes(p));
    });
    
    if (xKeyByName && yKeyByName && xKeyByName !== yKeyByName) {
      xKey = xKeyByName;
      yKey = yKeyByName;
    } else {
      xKey = numericKeys[0];
      yKey = numericKeys[1];
    }
  }

  // Format data
  const chartData = data.map((item, index) => ({
    x: typeof item[xKey] === 'number' ? item[xKey] : parseFloat(String(item[xKey])) || 0,
    y: typeof item[yKey] === 'number' ? item[yKey] : parseFloat(String(item[yKey])) || 0,
    index,
  }));

  const xMax = Math.max(...chartData.map(d => d.x));
  const yMax = Math.max(...chartData.map(d => d.y));
  const xMin = Math.min(...chartData.map(d => d.x));
  const yMin = Math.min(...chartData.map(d => d.y));

  // Custom tooltip
  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const point = payload[0].payload;
      return (
        <div className="bg-white border border-gray-200 rounded-lg shadow-xl p-3 min-w-[150px]">
          <p className="text-gray-600 text-xs font-medium mb-2">Data Point</p>
          <div className="space-y-1">
            <p className="text-gray-900 text-sm">
              <span className="font-semibold">{xKey}:</span> {point.x.toLocaleString()}
            </p>
            <p className="text-gray-900 text-sm">
              <span className="font-semibold">{yKey}:</span> {point.y.toLocaleString()}
            </p>
          </div>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="w-full h-full min-h-[450px] bg-white rounded-lg border border-gray-200 shadow-sm hover:shadow-md transition-shadow duration-300 flex flex-col overflow-hidden">
      {title && (
        <div className="px-6 pt-5 pb-3 border-b border-gray-100 bg-gradient-to-r from-gray-50 to-white">
          <h4 className="text-lg font-semibold text-gray-900 mb-1">{title}</h4>
          <div className="flex items-center gap-6 text-xs text-gray-600 mt-2">
            <div className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-blue-500"></span>
              <span>Points: <span className="font-semibold text-gray-900">{data.length}</span></span>
            </div>
            <div className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-purple-500"></span>
              <span>X Range: <span className="font-semibold text-gray-900">{xMin.toLocaleString()} - {xMax.toLocaleString()}</span></span>
            </div>
          </div>
        </div>
      )}
      <div className="flex-1 p-6 min-h-[350px]" style={{ height: '350px' }}>
        <ResponsiveContainer width="100%" height={350}>
          <ScatterChart 
            data={chartData}
            margin={{ top: 20, right: 30, bottom: 50, left: 20 }}
          >
            <CartesianGrid 
              strokeDasharray="3 3" 
              stroke="#E5E7EB" 
              strokeWidth={1}
            />
            <XAxis 
              type="number" 
              dataKey="x" 
              name={xKey}
              tick={{ fill: '#6B7280', fontSize: 11, fontWeight: 500 }}
              axisLine={{ stroke: '#D1D5DB', strokeWidth: 1 }}
              tickLine={{ stroke: '#D1D5DB' }}
              label={{ 
                value: xKey, 
                position: 'insideBottom', 
                offset: -5, 
                fill: '#6B7280', 
                style: { fontSize: '12px', fontWeight: 600 } 
              }}
            />
            <YAxis 
              type="number" 
              dataKey="y" 
              name={yKey}
              tick={{ fill: '#6B7280', fontSize: 11, fontWeight: 500 }}
              axisLine={{ stroke: '#D1D5DB', strokeWidth: 1 }}
              tickLine={{ stroke: '#D1D5DB' }}
              label={{ 
                value: yKey, 
                angle: -90, 
                position: 'insideLeft', 
                fill: '#6B7280', 
                style: { fontSize: '12px', fontWeight: 600 } 
              }}
              width={70}
            />
            <Tooltip content={<CustomTooltip />} cursor={{ strokeDasharray: '3 3' }} />
            <Scatter 
              dataKey="y" 
              fill="#0078D4"
              shape="circle"
            >
              {chartData.map((entry, index) => (
                <Cell 
                  key={`cell-${index}`} 
                  fill={POWERBI_COLORS[index % POWERBI_COLORS.length]}
                  opacity={0.7}
                />
              ))}
            </Scatter>
          </ScatterChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
