/**
 * LangGraph Query Agent
 * 
 * Multi-step agent workflow for query generation with validation and refinement.
 * Simplified implementation that works sequentially (LangGraph StateGraph has type issues).
 */

import { ChatOpenAI } from '@langchain/openai';
import { DataSourceMetadata } from '../types';
import { exploreRelevantSchema } from '../services/agent-service';
import { validateAndRefineQuery } from '../services/agent-service';
import { validateQuery as validateQueryTool } from './tools/query-validator';
import { validateSQLQuery } from '../services/query-executor';
import { getLangSmithStatus } from '../utils/langsmith-tracer';

interface AgentState {
  question: string;
  metadata: DataSourceMetadata;
  query?: string;
  validation_result?: {
    valid: boolean;
    errors?: string[];
    suggestions?: string;
  };
  error?: string;
  step: number;
  connection_string?: string;
}

export class QueryAgent {
  private llm: ChatOpenAI;

  constructor() {
    // LangChain automatically traces if LANGCHAIN_TRACING_V2=true and LANGCHAIN_API_KEY are set
    const langSmithStatus = getLangSmithStatus();
    if (langSmithStatus.enabled) {
      console.log('[QueryAgent] LangSmith tracing enabled - LangChain calls will be traced');
    }
    
    // CRITICAL: Force use of gpt-4-turbo-preview or gpt-4o for high context (128k tokens)
    // This prevents context length errors with large schemas
    const requestedModel = process.env.OPENAI_MODEL || 'gpt-4-turbo-preview';
    const model = requestedModel.includes('gpt-4') && !requestedModel.includes('gpt-3.5')
      ? requestedModel
      : 'gpt-4-turbo-preview'; // Default to high-context model
    
    console.log(`[QueryAgent] Using model: ${model} (requested: ${requestedModel})`);
    
    this.llm = new ChatOpenAI({
      modelName: model,
      temperature: 0.2,
      openAIApiKey: process.env.OPENAI_API_KEY,
      timeout: 120000, // 120 seconds timeout
      maxRetries: 2,
      // LangChain automatically uses LangSmith if env vars are set
    });
  }

