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
  
  const strValue = String(value).trim();
  
  // CRITICAL: Don't format pure numbers as dates (e.g., "100", "981")
  // Only format if it looks like a date string (contains date separators or date patterns)
  const looksLikeDate = /^\d{4}-\d{2}-\d{2}|^\d{2}\/\d{2}\/\d{4}|^\d{2}-\d{2}-\d{4}|^\d{4}\/\d{2}\/\d{2}/.test(strValue);
  const isPureNumber = /^\d+$/.test(strValue);
  
  // If it's a pure number (no separators), don't treat it as a date
  if (isPureNumber && !looksLikeDate) {
    return strValue;
  }
  
  const date = parseDate(strValue);
  if (date) {
    // Additional validation: check if the parsed date makes sense
    // Reject dates that are clearly wrong (like year 100 for "100")
    const year = date.getFullYear();
    if (year < 1900 && isPureNumber) {
      // This is likely a number, not a date
      return strValue;
    }
    
    // Use readable format like "Jan 2024" or "2024-01-15"
    const formatted = formatDateReadable(date);
    if (formatted) return formatted;
    
    // Fallback to short date format
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

  // Improved column detection - check multiple rows
  const sampleSize = Math.min(5, data.length);
  const numericCols = keys.filter(key => {
    let numericCount = 0;
    for (let i = 0; i < sampleSize; i++) {
      const val = data[i]?.[key];
      if (val !== null && val !== undefined && typeof val === 'number') {
        numericCount++;
      }
    }
    return numericCount > sampleSize / 2;
  });

  const categoryPatterns = ['date', 'time', 'year', 'month', 'day', 'week', 'quarter', 'period', 'name', 'category', 'label', 'group', 'type'];
  const valuePatterns = ['value', 'count', 'total', 'amount', 'score', 'percentage', 'avg', 'average', 'sum', 'cgpa', 'attendance', 'marks', 'content', 'rate'];
  
  const timeKey = keys.find(key => {
    const lowerKey = key.toLowerCase();
    const isTimeByName = /date|time|year|month|day|week|quarter|created|updated|period/i.test(lowerKey);
    if (isTimeByName) {
      // Double-check: if column name suggests date, verify values are actually dates
      const sampleVal = data[0]?.[key];
      if (sampleVal !== null && sampleVal !== undefined) {
        const strVal = String(sampleVal);
        // Reject pure numbers even if column name suggests date
        if (/^\d+$/.test(strVal.trim())) {
          return false; // Pure number, not a date
        }
        // Only accept if it looks like a date string
        return /^\d{4}-\d{2}-\d{2}|^\d{2}\/\d{2}\/\d{4}|^\d{2}-\d{2}-\d{4}/.test(strVal);
      }
      return true; // Column name suggests date, assume it's correct
    }
    // Also check if values look like dates (but not pure numbers)
    const sampleVal = data[0]?.[key];
    if (sampleVal && typeof sampleVal === 'string') {
      const strVal = String(sampleVal).trim();
      // Reject pure numbers
      if (/^\d+$/.test(strVal)) {
        return false;
      }
      // Only accept actual date strings
      return /^\d{4}-\d{2}-\d{2}|^\d{2}\/\d{2}\/\d{4}|^\d{2}-\d{2}-\d{4}/.test(strVal);
    }
    return false;
  });
  
  if (timeKey) {
    categoryKey = timeKey;
    // Find value column excluding the time key
    valueKey = numericCols.find(k => k !== timeKey) || numericCols[0] || keys.find(k => k !== timeKey) || keys[1];
  } else {
    // Try to identify by column name patterns
    for (const key of keys) {
      const lowerKey = key.toLowerCase();
      if (categoryPatterns.some(p => lowerKey.includes(p))) {
        // Check if it's not numeric
        const isNumeric = numericCols.includes(key);
        if (!isNumeric || (isNumeric && keys.length === 2)) {
          categoryKey = key;
          break;
        }
      }
    }
  }
  
  // Find value column by name patterns or numeric type
  const valueKeyByName = keys.find(key => {
    if (key === categoryKey) return false;
    const lowerKey = key.toLowerCase();
    return valuePatterns.some(p => lowerKey.includes(p)) && numericCols.includes(key);
  });
  
  if (valueKeyByName) {
    valueKey = valueKeyByName;
  } else {
    // Fallback: find first numeric column that's not the category
    const numericKey = numericCols.find(key => key !== categoryKey);
    if (numericKey) {
      valueKey = numericKey;
    }
  }
  
  // Final validation
  if (!valueKey || !keys.includes(valueKey)) {
    valueKey = keys.find(k => k !== categoryKey && numericCols.includes(k)) || keys[1] || keys[0];
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

  // Enhanced custom tooltip with trend information
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      // Find original value if available
      const dataPoint = chartData.find(d => d[categoryKey] === label);
      const originalLabel = dataPoint?.[`${categoryKey}_original`] || label;
      const value = payload[0].value;
      const currentIndex = chartData.findIndex(d => d[categoryKey] === label);
      const previousValue = currentIndex > 0 ? chartData[currentIndex - 1][valueKey] : null;
      const change = previousValue !== null ? value - previousValue : null;
      const changePercent = change !== null && previousValue !== 0 
        ? ((change / previousValue) * 100).toFixed(1) 
        : null;
      
      return (
        <div className="bg-white border-2 border-gray-300 rounded-xl shadow-2xl p-4 min-w-[220px] backdrop-blur-sm">
          {/* Header */}
          <div className="mb-3 pb-3 border-b border-gray-200">
            <p className="text-gray-500 text-xs font-semibold uppercase tracking-wide mb-1">
              {categoryKey}
            </p>
            <p className="text-gray-900 text-base font-bold">
              {isDateColumn && originalLabel !== label ? String(originalLabel) : String(label)}
            </p>
          </div>
          
          {/* Value Display */}
          <div className="mb-3">
            <div className="flex items-baseline gap-2">
              <p className="text-gray-900 text-2xl font-bold">
                {typeof value === 'number' 
                  ? value.toLocaleString() 
                  : value}
              </p>
              <span className="text-gray-500 text-sm font-medium">{valueKey}</span>
            </div>
          </div>
          
          {/* Trend Information */}
          {change !== null && (
            <div className={`mb-3 p-2 rounded-lg ${change >= 0 ? 'bg-green-50' : 'bg-red-50'}`}>
              <div className="flex items-center gap-2">
                {change >= 0 ? (
                  <svg className="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                  </svg>
                ) : (
                  <svg className="w-4 h-4 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 17h8m0 0V9m0 8l-8-8-4 4-6-6" />
                  </svg>
                )}
                <div>
                  <p className={`text-sm font-bold ${change >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                    {change >= 0 ? '+' : ''}{change.toLocaleString()} ({changePercent}%)
                  </p>
                  <p className="text-xs text-gray-600">vs previous point</p>
                </div>
              </div>
            </div>
          )}
          
          {/* Statistics */}
          <div className="space-y-2 pt-3 border-t border-gray-100">
            <div className="flex justify-between items-center">
              <span className="text-xs text-gray-500">Position</span>
              <span className="text-sm font-semibold text-gray-700">
                #{currentIndex + 1} of {chartData.length}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-xs text-gray-500">vs Average</span>
              <span className={`text-sm font-bold ${value >= avg ? 'text-green-600' : 'text-red-600'}`}>
                {value >= avg ? '+' : ''}{((value - avg) / avg * 100).toFixed(1)}%
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-xs text-gray-500">Range</span>
              <span className="text-sm font-semibold text-purple-600">
                {minValue.toLocaleString()} - {maxValue.toLocaleString()}
              </span>
            </div>
          </div>
        </div>
      );
    }
    return null;
  };
  
  // For charts, always show all labels - don't hide any to ensure completeness
  // Only rotate labels if there are many data points or it's a date column
  const needsRotation = chartData.length > 5 || isDateColumn;

  return (
    <div className="w-full h-full min-h-[450px] bg-white rounded-xl border border-gray-200 shadow-lg hover:shadow-2xl transition-all duration-300 flex flex-col overflow-hidden group">
      {title && (
        <div className="px-6 pt-6 pb-4 border-b border-gray-100 bg-gradient-to-br from-blue-50 via-white to-purple-50">
          <h4 className="text-xl font-bold text-gray-900 mb-2">{title}</h4>
          <div className="flex items-center gap-4 text-xs text-gray-600 mt-2 flex-wrap">
            <div className="flex items-center gap-2 px-3 py-1.5 bg-blue-50 rounded-lg">
              <span className="w-2.5 h-2.5 rounded-full bg-blue-500 animate-pulse"></span>
              <span className="font-semibold text-gray-900">{total.toLocaleString()}</span>
              <span className="text-gray-500">Total</span>
            </div>
            <div className="flex items-center gap-2 px-3 py-1.5 bg-green-50 rounded-lg">
              <span className="w-2.5 h-2.5 rounded-full bg-green-500"></span>
              <span className="font-semibold text-gray-900">{avg.toFixed(2)}</span>
              <span className="text-gray-500">Average</span>
            </div>
            <div className="flex items-center gap-2 px-3 py-1.5 bg-purple-50 rounded-lg">
              <span className="w-2.5 h-2.5 rounded-full bg-purple-500"></span>
              <span className="font-semibold text-gray-900">{minValue.toLocaleString()}</span>
              <span className="text-gray-500">Min</span>
            </div>
            <div className="flex items-center gap-2 px-3 py-1.5 bg-orange-50 rounded-lg">
              <span className="w-2.5 h-2.5 rounded-full bg-orange-500"></span>
              <span className="font-semibold text-gray-900">{maxValue.toLocaleString()}</span>
              <span className="text-gray-500">Max</span>
            </div>
          </div>
        </div>
      )}
      <div className="flex-1 p-6 min-h-[350px] bg-gradient-to-br from-gray-50/50 to-white" style={{ height: '350px' }}>
        <ResponsiveContainer width="100%" height={350}>
          <RechartsLineChart 
            data={chartData}
            margin={{ top: 20, right: 30, left: 10, bottom: needsRotation ? 80 : 50 }}
          >
            <defs>
              <linearGradient id="lineGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={GRADIENT_FROM} stopOpacity={0.4}/>
                <stop offset="50%" stopColor={GRADIENT_FROM} stopOpacity={0.2}/>
                <stop offset="100%" stopColor={GRADIENT_TO} stopOpacity={0.05}/>
              </linearGradient>
              <filter id="lineShadow" x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur in="SourceAlpha" stdDeviation="2"/>
                <feOffset dx="0" dy="2" result="offsetblur"/>
                <feComponentTransfer>
                  <feFuncA type="linear" slope="0.2"/>
                </feComponentTransfer>
                <feMerge>
                  <feMergeNode/>
                  <feMergeNode in="SourceGraphic"/>
                </feMerge>
              </filter>
            </defs>
            <CartesianGrid 
              strokeDasharray="3 3" 
              stroke="#E5E7EB" 
              vertical={false}
              strokeWidth={1}
              opacity={0.5}
            />
            <XAxis 
              dataKey={categoryKey} 
              tick={{ 
                fill: '#6B7280', 
                fontSize: isDateColumn ? 10 : 11, 
                fontWeight: 600
              }}
              axisLine={{ stroke: '#D1D5DB', strokeWidth: 2 }}
              tickLine={{ stroke: '#D1D5DB', strokeWidth: 1 }}
              angle={needsRotation ? -45 : 0}
              textAnchor={needsRotation ? 'end' : 'middle'}
              height={needsRotation ? 80 : 40}
              interval={0}
              tickFormatter={(value) => {
                if (isDateColumn) {
                  return formatDateForChart(value);
                }
                const str = String(value);
                return str.length > 12 ? str.substring(0, 10) + '...' : str;
              }}
            />
            <YAxis 
              tick={{ fill: '#6B7280', fontSize: 11, fontWeight: 600 }}
              axisLine={{ stroke: '#D1D5DB', strokeWidth: 2 }}
              tickLine={{ stroke: '#D1D5DB', strokeWidth: 1 }}
              label={{ 
                value: valueKey, 
                angle: -90, 
                position: 'insideLeft', 
                fill: '#6B7280', 
                style: { fontSize: '13px', fontWeight: 700 } 
              }}
              width={80}
            />
            <Tooltip 
              content={<CustomTooltip />}
              cursor={{ stroke: PRIMARY_COLOR, strokeWidth: 2, strokeDasharray: '5 5' }}
            />
            <Area
              type="monotone"
              dataKey={valueKey}
              stroke="none"
              fill="url(#lineGradient)"
              animationDuration={1200}
              animationEasing="ease-out"
            />
            <Line 
              type="monotone" 
              dataKey={valueKey} 
              stroke={PRIMARY_COLOR} 
              strokeWidth={4}
              dot={{ fill: PRIMARY_COLOR, r: 5, strokeWidth: 3, stroke: '#fff' }}
              activeDot={{ r: 8, stroke: PRIMARY_COLOR, strokeWidth: 3, fill: '#fff', filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.2))' }}
              animationDuration={1200}
              animationEasing="ease-out"
              isAnimationActive={true}
              style={{ filter: 'url(#lineShadow)' }}
            />
          </RechartsLineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
