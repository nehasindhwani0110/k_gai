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
    
    this.llm = new ChatOpenAI({
      modelName: process.env.OPENAI_MODEL || 'gpt-4-turbo-preview',
      temperature: 0.2,
      openAIApiKey: process.env.OPENAI_API_KEY,
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
    
    // Only explore if we have connection string and it's SQL_DB
    if (state.metadata.source_type === 'SQL_DB' && state.connection_string) {
      try {
        // Get all table names from metadata
        const allTables = state.metadata.tables.map(t => t.name);
        
        // Explore relevant tables based on question
        const exploredMetadata = await exploreRelevantSchema(
          state.question,
          state.connection_string,
          allTables
        );
        
        return {
          metadata: exploredMetadata,
          step: state.step + 1,
        };
      } catch (error) {
        console.warn('[AGENT] Schema exploration failed, using existing metadata:', error);
        // Continue with existing metadata
        return { step: state.step + 1 };
      }
    }
    
    // For CSV files or if no connection string, skip exploration
    return { step: state.step + 1 };
  }

  private async generateQuery(state: AgentState): Promise<Partial<AgentState>> {
    console.log('[AGENT] Generating SQL query');
    
    try {
      const prompt = `Generate a SQL query that answers this question: "${state.question}"

Schema:
${JSON.stringify(state.metadata, null, 2)}

Requirements:
1. Use exact table and column names from schema
2. Only generate SELECT queries (no INSERT, UPDATE, DELETE)
3. Use proper SQL syntax
4. Include appropriate WHERE, GROUP BY, ORDER BY, LIMIT clauses as needed
5. CRITICAL - MySQL ONLY_FULL_GROUP_BY mode: ALL non-aggregated columns in SELECT must be in GROUP BY clause. If a column is needed but cannot be grouped, wrap it in MIN() or MAX() aggregate function.

CRITICAL - Question Intent Analysis:
- If question mentions "differences", "difference", "compare", "comparison", "versus", "vs", "measure differences":
  → Group by ALL dimensions mentioned in the question
  → Calculate metrics (COUNT, AVG, SUM) for each combination
  → Example: "differences between X and Y by Z" → GROUP BY Z, X_or_Y_column
  → Example: "income bracket differences between parties" → GROUP BY income_bracket, party_affiliation
- This enables visual comparison in charts by showing metrics for each combination

Return ONLY the SQL query, no explanations:`;

      const response = await this.llm.invoke(prompt);
      let query = typeof response.content === 'string' 
        ? response.content.trim() 
        : JSON.stringify(response.content).trim();
      
      // Clean up query (remove markdown code blocks if present)
      let cleanQuery = query.replace(/^```sql\s*/i, '').replace(/```\s*$/, '').trim();
      
      // Post-generation check: Verify query uses columns from question
      const queryLower = cleanQuery.toLowerCase();
      const questionLower = state.question.toLowerCase();
      const missingColumns: string[] = [];
      
      columnMapping.forEach(mapping => {
        const termMentions = (questionLower.match(new RegExp(mapping.questionTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi')) || []).length;
        if (termMentions > 0 && !queryLower.includes(mapping.columnName.toLowerCase())) {
          missingColumns.push(`${mapping.questionTerm} → ${mapping.columnName}`);
        }
      });
      
      // If critical columns are missing, refine the query
      if (missingColumns.length > 0 && columnMapping.length > 0) {
        console.log('[AGENT] Query missing columns, refining...', missingColumns);
        
        const refinePrompt = `Refine this SQL query to use the correct columns from the question.

Question: "${state.question}"
Current Query: ${cleanQuery}

Missing Columns:
${missingColumns.map(m => `- ${m}`).join('\n')}

Column Mapping:
${columnMapping.map(m => `- "${m.questionTerm}" → Use column: "${m.columnName}"`).join('\n')}

Schema:
${JSON.stringify(state.metadata, null, 2)}

Return ONLY the corrected SQL query (no explanations, no markdown):`;

        try {
          const refineResponse = await this.llm.invoke(refinePrompt);
          const refinedQuery = typeof refineResponse.content === 'string' 
            ? refineResponse.content.trim() 
            : JSON.stringify(refineResponse.content).trim();
          cleanQuery = refinedQuery.replace(/^```sql\s*/i, '').replace(/```\s*$/, '').trim();
          console.log('[AGENT] Query refined');
        } catch (error) {
          console.warn('[AGENT] Query refinement failed:', error);
        }
      }
      
      return {
        query: cleanQuery,
        step: state.step + 1,
      };
    } catch (error) {
      console.error('[AGENT] Query generation error:', error);
      return {
        error: `Query generation failed: ${error instanceof Error ? error.message : String(error)}`,
        step: state.step + 1,
      };
    }
  }

  private async validateQuery(state: AgentState): Promise<Partial<AgentState>> {
    console.log('[AGENT] Validating query');
    
    if (!state.query) {
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
      const isValid = validateSQLQuery(state.query);
      
      if (!isValid) {
        return {
          validation_result: {
            valid: false,
            errors: ['Query failed security validation'],
            suggestions: 'Ensure query starts with SELECT and contains no dangerous operations',
          },
          step: state.step + 1,
        };
      }

      // Semantic validation using LLM
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

      const response = await this.llm.invoke(validationPrompt);
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
    connectionString?: string
  ): Promise<string> {
    let state: AgentState = {
      question,
      metadata,
      step: 0,
      connection_string: connectionString,
    };

    try {
      // Step 1: Analyze question
      state = { ...state, ...(await this.analyzeQuestion(state)) };

      // Step 2: Explore schema if needed
      state = { ...state, ...(await this.exploreSchema(state)) };

      // Step 3: Generate query
      state = { ...state, ...(await this.generateQuery(state)) };

      if (state.error) {
        throw new Error(state.error);
      }

      // Step 4: Validate query
      state = { ...state, ...(await this.validateQuery(state)) };

      // Step 5: Refine if needed (max 3 attempts)
      let refinementAttempts = 0;
      const maxRefinements = 3;

      while (!state.validation_result?.valid && refinementAttempts < maxRefinements) {
        if (this.shouldRefine(state) === 'done') {
          break;
        }

        state = { ...state, ...(await this.refineQuery(state)) };
        state = { ...state, ...(await this.generateQuery(state)) };
        state = { ...state, ...(await this.validateQuery(state)) };
        refinementAttempts++;
      }

      if (!state.query) {
        throw new Error('No query generated after agent execution');
      }

      return state.query;
    } catch (error) {
      console.error('[AGENT] Agent execution error:', error);
      throw error;
    }
  }
}

