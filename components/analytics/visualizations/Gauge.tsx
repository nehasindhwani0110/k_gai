'use client';

interface GaugeProps {
  data: any[];
  title?: string;
}

export default function Gauge({ data, title }: GaugeProps) {
  if (!data || data.length === 0) {
    return (
      <div className="w-full h-[400px] flex items-center justify-center bg-white rounded-lg border border-gray-200">
        <p className="text-gray-400 text-sm">No data available</p>
      </div>
    );
  }

  // Extract value from data
  let value = 0;
  let maxValue = 100;
  let label = 'Value';

  if (data && data.length > 0) {
    const firstRow = data[0];
    const keys = Object.keys(firstRow);
    const numericKeys = keys.filter((key) => {
      const val = firstRow[key];
      return typeof val === 'number' || !isNaN(Number(val));
    });

    if (numericKeys.length > 0) {
      value = Number(firstRow[numericKeys[0]]) || 0;
      label = numericKeys[0].replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
    }

    if (numericKeys.length > 1) {
      maxValue = Number(firstRow[numericKeys[1]]) || 100;
    } else {
      const allValues = data.map(row => {
        const val = row[numericKeys[0]];
        return typeof val === 'number' ? val : parseFloat(String(val)) || 0;
      });
      maxValue = Math.max(...allValues, 100);
    }
  }

  const percentage = Math.min((value / maxValue) * 100, 100);
  const circumference = 2 * Math.PI * 85;
  const offset = circumference - (percentage / 100) * circumference;

  // PowerBI-style color scheme
  const getColor = (percent: number) => {
    if (percent >= 80) return { main: '#107C10', light: '#E8F5E9' }; // Green
    if (percent >= 60) return { main: '#0078D4', light: '#E3F2FD' }; // Blue
    if (percent >= 40) return { main: '#FFB900', light: '#FFF8E1' }; // Gold
    return { main: '#E3008C', light: '#FCE4EC' }; // Pink
  };

  const colors = getColor(percentage);

  return (
    <div className="w-full h-full min-h-[450px] bg-white rounded-lg border border-gray-200 shadow-sm hover:shadow-md transition-shadow duration-300 flex flex-col overflow-hidden">
      {title && (
        <div className="px-6 pt-5 pb-3 border-b border-gray-100 bg-gradient-to-r from-gray-50 to-white">
          <h4 className="text-lg font-semibold text-gray-900 mb-1">{title}</h4>
        </div>
      )}
      <div className="flex-1 p-8 flex flex-col items-center justify-center min-h-[350px]">
        <div className="relative w-64 h-64 mb-6">
          <svg className="transform -rotate-90 w-64 h-64">
            {/* Background circle */}
            <circle
              cx="128"
              cy="128"
              r="85"
              stroke="#E5E7EB"
              strokeWidth="16"
              fill="transparent"
            />
            {/* Progress circle with gradient */}
            <defs>
              <linearGradient id="gaugeGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor={colors.main} stopOpacity={1} />
                <stop offset="100%" stopColor={colors.main} stopOpacity={0.7} />
              </linearGradient>
            </defs>
            <circle
              cx="128"
              cy="128"
              r="85"
              stroke="url(#gaugeGradient)"
              strokeWidth="16"
              fill="transparent"
              strokeDasharray={circumference}
              strokeDashoffset={offset}
              className="transition-all duration-1000 ease-out"
              strokeLinecap="round"
              style={{ filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.1))' }}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <div className="text-center">
              <div 
                className="text-5xl font-bold mb-1"
                style={{ color: colors.main }}
              >
                {value.toLocaleString()}
              </div>
              <div className="text-sm text-gray-500 mt-1">of {maxValue.toLocaleString()}</div>
              <div className="text-xs text-gray-400 mt-2 font-medium">{label}</div>
            </div>
          </div>
        </div>
        <div className="text-center mt-4">
          <div 
            className="text-4xl font-bold mb-2"
            style={{ color: colors.main }}
          >
            {percentage.toFixed(1)}%
          </div>
          <div className="text-sm text-gray-600 font-medium">Completion</div>
          <div className="mt-4 flex items-center justify-center gap-2">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg" style={{ backgroundColor: colors.light }}>
              <span 
                className="w-3 h-3 rounded-full"
                style={{ backgroundColor: colors.main }}
              ></span>
              <span className="text-xs font-medium text-gray-700">
                {percentage >= 80 ? 'Excellent' : percentage >= 60 ? 'Good' : percentage >= 40 ? 'Fair' : 'Needs Improvement'}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
