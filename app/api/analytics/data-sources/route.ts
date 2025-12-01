import { NextRequest, NextResponse } from 'next/server';
import {
  registerDataSource,
  getAllDataSources,
  getDataSourceById,
  registerSchemaMappings,
  getCanonicalSchema,
  autoRegisterSchemaFromIntrospection,
} from '@/analytics-engine/services/canonical-mapping-service';
import { introspectSQLSchema } from '@/analytics-engine/services/schema-introspection';

/**
 * GET /api/analytics/data-sources - Get all data sources
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const id = searchParams.get('id');

    if (id) {
      const dataSource = await getDataSourceById(id);
      if (!dataSource) {
        return NextResponse.json(
          { error: 'Data source not found' },
          { status: 404 }
        );
      }
      return NextResponse.json(dataSource);
    }

    const dataSources = await getAllDataSources();
    return NextResponse.json({ dataSources });
  } catch (error) {
    console.error('Error fetching data sources:', error);
    return NextResponse.json(
      {
        error: 'Failed to fetch data sources',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/analytics/data-sources - Register a new data source
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, sourceType, connectionString, description, autoRegisterSchema } = body;

    if (!name || !sourceType) {
      return NextResponse.json(
        { error: 'Missing required fields: name, sourceType' },
        { status: 400 }
      );
    }

    // Register the data source
    const dataSourceId = await registerDataSource({
      name,
      sourceType,
      connectionString: connectionString || undefined,
      description: description || undefined,
    });

    // If SQL database and auto-register is enabled, introspect and register schema
    if (sourceType === 'SQL_DB' && autoRegisterSchema && connectionString) {
      try {
        // Introspect the database schema
        const metadata = await introspectSQLSchema(connectionString);
        
        // Auto-register schema mappings
        await autoRegisterSchemaFromIntrospection(dataSourceId, metadata);
      } catch (introspectionError) {
        console.error('Schema introspection failed:', introspectionError);
        // Don't fail the registration if introspection fails
      }
    }

    const dataSource = await getDataSourceById(dataSourceId);
    return NextResponse.json({ dataSource });
  } catch (error) {
    console.error('Error registering data source:', error);
    return NextResponse.json(
      {
        error: 'Failed to register data source',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}

