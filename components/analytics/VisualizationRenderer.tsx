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
      <div className="text-center text-gray-400 py-8">
        No data available for visualization
      </div>
    );
  }

  const props = { data, title };

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
      return <Table {...props} />;
  }
}

