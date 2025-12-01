import { QueryType, SourceType } from '../types';
import { executeCSVQuery } from './csv-query-executor';
import { translateCanonicalQuery } from './canonical-mapping-service';

/**
 * Executes SQL query on database
 * Uses Python backend for SQL execution via SQLAlchemy
 */
export async function executeSQLQuery(
  connectionString: string,
  query: string,
  dataSourceId?: string
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
      throw new Error(`Python backend error: ${response.status} - ${errorData.error || errorData.details || 'Unknown error'}`);
    }

    const result = await response.json();
    
    if (result.error) {
      throw new Error(result.error);
    }

    console.log(`[QUERY] Query executed successfully: ${result.row_count || result.results?.length || 0} rows returned`);
    return result.results || [];
    
  } catch (error) {
    console.error('[QUERY] SQL execution error:', error);
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

