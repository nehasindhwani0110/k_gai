import { NextRequest, NextResponse } from 'next/server';
import { processCSVFile } from '@/analytics-engine/services/csv-processor';
import { introspectSQLSchema } from '@/analytics-engine/services/schema-introspection';

interface SchemaRequest {
  source_type: 'SQL_DB' | 'CSV_FILE';
  connection_string?: string;
  file_path?: string;
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
      const metadata = await processCSVFile(body.file_path);
      // Ensure file_path is included in the response
      const response = { ...metadata, file_path: body.file_path };
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

