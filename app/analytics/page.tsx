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
      // Check if data source is configured
      const isConfigured = sessionStorage.getItem('isConfigured');
      const dataSourceId = sessionStorage.getItem('dataSourceId');
      const dataSourceType = sessionStorage.getItem('dataSourceType');
      
      if (isConfigured === 'true' && dataSourceId) {
        // Load schema from configured data source
        console.log(`[ANALYTICS] Loading schema for dataSourceId: ${dataSourceId}`);
        
        if (dataSourceType === 'SQL_DB') {
          // For SQL databases, load schema from API
          // Add forceRefresh=true to always get fresh schema (system catalog queries INFORMATION_SCHEMA directly)
          // This ensures new tables/columns are detected immediately
          const response = await fetch(`/api/analytics/data-sources/${dataSourceId}/schema?forceRefresh=true`);
          
          if (!response.ok) {
            throw new Error(`Failed to load schema: ${response.statusText}`);
          }
          
          const schemaMetadata = await response.json();
          console.log(`[ANALYTICS] Schema loaded:`, schemaMetadata);
          
          if (schemaMetadata.error) {
            throw new Error(schemaMetadata.error);
          }
          
          // CRITICAL: Always ensure data_source_id is included in metadata
          // This is required for canonical query translation
          if (!schemaMetadata.data_source_id && dataSourceId) {
            schemaMetadata.data_source_id = dataSourceId;
            console.log(`[ANALYTICS] ✅ Added data_source_id to metadata: ${dataSourceId}`);
          } else if (schemaMetadata.data_source_id) {
            console.log(`[ANALYTICS] ✅ Metadata already has data_source_id: ${schemaMetadata.data_source_id}`);
          } else {
            console.error(`[ANALYTICS] ❌ WARNING: No data_source_id available! dataSourceId=${dataSourceId}`);
          }
          
          // Store connection_string in sessionStorage if available
          if (schemaMetadata.connection_string && typeof window !== 'undefined') {
            sessionStorage.setItem('connectionString', schemaMetadata.connection_string);
          }
          
          // Also ensure dataSourceId is in sessionStorage (redundancy check)
          if (dataSourceId && typeof window !== 'undefined') {
            sessionStorage.setItem('dataSourceId', dataSourceId);
          }
          
          console.log(`[ANALYTICS] Final metadata:`, {
            source_type: schemaMetadata.source_type,
            data_source_id: schemaMetadata.data_source_id,
            table_count: schemaMetadata.tables?.length || 0,
          });
          
          setMetadata(schemaMetadata);
          setDataSourceType('example'); // Mark as SQL DB source
        } else {
          // For file-based sources (CSV, Excel, JSON), load schema from file
          const filePath = sessionStorage.getItem('filePath');
          if (filePath) {
            // Determine file type from dataSourceType
            let fileType: 'CSV' | 'JSON' | 'EXCEL' | 'TXT' = 'CSV';
            if (dataSourceType === 'EXCEL_FILE') {
              fileType = 'EXCEL';
            } else if (dataSourceType === 'JSON_FILE') {
              fileType = 'JSON';
            } else if (dataSourceType === 'TXT_FILE') {
              fileType = 'TXT';
            } else if (dataSourceType === 'GOOGLE_DRIVE') {
              // For Google Drive, detect from file extension
              const ext = filePath.toLowerCase().split('.').pop();
              if (ext === 'json') fileType = 'JSON';
              else if (ext === 'xlsx' || ext === 'xls') fileType = 'EXCEL';
              else if (ext === 'txt') fileType = 'TXT';
              else fileType = 'CSV';
            } else {
              // Detect from file extension
              const ext = filePath.toLowerCase().split('.').pop();
              if (ext === 'json') fileType = 'JSON';
              else if (ext === 'xlsx' || ext === 'xls') fileType = 'EXCEL';
              else if (ext === 'txt') fileType = 'TXT';
              else fileType = 'CSV';
            }
            
            // For Google Drive, use CSV_FILE as source_type for schema API
            const schemaSourceType = dataSourceType === 'GOOGLE_DRIVE' ? 'CSV_FILE' : dataSourceType;
            
            const response = await fetch('/api/analytics/schema', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                source_type: schemaSourceType,
                file_path: filePath,
                file_type: fileType,
              }),
            });
            
            if (!response.ok) {
              const errorData = await response.json().catch(() => ({}));
              throw new Error(errorData.error || `Failed to load file schema: ${response.statusText}`);
            }
            
            const schemaMetadata = await response.json();
            setMetadata(schemaMetadata);
            setDataSourceType('csv'); // Mark as file source
          }
        }
      } else {
        // Redirect to configuration page if not configured
        console.log('[ANALYTICS] No data source configured, redirecting to configuration');
        window.location.href = '/';
        return;
      }
    } catch (error) {
      console.error('Failed to load metadata:', error);
      // Fallback to example metadata on error
      setMetadata(exampleMetadata);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Check if configured, if not redirect to home
    const isConfigured = sessionStorage.getItem('isConfigured');
    if (isConfigured !== 'true') {
      window.location.href = '/';
      return;
    }
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

