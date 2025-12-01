/**
 * Agent-based Query Generation Service
 * 
 * This service integrates LangGraph/LangChain SQL agents for improved
 * SQL query generation, especially for large databases.
 * 
 * Based on: https://github.com/Farzad-R/Advanced-QA-and-RAG-Series/tree/main/AgentGraph-Intelligent-Q%26A-and-RAG-System
 */

import { ChatOpenAI } from '@langchain/openai';
import { DataSourceMetadata, AdhocQueryResponse } from '../types';
import { generateAdhocQuery } from './llm-service'; // Fallback to original
import { exploreRelevantSchema as exploreSchemaTool } from '../agents/tools/schema-explorer';
import { validateQuery as validateQueryTool } from '../agents/tools/query-validator';

// Check if agent dependencies are available
let agentAvailable = false;
let ChatOpenAIClass: any;
let createSqlAgent: any;
let SqlToolkit: any;
let SQLDatabase: any;

try {
  // Try to import LangChain dependencies
  // Note: SQLDatabase is Python-only, so TypeScript SQL agent uses Python backend
  ChatOpenAIClass = require('@langchain/openai').ChatOpenAI;
  createSqlAgent = require('langchain/agents').createSqlAgent;
  SqlToolkit = require('langchain/agents/toolkits/sql').SqlToolkit;
  
  // SQLDatabase is not available in TypeScript LangChain (Python-only)
  // We'll use Python backend for SQL agent instead
  SQLDatabase = null;
  
  agentAvailable = true;
  console.log('[AGENT] LangChain dependencies loaded. TypeScript SQL agent will use Python backend.');
} catch (error) {
  console.warn('[AGENT] LangChain dependencies not found. Install with: npm install @langchain/openai langchain @langchain/community');
  console.warn('[AGENT] Falling back to Python backend agent or direct LLM');
  agentAvailable = false;
}

/**
 * Creates a database connection wrapper for SQL agents
 * Uses Python backend for actual database connections via API
 */
async function createDatabaseConnection(connectionString: string): Promise<any> {
  // SQLDatabase is Python-only, so we always use Python backend
  // This function is kept for compatibility but will redirect to Python backend
  throw new Error('TypeScript SQL agent uses Python backend. Use generateQueryWithPythonAgent() instead.');
}

/**
 * Agent-based query generation using LangChain SQL Agent
 * 
 * Note: SQLDatabase is Python-only, so this redirects to Python backend agent.
 * For TypeScript-only SQL agents, use LangGraph agent instead.
 */
export async function generateQueryWithSQLAgent(
  userQuestion: string,
  connectionString: string,
  metadata?: DataSourceMetadata
): Promise<string> {
  // SQLDatabase is Python-only, so redirect to Python backend agent
  console.log('[AGENT] TypeScript SQL agent redirecting to Python backend (SQLDatabase is Python-only)');
  
  const { generateQueryWithPythonAgent } = await import('./python-agent-bridge');
  const result = await generateQueryWithPythonAgent(userQuestion, connectionString, metadata);
  return result.query_content;
}

/**
 * Enhanced query generation with agent fallback
 * 
 * Uses agent-based approach if available and appropriate,
 * falls back to direct LLM if agent fails or not available
 */
export async function generateAdhocQueryEnhanced(
  userQuestion: string,
  metadata: DataSourceMetadata,
  connectionString?: string,
  useAgent: boolean = false
): Promise<AdhocQueryResponse> {
  // Check if we should use agent-based approach
  const shouldUseAgent = useAgent && 
                         agentAvailable && 
                         metadata.source_type === 'SQL_DB' && 
                         connectionString;

  if (shouldUseAgent) {
    try {
      console.log('[AGENT] Using agent-based query generation');
      
      // Generate query using SQL agent
      const query = await generateQueryWithSQLAgent(
        userQuestion,
        connectionString!,
        metadata
      );

      // Generate insight summary using LLM
      const insightPrompt = `Explain what this SQL query does and what insights it provides:\n\n${query}\n\nQuestion: ${userQuestion}`;
      
      const { default: OpenAI } = await import('openai');
      const openai = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY,
      });

      const insightResponse = await openai.chat.completions.create({
        model: process.env.OPENAI_MODEL || 'gpt-4-turbo-preview',
        messages: [
          {
            role: 'user',
            content: insightPrompt,
          },
        ],
        temperature: 0.3,
        max_tokens: 150,
      });

      return {
        query_type: 'SQL_QUERY',
        query_content: query,
        visualization_type: 'auto',
        insight_summary: insightResponse.choices[0]?.message?.content || 'Query generated successfully',
      };
    } catch (error) {
      console.warn('[AGENT] Agent-based generation failed, falling back to direct LLM:', error);
      // Fall back to original method
      return generateAdhocQuery(userQuestion, metadata);
    }
  }

  // Use original direct LLM approach
  return generateAdhocQuery(userQuestion, metadata);
}

/**
 * Schema exploration tool for large databases
 * 
 * Instead of loading all tables upfront, this explores
 * relevant tables based on the user question
 * 
 * Now uses the schema-explorer tool
 */
export async function exploreRelevantSchema(
  userQuestion: string,
  connectionString: string,
  allTables: string[]
): Promise<DataSourceMetadata> {
  return exploreSchemaTool(userQuestion, connectionString, allTables);
}

/**
 * Query validation and refinement tool
 * 
 * Validates generated queries and can refine them if needed
 * Uses the query-validator tool for validation
 */
export async function validateAndRefineQuery(
  query: string,
  userQuestion: string,
  metadata: DataSourceMetadata,
  maxRefinements: number = 3
): Promise<string> {
  const { default: OpenAI } = await import('openai');
  const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });

  let currentQuery = query;
  let refinementCount = 0;

  while (refinementCount < maxRefinements) {
    // Use validator tool for validation
    const validation = await validateQueryTool(currentQuery, userQuestion, metadata);

    if (validation.valid) {
      return currentQuery;
    }

    // Refine query based on errors
    if (refinementCount < maxRefinements - 1) {
      const refinePrompt = `Refine this SQL query to fix the errors.

Original Question: ${userQuestion}
Current Query: ${currentQuery}
Errors: ${validation.errors?.join(', ') || 'Unknown errors'}
Suggestions: ${validation.suggestions || 'None'}

Schema:
${JSON.stringify(metadata, null, 2)}

Generate the corrected SQL query:`;

      const refineResponse = await openai.chat.completions.create({
        model: process.env.OPENAI_MODEL || 'gpt-4-turbo-preview',
        messages: [
          {
            role: 'user',
            content: refinePrompt,
          },
        ],
        temperature: 0.2,
      });

      currentQuery = refineResponse.choices[0]?.message?.content || currentQuery;
      // Clean up query (remove markdown if present)
      currentQuery = currentQuery.replace(/^```sql\s*/i, '').replace(/```\s*$/, '').trim();
      refinementCount++;
    } else {
      // Max refinements reached, return current query
      console.warn('[AGENT] Max refinements reached, returning current query');
      return currentQuery;
    }
  }

  return currentQuery;
}

