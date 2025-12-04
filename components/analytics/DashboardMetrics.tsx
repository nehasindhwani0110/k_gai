'use client';

import { useState, useEffect } from 'react';
import { toast } from 'react-hot-toast';
import { DashboardMetricsResponse, DashboardMetric, VisualizationType } from '@/analytics-engine/types';
import VisualizationRenderer from './VisualizationRenderer';
import { autoSelectVisualizationType } from '@/analytics-engine/services/visualization-selector';
import EnhancedDataModal from './EnhancedDataModal';

interface DashboardMetricsProps {
  metadata: any;
}

// Helper function to generate fallback metrics when queries return empty
async function generateFallbackMetrics(
  metadata: any,
  existingMetrics: DashboardMetric[]
): Promise<DashboardMetric[]> {
  try {
    const fallbacks: DashboardMetric[] = [];
    const tables = metadata?.tables || [];
    
    if (tables.length === 0) return fallbacks;
    
    const firstTable = tables[0];
    const tableName = firstTable.name;
    const columns = firstTable.columns || [];
    
    // Find numeric columns
    const numericCols = columns.filter((c: any) => 
      c.type && ['INT', 'DECIMAL', 'FLOAT', 'DOUBLE', 'NUMERIC', 'INTEGER'].some(t => 
        c.type.toUpperCase().includes(t)
      )
    );
    
    // Find category columns
    const categoryCols = columns.filter((c: any) => 
      c.type && ['VARCHAR', 'TEXT', 'CHAR', 'STRING'].some(t => 
        c.type.toUpperCase().includes(t)
      )
    );
    
    // Generate simple COUNT query (always works)
    if (!existingMetrics.some(m => m.query_content?.includes('COUNT(*)') && !m.query_content?.includes('GROUP BY'))) {
      fallbacks.push({
        metric_name: `Total Records in ${tableName}`,
        query_type: 'SQL_QUERY',
        query_content: `SELECT COUNT(*) as total_count FROM ${tableName}`,
        visualization_type: 'gauge',
        insight_summary: `Total number of records in ${tableName}`
      });
    }
    
    // Generate category distribution if we have category columns
    if (categoryCols.length > 0 && !existingMetrics.some(m => m.query_content?.includes(`GROUP BY ${categoryCols[0].name}`))) {
      const catCol = categoryCols[0].name;
      fallbacks.push({
        metric_name: `Distribution by ${catCol}`,
        query_type: 'SQL_QUERY',
        query_content: `SELECT ${catCol}, COUNT(*) as count FROM ${tableName} GROUP BY ${catCol} ORDER BY count DESC LIMIT 10`,
        visualization_type: 'pie_chart',
        insight_summary: `Distribution of records by ${catCol}`
      });
    }
    
    // Generate average if we have numeric columns
    if (numericCols.length > 0 && !existingMetrics.some(m => m.query_content?.includes(`AVG(${numericCols[0].name})`))) {
      const numCol = numericCols[0].name;
      fallbacks.push({
        metric_name: `Average ${numCol}`,
        query_type: 'SQL_QUERY',
        query_content: `SELECT AVG(${numCol}) as avg_value FROM ${tableName} WHERE ${numCol} IS NOT NULL`,
        visualization_type: 'gauge',
        insight_summary: `Average value of ${numCol}`
      });
    }
    
    return fallbacks;
  } catch (error) {
    console.error('[DASHBOARD] Error generating fallback metrics:', error);
    return [];
  }
}

