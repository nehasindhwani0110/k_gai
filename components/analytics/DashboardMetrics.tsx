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
  const [metricResults, setMetricResults] = useState<Record<string, any[] | string>>({});
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  const [autoRefreshEnabled, setAutoRefreshEnabled] = useState(true);
  const [selectedMetric, setSelectedMetric] = useState<{ metric: DashboardMetric; data: any[] } | null>(null);

  useEffect(() => {
    loadDashboardMetrics();
  }, [metadata]);

  // Auto-refresh every hour (3600000 ms)
  useEffect(() => {
    if (!autoRefreshEnabled) return;

    const intervalId = setInterval(() => {
      console.log('Auto-refreshing dashboard metrics...');
      loadDashboardMetrics();
      setLastRefresh(new Date());
    }, 3600000); // 1 hour = 3600000 milliseconds

    return () => clearInterval(intervalId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRefreshEnabled, metadata]);

  const loadDashboardMetrics = async () => {
    setLoading(true);
    try {
      setLastRefresh(new Date());
      // Validate metadata for file-based sources
      const fileBasedSources = ['CSV_FILE', 'EXCEL_FILE', 'JSON_FILE', 'TXT_FILE', 'GOOGLE_DRIVE'];
      if (metadata?.source_type && fileBasedSources.includes(metadata.source_type) && !metadata?.file_path) {
        throw new Error(`File path is missing. Please re-upload your ${metadata.source_type.replace('_FILE', '')} file.`);
      }
      
      // Get connection string for SQL databases (from metadata or sessionStorage)
      const connectionString = metadata?.connection_string || 
        (typeof window !== 'undefined' ? sessionStorage.getItem('connectionString') : null) ||
        process.env.NEXT_PUBLIC_DB_CONNECTION_STRING;
      
      // Check if agents should be used (for large databases)
      const useAgent = process.env.NEXT_PUBLIC_USE_AGENT_BASED_QUERIES === 'true' || 
        (metadata?.tables && metadata.tables.length > 10);
      
      const response = await fetch('/api/analytics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'DASHBOARD_METRICS',
          metadata,
          ...(useAgent && { use_agent: true }),
          ...(connectionString && { connection_string: connectionString }),
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to generate dashboard metrics');
      }

      const data: DashboardMetricsResponse = await response.json();
      const allMetrics = data.dashboard_metrics || [];
      
      // Execute queries for all metrics and collect results
      const metricsWithData: DashboardMetric[] = [];
      
      for (const metric of allMetrics) {
        const result = await executeMetricQuery(metric);
        
        // Only include metrics that have data and no errors
        if (result.hasData && !result.hasError) {
          metricsWithData.push(metric);
        }
      }
      
      // Update metrics to only include those with data
      // If we have fewer than 3 metrics with data, keep all and let errors show
      if (metricsWithData.length >= 3) {
        setMetrics(metricsWithData);
        console.log(`[DASHBOARD] Filtered to ${metricsWithData.length} metrics with data out of ${allMetrics.length} total`);
      } else {
        // Keep all metrics but they'll show errors if no data
        setMetrics(allMetrics);
        console.log(`[DASHBOARD] Only ${metricsWithData.length} metrics have data, showing all ${allMetrics.length} metrics`);
      }
    } catch (error) {
      console.error('Error:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to load dashboard metrics');
    } finally {
      setLoading(false);
    }
  };

  const executeMetricQuery = async (metric: DashboardMetric): Promise<{ hasData: boolean; hasError: boolean }> => {
    try {
      // Build request body - prioritize file_path detection
      const requestBody: any = {
        query_type: metric.query_type,
        query_content: metric.query_content,
        source_type: metadata?.source_type || 'SQL_DB',
      };

      // ALWAYS include file_path if it exists in metadata (regardless of source_type)
      // This ensures file-based sources work correctly
      if (metadata?.file_path) {
        requestBody.file_path = metadata.file_path;
        // Use the actual source_type from metadata, or detect from file extension
        if (metadata?.source_type && ['CSV_FILE', 'EXCEL_FILE', 'JSON_FILE', 'TXT_FILE', 'GOOGLE_DRIVE'].includes(metadata.source_type)) {
          requestBody.source_type = metadata.source_type;
        } else {
          // Fallback: detect from file extension
          const ext = metadata.file_path.toLowerCase().split('.').pop();
          if (ext === 'xlsx' || ext === 'xls') {
            requestBody.source_type = 'EXCEL_FILE';
            requestBody.file_type = 'EXCEL';
          } else if (ext === 'json') {
            requestBody.source_type = 'JSON_FILE';
            requestBody.file_type = 'JSON';
          } else if (ext === 'txt') {
            requestBody.source_type = 'TXT_FILE';
            requestBody.file_type = 'TXT';
          } else {
            requestBody.source_type = 'CSV_FILE';
            requestBody.file_type = 'CSV';
          }
        }
        // Include file_type if available in metadata
        if (metadata?.file_type) {
          requestBody.file_type = metadata.file_type;
        }
      } else if (metadata?.source_type && ['CSV_FILE', 'EXCEL_FILE', 'JSON_FILE', 'TXT_FILE', 'GOOGLE_DRIVE'].includes(metadata.source_type)) {
        // CSV source type but no file_path - error
        console.error(`Missing file_path for CSV_FILE source type in metric: ${metric.metric_name}`);
        setMetricResults((prev) => ({
          ...prev,
          [metric.metric_name]: [],
          [`${metric.metric_name}_error`]: 'Missing file path',
        }));
        return { hasData: false, hasError: true };
      } else {
        // For SQL databases, get connection_string from multiple sources
        let connectionString = metadata?.connection_string;
        
        // If not in metadata, try to fetch from data source API
        if (!connectionString && typeof window !== 'undefined') {
          const dataSourceId = sessionStorage.getItem('dataSourceId');
          if (dataSourceId) {
            try {
              // Fetch source metadata which includes connection_string
              const sourceResponse = await fetch(`/api/analytics/data-sources/${dataSourceId}/schema?type=source`);
              if (sourceResponse.ok) {
                const sourceMetadata = await sourceResponse.json();
                connectionString = sourceMetadata.connection_string;
                // Update metadata with connection_string for future use
                if (connectionString && metadata) {
                  metadata.connection_string = connectionString;
                }
              }
            } catch (error) {
              console.warn('Failed to fetch connection_string from data source:', error);
            }
          }
        }
        
        // Fallback to sessionStorage or env variable
        if (!connectionString && typeof window !== 'undefined') {
          connectionString = sessionStorage.getItem('connectionString') || undefined;
        }
        
        if (!connectionString) {
          connectionString = process.env.NEXT_PUBLIC_DB_CONNECTION_STRING || undefined;
        }
        
        if (connectionString) {
          requestBody.connection_string = connectionString;
        } else {
          console.error(`Missing connection_string for SQL_DB source type in metric: ${metric.metric_name}`);
          setMetricResults((prev) => ({
            ...prev,
            [metric.metric_name]: [],
            [`${metric.metric_name}_error`]: 'Missing connection string. Please reconfigure your data source.',
          }));
          return { hasData: false, hasError: true };
        }
      }

      const response = await fetch('/api/analytics/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });

      if (response.ok) {
        const data = await response.json();
        const results = data.results || [];
        const hasData = Array.isArray(results) && results.length > 0;
        
        setMetricResults((prev) => ({
          ...prev,
          [metric.metric_name]: results,
        }));
        
        return { hasData, hasError: false };
      } else {
        const errorData = await response.json().catch(() => ({}));
        const errorMessage = errorData.error || errorData.details || 'Query execution failed';
        console.error(`Error executing query for ${metric.metric_name}:`, errorMessage);
        
        // Set error state (empty array with error flag)
        setMetricResults((prev) => ({
          ...prev,
          [metric.metric_name]: [],
          [`${metric.metric_name}_error`]: errorMessage,
        }));
        
        // Show warning toast for backend connection errors
        if (errorMessage.includes('Python backend') || errorMessage.includes('BackendConnectionError') || errorMessage.includes('Cannot connect') || errorMessage.includes('ECONNREFUSED')) {
          toast.error(`Backend Connection Error: Python backend is not running. Please start it with: npm run python:backend`, {
            duration: 10000,
          });
        }
        // Show warning toast for SQL errors (column, table, syntax issues)
        else if (errorMessage.includes('syntax') || errorMessage.includes('column') || errorMessage.includes('table') || errorMessage.includes('Column error') || errorMessage.includes('Table error')) {
          // Extract the actual error message (after colon if present)
          const actualError = errorMessage.includes(':') 
            ? errorMessage.split(':').slice(1).join(':').trim()
            : errorMessage;
          toast.error(`Query error for "${metric.metric_name}": ${actualError.substring(0, 150)}`, {
            duration: 6000,
          });
        }
        
        return { hasData: false, hasError: true };
      }
    } catch (error) {
      console.error(`Error executing query for ${metric.metric_name}:`, error);
      // Set empty results to show error state
      setMetricResults((prev) => ({
        ...prev,
        [metric.metric_name]: [],
        [`${metric.metric_name}_error`]: error instanceof Error ? error.message : 'Unknown error',
      }));
      
      return { hasData: false, hasError: true };
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

  const formatTimeUntilRefresh = () => {
    const now = new Date();
    const timeSinceRefresh = now.getTime() - lastRefresh.getTime();
    const timeUntilNextRefresh = 3600000 - timeSinceRefresh; // 1 hour in ms
    
    if (timeUntilNextRefresh <= 0) return 'Refreshing...';
    
    const minutes = Math.floor(timeUntilNextRefresh / 60000);
    const seconds = Math.floor((timeUntilNextRefresh % 60000) / 1000);
    return `${minutes}m ${seconds}s`;
  };

  const handleManualRefresh = () => {
    loadDashboardMetrics();
    setLastRefresh(new Date());
    toast.success('Dashboard refreshed');
  };

  return (
    <div className="w-full max-w-7xl mx-auto p-6">
      <div className="mb-8 flex justify-between items-center">
        <div>
          <h2 className="text-3xl font-bold text-gray-800 mb-2">Dashboard Metrics</h2>
          <p className="text-gray-600">
            {autoRefreshEnabled ? (
              <>Auto-refresh enabled • Next refresh in: <span className="font-semibold">{formatTimeUntilRefresh()}</span></>
            ) : (
              'Auto-refresh disabled'
            )}
          </p>
        </div>
        <div className="flex gap-3 items-center">
          <button
            onClick={() => setAutoRefreshEnabled(!autoRefreshEnabled)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              autoRefreshEnabled
                ? 'bg-green-100 text-green-700 hover:bg-green-200'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            {autoRefreshEnabled ? '✓ Auto-refresh ON' : 'Auto-refresh OFF'}
          </button>
          <button
            onClick={handleManualRefresh}
            disabled={loading}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
          >
            {loading ? 'Refreshing...' : '🔄 Refresh Now'}
          </button>
        </div>
      </div>
      
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {metrics.map((metric, index) => {
          const metricData = metricResults[metric.metric_name];
          const hasData = Array.isArray(metricData) && metricData.length > 0;
          const isLoading = metricData === undefined;
          const errorData = metricResults[`${metric.metric_name}_error`];
          const hasError = typeof errorData === 'string' ? errorData : undefined;
          
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
              
              <div className="min-h-[400px] flex flex-col">
                {hasError ? (
                  <div className={`flex flex-col items-center justify-center h-80 rounded-xl border-2 border-dashed p-6 ${
                    hasError.includes('Python backend') || hasError.includes('BackendConnectionError') || hasError.includes('Cannot connect')
                      ? 'bg-gradient-to-br from-yellow-50 to-orange-50 border-yellow-300'
                      : 'bg-gradient-to-br from-red-50 to-pink-50 border-red-200'
                  }`}>
                    <div className={`text-4xl mb-4 ${
                      hasError.includes('Python backend') || hasError.includes('BackendConnectionError') || hasError.includes('Cannot connect')
                        ? 'text-yellow-600'
                        : 'text-red-500'
                    }`}>⚠️</div>
                    <h4 className={`text-lg font-semibold mb-2 ${
                      hasError.includes('Python backend') || hasError.includes('BackendConnectionError') || hasError.includes('Cannot connect')
                        ? 'text-yellow-700'
                        : 'text-red-700'
                    }`}>
                      {hasError.includes('Python backend') || hasError.includes('BackendConnectionError') || hasError.includes('Cannot connect')
                        ? 'Backend Not Running'
                        : 'Query Execution Error'}
                    </h4>
                    <div className={`text-sm text-center max-w-lg px-4 space-y-2 ${
                      hasError.includes('Python backend') || hasError.includes('BackendConnectionError') || hasError.includes('Cannot connect')
                        ? 'text-yellow-700'
                        : 'text-red-600'
                    }`}>
                      {hasError.includes('Python backend') || hasError.includes('BackendConnectionError') || hasError.includes('Cannot connect') ? (
                        <div className="space-y-3">
                          <p className="font-semibold">The Python backend server is not running.</p>
                          <p>To fix this, run in a separate terminal:</p>
                          <code className="block bg-yellow-200 text-yellow-900 px-4 py-3 rounded font-mono text-xs mt-2 border border-yellow-300">
                            npm run python:backend
                          </code>
                          <p className="text-xs mt-2 opacity-75">Or manually: cd analytics-engine/python-backend && python api_server.py</p>
                        </div>
                      ) : (
                        <>
                          <p className="font-medium">
                            {hasError.includes(':') ? hasError.split(':')[0] + ':' : 'Error:'}
                          </p>
                          <p className="bg-red-100 rounded p-3 text-xs font-mono break-words">
                            {hasError.includes(':') 
                              ? hasError.split(':').slice(1).join(':').trim()
                              : hasError}
                          </p>
                        </>
                      )}
                    </div>
                    {!(hasError.includes('Python backend') || hasError.includes('BackendConnectionError') || hasError.includes('Cannot connect')) && (
                      <p className="text-xs text-red-500 mt-4 opacity-75">
                        This metric could not be loaded. The query may need refinement or the columns/tables may not exist.
                      </p>
                    )}
                  </div>
                ) : isLoading ? (
                  <div className="flex flex-col items-center justify-center h-80">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mb-4"></div>
                    <p className="text-gray-500">Loading data...</p>
                  </div>
                ) : hasData ? (() => {
                  try {
                    const rawVizType = metric.visualization_type;
                    let vizType: VisualizationType;
                    
                    // Auto-select visualization type if needed
                    const metricDataArray = Array.isArray(metricData) ? metricData : [];
                    if (rawVizType === 'auto' || !rawVizType || typeof rawVizType !== 'string') {
                      // Use metric name as context (it often contains the question intent)
                      vizType = autoSelectVisualizationType(
                        metricDataArray,
                        metric.query_content || '',
                        metric.metric_name || metric.insight_summary
                      );
                    } else {
                      vizType = rawVizType as VisualizationType;
                    }
                    
                    // Ensure we have a valid type
                    if (!vizType || vizType === 'auto') {
                      vizType = 'table';
                    }
                    
                    // Debug logging
                    console.log(`[DashboardMetrics] Rendering ${metric.metric_name}:`, {
                      vizType,
                      dataLength: metricDataArray.length,
                      sampleData: metricDataArray[0],
                      keys: metricDataArray.length > 0 ? Object.keys(metricDataArray[0]) : [],
                      hasData,
                      metricData: metricData
                    });
                    
                    // Ensure we have valid data
                    if (!metricDataArray || metricDataArray.length === 0) {
                      console.warn(`[DashboardMetrics] No data for ${metric.metric_name}, but hasData is true`);
                      return (
                        <div className="flex flex-col items-center justify-center h-80 bg-yellow-50 rounded-xl border-2 border-dashed border-yellow-200">
                          <p className="text-yellow-600">Data array is empty</p>
                        </div>
                      );
                    }
                    
                    return (
                      <div 
                        className="cursor-pointer hover:opacity-90 transition-opacity group w-full"
                        onClick={() => setSelectedMetric({ metric, data: metricDataArray })}
                        title="Click to view detailed data"
                      >
                        <div className="relative w-full" style={{ minHeight: '450px' }}>
                          <VisualizationRenderer
                            type={vizType}
                            data={metricDataArray}
                            title={metric.metric_name}
                          />
                          <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity bg-blue-600 text-white text-xs px-2 py-1 rounded z-20 pointer-events-none">
                            Click for details
                          </div>
                        </div>
                      </div>
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
                })() : (
                  <div className="flex flex-col items-center justify-center h-80 bg-gradient-to-br from-red-50 to-pink-50 rounded-xl border-2 border-dashed border-red-200">
                    <svg className="w-16 h-16 text-red-400 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <p className="text-red-600 font-medium">No data available</p>
                    <p className="text-sm text-red-400 mt-1">Query returned no results</p>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Data Details Modal */}
      {selectedMetric && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
          onClick={() => setSelectedMetric(null)}
        >
          <div 
            className="bg-white rounded-2xl shadow-2xl max-w-6xl w-full max-h-[90vh] overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="bg-gradient-to-r from-blue-600 to-purple-600 text-white p-6 flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-bold mb-2">{selectedMetric.metric.metric_name}</h2>
                <p className="text-blue-100 text-sm">{selectedMetric.metric.insight_summary}</p>
              </div>
              <button
                onClick={() => setSelectedMetric(null)}
                className="text-white hover:bg-white hover:bg-opacity-20 rounded-full p-2 transition-colors"
                aria-label="Close modal"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Modal Content */}
            <div className="flex-1 overflow-auto p-6">
              {/* Query Info */}
              <div className="mb-6 bg-gray-50 rounded-lg p-4">
                <h3 className="font-semibold text-gray-700 mb-2">Generated Query:</h3>
                <pre className="bg-white p-3 rounded border overflow-x-auto text-sm font-mono">
                  {selectedMetric.metric.query_content}
                </pre>
              </div>

              {/* Data Table */}
              <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                <div className="bg-gray-50 px-4 py-3 border-b border-gray-200">
                  <h3 className="font-semibold text-gray-700">
                    Data ({selectedMetric.data.length} {selectedMetric.data.length === 1 ? 'row' : 'rows'})
                  </h3>
                </div>
                <div className="overflow-x-auto max-h-[400px]">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 sticky top-0">
                      <tr>
                        {selectedMetric.data.length > 0 && Object.keys(selectedMetric.data[0]).map((key) => (
                          <th key={key} className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider border-b border-gray-200">
                            {key}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {selectedMetric.data.map((row, index) => (
                        <tr key={index} className="hover:bg-gray-50 transition-colors">
                          {Object.values(row).map((value: any, cellIndex) => (
                            <td key={cellIndex} className="px-4 py-3 text-gray-700 whitespace-nowrap">
                              {typeof value === 'number' ? value.toLocaleString() : String(value || '-')}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="bg-gray-50 px-6 py-4 border-t border-gray-200 flex justify-end">
              <button
                onClick={() => setSelectedMetric(null)}
                className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