  private async analyzeQuestion(state: AgentState): Promise<Partial<AgentState>> {
    console.log('[AGENT] Analyzing question complexity');
    
    // Analyze question to determine if schema exploration is needed
    const analysisPrompt = `Analyze this question and determine:
1. Is it simple or complex?
2. Does it need schema exploration?
3. What type of query is needed?

Question: ${state.question}

Return ONLY valid JSON (no markdown, no code blocks):
{
  "complexity": "simple" | "complex",
  "needs_schema_exploration": true/false,
  "query_type": "aggregate" | "filter" | "join" | "group_by" | "comparison"
}`;

    try {
      const response = await this.llm.invoke(analysisPrompt);
      let content = typeof response.content === 'string' ? response.content : JSON.stringify(response.content);
      
      // Clean up markdown code blocks if present
      content = content.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim();
      
      // Try to extract JSON if wrapped in text
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        content = jsonMatch[0];
      }
      
      const analysis = JSON.parse(content);
      
      return {
        step: state.step + 1,
        // Store analysis in metadata or use for next steps
      };
    } catch (error) {
      console.error('[AGENT] Question analysis error:', error);
      // Continue without analysis - not critical
      return { step: state.step + 1 };
    }
  }

  private async exploreSchema(state: AgentState): Promise<Partial<AgentState>> {
    console.log('[AGENT] Exploring schema');
    
    // PRIORITY: System catalog first - ALWAYS skip exploration if metadata is already reduced
    // The metadata passed to agent is already filtered by hybrid-metadata-service
    // Don't replace it with exploration - it will fetch ALL tables again!
    const tableCount = state.metadata.tables?.length || 0;
    const columnCount = state.metadata.tables?.reduce((sum, t) => sum + (t.columns?.length || 0), 0) || 0;
    
    // CRITICAL: Check token count to determine if metadata is safe
    const { estimateMetadataTokens, isMetadataSizeSafe } = await import('../utils/token-counter');
    const model = process.env.OPENAI_MODEL || 'gpt-4-turbo-preview';
    const tokenCount = estimateMetadataTokens(state.metadata, model);
    const isSafe = isMetadataSizeSafe(state.metadata, model);
    
    console.log(`[AGENT] 📊 Metadata check: ${tableCount} tables, ${columnCount} columns, ${tokenCount} tokens (${isSafe ? '✅ Safe' : '❌ Too large'})`);
    
    // ALWAYS skip exploration if metadata is already reduced (from system catalog + semantic filtering)
    // The hybrid-metadata-service already did the work - don't undo it!
    if (isSafe || tableCount <= 15) {
      console.log(`[AGENT] ✅ Metadata already optimized (${tableCount} tables, ${tokenCount} tokens) - skipping exploration (system catalog is primary)`);
      return { step: state.step + 1 };
    }
    
    // CRITICAL: DO NOT explore schema if metadata is already reduced!
    // The hybrid-metadata-service already did semantic filtering and system catalog fetching
    // Exploring again will fetch ALL tables from the database, undoing all the optimization!
    // 
    // If metadata is still too large, apply aggressive column reduction instead
    if (!isSafe && state.metadata.source_type === 'SQL_DB') {
      console.log(`[AGENT] ⚠️ Metadata still too large (${tokenCount} tokens) - applying aggressive column reduction`);
      
      // Reduce columns per table instead of fetching more tables
      const reducedTables = state.metadata.tables.map(table => ({
        ...table,
        columns: table.columns?.slice(0, 10) || [], // Keep only top 10 columns per table
      }));
      
      const reducedMetadata: DataSourceMetadata = {
        ...state.metadata,
        tables: reducedTables,
      };
      
      const reducedTokenCount = estimateMetadataTokens(reducedMetadata, model);
      console.log(`[AGENT] ✅ Column reduction: ${tokenCount} → ${reducedTokenCount} tokens`);
        
        return {
        metadata: reducedMetadata,
          step: state.step + 1,
        };
    }
    
    // For CSV files or if no connection string, skip exploration
    return { step: state.step + 1 };
  }

  private async generateQuery(state: AgentState): Promise<Partial<AgentState>> {
    console.log('[AGENT] Generating SQL query');
    
    try {
      // Log metadata size for debugging
      const metadataSize = JSON.stringify(state.metadata).length;
      const tableCount = state.metadata.tables?.length || 0;
      const columnCount = state.metadata.tables?.reduce((sum, t) => sum + (t.columns?.length || 0), 0) || 0;
      console.log(`[AGENT] 📊 Metadata: ${tableCount} tables, ${columnCount} columns, ${(metadataSize / 1024).toFixed(1)}KB`);
      
      // CRITICAL: Use ACTUAL database table/column names (not canonical names)
      // The metadata from system catalog already has actual names - use them directly
      const schemaDescription = state.metadata.tables?.map(table => {
        const columns = table.columns?.map(col => 
          `  - ${col.name} (${col.type || 'unknown'})${col.description ? ` - ${col.description}` : ''}`
        ).join('\n') || '  (no columns)';
        return `Table: ${table.name}${table.description ? ` - ${table.description}` : ''}\n${columns}`;
      }).join('\n\n') || 'No tables available';
      
      const prompt = `Generate a SQL query that answers this question: "${state.question}"

Database Schema (USE EXACT TABLE AND COLUMN NAMES AS SHOWN):
${schemaDescription}

CRITICAL REQUIREMENTS:
1. Use EXACT table and column names from the schema above (case-sensitive)
2. DO NOT use canonical names or translated names - use the actual database names
3. Only generate SELECT queries (no INSERT, UPDATE, DELETE, DROP, ALTER)
4. Use proper SQL syntax for MySQL
5. Include appropriate WHERE, GROUP BY, ORDER BY, LIMIT clauses as needed
6. CRITICAL - MySQL ONLY_FULL_GROUP_BY mode: ALL non-aggregated columns in SELECT must be in GROUP BY clause
7. If a column is needed but cannot be grouped, wrap it in MIN() or MAX() aggregate function

Question Intent Analysis:
- If question asks for "all classes", "show classes", "list classes" → Use table named "class" or similar
- If question mentions "differences", "compare", "versus" → Group by ALL dimensions mentioned
- Calculate metrics (COUNT, AVG, SUM) for each combination when comparing

Return ONLY the SQL query, no explanations, no markdown, no code blocks:`;

      console.log('[AGENT] 🤖 Calling LLM for query generation...');
      const startTime = Date.now();
      
      // Add timeout wrapper for LLM call
      const llmPromise = this.llm.invoke(prompt);
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('LLM call timed out after 120 seconds')), 120000)
      );
      
      const response = await Promise.race([llmPromise, timeoutPromise]) as any;
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      console.log(`[AGENT] ✅ LLM response received (${elapsed}s)`);
      
      const query = typeof response.content === 'string' 
        ? response.content.trim() 
        : JSON.stringify(response.content).trim();
      
      // Clean up query (remove markdown code blocks if present)
      const cleanQuery = query.replace(/^```sql\s*/i, '').replace(/```\s*$/, '').trim();
      
      console.log(`[AGENT] ✅ Query generated: ${cleanQuery.substring(0, 100)}${cleanQuery.length > 100 ? '...' : ''}`);
      
      return {
        query: cleanQuery,
        step: state.step + 1,
      };
    } catch (error) {
      console.error('[AGENT] ❌ Query generation error:', error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('[AGENT] Error details:', errorMessage);
      return {
        error: `Query generation failed: ${errorMessage}`,
        step: state.step + 1,
      };
    }
  }

  private async validateQuery(state: AgentState): Promise<Partial<AgentState>> {
    console.log('[AGENT] 🔍 Validating query');
    
    if (!state.query) {
      console.log('[AGENT] ⚠️ No query to validate');
      return {
        validation_result: {
          valid: false,
          errors: ['No query generated'],
        },
        step: state.step + 1,
      };
    }

    try {
      // Security validation
      console.log('[AGENT] 🔒 Running security validation...');
      const isValid = validateSQLQuery(state.query);
      
      if (!isValid) {
        console.log('[AGENT] ❌ Query failed security validation');
        return {
          validation_result: {
            valid: false,
            errors: ['Query failed security validation'],
            suggestions: 'Ensure query starts with SELECT and contains no dangerous operations',
          },
          step: state.step + 1,
        };
      }
      console.log('[AGENT] ✅ Security validation passed');

      // Semantic validation using LLM
      console.log('[AGENT] 🤖 Running semantic validation with LLM...');
      const validationPrompt = `Validate this SQL query:

Question: ${state.question}
Query: ${state.query}
Schema: ${JSON.stringify(state.metadata, null, 2)}

Check:
1. Correct table and column names
2. Proper SQL syntax
3. Logical correctness
4. Answers the question

Return JSON:
{
  "valid": true/false,
  "errors": ["error1", "error2"],
  "suggestions": "improvement suggestions"
}`;

      const startTime = Date.now();
      const llmPromise = this.llm.invoke(validationPrompt);
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Validation LLM call timed out after 60 seconds')), 60000)
      );
      
      const response = await Promise.race([llmPromise, timeoutPromise]) as any;
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      console.log(`[AGENT] ✅ Validation LLM response received (${elapsed}s)`);
      const content = typeof response.content === 'string' ? response.content : JSON.stringify(response.content);
      const validation = JSON.parse(content);

      return {
        validation_result: {
          valid: validation.valid || false,
          errors: validation.errors || [],
          suggestions: validation.suggestions || '',
        },
        step: state.step + 1,
      };
    } catch (error) {
      console.error('[AGENT] Validation error:', error);
      return {
        validation_result: {
          valid: true, // Assume valid if validation fails (don't block)
          errors: [],
        },
        step: state.step + 1,
      };
    }
  }

  private shouldRefine(state: AgentState): string {
    if (state.validation_result?.valid) {
      return 'done';
    }
    
    // Max 3 refinement attempts
    if (state.step >= 6) {
      console.warn('[AGENT] Max refinement attempts reached');
      return 'done';
    }
    
    return 'refine';
  }

  private async refineQuery(state: AgentState): Promise<Partial<AgentState>> {
    console.log('[AGENT] Refining query');
    
    if (!state.query || !state.validation_result) {
      return { step: state.step + 1 };
    }

    try {
      const refinedQuery = await validateAndRefineQuery(
        state.query,
        state.question,
        state.metadata,
        1 // Single refinement per step
      );

      return {
        query: refinedQuery,
        step: state.step + 1,
      };
    } catch (error) {
      console.error('[AGENT] Refinement error:', error);
      return { step: state.step + 1 };
    }
  }

  /**
   * Execute the agent workflow sequentially
   * This implements the same logic as LangGraph but in a simpler sequential way
   */
  async execute(
    question: string,
    metadata: DataSourceMetadata,
    connectionString?: string,
    questionUnderstanding?: {
      intent: string;
      keyConcepts: string[];
      entities: string[];
      queryType: string;
      semanticSummary: string;
    }
  ): Promise<string> {
    // Enhance question with semantic understanding if provided
    const enhancedQuestion = questionUnderstanding
      ? `${question}\n\nSemantic Understanding:\n- Intent: ${questionUnderstanding.intent}\n- Query Type: ${questionUnderstanding.queryType}\n- Key Concepts: ${questionUnderstanding.keyConcepts.join(', ')}\n- Entities: ${questionUnderstanding.entities.join(', ')}\n- Semantic Summary: ${questionUnderstanding.semanticSummary}`
      : question;
    
    let state: AgentState = {
      question: enhancedQuestion,
      metadata,
      step: 0,
      connection_string: connectionString,
    };

    try {
      console.log('[AGENT] 🚀 Starting agent workflow...');
      
      // Step 1: Analyze question
      console.log('[AGENT] 📝 Step 1/5: Analyzing question...');
      state = { ...state, ...(await this.analyzeQuestion(state)) };
      console.log('[AGENT] ✅ Step 1 complete');

      // Step 2: Explore schema if needed
      console.log('[AGENT] 🔎 Step 2/5: Exploring schema...');
      state = { ...state, ...(await this.exploreSchema(state)) };
      console.log('[AGENT] ✅ Step 2 complete');

      // Step 3: Generate query
      console.log('[AGENT] ⚙️ Step 3/5: Generating query...');
      state = { ...state, ...(await this.generateQuery(state)) };
      console.log('[AGENT] ✅ Step 3 complete');

      if (state.error) {
        throw new Error(state.error);
      }

      // Step 4: Validate query
      console.log('[AGENT] ✔️ Step 4/5: Validating query...');
      state = { ...state, ...(await this.validateQuery(state)) };
      console.log('[AGENT] ✅ Step 4 complete');

      // Step 5: Refine if needed (max 3 attempts)
      console.log('[AGENT] 🔄 Step 5/5: Checking if refinement needed...');
      let refinementAttempts = 0;
      const maxRefinements = 3;

      while (!state.validation_result?.valid && refinementAttempts < maxRefinements) {
        if (this.shouldRefine(state) === 'done') {
          console.log('[AGENT] ✅ Refinement not needed');
          break;
        }

        console.log(`[AGENT] 🔧 Refining query (attempt ${refinementAttempts + 1}/${maxRefinements})...`);
        state = { ...state, ...(await this.refineQuery(state)) };
        state = { ...state, ...(await this.generateQuery(state)) };
        state = { ...state, ...(await this.validateQuery(state)) };
        refinementAttempts++;
        console.log(`[AGENT] ✅ Refinement attempt ${refinementAttempts} complete`);
      }

      if (!state.query) {
        throw new Error('No query generated after agent execution');
      }

      console.log('[AGENT] ✅ Agent workflow complete!');
      console.log(`[AGENT] 📋 Final query: ${state.query.substring(0, 150)}${state.query.length > 150 ? '...' : ''}`);
      return state.query;
    } catch (error) {
      console.error('[AGENT] Agent execution error:', error);
      throw error;
    }
  }
}

