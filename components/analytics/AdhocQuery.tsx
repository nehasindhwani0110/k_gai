'use client';

import { useState } from 'react';
import { toast } from 'react-hot-toast';
import { AdhocQueryResponse } from '@/analytics-engine/types';
import VisualizationRenderer from './VisualizationRenderer';
import AIAnalyticsSuggestions from './AIAnalyticsSuggestions';
import { autoSelectVisualizationType } from '@/analytics-engine/services/visualization-selector';

interface AdhocQueryProps {
  metadata: any;
}

export default function AdhocQuery({ metadata }: AdhocQueryProps) {
  const [question, setQuestion] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AdhocQueryResponse | null>(null);
  const [queryResults, setQueryResults] = useState<any[]>([]);

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
      const response = await fetch('/api/analytics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'ADHOC_QUERY',
          metadata,
          user_question: question,
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
    } catch (error) {
      console.error('Query execution error:', error);
      toast.error('Failed to execute query. Showing query only.');
    }
  };

  return (
    <div className="w-full max-w-6xl mx-auto p-6">
      <h2 className="text-2xl font-bold mb-6">Ask a Question</h2>
      
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
              if (vizType === 'auto' || !vizType) {
                vizType = autoSelectVisualizationType(queryResults, result.query_content || '');
              }
              
              // Ensure we never pass 'auto' to the renderer
              if (vizType === 'auto') {
                vizType = 'table';
              }
              
              return (
                <div className="mt-6">
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
    </div>
  );
}

