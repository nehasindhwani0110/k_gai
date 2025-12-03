import { NextRequest, NextResponse } from 'next/server';
import { 
  generateAdhocQuery, 
  generateDashboardMetrics,
  generateAdhocQueryWithLangGraphAgent,
  generateDashboardMetricsWithAgent
} from '@/analytics-engine/services/llm-service';
import { validateMetadata } from '@/analytics-engine/services/schema-introspection';
import { validateSQLQuery } from '@/analytics-engine/services/query-executor';
import { postProcessDashboardMetrics } from '@/analytics-engine/services/query-post-processor';
import { AnalyticsRequest } from '@/analytics-engine/types';
import { generateQueryWithPythonAgent } from '@/analytics-engine/services/python-agent-bridge';
import { initializeRedis } from '@/analytics-engine/services/redis-cache';

// Initialize Redis connection early (once per server instance)
let redisInitialized = false;
async function ensureRedisInitialized() {
  if (!redisInitialized) {
    redisInitialized = true;
    await initializeRedis();
  }
}

export async function POST(request: NextRequest) {
  // Initialize Redis early
  await ensureRedisInitialized();
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

      // SIMPLIFIED: Always fetch fresh metadata from system catalog
      // Don't trust frontend metadata - it might be stale
      // Get data_source_id from metadata or connection_string
      const dataSourceId = (body.metadata as any)?.data_source_id;
      const connectionString = (body as any).connection_string;
      
      let freshMetadata = body.metadata;
      
      // STEP 1: Understand question semantics FIRST (like semantic search)
      // This guides which tables/columns to fetch from system catalog
      let questionUnderstanding: any = null;
      if (dataSourceId && body.metadata?.source_type === 'SQL_DB') {
        try {
          console.log(`[API] 🧠 Step 1: Understanding question semantics FIRST`);
          const { understandQuestionSemantics } = await import('@/analytics-engine/services/llm-service');
          questionUnderstanding = await understandQuestionSemantics(body.user_question);
          
          console.log(`[API] ✅ Question understanding:`);
          console.log(`[API]   Intent: ${questionUnderstanding.intent}`);
          console.log(`[API]   Key Concepts: ${questionUnderstanding.keyConcepts.join(', ')}`);
          console.log(`[API]   Entities: ${questionUnderstanding.entities.join(', ')}`);
        } catch (error) {
          console.warn(`[API] ⚠️ Question understanding failed, proceeding without it:`, error);
        }
      }
      
      // STEP 2: Use semantic understanding to guide system catalog query
      // Fetch fresh metadata from system catalog, filtered by semantic understanding
      if (dataSourceId && body.metadata?.source_type === 'SQL_DB') {
        try {
          console.log(`[API] 🔄 Step 2: Fetching fresh metadata from system catalog (guided by semantic understanding)`);
          const { getHybridMetadata } = await import('@/analytics-engine/services/hybrid-metadata-service');
          const { estimateMetadataTokens, isMetadataSizeSafe } = await import('@/analytics-engine/utils/token-counter');
          const model = process.env.OPENAI_MODEL || 'gpt-4-turbo-preview';
          
          // Build enhanced question from semantic understanding
          const enhancedQuestion = questionUnderstanding 
            ? `${questionUnderstanding.semanticSummary}\n\nIntent: ${questionUnderstanding.intent}\nKey Concepts: ${questionUnderstanding.keyConcepts.join(', ')}\nEntities: ${questionUnderstanding.entities.join(', ')}`
            : body.user_question;
          
          // Step 2a: Get ALL tables from system catalog first (no semantic filtering)
          let systemCatalogMetadata = await getHybridMetadata({
            dataSourceId,
            userQuestion: undefined, // No question = get all tables
            maxTables: 1000, // Get ALL tables
            useSystemCatalog: true, // Use system catalog (always fresh)
            useSemanticSearch: false, // NO semantic search - just get all tables
            includeStatistics: false,
            forceRefresh: true, // Always fresh
          });
          
          const tokenCount = estimateMetadataTokens(systemCatalogMetadata);
          const isSafe = isMetadataSizeSafe(systemCatalogMetadata, model);
          
          console.log(`[API] 📊 System catalog: ${systemCatalogMetadata.tables?.length || 0} tables, ${tokenCount} tokens, Safe: ${isSafe ? '✅' : '❌'}`);
          
          // Step 2b: Use semantic search ONLY if metadata is too large OR if we have semantic understanding
          if (!isSafe || questionUnderstanding) {
            console.log(`[API] 🎯 Using semantic understanding to filter metadata`);
            freshMetadata = await getHybridMetadata({
              dataSourceId,
              userQuestion: enhancedQuestion, // Use semantic understanding to guide filtering
              maxTables: 30, // Limit tables based on semantic relevance
              useSystemCatalog: true, // Still use system catalog (fresh data)
              useSemanticSearch: true, // Use semantic search to filter
              includeStatistics: false,
              forceRefresh: true,
            });
            console.log(`[API] ✅ Semantically-filtered metadata: ${freshMetadata.tables?.length || 0} tables`);
          } else {
            // Metadata is safe - use system catalog metadata as-is (all tables, no filtering)
            freshMetadata = systemCatalogMetadata;
            console.log(`[API] ✅ Using system catalog metadata as-is (all ${systemCatalogMetadata.tables?.length || 0} tables - no filtering needed)`);
          }
          
          // Ensure data_source_id is preserved
          freshMetadata.data_source_id = dataSourceId;
          
          // Log table and column counts to verify fresh data
          const totalColumns = freshMetadata.tables?.reduce((sum, t) => sum + (t.columns?.length || 0), 0) || 0;
          console.log(`[API] ✅ Final metadata: ${freshMetadata.tables?.length || 0} tables, ${totalColumns} columns`);
          
          // Log sample table names to verify we're getting fresh schema
          if (freshMetadata.tables && freshMetadata.tables.length > 0) {
            const sampleTables = freshMetadata.tables.slice(0, 5).map(t => t.name);
            console.log(`[API] 📋 Sample tables: ${sampleTables.join(', ')}`);
          }
        } catch (error) {
          console.warn(`[API] ⚠️ Failed to fetch fresh metadata, using provided metadata:`, error);
          // Continue with provided metadata if refresh fails
        }
      }

      // OPTIMIZATION: Use agent ONLY for complex queries, not simple ones
      // Simple queries (e.g., "show all classes") are faster and more accurate with direct LLM
      const questionLower = body.user_question.toLowerCase();
      const isSimpleQuery = 
        questionLower.includes('show all') ||
        questionLower.includes('list all') ||
        questionLower.includes('display all') ||
        questionLower.startsWith('select') ||
        (questionLower.split(' ').length <= 5 && !questionLower.includes('compare') && !questionLower.includes('difference'));
      
      // Check if agent-based generation is explicitly requested
      const useAgent = (body as any).use_agent === true; // Only if explicitly true
      const useLangGraph = (body as any).use_langgraph === true; // Only if explicitly true

      let result;
      
      // Use agent ONLY if explicitly requested AND query is complex
      if ((useAgent || useLangGraph) && !isSimpleQuery) {
        // Try LangGraph agent first if requested
        if (useLangGraph) {
          try {
            console.log('[API] Using LangGraph agent for query generation');
            result = await generateAdhocQueryWithLangGraphAgent(
              body.user_question,
              freshMetadata, // Use fresh metadata
              connectionString
            );
          } catch (error) {
            console.warn('[API] LangGraph agent failed, trying Python agent:', error);
            // Fall through to Python agent
          }
        }
        
        // Use Python agent for SQL databases (or as fallback)
        if (!result && freshMetadata.source_type === 'SQL_DB' && connectionString) {
          try {
            console.log('[API] Using Python agent for query generation');
            result = await generateQueryWithPythonAgent(
              body.user_question,
              connectionString,
              freshMetadata // Use fresh metadata
            );
          } catch (error) {
            console.warn('[API] Agent generation failed, falling back to direct LLM:', error);
            // Fallback to original method (which now reduces metadata)
            result = await generateAdhocQuery(
              body.user_question,
              freshMetadata, // Use fresh metadata
              connectionString
            );
          }
        } else if (!result) {
          // No agent available, use direct LLM (which now reduces metadata)
          result = await generateAdhocQuery(
            body.user_question,
            freshMetadata, // Use fresh metadata
            connectionString
          );
        }
      } else {
        // Use original direct LLM method
        result = await generateAdhocQuery(
        body.user_question,
        freshMetadata // Use fresh metadata
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
      // Check if agent-based generation is requested
      const useAgent = (body as any).use_agent ?? process.env.USE_AGENT_BASED_QUERIES === 'true';
      const connectionString = (body as any).connection_string;
      
      let result;
      
      // Use agent-based approach for large databases or if explicitly requested
      if (useAgent || (body.metadata.tables && body.metadata.tables.length > 10)) {
        try {
          console.log('[API] Using agent-based approach for dashboard metrics');
          result = await generateDashboardMetricsWithAgent(
            body.metadata,
            connectionString
          );
        } catch (error) {
          console.warn('[API] Agent-based dashboard metrics failed, falling back to direct LLM:', error);
          // Fallback to original method
          result = await generateDashboardMetrics(body.metadata);
        }
      } else {
        // Use original direct LLM method for smaller databases
        result = await generateDashboardMetrics(body.metadata);
      }

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

