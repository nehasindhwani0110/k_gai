import { NextRequest, NextResponse } from 'next/server';
import { 
  generateAnalyticsSuggestions,
  generateAnalyticsSuggestionsWithAgent
} from '@/analytics-engine/services/ai-analytics-suggestions';
import { validateMetadata } from '@/analytics-engine/services/schema-introspection';
import { DataSourceMetadata } from '@/analytics-engine/types';

export async function POST(request: NextRequest) {
  try {
    const body: { metadata: DataSourceMetadata; connection_string?: string; use_agent?: boolean } = await request.json();
    
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

    // Check if agent-based generation is requested or needed
    const useAgent = body.use_agent ?? process.env.USE_AGENT_BASED_QUERIES === 'true';
    const connectionString = body.connection_string;
    
    let suggestions;
    
    // Use agent-based approach for large databases or if explicitly requested
    if (useAgent || (body.metadata.tables && body.metadata.tables.length > 10)) {
      try {
        console.log('[API] Using agent-based approach for analytics suggestions');
        suggestions = await generateAnalyticsSuggestionsWithAgent(
          body.metadata,
          connectionString
        );
      } catch (error) {
        console.warn('[API] Agent-based suggestions failed, falling back to direct LLM:', error);
        // Fallback to original method
        suggestions = await generateAnalyticsSuggestions(body.metadata);
      }
    } else {
      // Use original direct LLM method for smaller databases
      suggestions = await generateAnalyticsSuggestions(body.metadata);
    }

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

