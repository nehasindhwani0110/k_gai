import { NextRequest, NextResponse } from 'next/server';
import { executeSQLQuery, executeQueryLogic, executeSQLOnCSV } from '@/analytics-engine/services/query-executor';
import { executeFileQuery } from '@/analytics-engine/services/file-query-executor';
import { QueryType, SourceType } from '@/analytics-engine/types';
import * as path from 'path';

interface ExecuteRequest {
  query_type: QueryType;
  query_content: string;
  source_type: SourceType;
  connection_string?: string;
  file_path?: string;
  file_type?: 'CSV' | 'JSON' | 'EXCEL' | 'TXT';
  data_source_id?: string; // For canonical mapping
  is_canonical_query?: boolean; // If true, translate query before execution
}

export async function POST(request: NextRequest) {
  try {
    const body: ExecuteRequest = await request.json();
    
    // Debug logging
    console.log('Execute request received:', {
      query_type: body.query_type,
      source_type: body.source_type,
      has_file_path: !!body.file_path,
      has_connection_string: !!body.connection_string,
      query_preview: body.query_content?.substring(0, 100),
    });
    
    if (!body.query_type || !body.query_content || !body.source_type) {
      return NextResponse.json(
        { error: 'Missing required fields: query_type, query_content, source_type' },
        { status: 400 }
      );
    }

    let results: any[];

    if (body.query_type === 'SQL_QUERY') {
      // PRIORITY: If file_path is provided, execute on file (CSV, JSON, Excel, or Text)
      if (body.file_path) {
        try {
          // Detect file type from extension if not provided
          let fileType: 'CSV' | 'JSON' | 'EXCEL' | 'TXT' = 'CSV';
          if (body.file_type) {
            fileType = body.file_type;
          } else {
            const ext = path.extname(body.file_path).toLowerCase();
            if (ext === '.json') fileType = 'JSON';
            else if (ext === '.xlsx' || ext === '.xls') fileType = 'EXCEL';
            else if (ext === '.txt') fileType = 'TXT';
            else fileType = 'CSV';
          }
          
          console.log(`Executing SQL query on ${fileType} file:`, body.file_path);
          
          // Use universal file query executor
          if (fileType === 'CSV') {
            results = await executeSQLOnCSV(body.file_path, body.query_content);
          } else {
            results = await executeFileQuery(body.file_path, fileType, body.query_content);
          }
        } catch (error) {
          console.error('File query execution error:', error);
          throw error;
        }
      } else if (body.source_type === 'CSV_FILE') {
        // CSV source type but no file_path - error
        console.error('Missing file_path for CSV_FILE source type', { source_type: body.source_type, query_type: body.query_type });
        return NextResponse.json(
          { 
            error: 'file_path is required for CSV_FILE source type',
            details: 'Please ensure the CSV file was uploaded correctly and file_path is included in the request'
          },
          { status: 400 }
        );
      } else {
        // Regular SQL database query
        if (!body.connection_string) {
          return NextResponse.json(
            { 
              error: 'connection_string is required for SQL_QUERY with database source',
              details: 'For CSV files, ensure file_path is provided in the request body'
            },
            { status: 400 }
          );
        }
        // Translate query if it's canonical and data_source_id is provided
        let queryToExecute = body.query_content;
        if (body.is_canonical_query && body.data_source_id) {
          const { translateCanonicalQuery } = await import('@/analytics-engine/services/canonical-mapping-service');
          queryToExecute = await translateCanonicalQuery(body.data_source_id, body.query_content);
          console.log('Translated canonical query:', {
            original: body.query_content,
            translated: queryToExecute,
          });
        }
        
        results = await executeSQLQuery(
          body.connection_string,
          queryToExecute,
          body.data_source_id
        );
      }
    } else if (body.query_type === 'QUERY_LOGIC') {
      if (!body.file_path) {
        return NextResponse.json(
          { error: 'file_path is required for QUERY_LOGIC' },
          { status: 400 }
        );
      }
      results = await executeQueryLogic(
        body.source_type,
        body.file_path,
        body.query_content
      );
    } else {
      return NextResponse.json(
        { error: `Invalid query_type: ${body.query_type}` },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      results,
      row_count: results.length,
    });
  } catch (error) {
    console.error('Query execution error:', error);
    return NextResponse.json(
      { 
        error: 'Query execution failed',
        details: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    );
  }
}

