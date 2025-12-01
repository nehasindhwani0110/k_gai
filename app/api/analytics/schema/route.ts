import { NextRequest, NextResponse } from 'next/server';
import { processFile } from '@/analytics-engine/services/file-processor';
import { introspectSQLSchema } from '@/analytics-engine/services/schema-introspection';
import { saveFileMetadata } from '@/analytics-engine/services/query-history-service';
import * as path from 'path';

interface SchemaRequest {
  source_type: 'SQL_DB' | 'CSV_FILE';
  connection_string?: string;
  file_path?: string;
  file_type?: 'CSV' | 'JSON' | 'EXCEL' | 'TXT';
  schema_name?: string;
}

export async function POST(request: NextRequest) {
  try {
    const body: SchemaRequest = await request.json();
    
    if (!body.source_type) {
      return NextResponse.json(
        { error: 'Missing required field: source_type' },
        { status: 400 }
      );
    }

    if (body.source_type === 'CSV_FILE') {
      if (!body.file_path) {
        return NextResponse.json(
          { error: 'file_path is required for CSV_FILE source_type' },
          { status: 400 }
        );
      }
      
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
      
      const metadata = await processFile(body.file_path, fileType);
      
      // Save file metadata to database (non-blocking)
      try {
        const fileName = path.basename(body.file_path);
        await saveFileMetadata({
          fileName: fileName,
          filePath: body.file_path,
          fileType: fileType,
          fileSize: 0, // Size not available here, but that's okay
          tableName: metadata.tables[0]?.name,
          metadata: metadata,
        });
      } catch (error) {
        // Don't fail the schema introspection if metadata saving fails
        console.error('Failed to save file metadata:', error);
      }
      
      // Ensure file_path is included in the response
      const response = { ...metadata, file_path: body.file_path, file_type: fileType };
      return NextResponse.json(response);
    }

    if (body.source_type === 'SQL_DB') {
      if (!body.connection_string) {
        return NextResponse.json(
          { error: 'connection_string is required for SQL_DB source_type' },
          { status: 400 }
        );
      }
      // Note: This would typically be handled by Python backend
      const metadata = await introspectSQLSchema(
        body.connection_string,
        body.schema_name
      );
      return NextResponse.json(metadata);
    }

    return NextResponse.json(
      { error: `Unsupported source_type: ${body.source_type}` },
      { status: 400 }
    );
  } catch (error) {
    console.error('Schema introspection error:', error);
    return NextResponse.json(
      { 
        error: 'Schema introspection failed',
        details: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    );
  }
}

