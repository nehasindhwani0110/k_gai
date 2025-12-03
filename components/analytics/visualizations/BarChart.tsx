'use client';

import { BarChart as RechartsBarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell } from 'recharts';
import { parseDate, formatDateReadable } from '@/analytics-engine/utils/date-utils';

interface BarChartProps {
  data: any[];
  title?: string;
}

/**
 * Formats date/time values for chart display
 */
function formatDateForChart(value: any): string {
  if (!value) return '';
  
  const date = parseDate(String(value));
  if (date) {
    // Use readable format like "Jan 2024" or "2024-01-15"
    const formatted = formatDateReadable(date);
    if (formatted) return formatted;
    
    // Fallback to short date format
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    
    // If same year, show "Jan 15", otherwise "Jan 2024"
    const now = new Date();
    if (date.getFullYear() === now.getFullYear()) {
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      return `${months[date.getMonth()]} ${day}`;
    }
    return `${month}/${year}`;
  }
  
  // Not a date, return truncated string
  const str = String(value);
  return str.length > 15 ? str.substring(0, 12) + '...' : str;
}

/**
 * Calculates optimal interval for x-axis labels based on data count
 */
function calculateInterval(dataLength: number): number {
  if (dataLength <= 5) return 0; // Show all
  if (dataLength <= 10) return 1; // Show every other
  if (dataLength <= 20) return 2; // Show every 3rd
  if (dataLength <= 50) return Math.floor(dataLength / 10); // Show ~10 labels
  return Math.floor(dataLength / 15); // Show ~15 labels max
}

// PowerBI-inspired professional color palette
const POWERBI_COLORS = [
  '#0078D4', '#107C10', '#8764B8', '#FFB900', '#0078D4', 
  '#00BCF2', '#FF8C00', '#E3008C', '#00B294', '#737373'
];

const GRADIENT_COLORS = [
  { from: '#0078D4', to: '#005A9E' }, // PowerBI Blue
  { from: '#107C10', to: '#0B5A0B' }, // Green
  { from: '#8764B8', to: '#6B4C93' }, // Purple
  { from: '#FFB900', to: '#CC9400' }, // Gold
  { from: '#00BCF2', to: '#0096C7' }, // Cyan
  { from: '#FF8C00', to: '#CC7000' }, // Orange
  { from: '#E3008C', to: '#B6006F' }, // Pink
  { from: '#00B294', to: '#008F75' }, // Teal
];

