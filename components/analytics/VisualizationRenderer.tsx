'use client';

import { VisualizationType } from '@/analytics-engine/types';
import BarChart from './visualizations/BarChart';
import LineChart from './visualizations/LineChart';
import PieChart from './visualizations/PieChart';
import Table from './visualizations/Table';
import ScatterPlot from './visualizations/ScatterPlot';
import Gauge from './visualizations/Gauge';
import MapView from './visualizations/MapView';

interface VisualizationRendererProps {
  type: VisualizationType;
  data: any[];
  title?: string;
}

export default function VisualizationRenderer({
  type,
  data,
  title,
}: VisualizationRendererProps) {
  if (!data || data.length === 0) {
    return (
      <div className="w-full h-[400px] flex items-center justify-center bg-white rounded-lg border border-gray-200">
        <p className="text-gray-400 text-sm">No data available for visualization</p>
      </div>
    );
  }

  // Validate data structure
  if (!Array.isArray(data)) {
    console.error('[VisualizationRenderer] Data is not an array:', typeof data, data);
    return (
      <div className="w-full h-[400px] flex items-center justify-center bg-yellow-50 rounded-lg border border-yellow-200">
        <p className="text-yellow-600 text-sm">Invalid data format. Expected array, got {typeof data}.</p>
      </div>
    );
  }

  if (!data[0] || typeof data[0] !== 'object') {
    console.error('[VisualizationRenderer] Data items are not objects:', data[0]);
    return (
      <div className="w-full h-[400px] flex items-center justify-center bg-yellow-50 rounded-lg border border-yellow-200">
        <p className="text-yellow-600 text-sm">Invalid data format. Data items must be objects.</p>
      </div>
    );
  }

  const props = { data, title };

  try {
    // Validate data before rendering
    if (!data || !Array.isArray(data) || data.length === 0) {
      console.warn(`[VisualizationRenderer] Empty or invalid data for ${type}`);
      return (
        <div className="w-full h-[400px] flex flex-col items-center justify-center bg-yellow-50 rounded-lg border border-yellow-200">
          <p className="text-yellow-600 font-medium mb-2">No Data Available</p>
          <p className="text-yellow-500 text-sm">The query returned no results</p>
        </div>
      );
    }

    // Log what we're rendering
    console.log(`[VisualizationRenderer] Rendering ${type} with ${data.length} rows`, {
      columns: Object.keys(data[0] || {}),
      sampleRow: data[0]
    });

    switch (type) {
      case 'bar_chart':
        return <BarChart {...props} />;
      case 'line_chart':
        return <LineChart {...props} />;
      case 'pie_chart':
        return <PieChart {...props} />;
      case 'table':
        return <Table {...props} />;
      case 'scatter_plot':
        return <ScatterPlot {...props} />;
      case 'gauge':
        return <Gauge {...props} />;
      case 'map_view':
        return <MapView {...props} />;
      default:
        console.warn(`[VisualizationRenderer] Unknown visualization type: ${type}, defaulting to table`);
        return <Table {...props} />;
    }
  } catch (error: any) {
    console.error('[VisualizationRenderer] Error rendering visualization:', error, { 
      type, 
      dataLength: data?.length, 
      sampleData: data?.[0],
      errorMessage: error?.message,
      errorStack: error?.stack
    });
    return (
      <div className="w-full h-[400px] flex flex-col items-center justify-center bg-red-50 rounded-lg border border-red-200 p-4">
        <p className="text-red-600 font-medium mb-2">Visualization Error</p>
        <p className="text-red-500 text-sm mb-1">Type: {type}</p>
        <p className="text-red-500 text-xs mb-2">{error?.message || 'Unknown error'}</p>
        <p className="text-red-400 text-xs mt-1">Check browser console for details</p>
      </div>
    );
  }
}

