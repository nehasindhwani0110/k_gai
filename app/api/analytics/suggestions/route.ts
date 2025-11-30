import { NextRequest, NextResponse } from 'next/server';
import { generateAnalyticsSuggestions } from '@/analytics-engine/services/ai-analytics-suggestions';
import { validateMetadata } from '@/analytics-engine/services/schema-introspection';
import { DataSourceMetadata } from '@/analytics-engine/types';

export async function POST(request: NextRequest) {
  try {
    const body: { metadata: DataSourceMetadata } = await request.json();
    
    if (!body.metadata) {
      return NextResponse.json(
        { error: 'Missing required field: metadata' },
        { status: 400 }
      );
    }

    // Validate metadata structure
    if (!validateMetadata(body.metadata)) {
      return NextResponse.json(
        { error: 'Invalid metadata structure' },
        { status: 400 }
      );
    }

    const suggestions = await generateAnalyticsSuggestions(body.metadata);

    return NextResponse.json(suggestions);
  } catch (error) {
    console.error('Analytics suggestions API error:', error);
    return NextResponse.json(
      { 
        error: 'Failed to generate analytics suggestions',
        details: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    );
  }
}

