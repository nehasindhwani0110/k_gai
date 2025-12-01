import { NextRequest, NextResponse } from 'next/server';
import { translateCanonicalQuery } from '@/analytics-engine/services/canonical-mapping-service';

/**
 * POST /api/analytics/data-sources/[id]/translate - Translate canonical query to source-specific query
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;
    const body = await request.json();
    const { canonicalQuery } = body;

    if (!canonicalQuery) {
      return NextResponse.json(
        { error: 'Missing required field: canonicalQuery' },
        { status: 400 }
      );
    }

    const translatedQuery = await translateCanonicalQuery(id, canonicalQuery);

    return NextResponse.json({
      canonicalQuery,
      translatedQuery,
      dataSourceId: id,
    });
  } catch (error) {
    console.error('Error translating query:', error);
    return NextResponse.json(
      {
        error: 'Failed to translate query',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}

