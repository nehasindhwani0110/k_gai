import { NextRequest, NextResponse } from 'next/server';
import { executeSQLQuery, executeQueryLogic, executeSQLOnCSV } from '@/analytics-engine/services/query-executor';
import { executeFileQuery } from '@/analytics-engine/services/file-query-executor';
import { QueryType, SourceType } from '@/analytics-engine/types';
import * as path from 'path';
import { prisma } from '@/lib/prisma';
import { enrichQueryResults } from '@/analytics-engine/services/data-enrichment';
import { getHybridMetadata } from '@/analytics-engine/services/hybrid-metadata-service';

interface ExecuteRequest {
  query_type: QueryType;
  query_content: string;
  source_type: SourceType;
  connection_string?: string;
  file_path?: string;
  file_type?: 'CSV' | 'JSON' | 'EXCEL' | 'TXT';
  data_source_id?: string; // For canonical mapping
  is_canonical_query?: boolean; // If true, translate query before execution
  user_question?: string; // Original user question for query fixing
}

export async function POST(request: NextRequest) {
  try {
    const body: ExecuteRequest = await request.json();
    
    // Debug logging
    console.log('[EXECUTE] Request received:', {
      query_type: body.query_type,
      source_type: body.source_type,
      has_file_path: !!body.file_path,
      has_connection_string: !!body.connection_string,
      has_data_source_id: !!body.data_source_id,
      data_source_id: body.data_source_id,
      is_canonical_query: body.is_canonical_query,
      query_preview: body.query_content?.substring(0, 100),
      request_keys: Object.keys(body),
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
      } else if (body.source_type === 'CSV_FILE' || body.source_type === 'EXCEL_FILE' || body.source_type === 'JSON_FILE' || body.source_type === 'TXT_FILE' || body.source_type === 'GOOGLE_DRIVE') {
        // File-based source type but no file_path - error
        console.error(`Missing file_path for ${body.source_type} source type`, { source_type: body.source_type, query_type: body.query_type });
        return NextResponse.json(
          { 
            error: `file_path is required for ${body.source_type} source type`,
            details: 'Please ensure the file was uploaded correctly and file_path is included in the request'
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
        // NO TRANSLATION NEEDED - We now use actual database names directly
        // The LLM receives real table/column names, so queries work as-is
        let queryToExecute = body.query_content;
        let dataSourceId = body.data_source_id;
        const needsTranslation = false; // Disabled - using actual names eliminates translation
        
        console.log('[EXECUTE] Translation check:', {
          needsTranslation,
          is_canonical_query: body.is_canonical_query,
          source_type: body.source_type,
          has_data_source_id: !!body.data_source_id,
          data_source_id: body.data_source_id,
        });
        
        // If translation is needed but data_source_id is missing, try to find it from connection_string
        if (needsTranslation && !dataSourceId && body.connection_string) {
          try {
            console.log('[EXECUTE] 🔍 Attempting to find data_source_id from connection_string...');
            const dataSource = await prisma.dataSource.findFirst({
              where: {
                connectionString: body.connection_string,
                isActive: true,
              },
              select: { id: true },
            });
            
            if (dataSource) {
              dataSourceId = dataSource.id;
              console.log('[EXECUTE] ✅ Found data_source_id from connection_string:', dataSourceId);
            } else {
              console.warn('[EXECUTE] ⚠️ Could not find data_source_id matching connection_string');
            }
          } catch (lookupError) {
            console.error('[EXECUTE] ❌ Error looking up data_source_id:', lookupError);
          }
        }
        
        // If translation is needed but data_source_id is still missing, return error
        if (needsTranslation && !dataSourceId) {
          console.error('[EXECUTE] ❌ CRITICAL: Translation needed but data_source_id missing!');
          console.error('[EXECUTE] ❌ Query will fail because canonical table names don\'t exist in database');
          console.error('[EXECUTE] Request details:', {
            source_type: body.source_type,
            is_canonical_query: body.is_canonical_query,
            has_data_source_id: !!body.data_source_id,
            data_source_id: body.data_source_id,
            request_keys: Object.keys(body),
            query_preview: body.query_content.substring(0, 200),
          });
          
          return NextResponse.json(
            { 
              error: 'data_source_id is required for canonical query translation',
              details: `The query uses canonical table names (like 'fee', 'student', 'aiquiz') which need to be translated to actual database table names. Please provide data_source_id in the request, or ensure the data source is properly configured with schema mappings.`,
              source_type: body.source_type,
              query_preview: body.query_content.substring(0, 200),
            },
            { status: 400 }
          );
        }
        
        if (needsTranslation && dataSourceId) {
          try {
            const { translateCanonicalQuery } = await import('@/analytics-engine/services/canonical-mapping-service');
            console.log('[EXECUTE] 🔄 Translating query with data_source_id:', dataSourceId);
            queryToExecute = await translateCanonicalQuery(dataSourceId, body.query_content);
            console.log('[EXECUTE] ✅ Translation successful:', {
              original: body.query_content.substring(0, 150),
              translated: queryToExecute.substring(0, 150),
              data_source_id: dataSourceId,
            });
          } catch (translationError) {
            console.error('[EXECUTE] ❌ Query translation failed:', translationError);
            console.error('[EXECUTE] Error details:', {
              message: translationError instanceof Error ? translationError.message : String(translationError),
              stack: translationError instanceof Error ? translationError.stack : undefined,
            });
            
            // Return error instead of continuing with untranslated query
            return NextResponse.json(
              { 
                error: 'Query translation failed',
                details: translationError instanceof Error ? translationError.message : String(translationError),
                suggestion: 'The canonical query could not be translated to actual database table names. Please ensure schema mappings are configured for this data source.',
                data_source_id: dataSourceId,
                query_preview: body.query_content.substring(0, 200),
              },
              { status: 400 }
            );
          }
        } else if (body.data_source_id && !needsTranslation) {
          console.log('[EXECUTE] ℹ️ data_source_id provided but translation not needed:', {
            source_type: body.source_type,
            is_canonical_query: body.is_canonical_query,
            data_source_id: body.data_source_id,
          });
        }
        
        results = await executeSQLQuery(
          body.connection_string,
          queryToExecute,
          dataSourceId || body.data_source_id,
          body.user_question
        );
        
        // CRITICAL: Enrich results with names when IDs are detected
        if (results && results.length > 0 && body.connection_string) {
          try {
            // Get metadata for enrichment (try to get it, but don't fail if we can't)
            let metadata: any = null;
            try {
              if (dataSourceId || body.data_source_id) {
                metadata = await getHybridMetadata({
                  connectionString: body.connection_string,
                  dataSourceId: dataSourceId || body.data_source_id,
                  userQuestion: body.user_question,
                  useSemanticSearch: false, // Don't filter for enrichment
                });
              }
            } catch (metadataError) {
              console.warn('[EXECUTE] ⚠️ Could not fetch metadata for enrichment, will try direct queries:', metadataError);
            }
            
            // Enrich results with names (works with or without metadata)
            results = await enrichQueryResults(
              results,
              metadata || { tables: [], source_type: 'SQL_DB' }, // Provide minimal metadata if not available
              queryToExecute,
              body.connection_string
            );
            console.log('[EXECUTE] ✅ Data enrichment complete - IDs replaced with names where possible');
          } catch (enrichError) {
            console.warn('[EXECUTE] ⚠️ Data enrichment failed, returning original results:', enrichError);
            // Continue with original results if enrichment fails
          }
        }
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

