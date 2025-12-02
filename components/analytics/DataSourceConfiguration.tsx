'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'react-hot-toast';

type DataSourceType = 'SQL_DB' | 'CSV_FILE' | 'EXCEL_FILE' | 'JSON_FILE' | 'TXT_FILE' | 'GOOGLE_DRIVE';

export default function DataSourceConfiguration() {
  const router = useRouter();
  const [sourceType, setSourceType] = useState<DataSourceType | ''>('');
  const [loading, setLoading] = useState(false);
  
  // SQL Database fields
  const [dbHost, setDbHost] = useState('');
  const [dbPort, setDbPort] = useState('3306');
  const [dbUsername, setDbUsername] = useState('');
  const [dbPassword, setDbPassword] = useState('');
  const [dbName, setDbName] = useState('');
  const [dataSourceName, setDataSourceName] = useState('');
  
  // File upload
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  
  // Google Drive
  const [googleDriveUrl, setGoogleDriveUrl] = useState('');

  const handleSourceTypeChange = (type: DataSourceType) => {
    setSourceType(type);
    setSelectedFile(null);
    setGoogleDriveUrl('');
    // Reset form fields
    setDbHost('');
    setDbPort('3306');
    setDbUsername('');
    setDbPassword('');
    setDbName('');
    setDataSourceName('');
  };

  const buildConnectionString = (): string => {
    if (!dbHost || !dbUsername || !dbPassword || !dbName) {
      return '';
    }
    // URL encode password to handle special characters
    const encodedPassword = encodeURIComponent(dbPassword);
    return `mysql://${dbUsername}:${encodedPassword}@${dbHost}:${dbPort}/${dbName}`;
  };

  const handleSQLSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!dataSourceName || !dbHost || !dbUsername || !dbPassword || !dbName) {
      toast.error('Please fill in all required fields');
      return;
    }

    setLoading(true);
    try {
      const connectionString = buildConnectionString();
      
      const response = await fetch('/api/analytics/data-sources', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: dataSourceName,
          sourceType: 'SQL_DB',
          connectionString,
          description: `SQL Database: ${dbHost}:${dbPort}/${dbName}`,
          autoRegisterSchema: true, // Auto-detect schema
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to configure data source');
      }

      // Store data source info in sessionStorage
      sessionStorage.setItem('dataSourceId', data.dataSource.id);
      sessionStorage.setItem('dataSourceName', data.dataSource.name);
      sessionStorage.setItem('dataSourceType', 'SQL_DB');
      sessionStorage.setItem('connectionString', connectionString); // Store connection string
      sessionStorage.setItem('isConfigured', 'true');

      toast.success(`Data source "${dataSourceName}" configured successfully!`);
      
      // Redirect to analytics dashboard
      router.push('/analytics');
    } catch (error) {
      console.error('Configuration error:', error);
      toast.error(error instanceof Error ? error.message : 'Configuration failed');
    } finally {
      setLoading(false);
    }
  };

  const handleFileUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!selectedFile || !dataSourceName) {
      toast.error('Please select a file and enter a data source name');
      return;
    }

    setUploading(true);
    try {
      // First upload the file
      const formData = new FormData();
      formData.append('file', selectedFile);
      formData.append('source_type', sourceType);

      const uploadResponse = await fetch('/api/analytics/upload', {
        method: 'POST',
        body: formData,
      });

      const uploadData = await uploadResponse.json();

      if (!uploadResponse.ok) {
        throw new Error(uploadData.error || 'File upload failed');
      }

      // Register the data source
      const registerResponse = await fetch('/api/analytics/data-sources', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: dataSourceName,
          sourceType,
          filePath: uploadData.file_path,
          description: `File: ${selectedFile.name}`,
        }),
      });

      const registerData = await registerResponse.json();

      if (!registerResponse.ok) {
        throw new Error(registerData.error || 'Failed to register data source');
      }

      // Store data source info
      sessionStorage.setItem('dataSourceId', registerData.dataSource.id);
      sessionStorage.setItem('dataSourceName', registerData.dataSource.name);
      sessionStorage.setItem('dataSourceType', sourceType);
      sessionStorage.setItem('filePath', uploadData.file_path);
      sessionStorage.setItem('isConfigured', 'true');

      toast.success(`File "${selectedFile.name}" uploaded and configured successfully!`);
      
      // Redirect to analytics dashboard
      router.push('/analytics');
    } catch (error) {
      console.error('File upload error:', error);
      toast.error(error instanceof Error ? error.message : 'File upload failed');
    } finally {
      setUploading(false);
    }
  };

  const handleGoogleDriveSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!dataSourceName || !googleDriveUrl) {
      toast.error('Please enter a data source name and Google Drive URL');
      return;
    }

    setUploading(true);
    try {
      // Download file from Google Drive
      const downloadResponse = await fetch('/api/analytics/google-drive/download', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          url: googleDriveUrl,
        }),
      });

      const downloadData = await downloadResponse.json();

      if (!downloadResponse.ok) {
        throw new Error(downloadData.error || 'Failed to download file from Google Drive');
      }

      // Register the data source
      const registerResponse = await fetch('/api/analytics/data-sources', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: dataSourceName,
          sourceType: downloadData.source_type || 'CSV_FILE',
          filePath: downloadData.file_path,
          description: `Google Drive: ${googleDriveUrl}`,
        }),
      });

      const registerData = await registerResponse.json();

      if (!registerResponse.ok) {
        throw new Error(registerData.error || 'Failed to register data source');
      }

      // Store data source info
      sessionStorage.setItem('dataSourceId', registerData.dataSource.id);
      sessionStorage.setItem('dataSourceName', registerData.dataSource.name);
      sessionStorage.setItem('dataSourceType', downloadData.source_type || 'CSV_FILE');
      sessionStorage.setItem('filePath', downloadData.file_path);
      sessionStorage.setItem('isConfigured', 'true');

      toast.success(`File from Google Drive configured successfully!`);
      
      // Redirect to analytics dashboard
      router.push('/analytics');
    } catch (error) {
      console.error('Google Drive error:', error);
      toast.error(error instanceof Error ? error.message : 'Google Drive configuration failed');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 px-4 py-8">
      <div className="max-w-2xl w-full bg-white rounded-lg shadow-xl p-8">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Configure Data Source</h1>
          <p className="text-gray-600">Choose your data source type and configure it</p>
        </div>

        {/* Data Source Type Selection */}
        <div className="mb-8">
          <label className="block text-sm font-medium text-gray-700 mb-4">
            Choose Data Source Type
          </label>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {(['SQL_DB', 'CSV_FILE', 'EXCEL_FILE', 'JSON_FILE', 'TXT_FILE', 'GOOGLE_DRIVE'] as DataSourceType[]).map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => handleSourceTypeChange(type)}
                className={`p-4 border-2 rounded-lg transition-all ${
                  sourceType === type
                    ? 'border-blue-600 bg-blue-50 text-blue-700'
                    : 'border-gray-200 hover:border-gray-300 text-gray-700'
                }`}
              >
                <div className="font-semibold text-sm">
                  {type === 'SQL_DB' && 'SQL Database'}
                  {type === 'CSV_FILE' && 'CSV File'}
                  {type === 'EXCEL_FILE' && 'Excel File'}
                  {type === 'JSON_FILE' && 'JSON File'}
                  {type === 'TXT_FILE' && 'Text File'}
                  {type === 'GOOGLE_DRIVE' && 'Google Drive'}
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* SQL Database Configuration Form */}
        {sourceType === 'SQL_DB' && (
          <form onSubmit={handleSQLSubmit} className="space-y-6">
            <div>
              <label htmlFor="dataSourceName" className="block text-sm font-medium text-gray-700 mb-2">
                Data Source Name *
              </label>
              <input
                id="dataSourceName"
                type="text"
                value={dataSourceName}
                onChange={(e) => setDataSourceName(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                placeholder="e.g., Production Database"
                required
                disabled={loading}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="dbHost" className="block text-sm font-medium text-gray-700 mb-2">
                  Host *
                </label>
                <input
                  id="dbHost"
                  type="text"
                  value={dbHost}
                  onChange={(e) => setDbHost(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                  placeholder="localhost"
                  required
                  disabled={loading}
                />
              </div>

              <div>
                <label htmlFor="dbPort" className="block text-sm font-medium text-gray-700 mb-2">
                  Port *
                </label>
                <input
                  id="dbPort"
                  type="number"
                  value={dbPort}
                  onChange={(e) => setDbPort(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                  placeholder="3306"
                  required
                  disabled={loading}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="dbUsername" className="block text-sm font-medium text-gray-700 mb-2">
                  Username *
                </label>
                <input
                  id="dbUsername"
                  type="text"
                  value={dbUsername}
                  onChange={(e) => setDbUsername(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                  placeholder="root"
                  required
                  disabled={loading}
                />
              </div>

              <div>
                <label htmlFor="dbPassword" className="block text-sm font-medium text-gray-700 mb-2">
                  Password *
                </label>
                <input
                  id="dbPassword"
                  type="password"
                  value={dbPassword}
                  onChange={(e) => setDbPassword(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                  placeholder="Enter password"
                  required
                  disabled={loading}
                />
              </div>
            </div>

            <div>
              <label htmlFor="dbName" className="block text-sm font-medium text-gray-700 mb-2">
                Database Name *
              </label>
              <input
                id="dbName"
                type="text"
                value={dbName}
                onChange={(e) => setDbName(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                placeholder="database_name"
                required
                disabled={loading}
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 text-white py-3 rounded-lg font-semibold hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              {loading ? (
                <span className="flex items-center justify-center">
                  <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Configuring...
                </span>
              ) : (
                'Configure SQL Database'
              )}
            </button>
          </form>
        )}

        {/* File Upload Configuration */}
        {(sourceType === 'CSV_FILE' || sourceType === 'EXCEL_FILE' || sourceType === 'JSON_FILE' || sourceType === 'TXT_FILE') && (
          <form onSubmit={handleFileUpload} className="space-y-6">
            <div>
              <label htmlFor="fileDataSourceName" className="block text-sm font-medium text-gray-700 mb-2">
                Data Source Name *
              </label>
              <input
                id="fileDataSourceName"
                type="text"
                value={dataSourceName}
                onChange={(e) => setDataSourceName(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                placeholder="e.g., Sales Data"
                required
                disabled={uploading}
              />
            </div>

            <div>
              <label htmlFor="fileUpload" className="block text-sm font-medium text-gray-700 mb-2">
                Upload {sourceType === 'CSV_FILE' ? 'CSV' : sourceType === 'EXCEL_FILE' ? 'Excel' : sourceType === 'JSON_FILE' ? 'JSON' : 'Text'} File *
              </label>
              <div className="mt-1 flex justify-center px-6 pt-5 pb-6 border-2 border-gray-300 border-dashed rounded-lg hover:border-gray-400 transition-colors">
                <div className="space-y-1 text-center">
                  <svg className="mx-auto h-12 w-12 text-gray-400" stroke="currentColor" fill="none" viewBox="0 0 48 48">
                    <path d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-4h12m-4 4v12m0 0l-4-4m4 4l4-4" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  <div className="flex text-sm text-gray-600">
                    <label htmlFor="fileUpload" className="relative cursor-pointer bg-white rounded-md font-medium text-blue-600 hover:text-blue-500 focus-within:outline-none focus-within:ring-2 focus-within:ring-offset-2 focus-within:ring-blue-500">
                      <span>Upload a file</span>
                      <input
                        id="fileUpload"
                        name="fileUpload"
                        type="file"
                        accept={
                          sourceType === 'CSV_FILE' ? '.csv' :
                          sourceType === 'EXCEL_FILE' ? '.xlsx,.xls' :
                          sourceType === 'JSON_FILE' ? '.json' :
                          '.txt'
                        }
                        className="sr-only"
                        onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                        disabled={uploading}
                        required
                      />
                    </label>
                    <p className="pl-1">or drag and drop</p>
                  </div>
                  <p className="text-xs text-gray-500">
                    {sourceType === 'CSV_FILE' && 'CSV files only'}
                    {sourceType === 'EXCEL_FILE' && 'Excel files (.xlsx, .xls)'}
                    {sourceType === 'JSON_FILE' && 'JSON files only'}
                    {sourceType === 'TXT_FILE' && 'Text files (.txt)'}
                  </p>
                  {selectedFile && (
                    <p className="text-sm text-green-600 font-medium mt-2">
                      Selected: {selectedFile.name}
                    </p>
                  )}
                </div>
              </div>
            </div>

            <button
              type="submit"
              disabled={uploading || !selectedFile}
              className="w-full bg-blue-600 text-white py-3 rounded-lg font-semibold hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              {uploading ? (
                <span className="flex items-center justify-center">
                  <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Uploading...
                </span>
              ) : (
                `Upload ${sourceType === 'CSV_FILE' ? 'CSV' : sourceType === 'EXCEL_FILE' ? 'Excel' : sourceType === 'JSON_FILE' ? 'JSON' : 'Text'} File`
              )}
            </button>
          </form>
        )}

        {/* Google Drive Configuration */}
        {sourceType === 'GOOGLE_DRIVE' && (
          <form onSubmit={handleGoogleDriveSubmit} className="space-y-6">
            <div>
              <label htmlFor="googleDriveDataSourceName" className="block text-sm font-medium text-gray-700 mb-2">
                Data Source Name *
              </label>
              <input
                id="googleDriveDataSourceName"
                type="text"
                value={dataSourceName}
                onChange={(e) => setDataSourceName(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                placeholder="e.g., Sales Data from Drive"
                required
                disabled={uploading}
              />
            </div>

            <div>
              <label htmlFor="googleDriveUrl" className="block text-sm font-medium text-gray-700 mb-2">
                Google Drive File URL or Shareable Link *
              </label>
              <input
                id="googleDriveUrl"
                type="url"
                value={googleDriveUrl}
                onChange={(e) => setGoogleDriveUrl(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                placeholder="https://drive.google.com/file/d/FILE_ID/view?usp=sharing"
                required
                disabled={uploading}
              />
              <p className="text-xs text-gray-500 mt-2">
                Paste the shareable link from Google Drive. Make sure the file is set to "Anyone with the link can view".
              </p>
            </div>

            <button
              type="submit"
              disabled={uploading || !googleDriveUrl}
              className="w-full bg-blue-600 text-white py-3 rounded-lg font-semibold hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              {uploading ? (
                <span className="flex items-center justify-center">
                  <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Downloading from Google Drive...
                </span>
              ) : (
                'Download from Google Drive'
              )}
            </button>
          </form>
        )}

        {/* Help Text */}
        {!sourceType && (
          <div className="text-center text-gray-500 text-sm mt-8">
            Please select a data source type to continue
          </div>
        )}
      </div>
    </div>
  );
}

