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
/**
 * Fixes table name errors (when table doesn't exist)
 */
async function fixTableErrorWithLLM(
  query: string,
  errorMessage: string,
  connectionString: string,
  userQuestion?: string
): Promise<string> {
  try {
    // Extract table name from error messages like:
    // "Table 'railway.fee' doesn't exist"
    // "Table 'database.table' doesn't exist"
    const tableMatch = errorMessage.match(/Table ['"](?:[\w.]+\.)?([\w]+)['"]\s+doesn't exist/i) ||
                      errorMessage.match(/Table ['"](?:[\w.]+\.)?([\w]+)['"]\s+not found/i);
    
    if (!tableMatch) {
      console.log('[QUERY] Could not extract table name from error message');
      return query;
    }

    const incorrectTable = tableMatch[1];
    console.log(`[QUERY] Detected table error: table "${incorrectTable}" doesn't exist`);

    // Get all available tables from schema
    const pythonBackendUrl = process.env.PYTHON_BACKEND_URL || 'http://localhost:8000';
    let availableTables: string[] = [];
    
    try {
      const schemaResponse = await fetch(`${pythonBackendUrl}/introspect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          connection_string: connectionString,
        }),
      });

      if (schemaResponse.ok) {
        const schema = await schemaResponse.json();
        availableTables = schema.tables?.map((t: any) => t.name) || [];
        console.log(`[QUERY] Found ${availableTables.length} available tables in schema`);
      }
    } catch (schemaError) {
      console.warn('[QUERY] Could not fetch schema for table fix:', schemaError);
    }

    // Find similar table names
    const incorrectTableLower = incorrectTable.toLowerCase();
    const similarTables = availableTables.filter(table => {
      const tableLower = table.toLowerCase();
      return tableLower.includes(incorrectTableLower) ||
             incorrectTableLower.includes(tableLower) ||
             tableLower.replace(/[_-]/g, '').includes(incorrectTableLower.replace(/[_-]/g, '')) ||
             incorrectTableLower.replace(/[_-]/g, '').includes(tableLower.replace(/[_-]/g, ''));
    }).slice(0, 10); // Limit to top 10 matches

    const prompt = `You are fixing a SQL query that has a table name error. CRITICALLY IMPORTANT: You must maintain the EXACT intent of the original query.

Error: ${errorMessage}

Original Query:
${query}

${userQuestion ? `Original User Question: "${userQuestion}"\n` : ''}

Incorrect Table Name: ${incorrectTable}
${similarTables.length > 0 ? `\nSimilar Table Names Found: ${similarTables.join(', ')}` : ''}
${availableTables.length > 0 ? `\nAll Available Tables (${availableTables.length} total): ${availableTables.slice(0, 50).join(', ')}${availableTables.length > 50 ? '...' : ''}` : ''}

CRITICAL REQUIREMENTS:
1. The fixed query MUST answer the SAME question as the original query
2. Replace "${incorrectTable}" with the most appropriate table name from the available tables
3. If "${incorrectTable}" was meant to find fee/payment data, use a table that contains fee or payment information
4. Use EXACT table names from the available tables list above
5. Maintain all column references, WHERE clauses, JOINs, and GROUP BY logic
6. Only replace the incorrect table name, keep everything else identical
7. If you cannot find a suitable replacement, return the original query unchanged

Think step by step:
- What was the original query trying to accomplish?
- What type of data does "${incorrectTable}" represent?
- Which table in the available tables best matches this intent?
- How can I replace it while keeping the query logic identical?

Return ONLY the corrected SQL query, no explanations or markdown:`;

    const { default: OpenAI } = await import('openai');
    const { createTracedOpenAI } = await import('../utils/langsmith-tracer');
    const openai = createTracedOpenAI();

    const response = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-4-turbo-preview',
      messages: [
        {
          role: 'system',
          content: 'You are an expert SQL query fixer. Your job is to fix table name errors while PRESERVING the exact intent and meaning of the original query. Never change the query logic or purpose, only fix table names.',
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

    console.log('[QUERY] LLM fixed table error', {
      original: query.substring(0, 100),
      fixed: cleanedQuery.substring(0, 100),
      incorrectTable,
      similarTables: similarTables.slice(0, 5)
    });

    return cleanedQuery;
  } catch (error) {
    console.error('[QUERY] Error fixing table error with LLM:', error);
    return query; // Return original on error
  }
}

/**
 * Fast column error fixing using system catalog (no LLM - instant!)
 * Fetches ALL columns from system catalog and does direct fuzzy matching
 */
async function fixColumnErrorWithSystemCatalog(
  query: string, 
  errorMessage: string,
  connectionString: string
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

    // Extract ALL tables from query (FROM and JOINs) - FIXED: Don't match SQL keywords as aliases
    const sqlKeywords = new Set(['LIMIT', 'ORDER', 'GROUP', 'WHERE', 'HAVING', 'SELECT', 'FROM', 'JOIN', 'INNER', 'LEFT', 'RIGHT', 'ON', 'AS', 'BY', 'ASC', 'DESC']);
    const tableMatches = [
      ...query.matchAll(/FROM\s+(\w+)(?:\s+(?:AS\s+)?(\w+))?/gi),
      ...query.matchAll(/JOIN\s+(\w+)(?:\s+(?:AS\s+)?(\w+))?/gi),
    ];
    
    const tables: Array<{ name: string; alias?: string }> = [];
    tableMatches.forEach(match => {
      const tableName = match[1];
      const alias = match[2] || match[4];
      // Only add alias if it's not a SQL keyword
      if (tableName && !tables.some(t => t.name === tableName)) {
        const validAlias = alias && !sqlKeywords.has(alias.toUpperCase()) ? alias : undefined;
        tables.push({ name: tableName, alias: validAlias });
      }
    });

    if (tables.length === 0) {
      console.log('[QUERY] Could not extract tables from query');
      return query;
    }

    // Fetch ALL columns from system catalog for tables in query (FAST - no LLM!)
    const { getTablesMetadata } = await import('./system-catalog-service');
    const tableNames = tables.map(t => t.name);
    
    console.log(`[QUERY] Fetching ALL columns from system catalog for tables: ${tableNames.join(', ')}`);
    const fullTables = await getTablesMetadata(
      { connectionString },
      tableNames
    );

    // Build column map: table name -> all columns
    const columnMap = new Map<string, string[]>();
    fullTables.forEach(table => {
      const allColumns = table.columns?.map(c => c.name) || [];
      columnMap.set(table.name.toLowerCase(), allColumns);
      console.log(`[QUERY] Found ${allColumns.length} columns for table ${table.name} (COMPLETE)`);
    });

    // Find the correct column using fuzzy matching
    let bestMatch: { column: string; table: string; score: number } | null = null;
    const incorrectLower = incorrectColumn.toLowerCase();
    
    // Try to find which table the column belongs to
    const possibleTables = tableAlias 
      ? tables.filter(t => t.alias?.toLowerCase() === tableAlias.toLowerCase() || t.name.toLowerCase() === tableAlias.toLowerCase())
      : tables; // If no alias, check all tables
    
    for (const table of possibleTables) {
      const tableColumns = columnMap.get(table.name.toLowerCase()) || [];
      
      for (const col of tableColumns) {
        const colLower = col.toLowerCase();
        let score = 0;
        
        // Exact match
        if (colLower === incorrectLower) {
          score = 100;
        }
        // Contains match
        else if (colLower.includes(incorrectLower) || incorrectLower.includes(colLower)) {
          score = 80;
        }
        // Fuzzy match (remove underscores/spaces)
        else {
          const colNormalized = colLower.replace(/[_\s]/g, '');
          const incorrectNormalized = incorrectLower.replace(/[_\s]/g, '');
          if (colNormalized.includes(incorrectNormalized) || incorrectNormalized.includes(colNormalized)) {
            score = 60;
          }
          // Check if removing common prefixes/suffixes helps
          else {
            const colBase = colLower.replace(/^(is|has|can|should|current|last|first|total|avg|sum|count|max|min)/, '');
            const incorrectBase = incorrectLower.replace(/^(is|has|can|should|current|last|first|total|avg|sum|count|max|min)/, '');
            if (colBase === incorrectBase || colBase.includes(incorrectBase) || incorrectBase.includes(colBase)) {
              score = 50;
            }
          }
        }
        
        if (score > 0 && (!bestMatch || score > bestMatch.score)) {
          bestMatch = { column: col, table: table.name, score };
        }
      }
    }

    if (!bestMatch || bestMatch.score < 30) {
      console.log(`[QUERY] Could not find suitable column match for "${incorrectColumn}" (best score: ${bestMatch?.score || 0})`);
      return query;
    }

    // Replace incorrect column with correct one
    const replacement = tableAlias ? `${tableAlias}.${bestMatch.column}` : bestMatch.column;
    const fixedQuery = query.replace(
      new RegExp(`\\b${incorrectColumnFull.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi'),
      replacement
    );

    console.log(`[QUERY] Fixed column error (INSTANT - no LLM):`, {
      original: query.substring(0, 100),
      fixed: fixedQuery.substring(0, 100),
      incorrectColumn: incorrectColumnFull,
      correctColumn: replacement,
      matchScore: bestMatch.score,
      table: bestMatch.table
    });

    return fixedQuery;
  } catch (error) {
    console.error('[QUERY] Error fixing column error with system catalog:', error);
    return query; // Return original on error
  }
}

/**
 * MySQL reserved keywords that need to be escaped with backticks
 */
const MYSQL_RESERVED_KEYWORDS = new Set([
  'group', 'order', 'select', 'from', 'where', 'join', 'inner', 'outer', 'left', 'right',
  'union', 'insert', 'update', 'delete', 'create', 'alter', 'drop', 'table', 'index',
  'database', 'schema', 'user', 'password', 'key', 'primary', 'foreign', 'references',
  'constraint', 'default', 'null', 'not', 'and', 'or', 'as', 'on', 'in', 'like', 'between',
  'is', 'exists', 'case', 'when', 'then', 'else', 'end', 'if', 'while', 'for', 'do',
  'function', 'procedure', 'trigger', 'view', 'grant', 'revoke', 'show', 'describe',
  'explain', 'use', 'set', 'values', 'into', 'limit', 'offset', 'having', 'distinct',
  'all', 'any', 'some', 'count', 'sum', 'avg', 'max', 'min', 'group_concat'
]);

/**
 * Escapes MySQL reserved keywords in column/table names with backticks
 */
function escapeMySQLKeywords(query: string): string {
  // Don't escape if already escaped
  if (query.includes('`')) {
    return query;
  }
  
  let fixedQuery = query;
  const backtick = '`';
  
  // Escape reserved keywords in SELECT clause (columns)
  fixedQuery = fixedQuery.replace(/\bSELECT\s+(.+?)(?:\s+FROM)/is, (match, selectClause) => {
    // Split by comma and escape each column
    const columns = selectClause.split(',').map((col: string) => {
      const trimmed = col.trim();
      // Extract column name (handle AS aliases and function calls)
      let columnName = trimmed;
      const asMatch = trimmed.match(/^(.+?)\s+AS\s+/i);
      if (asMatch) {
        columnName = asMatch[1].trim();
      }
      // Remove function calls like COUNT(...)
      const funcMatch = columnName.match(/^\w+\((.+?)\)/i);
      if (funcMatch) {
        columnName = funcMatch[1].trim();
      }
      
      // Check if it's a reserved keyword
      const lowerName = columnName.toLowerCase();
      if (MYSQL_RESERVED_KEYWORDS.has(lowerName) && !columnName.startsWith(backtick)) {
        // Escape the column name
        return trimmed.replace(new RegExp(`\\b${columnName}\\b`, 'i'), `${backtick}${columnName}${backtick}`);
      }
      return trimmed;
    });
    return `SELECT ${columns.join(', ')} FROM`;
  });
  
  // Escape reserved keywords in GROUP BY
  fixedQuery = fixedQuery.replace(/\bGROUP\s+BY\s+(\w+)/gi, (match, column) => {
    const lower = column.toLowerCase();
    if (MYSQL_RESERVED_KEYWORDS.has(lower) && !column.startsWith(backtick)) {
      return `GROUP BY ${backtick}${column}${backtick}`;
    }
    return match;
  });
  
  // Escape reserved keywords in ORDER BY
  fixedQuery = fixedQuery.replace(/\bORDER\s+BY\s+(\w+)/gi, (match, column) => {
    const lower = column.toLowerCase();
    if (MYSQL_RESERVED_KEYWORDS.has(lower) && !column.startsWith(backtick)) {
      return `ORDER BY ${backtick}${column}${backtick}`;
    }
    return match;
  });
  
  return fixedQuery;
}

/**
 * Fixes reserved keyword errors by escaping keywords with backticks
 */
async function fixReservedKeywordError(
  query: string,
  errorMessage: string,
  userQuestion?: string
): Promise<string> {
  try {
    console.log('[QUERY] Detected reserved keyword error, attempting to fix...');
    
    // Try automatic escaping first
    let fixedQuery = escapeMySQLKeywords(query);
    
    // If automatic fix didn't change anything, use LLM
    if (fixedQuery === query) {
      console.log('[QUERY] Automatic escaping did not help, using LLM...');
      
      const { default: OpenAI } = await import('openai');
      const { createTracedOpenAI } = await import('../utils/langsmith-tracer');
      const openai = createTracedOpenAI();
      
      const backtick = '`';
      const prompt = `Fix this SQL query by escaping MySQL reserved keywords with backticks.

Error: ${errorMessage}

Original Query:
${query}

${userQuestion ? `Original User Question: "${userQuestion}"\n` : ''}

CRITICAL REQUIREMENTS:
1. Escape all MySQL reserved keywords (like 'group', 'order', 'select', etc.) with backticks
2. Example: "SELECT group FROM table" → "SELECT ${backtick}group${backtick} FROM table"
3. Example: "GROUP BY group" → "GROUP BY ${backtick}group${backtick}"
4. Preserve all query logic and structure
5. Only escape identifiers (column/table names), not SQL keywords like SELECT, FROM, WHERE

Return ONLY the corrected SQL query, no explanations or markdown:`;

      const response = await openai.chat.completions.create({
        model: process.env.OPENAI_MODEL || 'gpt-4-turbo-preview',
        messages: [
          {
            role: 'system',
            content: 'You are an expert SQL query fixer. Your job is to escape MySQL reserved keywords with backticks while preserving the exact intent and meaning of the original query.',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        temperature: 0.1,
        max_tokens: 800,
      });

      fixedQuery = response.choices[0]?.message?.content?.trim() || query;
      
      // Clean up query (remove markdown code blocks if present)
      fixedQuery = fixedQuery
        .replace(/^```sql\s*/i, '')
        .replace(/```\s*$/i, '')
        .replace(/^```\s*/i, '')
        .trim();
    }
    
    console.log('[QUERY] Fixed reserved keyword error', {
      original: query.substring(0, 100),
      fixed: fixedQuery.substring(0, 100),
    });

    return fixedQuery;
  } catch (error) {
    console.error('[QUERY] Error fixing reserved keyword error:', error);
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
 * Maximum number of rows to return from a query (prevents memory exhaustion)
 */
const MAX_RESULT_ROWS = 10000;

/**
 * Timeout for query execution (30 seconds)
 */
const QUERY_TIMEOUT_MS = 30000;

/**
 * Adds LIMIT clause to query if not present to prevent excessive result sets
 */
function enforceResultLimit(query: string, maxRows: number = MAX_RESULT_ROWS): string {
  // Check if LIMIT already exists
  const hasLimit = /\bLIMIT\s+\d+/i.test(query);
  
  if (hasLimit) {
    // Extract existing limit and ensure it's not too large
    const limitMatch = query.match(/\bLIMIT\s+(\d+)/i);
    if (limitMatch) {
      const existingLimit = parseInt(limitMatch[1], 10);
      if (existingLimit > maxRows) {
        // Replace with max limit
        return query.replace(/\bLIMIT\s+\d+/i, `LIMIT ${maxRows}`);
      }
    }
    return query;
  }
  
  // Add LIMIT clause
  // Handle subqueries - only add LIMIT to the outermost SELECT
  let trimmedQuery = query.trim();
  
  // Remove trailing semicolon if present (LIMIT must be part of the same statement)
  trimmedQuery = trimmedQuery.replace(/;\s*$/, '');
  
  if (trimmedQuery.toUpperCase().startsWith('SELECT')) {
    // Simple approach: append LIMIT at the end
    // Note: This might not work for complex queries with UNION, but covers 95% of cases
    return `${trimmedQuery} LIMIT ${maxRows}`;
  }
  
  return query;
}

/**
 * Executes SQL query on database
 * Uses Python backend for SQL execution via SQLAlchemy
 * Includes result pagination and timeout handling
 */
export async function executeSQLQuery(
  connectionString: string,
  query: string,
  dataSourceId?: string,
  userQuestion?: string
): Promise<any[]> {
  // OPTIMIZATION: Check Redis cache for query results (common queries)
  if (dataSourceId && userQuestion) {
    try {
      const { hashQuery, getCachedQueryResult } = await import('./redis-cache');
      const queryHash = hashQuery(query, userQuestion);
      const cachedResult = await getCachedQueryResult(queryHash);
      
      if (cachedResult) {
        console.log(`[QUERY] ⚡ Redis cache HIT for query result (instant)`);
        return cachedResult;
      }
    } catch (error) {
      // Redis not available, continue with normal execution
    }
  }
  // Validate query before execution
  if (!validateSQLQuery(query)) {
    throw new Error('Query failed security validation. Only SELECT queries are allowed.');
  }
  
  // Enforce result limit to prevent memory exhaustion
  query = enforceResultLimit(query);

  // If dataSourceId is provided, translate canonical query to source-specific query
  // NOTE: Translation might already be done in the execute route, so check if query is already translated
  let finalQuery = query;
  if (dataSourceId) {
    try {
      // Check if query appears to already be translated (contains PascalCase table names)
      // If it does, skip translation to avoid double translation
      const hasPascalCaseTables = /\b[A-Z][a-zA-Z]+\b/.test(query) && 
                                  /\b(FROM|JOIN)\s+[A-Z][a-zA-Z]+\b/i.test(query);
      
      if (hasPascalCaseTables) {
        console.log('[QUERY] Query appears already translated (contains PascalCase tables), skipping translation');
        finalQuery = query;
      } else {
        finalQuery = await translateCanonicalQuery(dataSourceId, query);
        console.log('[QUERY] Translated canonical query:', {
          original: query.substring(0, 100),
          translated: finalQuery.substring(0, 100),
        });
      }
    } catch (error) {
      console.error('Query translation failed, using original query:', error);
      // Continue with original query if translation fails
    }
  }

  // Call Python backend for SQL execution
  const pythonBackendUrl = process.env.PYTHON_BACKEND_URL || 'http://localhost:8000';
  
  try {
    console.log(`[QUERY] Executing SQL query via Python backend: ${pythonBackendUrl}/execute`);
    console.log(`[QUERY] Query preview: ${finalQuery.substring(0, 200)}...`);
    
    // Create timeout promise
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error(`Query execution timeout after ${QUERY_TIMEOUT_MS}ms`)), QUERY_TIMEOUT_MS);
    });
    
    // Create fetch promise
    const fetchPromise = fetch(`${pythonBackendUrl}/execute`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        connection_string: connectionString,
        query: finalQuery,
      }),
    });
    
    // Race between fetch and timeout
    const response = await Promise.race([fetchPromise, timeoutPromise]);

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
      
      // Check if it's a reserved keyword error (SQL syntax error near reserved keyword)
      if (errorMessage.includes('SQL syntax error') && 
          (errorMessage.includes("near '") || errorMessage.includes('syntax'))) {
        // Check if query contains reserved keywords that might need escaping
        const queryLower = finalQuery.toLowerCase();
        const reservedKeywords = Array.from(MYSQL_RESERVED_KEYWORDS);
        const hasReservedKeyword = reservedKeywords.some(keyword => {
          // Check for reserved keywords in various contexts
          const patterns = [
            new RegExp(`\\bSELECT\\s+.*?\\b${keyword}\\b`, 'i'), // SELECT keyword
            new RegExp(`\\bGROUP\\s+BY\\s+${keyword}\\b`, 'i'), // GROUP BY keyword
            new RegExp(`\\bORDER\\s+BY\\s+${keyword}\\b`, 'i'), // ORDER BY keyword
            new RegExp(`\\bWHERE\\s+${keyword}\\b`, 'i'), // WHERE keyword
            new RegExp(`,\\s*${keyword}\\b`, 'i'), // Comma-separated keyword
          ];
          return patterns.some(pattern => pattern.test(finalQuery));
        });
        
        if (hasReservedKeyword) {
          console.log('[QUERY] Detected reserved keyword error, attempting to fix...');
          try {
            const fixedQuery = await fixReservedKeywordError(finalQuery, errorMessage, userQuestion);
            if (fixedQuery && fixedQuery !== finalQuery) {
              console.log('[QUERY] Retrying with fixed query...');
              // Retry with fixed query
              return await executeSQLQuery(connectionString, fixedQuery, dataSourceId, userQuestion);
            }
          } catch (fixError) {
            console.error('[QUERY] Failed to fix reserved keyword error:', fixError);
          }
        }
      }
      
      // Check if it's a table error (Table doesn't exist)
      if (errorMessage.includes("doesn't exist") && errorMessage.includes('Table')) {
        console.log('[QUERY] Detected table error, attempting to fix with LLM...');
        try {
          const fixedQuery = await fixTableErrorWithLLM(finalQuery, errorMessage, connectionString, userQuestion);
          if (fixedQuery && fixedQuery !== finalQuery) {
            console.log('[QUERY] Retrying with fixed query...');
            // Retry with fixed query
            return await executeSQLQuery(connectionString, fixedQuery, dataSourceId, userQuestion);
          }
        } catch (fixError) {
          console.error('[QUERY] Failed to fix table error:', fixError);
        }
      }
      
      // Check if it's a column error (Unknown column)
      if (errorMessage.includes('Unknown column') || errorMessage.includes('Column error')) {
        console.log('[QUERY] Detected column error, attempting to fix with system catalog...');
        try {
          const fixedQuery = await fixColumnErrorWithSystemCatalog(finalQuery, errorMessage, connectionString);
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

    let resultRows = result.results || [];
    const rowCount = result.row_count || resultRows.length;
    
    // Remove duplicate rows (caused by JOINs with LIKE patterns or one-to-many relationships)
    // Only remove exact duplicates (all columns match)
    if (resultRows.length > 0) {
      const originalCount = resultRows.length;
      const seen = new Set<string>();
      resultRows = resultRows.filter((row: any) => {
        // Create a unique key from all column values
        const key = JSON.stringify(Object.values(row).sort());
        if (seen.has(key)) {
          return false; // Duplicate
        }
        seen.add(key);
        return true;
      });
      
      if (resultRows.length < originalCount) {
        console.log(`[QUERY] Removed ${originalCount - resultRows.length} duplicate rows (${originalCount} → ${resultRows.length})`);
      }
    }
    
    // Log if query returned 0 rows
    if (rowCount === 0) {
      console.warn(`[QUERY] ⚠️ Query returned 0 rows. This could mean:`);
      console.warn(`[QUERY]   1. The table exists but contains no matching data`);
      console.warn(`[QUERY]   2. The query filters are too restrictive`);
      console.warn(`[QUERY]   3. The table or column names might need adjustment`);
      console.warn(`[QUERY]   Query executed: ${finalQuery.substring(0, 200)}...`);
    }
    
    // If dataSourceId is provided and query was translated, reverse-translate column names in results
    // This ensures results use canonical column names that match the original query
    if (dataSourceId && resultRows.length > 0) {
      try {
        const { reverseTranslateResultColumns } = await import('./canonical-mapping-service');
        resultRows = await reverseTranslateResultColumns(dataSourceId, resultRows);
        console.log('[QUERY] ✅ Reverse-translated result column names to canonical names');
      } catch (reverseError) {
        console.warn('[QUERY] ⚠️ Failed to reverse-translate column names:', reverseError);
        // Continue with original results if reverse translation fails
      }
    }
    
    // Warn if result was truncated
    if (rowCount >= MAX_RESULT_ROWS) {
      console.warn(`[QUERY] ⚠️ Result set truncated: ${rowCount} rows returned (max: ${MAX_RESULT_ROWS}). Consider adding more specific filters.`);
    }
    
    console.log(`[QUERY] Query executed successfully: ${rowCount} rows returned`);
    // OPTIMIZATION: Cache query result in Redis (for common queries)
    if (dataSourceId && userQuestion && resultRows.length > 0) {
      try {
        const { hashQuery, cacheQueryResult } = await import('./redis-cache');
        const queryHash = hashQuery(query, userQuestion);
        // Cache for 1 minute (data changes frequently)
        await cacheQueryResult(queryHash, resultRows, 60);
      } catch (error) {
        // Redis not available, continue without caching
      }
    }
    
    return resultRows;
    
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

