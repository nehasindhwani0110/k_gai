'use client';

import { useState, useEffect } from 'react';
import AdhocQuery from '@/components/analytics/AdhocQuery';
import DashboardMetrics from '@/components/analytics/DashboardMetrics';
import FileUpload from '@/components/analytics/FileUpload';

export default function AnalyticsPage() {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'query'>('dashboard');
  const [metadata, setMetadata] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [dataSourceType, setDataSourceType] = useState<'example' | 'csv'>('example');

  // Example metadata - in production, this would come from API or user selection
  const exampleMetadata = {
    source_type: 'SQL_DB',
    tables: [
      {
        name: 'STUDENT_DEMO',
        description: 'Core demographic data.',
        columns: [
          { name: 'StuID', description: 'The unique student key.', type: 'INT' },
          { name: 'Grade_lvl', description: 'Current grade level (9-12).', type: 'INT' },
          { name: 'Enroll_Date', description: 'The date the student began.', type: 'DATE' },
        ],
      },
      {
        name: 'GRADES',
        description: 'Student grades and scores.',
        columns: [
          { name: 'student_id', description: 'Student identifier.', type: 'INT' },
          { name: 'subject_name', description: 'Name of the subject.', type: 'TEXT' },
          { name: 'score_pct', description: 'Score percentage (0-100).', type: 'DECIMAL' },
        ],
      },
    ],
  };

  const loadMetadata = async () => {
    setLoading(true);
    try {
      // In production, fetch from API
      // const response = await fetch('/api/analytics/schema', { ... });
      setMetadata(exampleMetadata);
    } catch (error) {
      console.error('Failed to load metadata:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadMetadata();
  }, []);

  if (loading || !metadata) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-lg">Loading analytics...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <h1 className="text-3xl font-bold">Analytics Engine</h1>
          <p className="text-gray-600 mt-1">Multi-tenant analytics for education systems</p>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-6">
        {/* File Upload Section */}
        <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4">Data Source</h2>
          <div className="mb-4">
            <p className="text-sm text-gray-600 mb-3">
              Upload a CSV file to analyze your data, or use the example data source below.
            </p>
            <FileUpload onFileProcessed={(newMetadata) => {
              // Ensure file_path is always included for CSV files
              if (newMetadata.source_type === 'CSV_FILE' && !newMetadata.file_path) {
                console.error('Warning: CSV metadata missing file_path');
              }
              setMetadata(newMetadata);
              setDataSourceType('csv');
            }} />
          </div>
          
          {dataSourceType === 'example' && (
            <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
              <p className="text-sm text-blue-800">
                <strong>Using Example Data:</strong> Currently using sample database schema. 
                Upload a CSV file above to analyze your own data.
              </p>
            </div>
          )}
          
          {dataSourceType === 'csv' && metadata && (
            <div className="mt-4 p-4 bg-green-50 border border-green-200 rounded-lg">
              <p className="text-sm text-green-800">
                <strong>CSV File Loaded:</strong> {metadata.tables?.[0]?.name || 'Unknown file'}
              </p>
              <p className="text-xs text-green-700 mt-1">
                Columns: {metadata.tables?.[0]?.columns?.map((c: any) => c.name).join(', ') || 'N/A'}
              </p>
            </div>
          )}
        </div>

        <div className="bg-white rounded-lg shadow-sm mb-6">
          <div className="border-b border-gray-200">
            <nav className="flex -mb-px">
              <button
                onClick={() => setActiveTab('dashboard')}
                className={`px-6 py-3 text-sm font-medium border-b-2 ${
                  activeTab === 'dashboard'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                Dashboard Metrics
              </button>
              <button
                onClick={() => setActiveTab('query')}
                className={`px-6 py-3 text-sm font-medium border-b-2 ${
                  activeTab === 'query'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                Adhoc Query
              </button>
            </nav>
          </div>
        </div>

        {activeTab === 'dashboard' && <DashboardMetrics metadata={metadata} />}
        {activeTab === 'query' && <AdhocQuery metadata={metadata} />}
      </div>
    </div>
  );
}

