'use client';

import { PieChart as RechartsPieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts';

interface PieChartProps {
  data: any[];
  title?: string;
}

const COLORS = [
  '#667eea', '#f5576c', '#4facfe', '#43e97b', '#fa709a', '#30cfd0', '#a8edea', '#ff9a9e',
  '#ffecd2', '#fcb69f', '#ff8a80', '#ff80ab', '#ea80fc', '#b388ff', '#8c9eff', '#82b1ff'
];

export default function PieChart({ data, title }: PieChartProps) {
  if (!data || data.length === 0) {
    return (
      <div className="w-full h-80 flex items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100 rounded-lg">
        <p className="text-gray-400">No data available</p>
      </div>
    );
  }

  const keys = Object.keys(data[0] || {});
  let nameKey = keys[0] || 'name';
  let valueKey = keys[1] || 'value';

  // Find the right keys
  const namePatterns = ['name', 'category', 'label', 'type', 'subject', 'stream', 'status'];
  const valuePatterns = ['value', 'count', 'total', 'amount', 'score', 'percentage'];
  
  for (const key of keys) {
    const lowerKey = key.toLowerCase();
    if (namePatterns.some(p => lowerKey.includes(p))) {
      nameKey = key;
    }
    if (valuePatterns.some(p => lowerKey.includes(p)) || typeof data[0][key] === 'number') {
      valueKey = key;
    }
  }

  // Format and sort data
  const formattedData = data
    .map(item => ({
      name: String(item[nameKey] || 'Unknown').substring(0, 20),
      value: typeof item[valueKey] === 'number' ? item[valueKey] : parseFloat(item[valueKey]) || 0,
    }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 8); // Limit to top 8 for readability

  const total = formattedData.reduce((sum, item) => sum + item.value, 0);

  const RADIAN = Math.PI / 180;
  const renderCustomLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, percent }: any) => {
    const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
    const x = cx + radius * Math.cos(-midAngle * RADIAN);
    const y = cy + radius * Math.sin(-midAngle * RADIAN);

    return percent > 0.05 ? (
      <text 
        x={x} 
        y={y} 
        fill="white" 
        textAnchor={x > cx ? 'start' : 'end'} 
        dominantBaseline="central"
        fontSize={12}
        fontWeight="bold"
      >
        {`${(percent * 100).toFixed(0)}%`}
      </text>
    ) : null;
  };

  return (
    <div className="w-full h-80 bg-gradient-to-br from-white to-purple-50 rounded-xl p-4 shadow-lg border border-purple-100">
      {title && (
        <div className="mb-3">
          <h4 className="text-lg font-bold text-gray-800 mb-1">{title}</h4>
          <div className="flex items-center gap-4 text-sm">
            <span className="text-gray-600">Total: </span>
            <span className="font-bold text-purple-600 text-xl">{total.toLocaleString()}</span>
          </div>
        </div>
      )}
      <ResponsiveContainer width="100%" height="100%">
        <RechartsPieChart>
          <Pie
            data={formattedData}
            cx="50%"
            cy="50%"
            labelLine={false}
            label={renderCustomLabel}
            outerRadius={100}
            fill="#8884d8"
            dataKey="value"
            nameKey="name"
          >
            {formattedData.map((entry, index) => (
              <Cell 
                key={`cell-${index}`} 
                fill={COLORS[index % COLORS.length]}
                stroke="#fff"
                strokeWidth={2}
              />
            ))}
          </Pie>
          <Tooltip 
            contentStyle={{ 
              backgroundColor: 'rgba(255, 255, 255, 0.95)',
              border: '1px solid #e0e7ff',
              borderRadius: '8px',
              boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)'
            }}
            formatter={(value: any, name: any) => [
              `${value.toLocaleString()} (${((value / total) * 100).toFixed(1)}%)`,
              name
            ]}
          />
          <Legend 
            verticalAlign="bottom" 
            height={36}
            iconType="circle"
            wrapperStyle={{ fontSize: '12px' }}
          />
        </RechartsPieChart>
      </ResponsiveContainer>
    </div>
  );
}
