'use client';

interface GaugeProps {
  data: any[];
  title?: string;
}

export default function Gauge({ data, title }: GaugeProps) {
  if (!data || data.length === 0) {
    return (
      <div className="w-full h-80 flex items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100 rounded-lg">
        <p className="text-gray-400">No data available</p>
      </div>
    );
  }

  // Extract value from data - assume first numeric value
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

    // Try to find max value or use 100 as default
    if (numericKeys.length > 1) {
      maxValue = Number(firstRow[numericKeys[1]]) || 100;
    } else {
      // Try to infer max from data
      const allValues = data.map(row => {
        const val = row[numericKeys[0]];
        return typeof val === 'number' ? val : parseFloat(val) || 0;
      });
      maxValue = Math.max(...allValues, 100);
    }
  }

  const percentage = Math.min((value / maxValue) * 100, 100);
  const circumference = 2 * Math.PI * 70;
  const offset = circumference - (percentage / 100) * circumference;

  // Determine color based on percentage
  const getColor = (percent: number) => {
    if (percent >= 80) return '#10b981'; // green
    if (percent >= 60) return '#3b82f6'; // blue
    if (percent >= 40) return '#f59e0b'; // yellow
    return '#ef4444'; // red
  };

  const color = getColor(percentage);

  return (
    <div className="w-full h-80 bg-gradient-to-br from-white to-indigo-50 rounded-xl p-6 shadow-lg border border-indigo-100 flex flex-col items-center justify-center">
      {title && (
        <h4 className="text-lg font-bold text-gray-800 mb-2 text-center">{title}</h4>
      )}
      <div className="relative w-48 h-48 mb-4">
        <svg className="transform -rotate-90 w-48 h-48">
          {/* Background circle */}
          <circle
            cx="96"
            cy="96"
            r="70"
            stroke="currentColor"
            strokeWidth="12"
            fill="transparent"
            className="text-gray-200"
          />
          {/* Progress circle */}
          <circle
            cx="96"
            cy="96"
            r="70"
            stroke={color}
            strokeWidth="12"
            fill="transparent"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            className="transition-all duration-1000 ease-out"
            strokeLinecap="round"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <div className="text-center">
            <div className="text-4xl font-bold" style={{ color }}>
              {value.toFixed(1)}
            </div>
            <div className="text-sm text-gray-500 mt-1">of {maxValue.toLocaleString()}</div>
            <div className="text-xs text-gray-400 mt-1">{label}</div>
          </div>
        </div>
      </div>
      <div className="text-center">
        <div className="text-3xl font-bold" style={{ color }}>
          {percentage.toFixed(1)}%
        </div>
        <div className="text-sm text-gray-600 mt-1">Completion</div>
      </div>
    </div>
  );
}
