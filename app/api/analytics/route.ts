import { NextRequest, NextResponse } from 'next/server';
import { 
  generateAdhocQuery, 
  generateDashboardMetrics,
  generateAdhocQueryWithLangGraphAgent
} from '@/analytics-engine/services/llm-service';
import { validateMetadata } from '@/analytics-engine/services/schema-introspection';
import { validateSQLQuery } from '@/analytics-engine/services/query-executor';
import { postProcessDashboardMetrics } from '@/analytics-engine/services/query-post-processor';
import { AnalyticsRequest } from '@/analytics-engine/types';
import { generateQueryWithPythonAgent } from '@/analytics-engine/services/python-agent-bridge';

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

      // Check if agent-based generation is requested
      const useAgent = (body as any).use_agent ?? process.env.USE_AGENT_BASED_QUERIES === 'true';
      const useLangGraph = (body as any).use_langgraph ?? process.env.USE_LANGGRAPH_AGENT === 'true';
      const connectionString = (body as any).connection_string;

      let result;
      
      if (useAgent || useLangGraph) {
        // Try LangGraph agent first if requested
        if (useLangGraph) {
          try {
            console.log('[API] Using LangGraph agent for query generation');
            result = await generateAdhocQueryWithLangGraphAgent(
              body.user_question,
              body.metadata,
              connectionString
            );
          } catch (error) {
            console.warn('[API] LangGraph agent failed, trying Python agent:', error);
            // Fall through to Python agent
          }
        }
        
        // Use Python agent for SQL databases (or as fallback)
        if (!result && body.metadata.source_type === 'SQL_DB' && connectionString) {
          try {
            console.log('[API] Using Python agent for query generation');
            result = await generateQueryWithPythonAgent(
              body.user_question,
              connectionString,
              body.metadata
            );
          } catch (error) {
            console.warn('[API] Agent generation failed, falling back to direct LLM:', error);
            // Fallback to original method
            result = await generateAdhocQuery(
              body.user_question,
              body.metadata
            );
          }
        } else if (!result) {
          // No agent available, use direct LLM
          result = await generateAdhocQuery(
            body.user_question,
            body.metadata
          );
        }
      } else {
        // Use original direct LLM method
        result = await generateAdhocQuery(
          body.user_question,
          body.metadata
        );
      }

      // Validate generated SQL query if it's SQL_QUERY type
      if (result.query_type === 'SQL_QUERY' && !validateSQLQuery(result.query_content)) {
        console.error('Query validation failed:', {
          query_type: result.query_type,
          query_content: result.query_content,
          query_length: result.query_content?.length
        });
        return NextResponse.json(
          { 
            error: 'Generated query failed security validation',
            details: `Query: ${result.query_content?.substring(0, 200)}...`
          },
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
          console.error('Query validation failed for metric:', {
            metric_name: metric.metric_name,
            query_content: metric.query_content,
            query_length: metric.query_content?.length
          });
          return NextResponse.json(
            { 
              error: `Generated query for metric "${metric.metric_name}" failed security validation`,
              details: `Query: ${metric.query_content?.substring(0, 200)}...`
            },
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

