'use client';

import { useState, useEffect } from 'react';
import { toast } from 'react-hot-toast';

interface AnalyticsSuggestion {
  question: string;
  description: string;
  category: string;
  priority: 'high' | 'medium' | 'low';
}

interface AIAnalyticsSuggestionsProps {
  metadata: any;
  onQuestionSelect: (question: string) => void;
}

export default function AIAnalyticsSuggestions({ metadata, onQuestionSelect }: AIAnalyticsSuggestionsProps) {
  const [loading, setLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<AnalyticsSuggestion[]>([]);
  const [expanded, setExpanded] = useState(false);

  const loadSuggestions = async () => {
    if (!metadata || !metadata.tables || metadata.tables.length === 0) {
      return;
    }

    setLoading(true);
    try {
      const response = await fetch('/api/analytics/suggestions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ metadata }),
      });

      if (!response.ok) {
        throw new Error('Failed to generate suggestions');
      }

      const data = await response.json();
      setSuggestions(data.suggestions || []);
    } catch (error) {
      console.error('Error loading suggestions:', error);
      toast.error('Failed to load AI suggestions');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (expanded && suggestions.length === 0) {
      loadSuggestions();
    }
  }, [expanded, metadata]);

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high':
        return 'bg-red-100 text-red-800 border-red-300';
      case 'medium':
        return 'bg-yellow-100 text-yellow-800 border-yellow-300';
      case 'low':
        return 'bg-blue-100 text-blue-800 border-blue-300';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-300';
    }
  };

  const getCategoryColor = (category: string) => {
    const colors = [
      'bg-purple-100 text-purple-800',
      'bg-green-100 text-green-800',
      'bg-indigo-100 text-indigo-800',
      'bg-pink-100 text-pink-800',
      'bg-teal-100 text-teal-800',
    ];
    const index = category.length % colors.length;
    return colors[index];
  };

  return (
    <div className="w-full mb-6">
      <div className="bg-gradient-to-r from-blue-50 to-purple-50 border border-blue-200 rounded-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-xl font-bold text-gray-800 mb-1">
              🤖 AI-Powered Analytics Suggestions
            </h3>
            <p className="text-sm text-gray-600">
              Get intelligent question suggestions based on your data structure
            </p>
          </div>
          <button
            onClick={() => {
              setExpanded(!expanded);
              if (!expanded && suggestions.length === 0) {
                loadSuggestions();
              }
            }}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
          >
            {expanded ? 'Hide' : 'Show'} Suggestions
          </button>
        </div>

        {expanded && (
          <div className="mt-4">
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                <span className="ml-3 text-gray-600">Generating AI suggestions...</span>
              </div>
            ) : suggestions.length > 0 ? (
              <div className="space-y-3 max-h-96 overflow-y-auto">
                {suggestions.map((suggestion, index) => (
                  <div
                    key={index}
                    className="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow cursor-pointer"
                    onClick={() => {
                      onQuestionSelect(suggestion.question);
                      toast.success('Question selected!');
                    }}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <span className={`px-2 py-1 rounded text-xs font-semibold border ${getPriorityColor(suggestion.priority)}`}>
                            {suggestion.priority.toUpperCase()}
                          </span>
                          <span className={`px-2 py-1 rounded text-xs font-medium ${getCategoryColor(suggestion.category)}`}>
                            {suggestion.category}
                          </span>
                        </div>
                        <h4 className="font-semibold text-gray-800 mb-1">
                          {suggestion.question}
                        </h4>
                        <p className="text-sm text-gray-600">
                          {suggestion.description}
                        </p>
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onQuestionSelect(suggestion.question);
                          toast.success('Question selected!');
                        }}
                        className="ml-4 px-3 py-1 bg-blue-600 text-white rounded text-sm hover:bg-blue-700 transition-colors"
                      >
                        Use
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-gray-500">
                No suggestions available. Make sure you have uploaded a data source.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

