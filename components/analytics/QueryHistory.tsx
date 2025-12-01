'use client';

import { useState, useEffect } from 'react';
import { toast } from 'react-hot-toast';

interface QueryHistoryItem {
  id: string;
  userQuestion: string;
  queryType: string;
  queryContent: string;
  sourceType: string;
  filePath?: string;
  createdAt: string;
}

interface QueryHistoryProps {
  onQuerySelect?: (query: QueryHistoryItem) => void;
}

export default function QueryHistory({ onQuerySelect }: QueryHistoryProps) {
  const [history, setHistory] = useState<QueryHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const [selectedQuery, setSelectedQuery] = useState<QueryHistoryItem | null>(null);

  useEffect(() => {
    if (expanded) {
      loadHistory();
    }
  }, [expanded]);

  const loadHistory = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/analytics/history?limit=50');
      if (!response.ok) {
        throw new Error('Failed to load history');
      }
      const data = await response.json();
      setHistory(data.history || []);
    } catch (error) {
      console.error('Error loading history:', error);
      toast.error('Failed to load query history');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('Are you sure you want to delete this query?')) {
      return;
    }

    try {
      const response = await fetch(`/api/analytics/history?id=${id}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error('Failed to delete query');
      }

      toast.success('Query deleted');
      loadHistory();
    } catch (error) {
      console.error('Error deleting query:', error);
      toast.error('Failed to delete query');
    }
  };

  const handleClearAll = async () => {
    if (!confirm('Are you sure you want to clear all query history? This cannot be undone.')) {
      return;
    }

    try {
      const response = await fetch('/api/analytics/history?clearAll=true', {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error('Failed to clear history');
      }

      toast.success('All history cleared');
      setHistory([]);
      setSelectedQuery(null);
    } catch (error) {
      console.error('Error clearing history:', error);
      toast.error('Failed to clear history');
    }
  };

  const handleQueryClick = (query: QueryHistoryItem) => {
    setSelectedQuery(query);
    if (onQuerySelect) {
      onQuerySelect(query);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString();
  };

  return (
    <div className="w-full mb-6 bg-white rounded-lg shadow-sm border border-gray-100">
      <div className="p-4">
        <div className="flex justify-between items-center">
          <button
            onClick={() => setExpanded(!expanded)}
            className="flex items-center gap-2 text-blue-600 font-semibold hover:text-blue-700"
          >
            <span>Query History</span>
            <span className="text-sm text-gray-500">({history.length})</span>
            <span>{expanded ? '▲' : '▼'}</span>
          </button>
          {expanded && history.length > 0 && (
            <button
              onClick={handleClearAll}
              className="text-sm text-red-600 hover:text-red-700"
            >
              Clear All
            </button>
          )}
        </div>

        {expanded && (
          <div className="mt-4 pt-4 border-t border-gray-200">
            {loading ? (
              <div className="text-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                <p className="text-gray-500 mt-2">Loading history...</p>
              </div>
            ) : history.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <p>No query history yet.</p>
                <p className="text-sm mt-2">Your queries will appear here after you ask questions.</p>
              </div>
            ) : (
              <div className="space-y-3 max-h-96 overflow-y-auto">
                {history.map((query) => (
                  <div
                    key={query.id}
                    onClick={() => handleQueryClick(query)}
                    className={`p-4 rounded-lg border cursor-pointer transition-all ${
                      selectedQuery?.id === query.id
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    <div className="flex justify-between items-start">
                      <div className="flex-1">
                        <p className="font-medium text-gray-800 mb-1">
                          {query.userQuestion}
                        </p>
                        <div className="flex gap-2 text-xs text-gray-500 mb-2">
                          <span className="px-2 py-1 bg-gray-100 rounded">
                            {query.queryType}
                          </span>
                          <span className="px-2 py-1 bg-gray-100 rounded">
                            {query.sourceType}
                          </span>
                          <span className="px-2 py-1 bg-gray-100 rounded">
                            {formatDate(query.createdAt)}
                          </span>
                        </div>
                        <pre className="text-xs bg-white p-2 rounded border overflow-x-auto text-gray-700 max-h-20">
                          {query.queryContent}
                        </pre>
                      </div>
                      <button
                        onClick={(e) => handleDelete(query.id, e)}
                        className="ml-2 text-red-500 hover:text-red-700 text-sm"
                        title="Delete query"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

