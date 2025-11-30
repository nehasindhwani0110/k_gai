'use client';

import { ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';

interface ScatterPlotProps {
  data: any[];
  title?: string;
}

const COLORS = ['#667eea', '#f5576c', '#4facfe', '#43e97b', '#fa709a', '#30cfd0'];

export default function ScatterPlot({ data, title }: ScatterPlotProps) {
  if (!data || data.length === 0) {
    return (
      <div className="w-full h-80 flex items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100 rounded-lg">
        <p className="text-gray-400">No data available</p>
      </div>
    );
  }

  const keys = Object.keys(data[0] || {});
  let xKey = keys[0] || 'x';
  let yKey = keys[1] || 'y';

  // Find numeric keys
  const numericKeys = keys.filter(key => {
    const val = data[0][key];
    return typeof val === 'number' || !isNaN(parseFloat(val));
  });

  if (numericKeys.length >= 2) {
    xKey = numericKeys[0];
    yKey = numericKeys[1];
  }

  // Format data
  const chartData = data.map((item, index) => ({
    x: typeof item[xKey] === 'number' ? item[xKey] : parseFloat(item[xKey]) || 0,
    y: typeof item[yKey] === 'number' ? item[yKey] : parseFloat(item[yKey]) || 0,
    index,
  }));

  return (
    <div className="w-full h-80 bg-gradient-to-br from-white to-teal-50 rounded-xl p-4 shadow-lg border border-teal-100">
      {title && (
        <div className="mb-3">
          <h4 className="text-lg font-bold text-gray-800 mb-1">{title}</h4>
          <div className="flex items-center gap-4 text-sm">
            <span className="text-gray-600">Data Points: </span>
            <span className="font-bold text-teal-600 text-xl">{data.length}</span>
          </div>
        </div>
      )}
      <ResponsiveContainer width="100%" height="100%">
        <ScatterChart 
          data={chartData}
          margin={{ top: 20, right: 20, bottom: 20, left: 20 }}
        >
          <defs>
            <linearGradient id="scatterGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={COLORS[0]} stopOpacity={0.8}/>
              <stop offset="100%" stopColor={COLORS[0]} stopOpacity={0.2}/>
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#e0e7ff" />
          <XAxis 
            type="number" 
            dataKey="x" 
            name={xKey}
            tick={{ fill: '#64748b', fontSize: 12 }}
            label={{ value: xKey, position: 'insideBottom', offset: -5, fill: '#64748b' }}
          />
          <YAxis 
            type="number" 
            dataKey="y" 
            name={yKey}
            tick={{ fill: '#64748b', fontSize: 12 }}
            label={{ value: yKey, angle: -90, position: 'insideLeft', fill: '#64748b' }}
          />
          <Tooltip 
            cursor={{ strokeDasharray: '3 3' }}
            contentStyle={{ 
              backgroundColor: 'rgba(255, 255, 255, 0.95)',
              border: '1px solid #e0e7ff',
              borderRadius: '8px',
              boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)'
            }}
            formatter={(value: any, name: string) => {
              if (name === 'x') return [value.toLocaleString(), xKey];
              if (name === 'y') return [value.toLocaleString(), yKey];
              return [value, name];
            }}
          />
          <Scatter 
            dataKey="y" 
            fill={COLORS[0]}
            shape="circle"
          >
            {chartData.map((entry, index) => (
              <Cell 
                key={`cell-${index}`} 
                fill={COLORS[index % COLORS.length]}
                opacity={0.7}
              />
            ))}
          </Scatter>
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  );
}
