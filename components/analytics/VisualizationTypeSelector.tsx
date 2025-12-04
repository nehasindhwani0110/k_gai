'use client';

import { useState } from 'react';
import { VisualizationType } from '@/analytics-engine/types';

interface VisualizationTypeSelectorProps {
  currentType: VisualizationType;
  onTypeChange: (type: VisualizationType) => void;
  availableTypes?: VisualizationType[];
  className?: string;
}

const visualizationTypes: {
  type: VisualizationType;
  label: string;
  icon: string;
  description: string;
}[] = [
  {
    type: 'bar_chart',
    label: 'Bar Chart',
    icon: '📊',
    description: 'Compare values across categories',
  },
  {
    type: 'line_chart',
    label: 'Line Chart',
    icon: '📈',
    description: 'Show trends over time',
  },
  {
    type: 'pie_chart',
    label: 'Pie Chart',
    icon: '🥧',
    description: 'Show proportions and distributions',
  },
  {
    type: 'scatter_plot',
    label: 'Scatter Plot',
    icon: '⚫',
    description: 'Show relationships between variables',
  },
  {
    type: 'gauge',
    label: 'Gauge',
    icon: '🎯',
    description: 'Show single metric/KPI',
  },
  {
    type: 'table',
    label: 'Table',
    icon: '📋',
    description: 'Show detailed data in rows',
  },
];

export default function VisualizationTypeSelector({
  currentType,
  onTypeChange,
  availableTypes,
  className = '',
}: VisualizationTypeSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);

  // Filter available types if provided
  const typesToShow = availableTypes
    ? visualizationTypes.filter(t => availableTypes.includes(t.type))
    : visualizationTypes;

  const currentViz = visualizationTypes.find(v => v.type === currentType) || visualizationTypes[0];

  return (
    <div className={`relative ${className}`}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-lg hover:from-blue-700 hover:to-purple-700 transition-all duration-200 shadow-lg hover:shadow-xl transform hover:scale-105"
        title="Change visualization type"
      >
        <span className="text-xl">{currentViz.icon}</span>
        <span className="font-medium text-sm">{currentViz.label}</span>
        <svg
          className={`w-4 h-4 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-40"
            onClick={() => setIsOpen(false)}
          />

          {/* Dropdown Menu */}
          <div className="absolute top-full left-0 mt-2 w-64 bg-white rounded-xl shadow-2xl border border-gray-200 z-50 overflow-hidden">
            <div className="p-2">
              <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider px-3 py-2">
                Visualization Types
              </div>
              {typesToShow.map((viz) => {
                const isSelected = viz.type === currentType;
                return (
                  <button
                    key={viz.type}
                    onClick={() => {
                      onTypeChange(viz.type);
                      setIsOpen(false);
                    }}
                    className={`w-full flex items-start gap-3 px-3 py-3 rounded-lg transition-all duration-200 text-left group ${
                      isSelected
                        ? 'bg-gradient-to-r from-blue-50 to-purple-50 border-2 border-blue-500'
                        : 'hover:bg-gray-50 border-2 border-transparent'
                    }`}
                  >
                    <span className="text-2xl">{viz.icon}</span>
                    <div className="flex-1 min-w-0">
                      <div className={`font-medium text-sm ${isSelected ? 'text-blue-700' : 'text-gray-800'}`}>
                        {viz.label}
                        {isSelected && (
                          <span className="ml-2 text-blue-600">✓</span>
                        )}
                      </div>
                      <div className={`text-xs mt-0.5 ${isSelected ? 'text-blue-600' : 'text-gray-500'}`}>
                        {viz.description}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

