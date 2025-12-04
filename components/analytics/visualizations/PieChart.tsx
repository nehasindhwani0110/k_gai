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

  // Improved column detection - check multiple rows for better accuracy
  const keys = Object.keys(data[0] || {});
  
  // Find string columns (names/categories) and numeric columns (values)
  const sampleSize = Math.min(5, data.length);
  const stringCols = keys.filter(key => {
    let stringCount = 0;
    for (let i = 0; i < sampleSize; i++) {
      const val = data[i]?.[key];
      if (val !== null && val !== undefined && 
          typeof val === 'string' && 
          isNaN(Number(val)) && 
          val !== '') {
        stringCount++;
      }
    }
    return stringCount > sampleSize / 2;
  });
  
  const numericCols = keys.filter(key => {
    let numericCount = 0;
    for (let i = 0; i < sampleSize; i++) {
      const val = data[i]?.[key];
      if (val !== null && val !== undefined) {
        if (typeof val === 'number') {
          numericCount++;
        } else if (!isNaN(Number(val)) && String(val) !== '') {
          numericCount++;
        }
      }
    }
    return numericCount > sampleSize / 2;
  });
  
  // Column name patterns for better detection
  const namePatterns = ['name', 'category', 'type', 'status', 'group', 'label', 'city', 'country', 'region', 'item'];
  const valuePatterns = ['count', 'total', 'sum', 'amount', 'value', 'quantity', 'number'];
  
  // Smart selection: prefer columns by name patterns
  let nameKey = stringCols.length > 0 ? stringCols[0] : keys[0];
  let valueKey = numericCols.find(k => k !== nameKey) || numericCols[0] || keys[1] || keys[0];
  
  // Try to identify by column name patterns
  const nameKeyByName = keys.find(key => {
    const lowerKey = key.toLowerCase();
    return namePatterns.some(p => lowerKey.includes(p)) && (stringCols.includes(key) || !numericCols.includes(key));
  });
  const valueKeyByName = keys.find(key => {
    const lowerKey = key.toLowerCase();
    return valuePatterns.some(p => lowerKey.includes(p)) && numericCols.includes(key);
  });
  
  if (nameKeyByName) nameKey = nameKeyByName;
  if (valueKeyByName) valueKey = valueKeyByName;
  
  // If exactly 2 columns, use them directly
  if (keys.length === 2) {
    if (stringCols.length === 1 && numericCols.length === 1) {
      nameKey = stringCols[0];
      valueKey = numericCols[0];
    } else if (numericCols.length === 2) {
      // Both numeric - check names
      const firstLower = keys[0].toLowerCase();
      const secondLower = keys[1].toLowerCase();
      if (namePatterns.some(p => firstLower.includes(p))) {
        nameKey = keys[0];
        valueKey = keys[1];
      } else if (namePatterns.some(p => secondLower.includes(p))) {
        nameKey = keys[1];
        valueKey = keys[0];
      } else {
        nameKey = keys[0];
        valueKey = keys[1];
      }
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

  // Enhanced custom tooltip with detailed breakdown
  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      const percent = ((data.value / total) * 100).toFixed(1);
      const rank = formattedData.findIndex(d => d.name === data.name) + 1;
      const isTop3 = rank <= 3;
      
      return (
        <div className="bg-white border-2 border-gray-300 rounded-xl shadow-2xl p-4 min-w-[220px] backdrop-blur-sm">
          {/* Header */}
          <div className="mb-3 pb-3 border-b border-gray-200">
            <div className="flex items-center gap-2 mb-1">
              {isTop3 && (
                <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${
                  rank === 1 ? 'bg-yellow-100 text-yellow-700' :
                  rank === 2 ? 'bg-gray-100 text-gray-700' :
                  'bg-orange-100 text-orange-700'
                }`}>
                  #{rank}
                </span>
              )}
              <p className="text-gray-500 text-xs font-semibold uppercase tracking-wide">
                Category
              </p>
            </div>
            <p className="text-gray-900 text-base font-bold">{data.name}</p>
          </div>
          
          {/* Value Display */}
          <div className="mb-3">
            <div className="flex items-baseline gap-2">
              <p className="text-gray-900 text-2xl font-bold">
                {data.value.toLocaleString()}
              </p>
              <span className="text-gray-500 text-sm font-medium">value</span>
            </div>
          </div>
          
          {/* Statistics */}
          <div className="space-y-2 pt-3 border-t border-gray-100">
            <div className="flex justify-between items-center">
              <span className="text-xs text-gray-500">Percentage</span>
              <span className={`text-lg font-bold ${isTop3 ? 'text-green-600' : 'text-blue-600'}`}>
                {percent}%
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-xs text-gray-500">Rank</span>
              <span className="text-sm font-semibold text-gray-700">
                #{rank} of {formattedData.length}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-xs text-gray-500">Remaining</span>
              <span className="text-sm font-semibold text-purple-600">
                {(100 - parseFloat(percent)).toFixed(1)}%
              </span>
            </div>
          </div>
          
          {/* Visual Progress Bar */}
          <div className="mt-3 pt-3 border-t border-gray-100">
            <div className="w-full bg-gray-200 rounded-full h-2.5 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  isTop3 
                    ? 'bg-gradient-to-r from-green-500 to-green-600' 
                    : 'bg-gradient-to-r from-blue-500 to-purple-600'
                }`}
                style={{ width: `${percent}%` }}
              />
            </div>
          </div>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="w-full h-full min-h-[450px] bg-white rounded-xl border border-gray-200 shadow-lg hover:shadow-2xl transition-all duration-300 flex flex-col overflow-hidden group">
      {title && (
        <div className="px-6 pt-6 pb-4 border-b border-gray-100 bg-gradient-to-br from-purple-50 via-white to-pink-50">
          <h4 className="text-xl font-bold text-gray-900 mb-2">{title}</h4>
          <div className="flex items-center gap-4 text-xs text-gray-600 mt-2 flex-wrap">
            <div className="flex items-center gap-2 px-3 py-1.5 bg-purple-50 rounded-lg">
              <span className="w-2.5 h-2.5 rounded-full bg-purple-500 animate-pulse"></span>
              <span className="font-semibold text-gray-900">{total.toLocaleString()}</span>
              <span className="text-gray-500">Total</span>
            </div>
            <div className="flex items-center gap-2 px-3 py-1.5 bg-blue-50 rounded-lg">
              <span className="w-2.5 h-2.5 rounded-full bg-blue-500"></span>
              <span className="font-semibold text-gray-900">{formattedData.length}</span>
              <span className="text-gray-500">Categories</span>
            </div>
          </div>
        </div>
      )}
      <div className="flex-1 p-6 min-h-[350px] flex items-center justify-center bg-gradient-to-br from-gray-50/50 to-white" style={{ height: '350px' }}>
        <ResponsiveContainer width="100%" height={350}>
          <RechartsPieChart>
            <defs>
              {POWERBI_COLORS.map((color, index) => (
                <linearGradient key={index} id={`pieGradient${index}`} x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stopColor={color} stopOpacity={1}/>
                  <stop offset="100%" stopColor={color} stopOpacity={0.7}/>
                </linearGradient>
              ))}
            </defs>
            <Pie
              data={formattedData}
              cx="50%"
              cy="50%"
              labelLine={false}
              label={renderCustomLabel}
              outerRadius={115}
              innerRadius={50}
              fill="#8884d8"
              dataKey="value"
              nameKey="name"
              animationDuration={1200}
              animationEasing="ease-out"
              isAnimationActive={true}
            >
              {formattedData.map((entry, index) => (
                <Cell 
                  key={`cell-${index}`} 
                  fill={`url(#pieGradient${index % POWERBI_COLORS.length})`}
                  stroke="#fff"
                  strokeWidth={3}
                  style={{ 
                    filter: 'drop-shadow(0 4px 6px rgba(0,0,0,0.15))',
                    transition: 'all 0.3s ease',
                  }}
                  className="hover:opacity-90"
                />
              ))}
            </Pie>
            <Tooltip content={<CustomTooltip />} />
            <Legend 
              verticalAlign="bottom" 
              height={60}
              iconType="circle"
              wrapperStyle={{ fontSize: '12px', fontWeight: 600, paddingTop: '20px' }}
              formatter={(value: string) => <span className="text-gray-700 font-medium">{value}</span>}
            />
          </RechartsPieChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
