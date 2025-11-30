'use client';

import { useState, useEffect } from 'react';
import { toast } from 'react-hot-toast';
import { DashboardMetricsResponse, DashboardMetric, VisualizationType } from '@/analytics-engine/types';
import VisualizationRenderer from './VisualizationRenderer';
import { autoSelectVisualizationType } from '@/analytics-engine/services/visualization-selector';

interface DashboardMetricsProps {
  metadata: any;
}

export default function DashboardMetrics({ metadata }: DashboardMetricsProps) {
  const [loading, setLoading] = useState(true);
  const [metrics, setMetrics] = useState<DashboardMetric[]>([]);
  const [metricResults, setMetricResults] = useState<Record<string, any[]>>({});

  useEffect(() => {
    loadDashboardMetrics();
  }, [metadata]);

  const loadDashboardMetrics = async () => {
    setLoading(true);
    try {
      // Validate metadata for CSV files
      if (metadata?.source_type === 'CSV_FILE' && !metadata?.file_path) {
        throw new Error('File path is missing. Please re-upload your CSV file.');
      }
      const response = await fetch('/api/analytics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'DASHBOARD_METRICS',
          metadata,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to generate dashboard metrics');
      }

      const data: DashboardMetricsResponse = await response.json();
      setMetrics(data.dashboard_metrics || []);

      // Execute queries for all metrics
      for (const metric of data.dashboard_metrics) {
        await executeMetricQuery(metric);
      }
    } catch (error) {
      console.error('Error:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to load dashboard metrics');
    } finally {
      setLoading(false);
    }
  };

  const executeMetricQuery = async (metric: DashboardMetric) => {
    try {
      // Build request body - prioritize file_path detection
      const requestBody: any = {
        query_type: metric.query_type,
        query_content: metric.query_content,
        source_type: metadata?.source_type || 'SQL_DB',
      };

      // ALWAYS include file_path if it exists in metadata (regardless of source_type)
      // This ensures CSV files work even if source_type is incorrectly set
      if (metadata?.file_path) {
        requestBody.file_path = metadata.file_path;
        // Also set source_type to CSV_FILE if file_path exists
        requestBody.source_type = 'CSV_FILE';
      } else if (metadata?.source_type === 'CSV_FILE') {
        // CSV source type but no file_path - error
        console.error(`Missing file_path for CSV_FILE source type in metric: ${metric.metric_name}`);
        setMetricResults((prev) => ({
          ...prev,
          [metric.metric_name]: [],
        }));
        return;
      } else {
        // For SQL databases, include connection_string if available
        requestBody.connection_string = process.env.NEXT_PUBLIC_DB_CONNECTION_STRING || metadata?.connection_string;
      }

      const response = await fetch('/api/analytics/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });

      if (response.ok) {
        const data = await response.json();
        const results = data.results || [];
        setMetricResults((prev) => ({
          ...prev,
          [metric.metric_name]: results,
        }));
      } else {
        const errorData = await response.json().catch(() => ({}));
        console.error(`Error executing query for ${metric.metric_name}:`, errorData.error || errorData.details);
        // Set empty results to show error state
        setMetricResults((prev) => ({
          ...prev,
          [metric.metric_name]: [],
        }));
      }
    } catch (error) {
      console.error(`Error executing query for ${metric.metric_name}:`, error);
      // Set empty results to show error state
      setMetricResults((prev) => ({
        ...prev,
        [metric.metric_name]: [],
      }));
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <div className="text-lg text-gray-600">Loading dashboard metrics...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-7xl mx-auto p-6">
      <div className="mb-8">
        <h2 className="text-4xl font-bold text-gray-800 mb-2">Dashboard Metrics</h2>
        <p className="text-gray-600">Comprehensive analytics overview</p>
      </div>
      
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {metrics.map((metric, index) => {
          const hasData = metricResults[metric.metric_name] && metricResults[metric.metric_name].length > 0;
          const isLoading = metricResults[metric.metric_name] === undefined;
          
          return (
            <div 
              key={metric.metric_name} 
              className="bg-white rounded-2xl p-6 shadow-xl border border-gray-100 hover:shadow-2xl transition-all duration-300 transform hover:-translate-y-1"
            >
              <div className="mb-4">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-xl font-bold text-gray-800">{metric.metric_name}</h3>
                  <div className={`w-3 h-3 rounded-full ${hasData ? 'bg-green-500' : isLoading ? 'bg-yellow-500 animate-pulse' : 'bg-red-500'}`}></div>
                </div>
                <p className="text-sm text-gray-600 leading-relaxed">{metric.insight_summary}</p>
              </div>
              
              <div className="min-h-[320px]">
                {hasData && (() => {
                  try {
                    const rawVizType = metric.visualization_type;
                    let vizType: VisualizationType;
                    
                    // Auto-select visualization type if needed
                    if (rawVizType === 'auto' || !rawVizType || typeof rawVizType !== 'string') {
                      vizType = autoSelectVisualizationType(
                        metricResults[metric.metric_name],
                        metric.query_content || ''
                      );
                    } else {
                      vizType = rawVizType as VisualizationType;
                    }
                    
                    // Ensure we have a valid type
                    if (!vizType || vizType === 'auto') {
                      vizType = 'table';
                    }
                    
                    return (
                      <VisualizationRenderer
                        type={vizType}
                        data={metricResults[metric.metric_name]}
                        title={metric.metric_name}
                      />
                    );
                  } catch (error) {
                    console.error('Visualization error:', error);
                    return (
                      <div className="flex flex-col items-center justify-center h-80 bg-gradient-to-br from-yellow-50 to-orange-50 rounded-xl border-2 border-dashed border-yellow-200">
                        <svg className="w-16 h-16 text-yellow-400 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                        </svg>
                        <p className="text-yellow-600 font-medium">Visualization Error</p>
                        <p className="text-sm text-yellow-400 mt-1">Check console for details</p>
                      </div>
                    );
                  }
                })()}
                
                {!hasData && !isLoading && (
                  <div className="flex flex-col items-center justify-center h-80 bg-gradient-to-br from-red-50 to-pink-50 rounded-xl border-2 border-dashed border-red-200">
                    <svg className="w-16 h-16 text-red-400 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <p className="text-red-600 font-medium">Failed to load data</p>
                    <p className="text-sm text-red-400 mt-1">Check console for details</p>
                  </div>
                )}
                
                {isLoading && (
                  <div className="flex flex-col items-center justify-center h-80 bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mb-4"></div>
                    <p className="text-blue-600 font-medium">Loading data...</p>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
