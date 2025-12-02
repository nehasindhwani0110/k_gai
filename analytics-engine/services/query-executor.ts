import { QueryType, SourceType } from '../types';
import { executeCSVQuery } from './csv-query-executor';
import { translateCanonicalQuery } from './canonical-mapping-service';
import OpenAI from 'openai';
import { createTracedOpenAI } from '../utils/langsmith-tracer';

// Initialize traced OpenAI client
const openai = createTracedOpenAI();

/**
 * Fixes column errors using LLM with full schema introspection
 * 
 * When a query references non-existent columns, this function:
 * 1. Extracts ALL tables from the query (including JOINs)
 * 2. Gets full schema for all tables
 * 3. Uses LLM to find correct column names while maintaining query intent
 */
async function fixColumnErrorWithLLM(
  query: string, 
  errorMessage: string,
  connectionString: string,
  userQuestion?: string
): Promise<string> {
  try {
    // Extract incorrect column from error
    const columnMatch = errorMessage.match(/Unknown column ['"]([\w.]+)['"]/i);
    if (!columnMatch) {
      console.log('[QUERY] Could not extract column from error message');
      return query;
    }

    const incorrectColumnFull = columnMatch[1];
    const [tableAlias, incorrectColumn] = incorrectColumnFull.includes('.') 
      ? incorrectColumnFull.split('.') 
      : [null, incorrectColumnFull];

    // Extract ALL tables from query (FROM and JOINs)
    const tableMatches = [
      ...query.matchAll(/FROM\s+(\w+)(?:\s+(\w+))?/gi),
      ...query.matchAll(/JOIN\s+(\w+)(?:\s+(\w+))?/gi),
    ];
    
    const tables: Array<{ name: string; alias?: string }> = [];
    tableMatches.forEach(match => {
      const tableName = match[1];
      const alias = match[2] || match[4];
      if (tableName && !tables.some(t => t.name === tableName)) {
        tables.push({ name: tableName, alias });
      }
    });

    if (tables.length === 0) {
      console.log('[QUERY] Could not extract tables from query');
      return query;
    }

    // Get schema ONLY for tables used in this query (not entire database)
    const pythonBackendUrl = process.env.PYTHON_BACKEND_URL || 'http://localhost:8000';
    const schemaInfo: Record<string, string[]> = {};
    
    try {
      // Get full schema but filter to only tables used in query
      const schemaResponse = await fetch(`${pythonBackendUrl}/introspect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          connection_string: connectionString,
        }),
      });

      if (schemaResponse.ok) {
        const schema = await schemaResponse.json();
        const tableNamesInQuery = tables.map(t => t.name.toLowerCase());
        
        // Only process tables that are actually in the query
        tables.forEach(({ name, alias }) => {
          const table = schema.tables?.find((t: any) => {
            const tName = t.name.toLowerCase();
            const queryName = name.toLowerCase();
            return tName === queryName ||
                   tName.replace(/^tbl_|^tb_|^table_/i, '') === queryName ||
                   queryName.replace(/^tbl_|^tb_|^table_/i, '') === tName;
          });
          
          if (table?.columns) {
            const key = alias || name;
            // Limit columns to prevent context length issues (max 50 columns per table)
            const columns = table.columns.slice(0, 50).map((c: any) => c.name);
            schemaInfo[key] = columns;
            console.log(`[QUERY] Found ${columns.length} columns for table ${name}${alias ? ` (alias: ${alias})` : ''}${table.columns.length > 50 ? ` (showing first 50 of ${table.columns.length})` : ''}`);
          }
        });
      }
    } catch (schemaError) {
      console.warn('[QUERY] Could not fetch schema for column fix:', schemaError);
    }

    // Build concise schema context (only for tables in query)
    let schemaContext = '';
    let totalColumns = 0;
    Object.entries(schemaInfo).forEach(([tableKey, columns]) => {
      if (columns.length > 0) {
        schemaContext += `\nTable ${tableKey} (${columns.length} columns): ${columns.slice(0, 30).join(', ')}${columns.length > 30 ? '...' : ''}`;
        totalColumns += columns.length;
      }
    });
    
    // If too many columns, summarize instead
    if (totalColumns > 100) {
      schemaContext = '';
      Object.entries(schemaInfo).forEach(([tableKey, columns]) => {
        if (columns.length > 0) {
          // Show first 10 and last 5 columns as a sample
          const sample = columns.length > 15 
            ? [...columns.slice(0, 10), '...', ...columns.slice(-5)].join(', ')
            : columns.join(', ');
          schemaContext += `\nTable ${tableKey}: ${sample} (${columns.length} total columns)`;
        }
      });
    }

    // Find potential matches for the incorrect column
    const allColumns = Object.values(schemaInfo).flat();
    const potentialMatches = allColumns.filter(col => {
      const colLower = col.toLowerCase();
      const incorrectLower = incorrectColumn.toLowerCase();
      return colLower.includes(incorrectLower) || 
             incorrectLower.includes(colLower) ||
             colLower.replace(/_/g, '').includes(incorrectLower.replace(/_/g, '')) ||
             incorrectLower.replace(/_/g, '').includes(colLower.replace(/_/g, ''));
    });

    const prompt = `You are fixing a SQL query that has a column name error. CRITICALLY IMPORTANT: You must maintain the EXACT intent of the original query.

Error: ${errorMessage}

Original Query:
${query}

${userQuestion ? `Original User Question: "${userQuestion}"\n` : ''}

Incorrect Column Reference: ${incorrectColumnFull}
${tableAlias ? `Table Alias: ${tableAlias}` : ''}

Available Schema:${schemaContext}

${potentialMatches.length > 0 ? `\nPotential Column Matches: ${potentialMatches.join(', ')}` : ''}

CRITICAL REQUIREMENTS:
1. The fixed query MUST answer the SAME question as the original query
2. If "${incorrectColumn}" was meant to find payment methods, use a column that contains payment method data
3. If "${incorrectColumn}" was meant to find customer info, use a column that contains customer data
4. Use EXACT column names from the schema provided above
5. Maintain all JOINs, WHERE clauses, and GROUP BY logic
6. Only replace the incorrect column name, keep everything else identical
7. If you cannot find a suitable replacement, return the original query unchanged

Think step by step:
- What was the original query trying to accomplish?
- What type of data does "${incorrectColumn}" represent?
- Which column in the schema best matches this intent?
- How can I replace it while keeping the query logic identical?

Return ONLY the corrected SQL query, no explanations or markdown:`;

    const response = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-4-turbo-preview',
      messages: [
        {
          role: 'system',
          content: 'You are an expert SQL query fixer. Your job is to fix column name errors while PRESERVING the exact intent and meaning of the original query. Never change the query logic or purpose, only fix column names.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      temperature: 0.1,
      max_tokens: 800,
    });

    const fixedQuery = response.choices[0]?.message?.content?.trim() || query;
    
    // Clean up query (remove markdown code blocks if present)
    const cleanedQuery = fixedQuery
      .replace(/^```sql\s*/i, '')
      .replace(/```\s*$/i, '')
      .replace(/^```\s*/i, '')
      .trim();

    console.log('[QUERY] LLM fixed column error', {
      original: query.substring(0, 100),
      fixed: cleanedQuery.substring(0, 100),
      incorrectColumn: incorrectColumnFull,
      potentialMatches: potentialMatches.slice(0, 5)
    });

    return cleanedQuery;
  } catch (error) {
    console.error('[QUERY] Error fixing column error with LLM:', error);
    return query; // Return original on error
  }
}

/**
 * Fixes GROUP BY violations using LLM
 * 
 * When MySQL ONLY_FULL_GROUP_BY mode detects violations, this function
 * uses LLM to intelligently fix the query by either:
 * 1. Adding missing columns to GROUP BY
 * 2. Removing non-grouped columns from SELECT
 * 3. Wrapping non-grouped columns in aggregate functions
 */
async function fixGroupByWithLLM(query: string, errorMessage: string): Promise<string> {
  try {
    const prompt = `Fix this SQL query to resolve the MySQL ONLY_FULL_GROUP_BY error.

Error: ${errorMessage}

Original Query:
${query}

Requirements:
1. All non-aggregated columns in SELECT must be in GROUP BY clause
2. If a column is needed but can't be grouped, wrap it in MIN() or MAX() aggregate function
3. If a column is not essential, remove it from SELECT
4. Maintain the query's intent and answer the original question
5. Return ONLY the corrected SQL query, no explanations

Fixed Query:`;

    const response = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-4-turbo-preview',
      messages: [
        {
          role: 'system',
          content: 'You are an expert SQL query fixer. Fix GROUP BY violations while maintaining query intent.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      temperature: 0.1,
      max_tokens: 500,
    });

    const fixedQuery = response.choices[0]?.message?.content?.trim() || query;
    
    // Clean up query (remove markdown code blocks if present)
    const cleanedQuery = fixedQuery
      .replace(/^```sql\s*/i, '')
      .replace(/```\s*$/i, '')
      .trim();

    console.log('[QUERY] LLM fixed GROUP BY violation');
    return cleanedQuery;
  } catch (error) {
    console.error('[QUERY] Error fixing GROUP BY with LLM:', error);
    return query; // Return original on error
  }
}

/**
 * Executes SQL query on database
 * Uses Python backend for SQL execution via SQLAlchemy
 */
export async function executeSQLQuery(
  connectionString: string,
  query: string,
  dataSourceId?: string,
  userQuestion?: string
): Promise<any[]> {
  // Validate query before execution
  if (!validateSQLQuery(query)) {
    throw new Error('Query failed security validation. Only SELECT queries are allowed.');
  }

  // If dataSourceId is provided, translate canonical query to source-specific query
  let finalQuery = query;
  if (dataSourceId) {
    try {
      finalQuery = await translateCanonicalQuery(dataSourceId, query);
      console.log('[QUERY] Translated canonical query:', {
        original: query.substring(0, 100),
        translated: finalQuery.substring(0, 100),
      });
    } catch (error) {
      console.error('Query translation failed, using original query:', error);
      // Continue with original query if translation fails
    }
  }

  // Call Python backend for SQL execution
  const pythonBackendUrl = process.env.PYTHON_BACKEND_URL || 'http://localhost:8000';
  
  try {
    console.log(`[QUERY] Executing SQL query via Python backend: ${pythonBackendUrl}/execute`);
    
    const response = await fetch(`${pythonBackendUrl}/execute`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        connection_string: connectionString,
        query: finalQuery,
      }),
    });

    if (!response.ok) {
      let errorData: any;
      try {
        errorData = await response.json();
      } catch {
        const errorText = await response.text();
        errorData = { error: errorText };
      }
      
      // Extract detailed error message
      const errorMessage = errorData.details || errorData.error || 'Unknown error';
      const fullError = errorData.details 
        ? `${errorData.error || 'Query execution failed'}: ${errorData.details}`
        : errorData.error || 'Unknown error';
      
      console.error('[QUERY] Python backend error details:', {
        status: response.status,
        error: errorData.error,
        details: errorData.details,
        fullError
      });
      
      // Check if it's a GROUP BY violation error
      if (errorMessage.includes('GROUP BY') && errorMessage.includes('only_full_group_by')) {
        console.log('[QUERY] Detected GROUP BY violation, attempting to fix with LLM...');
        try {
          const fixedQuery = await fixGroupByWithLLM(finalQuery, errorMessage);
          if (fixedQuery && fixedQuery !== finalQuery) {
            console.log('[QUERY] Retrying with fixed query...');
            // Retry with fixed query
            return await executeSQLQuery(connectionString, fixedQuery, dataSourceId);
          }
        } catch (fixError) {
          console.error('[QUERY] Failed to fix GROUP BY violation:', fixError);
        }
      }
      
      // Check if it's a column error (Unknown column)
      if (errorMessage.includes('Unknown column') || errorMessage.includes('Column error')) {
        console.log('[QUERY] Detected column error, attempting to fix with LLM...');
        try {
          const fixedQuery = await fixColumnErrorWithLLM(finalQuery, errorMessage, connectionString, userQuestion);
          if (fixedQuery && fixedQuery !== finalQuery) {
            console.log('[QUERY] Retrying with fixed query...');
            // Retry with fixed query
            return await executeSQLQuery(connectionString, fixedQuery, dataSourceId, userQuestion);
          }
        } catch (fixError) {
          console.error('[QUERY] Failed to fix column error:', fixError);
        }
      }
      
      throw new Error(fullError);
    }

    const result = await response.json();
    
    if (result.error) {
      throw new Error(result.error);
    }

    console.log(`[QUERY] Query executed successfully: ${result.row_count || result.results?.length || 0} rows returned`);
    return result.results || [];
    
  } catch (error: any) {
    console.error('[QUERY] SQL execution error:', error);
    
    // Check if it's a connection refused error (Python backend not running)
    if (error?.code === 'ECONNREFUSED' || error?.message?.includes('ECONNREFUSED') || error?.cause?.code === 'ECONNREFUSED') {
      const helpfulError = new Error(
        `Python backend is not running. Please start it with: npm run python:backend\n` +
        `Or manually: cd analytics-engine/python-backend && python api_server.py\n` +
        `The backend should be running on ${pythonBackendUrl}`
      );
      helpfulError.name = 'BackendConnectionError';
      throw helpfulError;
    }
    
    // Check if it's a fetch failed error (usually means backend not running)
    if (error?.message?.includes('fetch failed') || error?.message?.includes('Failed to fetch')) {
      const helpfulError = new Error(
        `Cannot connect to Python backend at ${pythonBackendUrl}.\n` +
        `Please ensure the Python backend is running:\n` +
        `  npm run python:backend\n` +
        `Or check if the backend URL is correct in your environment variables.`
      );
      helpfulError.name = 'BackendConnectionError';
      throw helpfulError;
    }
    
    throw error;
  }
}

