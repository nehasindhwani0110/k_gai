'use client';

import { useState } from 'react';
import { toast } from 'react-hot-toast';
import { AdhocQueryResponse } from '@/analytics-engine/types';
import VisualizationRenderer from './VisualizationRenderer';
import AIAnalyticsSuggestions from './AIAnalyticsSuggestions';
import QueryHistory from './QueryHistory';
import { autoSelectVisualizationType } from '@/analytics-engine/services/visualization-selector';
import { VisualizationType } from '@/analytics-engine/types';

interface AdhocQueryProps {
  metadata: any;
}

interface DataModalProps {
  title: string;
  query: string;
  data: any[];
  onClose: () => void;
}

function DataModal({ title, query, data, onClose }: DataModalProps) {
  return (
    <div 
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div 
        className="bg-white rounded-2xl shadow-2xl max-w-6xl w-full max-h-[90vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="bg-gradient-to-r from-blue-600 to-purple-600 text-white p-6 flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold mb-2">{title}</h2>
            <p className="text-blue-100 text-sm">Detailed data view</p>
          </div>
          <button
            onClick={onClose}
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
          {query && (
            <div className="mb-6 bg-gray-50 rounded-lg p-4">
              <h3 className="font-semibold text-gray-700 mb-2">Generated Query:</h3>
              <pre className="bg-white p-3 rounded border overflow-x-auto text-sm font-mono">
                {query}
              </pre>
            </div>
          )}

          {/* Data Table */}
          {data.length > 0 && (
            <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
              <div className="bg-gray-50 px-4 py-3 border-b border-gray-200">
                <h3 className="font-semibold text-gray-700">
                  Data ({data.length} {data.length === 1 ? 'row' : 'rows'})
                </h3>
              </div>
              <div className="overflow-x-auto max-h-[400px]">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 sticky top-0">
                    <tr>
                      {Object.keys(data[0]).map((key) => (
                        <th key={key} className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider border-b border-gray-200">
                          {key}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {data.map((row, index) => (
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
          )}
        </div>

        {/* Modal Footer */}
        <div className="bg-gray-50 px-6 py-4 border-t border-gray-200 flex justify-end">
          <button
            onClick={onClose}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

export default function AdhocQuery({ metadata }: AdhocQueryProps) {
  const [question, setQuestion] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AdhocQueryResponse | null>(null);
  const [queryResults, setQueryResults] = useState<any[]>([]);
  const [showDataModal, setShowDataModal] = useState(false);

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
      // This ensures CSV files work even if source_type is incorrectly set
      if (metadata?.file_path) {
        requestBody.file_path = metadata.file_path;
        // Also set source_type to CSV_FILE if file_path exists
        requestBody.source_type = 'CSV_FILE';
      } else if (metadata?.source_type === 'CSV_FILE') {
        // CSV source type but no file_path - error
        toast.error('File path is missing. Please re-upload your CSV file.');
        return;
      } else {
        // For SQL databases, include connection_string if available
        requestBody.connection_string = process.env.NEXT_PUBLIC_DB_CONNECTION_STRING || metadata?.connection_string;
      }

      // Include user question for better query fixing
      requestBody.user_question = question;

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
            <h3 className="font-semibold mb-2">Insight:</h3>
            <p>{result.insight_summary}</p>
          </div>

          {queryResults.length > 0 && (() => {
            try {
              let vizType: VisualizationType = result.visualization_type as VisualizationType;
              
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
              
              // Ensure we never pass 'auto' to the renderer
              if (vizType === 'auto') {
                vizType = 'table';
              }
              
              return (
                <div 
                  className="mt-6 cursor-pointer hover:opacity-90 transition-opacity"
                  onClick={() => setShowDataModal(true)}
                  title="Click to view detailed data"
                >
                  <VisualizationRenderer
                    type={vizType}
                    data={queryResults}
                    title={question}
                  />
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
        <DataModal
          title={question || 'Query Results'}
          query={result?.query_content || ''}
          data={queryResults}
          onClose={() => setShowDataModal(false)}
        />
      )}
    </div>
  );
}