// Generate simple fallback metrics that are guaranteed to work
async function generateSimpleFallbackMetrics(
  metadata: any
): Promise<DashboardMetric[]> {
  const simple: DashboardMetric[] = [];
  const tables = metadata?.tables || [];
  
  if (tables.length === 0) return simple;
  
  const firstTable = tables[0];
  const tableName = firstTable.name;
  
  // Always generate a simple COUNT - this will always work
  simple.push({
    metric_name: `Total Records`,
    query_type: 'SQL_QUERY',
    query_content: `SELECT COUNT(*) as total_count FROM ${tableName}`,
    visualization_type: 'gauge',
    insight_summary: `Total number of records in the database`
  });
  
  return simple;
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
      
      console.log(`[DASHBOARD] Received ${allMetrics.length} metrics from API`);
      
      // Execute queries for all metrics and collect results
      // Filter out metrics that return empty data
      const metricsWithData: DashboardMetric[] = [];
      const metricsWithoutData: DashboardMetric[] = [];
      
      for (const metric of allMetrics) {
        const result = await executeMetricQuery(metric);
        if (result.hasData && !result.hasError) {
          metricsWithData.push(metric);
        } else {
          metricsWithoutData.push(metric);
          console.warn(`[DASHBOARD] Metric "${metric.metric_name}" returned no data or had errors`);
        }
      }
      
      // If we have empty metrics, try to generate fallback queries
      if (metricsWithoutData.length > 0 && metricsWithData.length < 3) {
        console.log(`[DASHBOARD] ${metricsWithoutData.length} metrics returned empty data, generating fallback queries...`);
        const fallbackMetrics = await generateFallbackMetrics(metadata, metricsWithData);
        for (const fallback of fallbackMetrics) {
          const result = await executeMetricQuery(fallback);
          if (result.hasData && !result.hasError) {
            metricsWithData.push(fallback);
          }
        }
      }
      
      // Only show metrics with data - never show empty metrics
      if (metricsWithData.length === 0) {
        // Last resort: generate simple COUNT queries that are guaranteed to work
        console.log(`[DASHBOARD] No metrics returned data, generating simple fallback queries...`);
        const simpleMetrics = await generateSimpleFallbackMetrics(metadata);
        for (const simple of simpleMetrics) {
          const result = await executeMetricQuery(simple);
          if (result.hasData && !result.hasError) {
            metricsWithData.push(simple);
          }
        }
      }
      
      // Only set metrics that have data
      setMetrics(metricsWithData);
      console.log(`[DASHBOARD] Displaying ${metricsWithData.length} metrics with data (filtered out ${metricsWithoutData.length} empty metrics)`);
      
      if (metricsWithData.length === 0) {
        toast.error('No dashboard metrics could be generated. Please check your data source.');
      } else if (metricsWithoutData.length > 0) {
        toast(`${metricsWithoutData.length} metrics were filtered out due to empty results. Showing ${metricsWithData.length} working metrics.`, {
          icon: '⚠️',
          duration: 5000,
        });
      }
    } catch (error) {
      console.error('Error:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to load dashboard metrics');
    } finally {
      setLoading(false);
    }
  };

  // Helper function to check if data is effectively empty (all null/empty values)
  const isDataEffectivelyEmpty = (data: any[]): boolean => {
    if (!Array.isArray(data) || data.length === 0) return true;
    
    // Check if all rows have all null/empty/undefined values
    return data.every(row => {
      if (!row || typeof row !== 'object') return true;
      const values = Object.values(row);
      return values.every(val => 
        val === null || 
        val === undefined || 
        val === '' || 
        (typeof val === 'string' && val.trim() === '') ||
        (typeof val === 'number' && isNaN(val))
      );
    });
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
      if (metadata?.file_path) {
        requestBody.file_path = metadata.file_path;
        if (metadata?.source_type && ['CSV_FILE', 'EXCEL_FILE', 'JSON_FILE', 'TXT_FILE', 'GOOGLE_DRIVE'].includes(metadata.source_type)) {
          requestBody.source_type = metadata.source_type;
        } else {
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
        if (metadata?.file_type) {
          requestBody.file_type = metadata.file_type;
        }
      } else if (metadata?.source_type && ['CSV_FILE', 'EXCEL_FILE', 'JSON_FILE', 'TXT_FILE', 'GOOGLE_DRIVE'].includes(metadata.source_type)) {
        console.error(`Missing file_path for CSV_FILE source type in metric: ${metric.metric_name}`);
        setMetricResults((prev) => ({
          ...prev,
          [metric.metric_name]: [],
          [`${metric.metric_name}_error`]: 'Missing file path',
        }));
        return { hasData: false, hasError: true };
      } else {
        let connectionString = metadata?.connection_string;
        
        if (!connectionString && typeof window !== 'undefined') {
          const dataSourceId = sessionStorage.getItem('dataSourceId');
          if (dataSourceId) {
            try {
              const sourceResponse = await fetch(`/api/analytics/data-sources/${dataSourceId}/schema?type=source`);
              if (sourceResponse.ok) {
                const sourceMetadata = await sourceResponse.json();
                connectionString = sourceMetadata.connection_string;
                if (connectionString && metadata) {
                  metadata.connection_string = connectionString;
                }
              }
            } catch (error) {
              console.warn('Failed to fetch connection_string from data source:', error);
            }
          }
        }
        
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
        // Check both if results exist AND if they contain actual data (not all null/empty)
        const hasData = Array.isArray(results) && results.length > 0 && !isDataEffectivelyEmpty(results);
        
        setMetricResults((prev) => ({
          ...prev,
          [metric.metric_name]: results,
        }));
        
        return { hasData, hasError: false };
      } else {
        const errorData = await response.json().catch(() => ({}));
        const errorMessage = errorData.error || errorData.details || 'Query execution failed';
        console.error(`Error executing query for ${metric.metric_name}:`, errorMessage);
        
        setMetricResults((prev) => ({
          ...prev,
          [metric.metric_name]: [],
          [`${metric.metric_name}_error`]: errorMessage,
        }));
        
        return { hasData: false, hasError: true };
      }
    } catch (error) {
      console.error(`Error executing query for ${metric.metric_name}:`, error);
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
    const timeUntilNextRefresh = 3600000 - timeSinceRefresh;
    
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

  // Don't render if no metrics with data
  if (metrics.length === 0) {
    return (
      <div className="w-full max-w-7xl mx-auto p-6">
        <div className="bg-yellow-50 border-2 border-yellow-200 rounded-xl p-8 text-center">
          <svg className="w-16 h-16 text-yellow-500 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <h3 className="text-xl font-bold text-yellow-800 mb-2">No Dashboard Metrics Available</h3>
          <p className="text-yellow-700 mb-4">
            Unable to generate dashboard metrics from your data source. This could be due to:
          </p>
          <ul className="text-left text-yellow-700 max-w-md mx-auto space-y-2 mb-6">
            <li>• Empty tables or no data in the database</li>
            <li>• Schema mismatch or missing columns</li>
            <li>• Connection issues with the data source</li>
          </ul>
          <button
            onClick={handleManualRefresh}
            className="px-6 py-3 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 transition-colors font-semibold"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

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
          // Check both if results exist AND if they contain actual data (not all null/empty)
          const hasData = Array.isArray(metricData) && metricData.length > 0 && !isDataEffectivelyEmpty(metricData);
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
                        </div>
                      ) : (
                        <>
                          <p className="font-medium">Error:</p>
                          <p className="bg-red-100 rounded p-3 text-xs font-mono break-words">
                            {hasError.includes(':') 
                              ? hasError.split(':').slice(1).join(':').trim()
                              : hasError}
                          </p>
                        </>
                      )}
                    </div>
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
                    
                    const metricDataArray = Array.isArray(metricData) ? metricData : [];
                    if (rawVizType === 'auto' || !rawVizType || typeof rawVizType !== 'string') {
                      vizType = autoSelectVisualizationType(
                        metricDataArray,
                        metric.query_content || '',
                        metric.metric_name || metric.insight_summary
                      );
                    } else {
                      vizType = rawVizType as VisualizationType;
                    }
                    
                    if (!vizType || vizType === 'auto') {
                      vizType = 'table';
                    }
                    
                    if (!metricDataArray || metricDataArray.length === 0) {
                      return (
                        <div className="flex flex-col items-center justify-center h-80 bg-yellow-50 rounded-xl border-2 border-dashed border-yellow-200">
                          <p className="text-yellow-600">Data array is empty</p>
                        </div>
                      );
                    }
                    
                    return (
                      <div 
                        className="cursor-pointer hover:scale-[1.02] transition-all duration-300 group w-full relative"
                        onClick={() => setSelectedMetric({ metric, data: metricDataArray })}
                        title="Click to view detailed data"
                      >
                        <div className="relative w-full" style={{ minHeight: '450px' }}>
                          <VisualizationRenderer
                            type={vizType}
                            data={metricDataArray}
                            title={metric.metric_name}
                          />
                          <div className="absolute inset-0 bg-gradient-to-br from-blue-600/0 to-purple-600/0 group-hover:from-blue-600/5 group-hover:to-purple-600/5 rounded-xl transition-all duration-300 pointer-events-none z-10" />
                          <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-all duration-300 transform translate-y-2 group-hover:translate-y-0 z-20 pointer-events-none">
                            <div className="bg-gradient-to-r from-blue-600 to-purple-600 text-white text-xs px-4 py-2 rounded-lg shadow-xl flex items-center gap-2">
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                              </svg>
                              <span className="font-semibold">Click for detailed view</span>
                            </div>
                          </div>
                          <div className="absolute bottom-4 left-4 opacity-0 group-hover:opacity-100 transition-all duration-300 transform translate-y-2 group-hover:translate-y-0 z-20 pointer-events-none">
                            <div className="bg-white/90 backdrop-blur-sm text-gray-700 text-xs px-3 py-1.5 rounded-lg shadow-lg border border-gray-200">
                              <span className="font-medium">{metricDataArray.length} records</span>
                            </div>
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

      {/* Enhanced Data Details Modal */}
      {selectedMetric && (
        <EnhancedDataModal
          title={selectedMetric.metric.metric_name}
          query={selectedMetric.metric.query_content}
          data={selectedMetric.data}
          insightSummary={selectedMetric.metric.insight_summary}
          onClose={() => setSelectedMetric(null)}
        />
      )}
    </div>
  );
}
