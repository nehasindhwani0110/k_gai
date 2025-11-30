'use client';

import { LineChart as RechartsLineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

interface LineChartProps {
  data: any[];
  title?: string;
}

const COLORS = ['#667eea', '#f5576c', '#4facfe', '#43e97b', '#fa709a', '#30cfd0'];

export default function LineChart({ data, title }: LineChartProps) {
  if (!data || data.length === 0) {
    return (
      <div className="w-full h-80 flex items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100 rounded-lg">
        <p className="text-gray-400">No data available</p>
      </div>
    );
  }

  const keys = Object.keys(data[0] || {});
  let categoryKey = keys[0] || 'category';
  let valueKey = keys[1] || 'value';

  // Find the right keys - prioritize date/time for X-axis, numeric for Y-axis
  const categoryPatterns = ['date', 'time', 'year', 'month', 'day', 'week', 'quarter', 'period', 'name', 'category', 'label'];
  const valuePatterns = ['value', 'count', 'total', 'amount', 'score', 'percentage', 'avg', 'sum', 'cgpa', 'attendance', 'marks'];
  
  // First, find date/time column for X-axis (line charts are for time series)
  const timeKey = keys.find(key => {
    const lowerKey = key.toLowerCase();
    return /date|time|year|month|day|week|quarter|created|updated/i.test(lowerKey);
  });
  
  if (timeKey) {
    categoryKey = timeKey;
  } else {
    // If no time column, use first string column or first column
    for (const key of keys) {
      const lowerKey = key.toLowerCase();
      if (categoryPatterns.some(p => lowerKey.includes(p)) && typeof data[0][key] !== 'number') {
        categoryKey = key;
        break;
      }
    }
  }
  
  // Find numeric value column for Y-axis
  for (const key of keys) {
    if (key === categoryKey) continue; // Skip the category key
    const lowerKey = key.toLowerCase();
    if (valuePatterns.some(p => lowerKey.includes(p)) || typeof data[0][key] === 'number') {
      valueKey = key;
      break;
    }
  }
  
  // Fallback: if we didn't find a good value key, use first numeric column
  if (!valueKey || typeof data[0][valueKey] !== 'number') {
    const numericKey = keys.find(key => typeof data[0][key] === 'number' && key !== categoryKey);
    if (numericKey) {
      valueKey = numericKey;
    }
  }

  // Format data
  const chartData = data.map((item, index) => ({
    ...item,
    [categoryKey]: String(item[categoryKey] || `Item ${index + 1}`).substring(0, 15),
    [valueKey]: typeof item[valueKey] === 'number' ? item[valueKey] : parseFloat(item[valueKey]) || 0,
  }));

  const total = chartData.reduce((sum, item) => sum + (item[valueKey] || 0), 0);
  const avg = total / chartData.length;

  return (
    <div className="w-full h-80 bg-gradient-to-br from-white to-green-50 rounded-xl p-4 shadow-lg border border-green-100">
      {title && (
        <div className="mb-3">
          <h4 className="text-lg font-bold text-gray-800 mb-1">{title}</h4>
          <div className="flex items-center gap-4 text-sm">
            <span className="text-gray-600">Total: </span>
            <span className="font-bold text-green-600 text-xl">{total.toLocaleString()}</span>
            <span className="text-gray-400">|</span>
            <span className="text-gray-600">Avg: </span>
            <span className="font-bold text-green-600">{avg.toFixed(2)}</span>
          </div>
        </div>
      )}
      <ResponsiveContainer width="100%" height="100%">
        <RechartsLineChart 
          data={chartData}
          margin={{ top: 5, right: 30, left: 0, bottom: 0 }}
        >
          <defs>
            <linearGradient id="colorLine" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={COLORS[0]} stopOpacity={0.8}/>
              <stop offset="100%" stopColor={COLORS[0]} stopOpacity={0.1}/>
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#e0e7ff" />
          <XAxis 
            dataKey={categoryKey} 
            tick={{ fill: '#64748b', fontSize: 12 }}
            angle={-45}
            textAnchor="end"
            height={80}
          />
          <YAxis 
            tick={{ fill: '#64748b', fontSize: 12 }}
            label={{ value: 'Value', angle: -90, position: 'insideLeft', fill: '#64748b' }}
          />
          <Tooltip 
            contentStyle={{ 
              backgroundColor: 'rgba(255, 255, 255, 0.95)',
              border: '1px solid #e0e7ff',
              borderRadius: '8px',
              boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)'
            }}
            formatter={(value: any) => [value.toLocaleString(), valueKey]}
          />
          <Legend 
            wrapperStyle={{ paddingTop: '10px' }}
            iconType="line"
          />
          <Line 
            type="monotone" 
            dataKey={valueKey} 
            stroke={COLORS[0]} 
            strokeWidth={3}
            dot={{ fill: COLORS[0], r: 5 }}
            activeDot={{ r: 8 }}
            fill="url(#colorLine)"
          />
        </RechartsLineChart>
      </ResponsiveContainer>
    </div>
  );
}