/**
 * Executes query logic on file-based data source
 */
export async function executeQueryLogic(
  sourceType: SourceType,
  filePath: string,
  queryLogic: string
): Promise<any[]> {
  if (sourceType === 'CSV_FILE') {
    return await executeCSVQuery(filePath, queryLogic);
  }
  
  throw new Error(`Unsupported source type for query logic: ${sourceType}`);
}

/**
 * Executes SQL query on CSV file (converts SQL to CSV operations)
 */
export async function executeSQLOnCSV(
  filePath: string,
  query: string
): Promise<any[]> {
  // For CSV files, we can execute SQL-like queries directly
  return await executeCSVQuery(filePath, query);
}

/**
 * Validates SQL query for security
 */
export function validateSQLQuery(query: string): boolean {
  if (!query || typeof query !== 'string') {
    return false;
  }
  
  // Remove leading/trailing whitespace and newlines
  const cleanedQuery = query.trim().replace(/^\s+|\s+$/g, '');
  const upperQuery = cleanedQuery.toUpperCase();
  
  // Check for dangerous operations (but allow them in string literals/comments)
  const dangerousKeywords = [
    'INSERT', 'UPDATE', 'DELETE', 'DROP', 'CREATE', 
    'ALTER', 'TRUNCATE', 'EXEC', 'EXECUTE', 'CALL'
  ];
  
  // Check for dangerous keywords as standalone words (not inside other words)
  for (const keyword of dangerousKeywords) {
    // Use word boundary regex to match whole words only
    const regex = new RegExp(`\\b${keyword}\\b`, 'i');
    if (regex.test(cleanedQuery)) {
      console.log(`Security validation failed: Found dangerous keyword "${keyword}" in query`);
      return false;
    }
  }
  
  // Must start with SELECT (after trimming)
  if (!upperQuery.startsWith('SELECT')) {
    console.log(`Security validation failed: Query does not start with SELECT. Query: ${cleanedQuery.substring(0, 100)}`);
    return false;
  }
  
  return true;
}

