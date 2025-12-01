import { NextRequest, NextResponse } from 'next/server';
import {
  getCanonicalSchema,
  registerSchemaMappings,
  getSourceMetadata,
  autoRegisterSchemaFromIntrospection,
} from '@/analytics-engine/services/canonical-mapping-service';
import { prisma } from '@/lib/prisma';

/**
 * GET /api/analytics/data-sources/[id]/schema - Get canonical schema for a data source
 * Auto-detects schema if mappings don't exist
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;
    const searchParams = request.nextUrl.searchParams;
    const type = searchParams.get('type'); // 'canonical' or 'source'

    if (type === 'source') {
      const metadata = await getSourceMetadata(id);
      return NextResponse.json(metadata);
    }

    // Check if mappings exist
    const existingMappings = await prisma.schemaMapping.findFirst({
      where: { dataSourceId: id },
    });

    // If no mappings exist, auto-detect schema
    if (!existingMappings) {
      const dataSource = await prisma.dataSource.findUnique({
        where: { id },
      });

      if (!dataSource) {
        return NextResponse.json(
          { error: 'Data source not found' },
          { status: 404 }
        );
      }

      if (dataSource.sourceType === 'SQL_DB' && dataSource.connectionString) {
        console.log(`[SCHEMA] Auto-detecting schema for data source: ${id}`);
        console.log(`[SCHEMA] Connection string: ${dataSource.connectionString.substring(0, 50)}...`);
        
        try {
          // Call Python backend for schema introspection using SQLAlchemy
          const pythonBackendUrl = process.env.PYTHON_BACKEND_URL || 'http://localhost:8000';
          
          console.log(`[SCHEMA] Calling Python backend: ${pythonBackendUrl}/introspect`);
          
          // Use POST method for better security (connection string in body, not URL)
          const introspectionResponse = await fetch(`${pythonBackendUrl}/introspect`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              connection_string: dataSource.connectionString,
            }),
          });

          if (!introspectionResponse.ok) {
            const errorText = await introspectionResponse.text();
            throw new Error(`Python backend error: ${introspectionResponse.status} - ${errorText}`);
          }

          const introspectedMetadata = await introspectionResponse.json();
          
          if (introspectedMetadata.error) {
            throw new Error(introspectedMetadata.error);
          }

          console.log(`[SCHEMA] Introspection successful: Found ${introspectedMetadata.tables?.length || 0} tables`);
          
          // Auto-register schema mappings
          await autoRegisterSchemaFromIntrospection(id, introspectedMetadata);
          console.log(`[SCHEMA] Schema auto-detected and registered for: ${id}`);
        } catch (error) {
          console.error('[SCHEMA] Auto-detection error:', error);
          return NextResponse.json(
            {
              error: 'Schema introspection failed',
              details: error instanceof Error ? error.message : String(error),
              message: 'Make sure Python backend is running on port 8000',
            },
            { status: 500 }
          );
        }
      }
    }

    // Default: return canonical schema
    const metadata = await getCanonicalSchema(id);
    return NextResponse.json(metadata);
  } catch (error) {
    console.error('Error fetching schema:', error);
    return NextResponse.json(
      {
        error: 'Failed to fetch schema',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/analytics/data-sources/[id]/schema - Register schema mappings
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;
    const body = await request.json();
    const { mappings } = body;

    if (!mappings || !Array.isArray(mappings)) {
      return NextResponse.json(
        { error: 'Missing required field: mappings (array)' },
        { status: 400 }
      );
    }

    await registerSchemaMappings(id, mappings);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error registering schema mappings:', error);
    return NextResponse.json(
      {
        error: 'Failed to register schema mappings',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}

