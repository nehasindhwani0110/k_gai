'use client';

import { LineChart as RechartsLineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Area, AreaChart } from 'recharts';
import { parseDate, formatDateReadable } from '@/analytics-engine/utils/date-utils';

interface LineChartProps {
  data: any[];
  title?: string;
}

const PRIMARY_COLOR = '#0078D4'; // PowerBI Blue
const GRADIENT_FROM = '#0078D4';
const GRADIENT_TO = '#E3F2FD';

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

export default function LineChart({ data, title }: LineChartProps) {
  if (!data || data.length === 0) {
    return (
      <div className="w-full h-[400px] flex items-center justify-center bg-white rounded-lg border border-gray-200">
        <p className="text-gray-400 text-sm">No data available</p>
      </div>
    );
  }

  const keys = Object.keys(data[0] || {});
  let categoryKey = keys[0] || 'category';
  let valueKey = keys[1] || 'value';

  const categoryPatterns = ['date', 'time', 'year', 'month', 'day', 'week', 'quarter', 'period', 'name', 'category', 'label'];
  const valuePatterns = ['value', 'count', 'total', 'amount', 'score', 'percentage', 'avg', 'sum', 'cgpa', 'attendance', 'marks'];
  
  const timeKey = keys.find(key => {
    const lowerKey = key.toLowerCase();
    return /date|time|year|month|day|week|quarter|created|updated/i.test(lowerKey);
  });
  
  if (timeKey) {
    categoryKey = timeKey;
  } else {
    for (const key of keys) {
      const lowerKey = key.toLowerCase();
      if (categoryPatterns.some(p => lowerKey.includes(p)) && typeof data[0][key] !== 'number') {
        categoryKey = key;
        break;
      }
    }
  }
  
  for (const key of keys) {
    if (key === categoryKey) continue;
    const lowerKey = key.toLowerCase();
    if (valuePatterns.some(p => lowerKey.includes(p)) || typeof data[0][key] === 'number') {
      valueKey = key;
      break;
    }
  }
  
  if (!valueKey || typeof data[0][valueKey] !== 'number') {
    const numericKey = keys.find(key => typeof data[0][key] === 'number' && key !== categoryKey);
    if (numericKey) {
      valueKey = numericKey;
    }
  }

  // Check if category is a date/time column
  const isDateColumn = timeKey !== undefined;
  
  // Format data - preserve original for tooltip, create formatted version for display
  const chartData = data.map((item, index) => {
    const originalValue = item[categoryKey];
    let displayValue: string;
    
    if (isDateColumn) {
      displayValue = formatDateForChart(originalValue);
    } else {
      displayValue = String(originalValue || `Item ${index + 1}`).substring(0, 20);
    }
    
    return {
      ...item,
      [categoryKey]: displayValue,
      [`${categoryKey}_original`]: originalValue, // Keep original for tooltip
      [valueKey]: typeof item[valueKey] === 'number' ? item[valueKey] : parseFloat(String(item[valueKey])) || 0,
    };
  });

  const total = chartData.reduce((sum, item) => sum + (item[valueKey] || 0), 0);
  const avg = total / chartData.length;
  const maxValue = Math.max(...chartData.map(item => item[valueKey] || 0));
  const minValue = Math.min(...chartData.map(item => item[valueKey] || 0));

  // Custom tooltip
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
              <span className="w-2 h-2 rounded-full bg-green-500"></span>
              <span>Avg: <span className="font-semibold text-gray-900">{avg.toFixed(2)}</span></span>
            </div>
            <div className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-purple-500"></span>
              <span>Range: <span className="font-semibold text-gray-900">{minValue.toLocaleString()} - {maxValue.toLocaleString()}</span></span>
            </div>
          </div>
        </div>
      )}
      <div className="flex-1 p-6 min-h-[350px]" style={{ height: '350px' }}>
        <ResponsiveContainer width="100%" height={350}>
          <RechartsLineChart 
            data={chartData}
            margin={{ top: 10, right: 20, left: 0, bottom: needsRotation ? 80 : 50 }}
          >
            <defs>
              <linearGradient id="lineGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={GRADIENT_FROM} stopOpacity={0.3}/>
                <stop offset="100%" stopColor={GRADIENT_TO} stopOpacity={0.05}/>
              </linearGradient>
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
            <Area
              type="monotone"
              dataKey={valueKey}
              stroke="none"
              fill="url(#lineGradient)"
            />
            <Line 
              type="monotone" 
              dataKey={valueKey} 
              stroke={PRIMARY_COLOR} 
              strokeWidth={3}
              dot={{ fill: PRIMARY_COLOR, r: 4, strokeWidth: 2, stroke: '#fff' }}
              activeDot={{ r: 7, stroke: PRIMARY_COLOR, strokeWidth: 2, fill: '#fff' }}
              animationDuration={800}
              animationEasing="ease-out"
            />
          </RechartsLineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