export default function BarChart({ data, title }: BarChartProps) {
  if (!data || data.length === 0) {
    return (
      <div className="w-full h-[400px] flex items-center justify-center bg-white rounded-lg border border-gray-200">
        <p className="text-gray-400 text-sm">No data available</p>
      </div>
    );
  }

  // Transform data for Recharts - handle various data formats
  let chartData = data;
  const keys = Object.keys(data[0] || {});
  
  // Improved column detection - check multiple rows for better accuracy
  // Find string columns (categories) and numeric columns (values)
  const stringCols = keys.filter(key => {
    // Check first 5 rows (or all if less than 5) to determine type
    const sampleSize = Math.min(5, data.length);
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
    // Column is string if majority of samples are strings
    return stringCount > sampleSize / 2;
  });
  
  const numericCols = keys.filter(key => {
    // Check first 5 rows (or all if less than 5) to determine type
    const sampleSize = Math.min(5, data.length);
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
    // Column is numeric if majority of samples are numeric
    return numericCount > sampleSize / 2;
  });
  
  // Check for date/time columns by name and content
  const timeKey = keys.find(key => {
    const lowerKey = key.toLowerCase();
    const isTimeByName = /date|time|year|month|day|week|quarter|created|updated|period/i.test(lowerKey);
    if (isTimeByName) return true;
    // Also check if values look like dates
    const sampleVal = data[0]?.[key];
    if (sampleVal && typeof sampleVal === 'string') {
      return /^\d{4}-\d{2}-\d{2}|^\d{2}\/\d{2}\/\d{4}/.test(sampleVal);
    }
    return false;
  });
  
  // Smart column selection based on column names and types
  // Value column patterns (aggregations, metrics)
  const valuePatterns = ['count', 'total', 'sum', 'avg', 'average', 'mean', 'max', 'min', 'amount', 'value', 'score', 'rating', 'attendance', 'content', 'quantity'];
  // Category column patterns (dimensions, groups)
  const categoryPatterns = ['name', 'category', 'type', 'status', 'group', 'label', 'city', 'country', 'region', 'item'];
  
  let categoryKey = stringCols.length > 0 ? stringCols[0] : keys[0];
  let valueKey = numericCols.find(k => k !== categoryKey) || numericCols[0] || keys[1] || keys[0];
  
  // Prefer date/time column as category if available
  if (timeKey) {
    categoryKey = timeKey;
    // Find value column excluding the time key
    valueKey = numericCols.find(k => k !== timeKey) || numericCols[0] || keys.find(k => k !== timeKey) || keys[1];
  } else {
    // Try to identify by column name patterns
    const valueKeyByName = keys.find(key => {
      const lowerKey = key.toLowerCase();
      return valuePatterns.some(p => lowerKey.includes(p)) && numericCols.includes(key);
    });
    const categoryKeyByName = keys.find(key => {
      const lowerKey = key.toLowerCase();
      return categoryPatterns.some(p => lowerKey.includes(p)) && (stringCols.includes(key) || key === timeKey);
    });
    
    if (valueKeyByName) valueKey = valueKeyByName;
    if (categoryKeyByName) categoryKey = categoryKeyByName;
  }
  
  // If we have exactly 2 columns, use them intelligently
  if (keys.length === 2) {
    if (numericCols.length === 1 && stringCols.length === 1) {
      categoryKey = stringCols[0];
      valueKey = numericCols[0];
    } else if (numericCols.length === 2) {
      // Both numeric - check names to determine which is category vs value
      const firstLower = keys[0].toLowerCase();
      const secondLower = keys[1].toLowerCase();
      if (categoryPatterns.some(p => firstLower.includes(p))) {
        categoryKey = keys[0];
        valueKey = keys[1];
      } else if (categoryPatterns.some(p => secondLower.includes(p))) {
        categoryKey = keys[1];
        valueKey = keys[0];
      } else {
        // Default: first as category, second as value
        categoryKey = keys[0];
        valueKey = keys[1];
      }
    }
  }
  
  const isDateColumn = timeKey !== undefined;

  // Calculate statistics
  const total = data.reduce((sum, item) => {
    const val = typeof item[valueKey] === 'number' ? item[valueKey] : parseFloat(String(item[valueKey])) || 0;
    return sum + val;
  }, 0);
  
  const maxValue = Math.max(...data.map(item => {
    const val = typeof item[valueKey] === 'number' ? item[valueKey] : parseFloat(String(item[valueKey])) || 0;
    return val;
  }));

  // Ensure we have valid keys
  if (!categoryKey || !keys.includes(categoryKey)) {
    categoryKey = keys[0] || 'category';
  }
  if (!valueKey || !keys.includes(valueKey) || valueKey === categoryKey) {
    valueKey = keys.find(k => k !== categoryKey && numericCols.includes(k)) || keys[1] || 'value';
  }
  
  // Debug logging for column detection
  console.log(`[BarChart] Column detection for "${title}":`, {
    allKeys: keys,
    categoryKey,
    valueKey,
    stringCols,
    numericCols,
    timeKey,
    sampleData: data[0]
  });
  
  // Format data properly
  chartData = data.map((item, index) => {
    const catValue = item[categoryKey];
    const valValue = item[valueKey];
    
    let displayValue: string;
    if (isDateColumn) {
      displayValue = formatDateForChart(catValue);
    } else {
      displayValue = catValue !== null && catValue !== undefined 
        ? String(catValue).substring(0, 30) 
        : `Item ${index + 1}`;
    }
    
    return {
      ...item,
      [categoryKey]: displayValue,
      [`${categoryKey}_original`]: catValue, // Keep original for tooltip
      [valueKey]: valValue !== null && valValue !== undefined 
        ? (typeof valValue === 'number' ? valValue : parseFloat(String(valValue)) || 0)
        : 0,
    };
  });

  // Custom tooltip component
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      // Find original value if available
      const dataPoint = chartData.find(d => d[categoryKey] === label);
      const originalLabel = dataPoint?.[`${categoryKey}_original`] || label;
      
      return (
        <div className="bg-white border border-gray-200 rounded-lg shadow-xl p-3 min-w-[150px]">
          <p className="text-gray-600 text-xs font-medium mb-1">
            {isDateColumn && originalLabel !== label ? String(originalLabel) : String(label)}
          </p>
          <p className="text-gray-900 text-lg font-bold">
            {typeof payload[0].value === 'number' 
              ? payload[0].value.toLocaleString() 
              : payload[0].value}
          </p>
          <p className="text-gray-500 text-xs mt-1">{valueKey}</p>
        </div>
      );
    }
    return null;
  };
  
  // Calculate optimal interval
  const labelInterval = calculateInterval(chartData.length);
  const needsRotation = chartData.length > 5 || isDateColumn;

  return (
    <div className="w-full h-full min-h-[450px] bg-white rounded-lg border border-gray-200 shadow-sm hover:shadow-md transition-shadow duration-300 flex flex-col overflow-hidden">
      {title && (
        <div className="px-6 pt-5 pb-3 border-b border-gray-100 bg-gradient-to-r from-gray-50 to-white">
          <h4 className="text-lg font-semibold text-gray-900 mb-1">{title}</h4>
          <div className="flex items-center gap-6 text-xs text-gray-600 mt-2">
            <div className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-blue-500"></span>
              <span>Total: <span className="font-semibold text-gray-900">{total.toLocaleString()}</span></span>
            </div>
            <div className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-purple-500"></span>
              <span>Max: <span className="font-semibold text-gray-900">{maxValue.toLocaleString()}</span></span>
            </div>
          </div>
        </div>
      )}
      <div className="flex-1 p-6 min-h-[350px]" style={{ height: '350px' }}>
        <ResponsiveContainer width="100%" height={350}>
          <RechartsBarChart 
            data={chartData}
            margin={{ top: 10, right: 20, left: 0, bottom: needsRotation ? 80 : 50 }}
            barCategoryGap="15%"
          >
            <defs>
              {GRADIENT_COLORS.map((gradient, index) => (
                <linearGradient key={index} id={`powerbiGradient${index}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={gradient.from} stopOpacity={1}/>
                  <stop offset="100%" stopColor={gradient.to} stopOpacity={0.8}/>
                </linearGradient>
              ))}
            </defs>
            <CartesianGrid 
              strokeDasharray="3 3" 
              stroke="#E5E7EB" 
              vertical={false}
              strokeWidth={1}
            />
            <XAxis 
              dataKey={categoryKey} 
              tick={{ 
                fill: '#6B7280', 
                fontSize: isDateColumn ? 10 : 11, 
                fontWeight: 500
              }}
              axisLine={{ stroke: '#D1D5DB', strokeWidth: 1 }}
              tickLine={{ stroke: '#D1D5DB' }}
              angle={needsRotation ? -45 : 0}
              textAnchor={needsRotation ? 'end' : 'middle'}
              height={needsRotation ? 80 : 40}
              interval={labelInterval}
              tickFormatter={(value) => {
                // Ensure proper formatting
                if (isDateColumn) {
                  return formatDateForChart(value);
                }
                const str = String(value);
                return str.length > 12 ? str.substring(0, 10) + '...' : str;
              }}
            />
            <YAxis 
              tick={{ fill: '#6B7280', fontSize: 11, fontWeight: 500 }}
              axisLine={{ stroke: '#D1D5DB', strokeWidth: 1 }}
              tickLine={{ stroke: '#D1D5DB' }}
              label={{ 
                value: valueKey, 
                angle: -90, 
                position: 'insideLeft', 
                fill: '#6B7280', 
                style: { fontSize: '12px', fontWeight: 600 } 
              }}
              width={70}
            />
            <Tooltip content={<CustomTooltip />} />
            <Bar 
              dataKey={valueKey} 
              radius={[6, 6, 0, 0]}
              animationDuration={800}
              animationEasing="ease-out"
            >
              {chartData.map((entry, index) => (
                <Cell 
                  key={`cell-${index}`} 
                  fill={`url(#powerbiGradient${index % GRADIENT_COLORS.length})`}
                />
              ))}
            </Bar>
          </RechartsBarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
