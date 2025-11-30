'use client';

import { BarChart as RechartsBarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell } from 'recharts';

interface BarChartProps {
  data: any[];
  title?: string;
}

// Beautiful gradient colors
const COLORS = [
  'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
  'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
  'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
  'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)',
  'linear-gradient(135deg, #fa709a 0%, #fee140 100%)',
  'linear-gradient(135deg, #30cfd0 0%, #330867 100%)',
  'linear-gradient(135deg, #a8edea 0%, #fed6e3 100%)',
  'linear-gradient(135deg, #ff9a9e 0%, #fecfef 100%)',
];

const SOLID_COLORS = [
  '#667eea', '#f5576c', '#4facfe', '#43e97b', '#fa709a', '#30cfd0', '#a8edea', '#ff9a9e'
];

export default function BarChart({ data, title }: BarChartProps) {
  if (!data || data.length === 0) {
    return (
      <div className="w-full h-80 flex items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100 rounded-lg">
        <p className="text-gray-400">No data available</p>
      </div>
    );
  }

  // Transform data for Recharts - handle various data formats
  let chartData = data;
  const keys = Object.keys(data[0] || {});
  
  // Find category and value keys intelligently
  let categoryKey = keys[0];
  let valueKey = keys[1];
  
  // Look for common patterns - prioritize string columns for category, numeric for value
  const categoryPatterns = ['name', 'full_name', 'category', 'label', 'type', 'subject', 'stream', 'status', 'grade', 'state', 'city', 'department'];
  const valuePatterns = ['value', 'count', 'total', 'amount', 'score', 'percentage', 'avg', 'sum', 'cgpa', 'attendance', 'marks'];
  
  // First, identify all string and numeric columns
  const stringCols = keys.filter(key => typeof data[0][key] === 'string' || (typeof data[0][key] !== 'number' && isNaN(Number(data[0][key]))));
  const numericCols = keys.filter(key => typeof data[0][key] === 'number' || !isNaN(Number(data[0][key])));
  
  // Find best category key (prefer string columns matching patterns)
  for (const key of stringCols) {
    const lowerKey = key.toLowerCase();
    if (categoryPatterns.some(p => lowerKey.includes(p))) {
      categoryKey = key;
      break;
    }
  }
  // If no pattern match, use first string column
  if (stringCols.length > 0 && categoryKey === keys[0] && !stringCols.includes(categoryKey)) {
    categoryKey = stringCols[0];
  }
  
  // Find best value key (prefer numeric columns matching patterns)
  for (const key of numericCols) {
    if (key === categoryKey) continue; // Skip if same as category
    const lowerKey = key.toLowerCase();
    if (valuePatterns.some(p => lowerKey.includes(p))) {
      valueKey = key;
      break;
    }
  }
  // If no pattern match, use first numeric column
  if (numericCols.length > 0) {
    const firstNumeric = numericCols.find(k => k !== categoryKey) || numericCols[0];
    if (firstNumeric) {
      valueKey = firstNumeric;
    }
  }

  // Calculate total for display
  const total = data.reduce((sum, item) => {
    const val = typeof item[valueKey] === 'number' ? item[valueKey] : parseFloat(item[valueKey]) || 0;
    return sum + val;
  }, 0);

  // Format data properly
  chartData = data.map((item, index) => ({
    ...item,
    [categoryKey]: String(item[categoryKey] || `Item ${index + 1}`).substring(0, 20),
    [valueKey]: typeof item[valueKey] === 'number' ? item[valueKey] : parseFloat(item[valueKey]) || 0,
  }));

  return (
    <div className="w-full h-80 bg-gradient-to-br from-white to-blue-50 rounded-xl p-4 shadow-lg border border-blue-100">
      {title && (
        <div className="mb-3">
          <h4 className="text-lg font-bold text-gray-800 mb-1">{title}</h4>
          <div className="flex items-center gap-4 text-sm">
            <span className="text-gray-600">Total: </span>
            <span className="font-bold text-blue-600 text-xl">{total.toLocaleString()}</span>
          </div>
        </div>
      )}
      <ResponsiveContainer width="100%" height="100%">
        <RechartsBarChart 
          data={chartData}
          margin={{ top: 10, right: 30, left: 0, bottom: 0 }}
        >
          <defs>
            {SOLID_COLORS.map((color, index) => (
              <linearGradient key={index} id={`colorBar${index}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity={0.8}/>
                <stop offset="100%" stopColor={color} stopOpacity={0.4}/>
              </linearGradient>
            ))}
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
            iconType="rect"
          />
          <Bar 
            dataKey={valueKey} 
            radius={[8, 8, 0, 0]}
            fill="url(#colorBar0)"
          >
            {chartData.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={`url(#colorBar${index % SOLID_COLORS.length})`} />
            ))}
          </Bar>
        </RechartsBarChart>
      </ResponsiveContainer>
    </div>
  );
}
