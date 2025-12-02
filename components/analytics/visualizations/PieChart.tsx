'use client';

import { PieChart as RechartsPieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts';

interface PieChartProps {
  data: any[];
  title?: string;
}

// PowerBI-inspired professional colors
const POWERBI_COLORS = [
  '#0078D4', '#107C10', '#8764B8', '#FFB900', '#00BCF2', 
  '#FF8C00', '#E3008C', '#00B294', '#737373', '#5C2D91'
];

export default function PieChart({ data, title }: PieChartProps) {
  if (!data || data.length === 0) {
    return (
      <div className="w-full h-[400px] flex items-center justify-center bg-white rounded-lg border border-gray-200">
        <p className="text-gray-400 text-sm">No data available</p>
      </div>
    );
  }

  // Generic column detection - works for any multi-tenant application
  const keys = Object.keys(data[0] || {});
  
  // Find string columns (names/categories) and numeric columns (values)
  const stringCols = keys.filter(key => {
    const val = data[0][key];
    return val !== null && val !== undefined && 
           typeof val === 'string' && 
           isNaN(Number(val)) && 
           val !== '';
  });
  
  const numericCols = keys.filter(key => {
    const val = data[0][key];
    return val !== null && val !== undefined && 
           (typeof val === 'number' || (!isNaN(Number(val)) && String(val) !== ''));
  });
  
  // Smart selection: name = first string column, value = first numeric column
  let nameKey = stringCols.length > 0 ? stringCols[0] : keys[0];
  let valueKey = numericCols.find(k => k !== nameKey) || numericCols[0] || keys[1] || keys[0];
  
  // If exactly 2 columns, use them directly
  if (keys.length === 2) {
    if (stringCols.length === 1 && numericCols.length === 1) {
      nameKey = stringCols[0];
      valueKey = numericCols[0];
    }
  }

  // Format and sort data
  const formattedData = data
    .map(item => ({
      name: String(item[nameKey] || 'Unknown').substring(0, 25),
      value: typeof item[valueKey] === 'number' ? item[valueKey] : parseFloat(String(item[valueKey])) || 0,
    }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 10); // Limit to top 10 for readability

  const total = formattedData.reduce((sum, item) => sum + item.value, 0);

  const RADIAN = Math.PI / 180;
  const renderCustomLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, percent, name }: any) => {
    if (percent < 0.03) return null; // Don't show labels for very small slices
    
    const radius = innerRadius + (outerRadius - innerRadius) * 0.6;
    const x = cx + radius * Math.cos(-midAngle * RADIAN);
    const y = cy + radius * Math.sin(-midAngle * RADIAN);

    return (
      <text 
        x={x} 
        y={y} 
        fill="white" 
        textAnchor={x > cx ? 'start' : 'end'} 
        dominantBaseline="central"
        fontSize={11}
        fontWeight="600"
        className="drop-shadow-sm"
      >
        {`${(percent * 100).toFixed(0)}%`}
      </text>
    );
  };

  // Custom tooltip
  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      const percent = ((data.value / total) * 100).toFixed(1);
      return (
        <div className="bg-white border border-gray-200 rounded-lg shadow-xl p-3 min-w-[180px]">
          <p className="text-gray-900 font-semibold text-sm mb-1">{data.name}</p>
          <p className="text-gray-700 text-lg font-bold">
            {data.value.toLocaleString()}
          </p>
          <p className="text-gray-500 text-xs mt-1">{percent}% of total</p>
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
          <div className="flex items-center gap-1 text-xs text-gray-600 mt-2">
            <span className="w-2 h-2 rounded-full bg-purple-500"></span>
            <span>Total: <span className="font-semibold text-gray-900">{total.toLocaleString()}</span></span>
            <span className="mx-2">•</span>
            <span>{formattedData.length} categories</span>
          </div>
        </div>
      )}
      <div className="flex-1 p-6 min-h-[350px] flex items-center justify-center" style={{ height: '350px' }}>
        <ResponsiveContainer width="100%" height={350}>
          <RechartsPieChart>
            <Pie
              data={formattedData}
              cx="50%"
              cy="50%"
              labelLine={false}
              label={renderCustomLabel}
              outerRadius={110}
              innerRadius={44}
              fill="#8884d8"
              dataKey="value"
              nameKey="name"
              animationDuration={800}
              animationEasing="ease-out"
            >
              {formattedData.map((entry, index) => (
                <Cell 
                  key={`cell-${index}`} 
                  fill={POWERBI_COLORS[index % POWERBI_COLORS.length]}
                  stroke="#fff"
                  strokeWidth={2}
                  style={{ filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.1))' }}
                />
              ))}
            </Pie>
            <Tooltip content={<CustomTooltip />} />
            <Legend 
              verticalAlign="bottom" 
              height={50}
              iconType="circle"
              wrapperStyle={{ fontSize: '12px', fontWeight: 500 }}
              formatter={(value: string) => <span className="text-gray-700">{value}</span>}
            />
          </RechartsPieChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
