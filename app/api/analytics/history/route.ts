import { NextRequest, NextResponse } from 'next/server';
import {
  getQueryHistory,
  getQueryById,
  deleteQueryHistory,
  clearQueryHistory,
  saveQueryHistory,
} from '@/analytics-engine/services/query-history-service';

/**
 * GET /api/analytics/history - Get query history
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const limit = parseInt(searchParams.get('limit') || '50', 10);
    const id = searchParams.get('id');

    if (id) {
      // Get specific query by ID
      const query = await getQueryById(id);
      if (!query) {
        return NextResponse.json(
          { error: 'Query not found' },
          { status: 404 }
        );
      }
      return NextResponse.json(query);
    }

    // Get all queries
    const history = await getQueryHistory(limit);
    return NextResponse.json({ history });
  } catch (error) {
    console.error('Error fetching query history:', error);
    return NextResponse.json(
      {
        error: 'Failed to fetch query history',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/analytics/history - Save query to history
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      userQuestion,
      queryType,
      queryContent,
      sourceType,
      filePath,
      results,
    } = body;

    if (!userQuestion || !queryType || !queryContent || !sourceType) {
      return NextResponse.json(
        {
          error: 'Missing required fields: userQuestion, queryType, queryContent, sourceType',
        },
        { status: 400 }
      );
    }

    await saveQueryHistory({
      userQuestion,
      queryType,
      queryContent,
      sourceType,
      filePath: filePath || undefined,
      results: results || undefined,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error saving query history:', error);
    return NextResponse.json(
      {
        error: 'Failed to save query history',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/analytics/history - Delete query history
 */
export async function DELETE(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const id = searchParams.get('id');
    const clearAll = searchParams.get('clearAll') === 'true';

    if (clearAll) {
      // Clear all history
      const success = await clearQueryHistory();
      return NextResponse.json({ success });
    }

    if (id) {
      // Delete specific query
      const success = await deleteQueryHistory(id);
      if (!success) {
        return NextResponse.json(
          { error: 'Failed to delete query' },
          { status: 500 }
        );
      }
      return NextResponse.json({ success: true });
    }

    return NextResponse.json(
      { error: 'Missing id parameter or clearAll=true' },
      { status: 400 }
    );
  } catch (error) {
    console.error('Error deleting query history:', error);
    return NextResponse.json(
      {
        error: 'Failed to delete query history',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}

