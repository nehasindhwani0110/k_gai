'use client';

import React from 'react';
import { BarChart as RechartsBarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell } from 'recharts';
import { parseDate, formatDateReadable } from '@/analytics-engine/utils/date-utils';

interface BarChartProps {
  data: any[];
  title?: string;
}

/**
 * Formats column name to descriptive label
 */
function formatColumnLabel(columnName: string): string {
  let label = columnName
    .replace(/_/g, ' ')
    .replace(/([A-Z])/g, ' $1')
    .trim()
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
  
  // Replace common abbreviations
  label = label.replace(/\bId\b/g, 'ID');
  label = label.replace(/\bAvg\b/g, 'Average');
  label = label.replace(/\bCnt\b/g, 'Count');
  label = label.replace(/\bPct\b/g, 'Percentage');
  label = label.replace(/\bNum\b/g, 'Number');
  
  // Make it more descriptive
  if (label.toLowerCase().includes('count')) {
    label = label.replace(/\bCount\b/i, 'Total Count');
  }
  if (label.toLowerCase().includes('amount')) {
    label = label.replace(/\bAmount\b/i, 'Total Amount');
  }
  
  return label;
}

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
  // CRITICAL: Only detect as date column if column name suggests it OR values are actual date strings
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
  
  // CRITICAL: Smart column selection - ALWAYS PREFER NAME/LABEL COLUMNS OVER IDs
  // Prefer columns with _name, _label, _formatted suffixes (added by enrichment)
  const nameLabelColumns = keys.filter(k => {
    const lower = k.toLowerCase();
    return lower.includes('_name') || lower.includes('_label') || lower.includes('_formatted') || 
           lower.includes('month_name') || lower.includes('date_label') ||
           lower === 'name'; // Direct name column
  });
  
  // CRITICAL: Detect ID columns and find corresponding name columns
  const idColumns = keys.filter(k => {
    const lower = k.toLowerCase();
    const sampleValue = data[0]?.[k];
    const isUUID = sampleValue && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(sampleValue));
    return lower.endsWith('_id') || lower.endsWith('id') || isUUID;
  });
  
  // For each ID column, check if there's a corresponding _name column
  const idToNameMapping = new Map<string, string>();
  idColumns.forEach(idCol => {
    const nameCol = keys.find(k => {
      const lower = k.toLowerCase();
      const idColBase = idCol.toLowerCase().replace(/_id$/, '').replace(/id$/, '');
      return (lower === `${idColBase}_name` || lower === `${idColBase}name` || lower === 'name') && k !== idCol;
    });
    if (nameCol) {
      idToNameMapping.set(idCol, nameCol);
    }
  });
  
  // Value column patterns (aggregations, metrics)
  const valuePatterns = ['count', 'total', 'sum', 'avg', 'average', 'mean', 'max', 'min', 'amount', 'value', 'score', 'rating', 'attendance', 'content', 'quantity'];
  // Category column patterns (dimensions, groups)
  const categoryPatterns = ['name', 'category', 'type', 'status', 'group', 'label', 'city', 'country', 'region', 'item'];
  
  // CRITICAL: ALWAYS prefer name/label columns for category - NEVER use IDs
  let categoryKey: string;
  if (nameLabelColumns.length > 0) {
    // Use enriched name columns first
    categoryKey = nameLabelColumns[0];
  } else {
    // Check if we have ID columns with corresponding name columns
    const idWithName = Array.from(idToNameMapping.values())[0];
    if (idWithName) {
      categoryKey = idWithName;
    } else {
      // Filter out ID columns from string columns
      const nonIdStringCols = stringCols.filter(k => {
        const lower = k.toLowerCase();
        const sampleValue = data[0]?.[k];
        const isUUID = sampleValue && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(sampleValue));
        return !lower.endsWith('_id') && !lower.endsWith('id') && !isUUID;
      });
      categoryKey = nonIdStringCols.length > 0 ? nonIdStringCols[0] : (stringCols.length > 0 ? stringCols[0] : keys[0]);
    }
  }
  
  let valueKey = numericCols.find(k => k !== categoryKey) || numericCols[0] || keys[1] || keys[0];
  
  // Prefer date_label or formatted date columns over raw dates
  const dateLabelKey = keys.find(k => {
    const lower = k.toLowerCase();
    return (lower.includes('date_label') || lower.includes('date_formatted') || lower.includes('month_name')) && 
           !lower.includes('_number');
  });
  
  // Prefer date/time column as category if available (with formatted version if exists)
  if (dateLabelKey) {
    categoryKey = dateLabelKey;
    valueKey = numericCols.find(k => k !== dateLabelKey && !k.toLowerCase().includes('_number')) || 
               numericCols[0] || keys.find(k => k !== dateLabelKey) || keys[1];
  } else if (timeKey) {
    categoryKey = timeKey;
    valueKey = numericCols.find(k => k !== timeKey && !k.toLowerCase().includes('_number')) || 
               numericCols[0] || keys.find(k => k !== timeKey) || keys[1];
  } else {
    // Try to identify by column name patterns - prefer names over IDs
    const categoryKeyByName = keys.find(key => {
      const lowerKey = key.toLowerCase();
      const isNameLabel = lowerKey.includes('_name') || lowerKey.includes('_label');
      const matchesPattern = categoryPatterns.some(p => lowerKey.includes(p));
      const isNotId = !lowerKey.endsWith('_id') && !lowerKey.endsWith('id');
      return (isNameLabel || (matchesPattern && isNotId)) && (stringCols.includes(key) || key === timeKey);
    });
    
    const valueKeyByName = keys.find(key => {
      const lowerKey = key.toLowerCase();
      return valuePatterns.some(p => lowerKey.includes(p)) && numericCols.includes(key);
    });
    
    if (categoryKeyByName) categoryKey = categoryKeyByName;
    if (valueKeyByName) valueKey = valueKeyByName;
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

  // Enhanced custom tooltip component with detailed information
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      // Find original value if available
      const dataPoint = chartData.find(d => d[categoryKey] === label);
      const originalLabel = dataPoint?.[`${categoryKey}_original`] || label;
      const value = payload[0].value;
      const percentage = ((value / total) * 100).toFixed(1);
      const isHighValue = value >= maxValue * 0.8;
      
      return (
        <div className="bg-white border-2 border-gray-300 rounded-xl shadow-2xl p-4 min-w-[200px] backdrop-blur-sm">
          {/* Header */}
          <div className="mb-3 pb-3 border-b border-gray-200">
            <p className="text-gray-500 text-xs font-semibold uppercase tracking-wide mb-1">
              {formatColumnLabel(categoryKey)}
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
              <span className="text-gray-500 text-sm font-medium">{formatColumnLabel(valueKey)}</span>
            </div>
          </div>
          
          {/* Statistics */}
          <div className="space-y-2 pt-3 border-t border-gray-100">
            <div className="flex justify-between items-center">
              <span className="text-xs text-gray-500">Percentage</span>
              <span className={`text-sm font-bold ${isHighValue ? 'text-green-600' : 'text-blue-600'}`}>
                {percentage}%
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-xs text-gray-500">Rank</span>
              <span className="text-sm font-semibold text-gray-700">
                #{chartData.findIndex(d => d[categoryKey] === label) + 1} of {chartData.length}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-xs text-gray-500">vs Max</span>
              <span className="text-sm font-semibold text-purple-600">
                {((value / maxValue) * 100).toFixed(1)}%
              </span>
            </div>
          </div>
          
          {/* Visual Indicator */}
          <div className="mt-3 pt-3 border-t border-gray-100">
            <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  isHighValue ? 'bg-gradient-to-r from-green-500 to-green-600' : 'bg-gradient-to-r from-blue-500 to-purple-600'
                }`}
                style={{ width: `${(value / maxValue) * 100}%` }}
              />
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
          <div className="flex items-center gap-6 text-xs text-gray-600 mt-2">
            <div className="flex items-center gap-2 px-3 py-1.5 bg-blue-50 rounded-lg">
              <span className="w-2.5 h-2.5 rounded-full bg-blue-500 animate-pulse"></span>
              <span className="font-semibold text-gray-900">{total.toLocaleString()}</span>
              <span className="text-gray-500">Total</span>
            </div>
            <div className="flex items-center gap-2 px-3 py-1.5 bg-purple-50 rounded-lg">
              <span className="w-2.5 h-2.5 rounded-full bg-purple-500"></span>
              <span className="font-semibold text-gray-900">{maxValue.toLocaleString()}</span>
              <span className="text-gray-500">Peak</span>
            </div>
            <div className="flex items-center gap-2 px-3 py-1.5 bg-green-50 rounded-lg">
              <span className="w-2.5 h-2.5 rounded-full bg-green-500"></span>
              <span className="font-semibold text-gray-900">{chartData.length}</span>
              <span className="text-gray-500">Items</span>
            </div>
          </div>
        </div>
      )}
      <div className="flex-1 p-6 min-h-[350px] bg-gradient-to-br from-gray-50/50 to-white" style={{ height: '350px' }}>
        <ResponsiveContainer width="100%" height={350}>
          <RechartsBarChart 
            data={chartData}
            margin={{ top: 20, right: 30, left: 10, bottom: needsRotation ? 80 : 50 }}
            barCategoryGap="20%"
          >
            <defs>
              {GRADIENT_COLORS.map((gradient, index) => (
                <React.Fragment key={index}>
                  <linearGradient id={`powerbiGradient${index}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={gradient.from} stopOpacity={1}/>
                    <stop offset="50%" stopColor={gradient.from} stopOpacity={0.9}/>
                    <stop offset="100%" stopColor={gradient.to} stopOpacity={0.7}/>
                  </linearGradient>
                  <filter id={`barShadow${index}`} x="-50%" y="-50%" width="200%" height="200%">
                    <feGaussianBlur in="SourceAlpha" stdDeviation="3"/>
                    <feOffset dx="0" dy="2" result="offsetblur"/>
                    <feComponentTransfer>
                      <feFuncA type="linear" slope="0.3"/>
                    </feComponentTransfer>
                    <feMerge>
                      <feMergeNode/>
                      <feMergeNode in="SourceGraphic"/>
                    </feMerge>
                  </filter>
                </React.Fragment>
              ))}
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
                value: formatColumnLabel(valueKey), 
                angle: -90, 
                position: 'insideLeft', 
                fill: '#6B7280', 
                style: { fontSize: '13px', fontWeight: 700 } 
              }}
              width={80}
            />
            <Tooltip 
              content={<CustomTooltip />}
              cursor={{ fill: 'rgba(59, 130, 246, 0.1)' }}
            />
            <Bar 
              dataKey={valueKey} 
              radius={[8, 8, 0, 0]}
              animationDuration={1200}
              animationEasing="ease-out"
              isAnimationActive={true}
            >
              {chartData.map((entry, index) => (
                <Cell 
                  key={`cell-${index}`} 
                  fill={`url(#powerbiGradient${index % GRADIENT_COLORS.length})`}
                  style={{ filter: `url(#barShadow${index % GRADIENT_COLORS.length})` }}
                />
              ))}
            </Bar>
          </RechartsBarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
