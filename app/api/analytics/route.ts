import { NextRequest, NextResponse } from 'next/server';
import { 
  generateAdhocQuery, 
  generateDashboardMetrics 
} from '@/analytics-engine/services/llm-service';
import { validateMetadata } from '@/analytics-engine/services/schema-introspection';
import { validateSQLQuery } from '@/analytics-engine/services/query-executor';
import { postProcessDashboardMetrics } from '@/analytics-engine/services/query-post-processor';
import { AnalyticsRequest } from '@/analytics-engine/types';

export async function POST(request: NextRequest) {
  try {
    const body: AnalyticsRequest = await request.json();
    
    // Validate request
    if (!body.mode || !body.metadata) {
      return NextResponse.json(
        { error: 'Missing required fields: mode and metadata' },
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

    // Handle ADHOC_QUERY mode
    if (body.mode === 'ADHOC_QUERY') {
      if (!body.user_question) {
        return NextResponse.json(
          { error: 'user_question is required for ADHOC_QUERY mode' },
          { status: 400 }
        );
      }

      const result = await generateAdhocQuery(
        body.user_question,
        body.metadata
      );

      // Validate generated SQL query if it's SQL_QUERY type
      if (result.query_type === 'SQL_QUERY' && !validateSQLQuery(result.query_content)) {
        return NextResponse.json(
          { error: 'Generated query failed security validation' },
          { status: 400 }
        );
      }

      return NextResponse.json(result);
    }

    // Handle DASHBOARD_METRICS mode
    if (body.mode === 'DASHBOARD_METRICS') {
      const result = await generateDashboardMetrics(body.metadata);

      // Post-process queries to fix table names and ensure compatibility
      const processedMetrics = postProcessDashboardMetrics(
        result.dashboard_metrics,
        body.metadata
      );

      // Validate all generated queries
      for (const metric of processedMetrics) {
        if (metric.query_type === 'SQL_QUERY' && !validateSQLQuery(metric.query_content)) {
          return NextResponse.json(
            { error: `Generated query for metric "${metric.metric_name}" failed security validation` },
            { status: 400 }
          );
        }
      }

      return NextResponse.json({
        dashboard_metrics: processedMetrics,
      });
    }

    return NextResponse.json(
      { error: `Invalid mode: ${body.mode}` },
      { status: 400 }
    );
  } catch (error) {
    console.error('Analytics API error:', error);
    return NextResponse.json(
      { 
        error: 'Internal server error',
        details: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    );
  }
}

