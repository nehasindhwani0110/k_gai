'use client';

import { useState } from 'react';
import { toast } from 'react-hot-toast';
import { AdhocQueryResponse } from '@/analytics-engine/types';
import VisualizationRenderer from './VisualizationRenderer';
import AIAnalyticsSuggestions from './AIAnalyticsSuggestions';
import QueryHistory from './QueryHistory';
import { autoSelectVisualizationType } from '@/analytics-engine/services/visualization-selector';
import { VisualizationType } from '@/analytics-engine/types';
import EnhancedDataModal from './EnhancedDataModal';
import VisualizationTypeSelector from './VisualizationTypeSelector';

interface AdhocQueryProps {
  metadata: any;
}


export default function AdhocQuery({ metadata }: AdhocQueryProps) {
  const [question, setQuestion] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AdhocQueryResponse | null>(null);
  const [queryResults, setQueryResults] = useState<any[]>([]);
  const [showDataModal, setShowDataModal] = useState(false);
  const [selectedVizType, setSelectedVizType] = useState<VisualizationType | null>(null);

  const handleQuestionSelect = (selectedQuestion: string) => {
    setQuestion(selectedQuestion);
    // Optionally auto-submit
    // handleSubmit({ preventDefault: () => {} } as React.FormEvent);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!question.trim()) {
      toast.error('Please enter a question');
      return;
    }

    setLoading(true);
    try {
      // Check if agents should be used (from environment or metadata)
      const useLangGraph = process.env.NEXT_PUBLIC_USE_LANGGRAPH_AGENT === 'true' || metadata?.use_langgraph;
      const useAgent = process.env.NEXT_PUBLIC_USE_AGENT_BASED_QUERIES === 'true' || metadata?.use_agent;
      const connectionString = metadata?.connection_string || process.env.NEXT_PUBLIC_DB_CONNECTION_STRING;

      const response = await fetch('/api/analytics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'ADHOC_QUERY',
          metadata,
          user_question: question,
          ...(useLangGraph && { use_langgraph: true }),
          ...(useAgent && { use_agent: true }),
          ...(connectionString && { connection_string: connectionString }),
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to generate query');
      }

      const data: AdhocQueryResponse = await response.json();
      setResult(data);
      setSelectedVizType(null); // Reset visualization type selection for new query

      // Execute the query if needed
      if (data.query_content) {
        await executeQuery(data);
      }
    } catch (error) {
      console.error('Error:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to process query');
    } finally {
      setLoading(false);
    }
  };

  const executeQuery = async (queryData: AdhocQueryResponse) => {
    try {
      // Build request body - prioritize file_path detection
      const requestBody: any = {
        query_type: queryData.query_type,
        query_content: queryData.query_content,
        source_type: metadata?.source_type || 'SQL_DB',
      };

      // ALWAYS include file_path if it exists in metadata (regardless of source_type)
      // This ensures file-based sources work correctly
      if (metadata?.file_path) {
        requestBody.file_path = metadata.file_path;
        // Use the actual source_type from metadata or detect from file_type
        if (metadata?.file_type) {
          // Map file_type to source_type
          if (metadata.file_type === 'EXCEL') {
            requestBody.source_type = 'EXCEL_FILE';
          } else if (metadata.file_type === 'JSON') {
            requestBody.source_type = 'JSON_FILE';
          } else if (metadata.file_type === 'TXT') {
            requestBody.source_type = 'TXT_FILE';
          } else {
            requestBody.source_type = 'CSV_FILE';
          }
          requestBody.file_type = metadata.file_type;
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
      } else if (metadata?.source_type === 'CSV_FILE' || metadata?.source_type === 'EXCEL_FILE' || metadata?.source_type === 'JSON_FILE' || metadata?.source_type === 'TXT_FILE' || metadata?.source_type === 'GOOGLE_DRIVE') {
        // CSV source type but no file_path - error
        toast.error('File path is missing. Please re-upload your CSV file.');
        return;
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
            throw new Error('Missing connection string. Please reconfigure your data source.');
          }
        }

      // Include user question for better query fixing
      requestBody.user_question = question;
      
      // ALWAYS try to get dataSourceId for SQL queries (needed for canonical translation)
      // Priority 1: Get from metadata (most reliable)
      if ((metadata as any)?.data_source_id) {
        requestBody.data_source_id = (metadata as any).data_source_id;
      }
      
      // Priority 2: Get from sessionStorage
      if (!requestBody.data_source_id && typeof window !== 'undefined') {
        const dataSourceId = sessionStorage.getItem('dataSourceId');
        if (dataSourceId) {
          requestBody.data_source_id = dataSourceId;
        }
      }
      
      // No longer using canonical mapping - queries use actual database names directly
      // Translation is disabled, so no need to set is_canonical_query flag
      // Removed CANONICAL_DB check - all queries use actual names now
      if (false && metadata?.source_type === 'CANONICAL_DB') {
        requestBody.is_canonical_query = true;
        console.log('[ADHOC-QUERY] 🔍 Canonical DB detected:', {
          is_canonical_query: requestBody.is_canonical_query,
          data_source_id: requestBody.data_source_id,
          source_type: metadata.source_type,
          metadata_has_data_source_id: !!(metadata as any)?.data_source_id,
          sessionStorage_has_dataSourceId: typeof window !== 'undefined' ? !!sessionStorage.getItem('dataSourceId') : 'N/A',
        });
        
        if (!requestBody.data_source_id) {
          console.error('[ADHOC-QUERY] ❌ CRITICAL: data_source_id missing for CANONICAL_DB! Query will fail.');
          console.error('[ADHOC-QUERY] Debug info:', {
            metadata_keys: Object.keys(metadata || {}),
            metadata_data_source_id: (metadata as any)?.data_source_id,
            sessionStorage_dataSourceId: typeof window !== 'undefined' ? sessionStorage.getItem('dataSourceId') : 'N/A',
          });
        }
      } else if (requestBody.data_source_id) {
        // For other SQL sources, still log data_source_id for debugging
        console.log('[ADHOC-QUERY] SQL query with data_source_id:', {
          data_source_id: requestBody.data_source_id,
          source_type: metadata?.source_type,
        });
      }

      const response = await fetch('/api/analytics/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        throw new Error('Failed to execute query');
      }

      const data = await response.json();
      setQueryResults(data.results || []);

      // Save query to history
      try {
        await fetch('/api/analytics/history', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userQuestion: question,
            queryType: queryData.query_type,
            queryContent: queryData.query_content,
            sourceType: metadata?.source_type || 'SQL_DB',
            filePath: metadata?.file_path || undefined,
            results: data.results || [],
          }),
        });
      } catch (historyError) {
        // Don't show error to user - history saving is optional
        console.error('Failed to save query history:', historyError);
      }
    } catch (error) {
      console.error('Query execution error:', error);
      toast.error('Failed to execute query. Showing query only.');
    }
  };

  const handleHistorySelect = (query: any) => {
    setQuestion(query.userQuestion);
    // Optionally auto-execute the query
    // You can add logic here to re-execute the query if needed
  };

  return (
    <div className="w-full max-w-6xl mx-auto p-6">
      <h2 className="text-2xl font-bold mb-6">Ask a Question</h2>
      
      {/* Query History */}
      <QueryHistory onQuerySelect={handleHistorySelect} />
      
      {/* AI Analytics Suggestions */}
      <AIAnalyticsSuggestions 
        metadata={metadata} 
        onQuestionSelect={handleQuestionSelect}
      />
      
      <form onSubmit={handleSubmit} className="mb-6">
        <div className="flex gap-4">
          <input
            type="text"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="e.g., What is the average score for 10th graders in Math?"
            className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            disabled={loading}
          />
          <button
            type="submit"
            disabled={loading}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Processing...' : 'Ask'}
          </button>
        </div>
      </form>

      {result && (
        <div className="mt-6 space-y-4">
          <div className="bg-gray-50 p-4 rounded-lg">
            <h3 className="font-semibold mb-2">Generated Query:</h3>
            <pre className="bg-white p-3 rounded border overflow-x-auto text-sm">
              {result.query_content}
            </pre>
          </div>

          <div className="bg-blue-50 p-4 rounded-lg">
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-semibold">Insight:</h3>
              {queryResults.length > 0 && (
                <VisualizationTypeSelector
                  currentType={selectedVizType || (() => {
                    let vizType: VisualizationType = result.visualization_type as VisualizationType;
                    if (vizType === 'auto' || !vizType) {
                      vizType = autoSelectVisualizationType(
                        queryResults, 
                        result.query_content || '', 
                        question
                      );
                    }
                    if (vizType === 'auto') {
                      vizType = 'table';
                    }
                    return vizType;
                  })()}
                  onTypeChange={(type) => {
                    setSelectedVizType(type);
                  }}
                />
              )}
            </div>
            <p>{result.insight_summary}</p>
          </div>

          {(() => {
            try {
              // Show empty state if no results
              if (queryResults.length === 0) {
                return (
                  <div className="mt-6 p-6 bg-yellow-50 border border-yellow-200 rounded-lg">
                    <div className="flex items-center gap-3 mb-2">
                      <svg className="w-6 h-6 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                      </svg>
                      <h3 className="text-lg font-semibold text-yellow-800">No Data Returned</h3>
                    </div>
                    <p className="text-yellow-700 mb-2">
                      The query executed successfully but returned 0 rows. This could mean:
                    </p>
                    <ul className="list-disc list-inside text-yellow-700 space-y-1 ml-4">
                      <li>The table exists but contains no matching data</li>
                      <li>The query filters are too restrictive</li>
                      <li>The table or column names might need adjustment</li>
                    </ul>
                    <div className="mt-4 p-3 bg-white rounded border border-yellow-300">
                      <p className="text-sm font-mono text-gray-700 break-all">{result.query_content}</p>
                    </div>
                  </div>
                );
              }

              // Use selected visualization type if available, otherwise use auto-selected or default
              let vizType: VisualizationType;
              if (selectedVizType) {
                vizType = selectedVizType;
              } else {
                vizType = result.visualization_type as VisualizationType;
                
                // Auto-select visualization type if needed
                // Pass both query content and user question for better context
                if (vizType === 'auto' || !vizType) {
                  vizType = autoSelectVisualizationType(
                    queryResults, 
                    result.query_content || '', 
                    question
                  );
                  console.log('[AdhocQuery] Selected visualization:', {
                    vizType,
                    rowCount: queryResults.length,
                    keys: queryResults.length > 0 ? Object.keys(queryResults[0]) : [],
                    question: question.substring(0, 50)
                  });
                }
              }
              
              // Ensure we never pass 'auto' to the renderer
              if (vizType === 'auto') {
                vizType = 'table';
              }
              
              return (
                <div 
                  className="mt-6 cursor-pointer hover:scale-[1.01] transition-all duration-300 group relative"
                  onClick={() => setShowDataModal(true)}
                  title="Click to view detailed data"
                >
                  <div className="relative">
                    <VisualizationRenderer
                      type={vizType}
                      data={queryResults}
                      title={question}
                    />
                    {/* Enhanced Hover Overlay */}
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
                        <span className="font-medium">{queryResults.length} records</span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            } catch (error) {
              console.error('Visualization error:', error);
              return (
                <div className="mt-6 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                  <p className="text-yellow-600">Error rendering visualization. Check console for details.</p>
                </div>
              );
            }
          })()}
        </div>
      )}

      {/* Data Details Modal */}
      {showDataModal && queryResults.length > 0 && (
        <EnhancedDataModal
          title={question || 'Query Results'}
          query={result?.query_content || ''}
          data={queryResults}
          insightSummary={result?.insight_summary}
          onClose={() => setShowDataModal(false)}
        />
      )}
    </div>
  );
}

