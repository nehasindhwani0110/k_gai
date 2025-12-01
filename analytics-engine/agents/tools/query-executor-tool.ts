/**
 * Query Executor Tool
 * 
 * Executes SQL queries on different data source types.
 * Routes to appropriate executor based on source type.
 */

import { SourceType } from '../../types';
import { executeSQLQuery, executeSQLOnCSV } from '../../services/query-executor';
import { executeCSVQuery } from '../../services/csv-query-executor';

export interface ExecutionResult {
  success: boolean;
  results?: any[];
  error?: string;
  rowCount?: number;
}

/**
 * Executes a query based on source type
 */
export async function executeQuery(
  query: string,
  sourceType: SourceType,
  connectionString?: string,
  filePath?: string,
  dataSourceId?: string
): Promise<ExecutionResult> {
  try {
    let results: any[] = [];

    switch (sourceType) {
      case 'SQL_DB':
        if (!connectionString) {
          throw new Error('Connection string required for SQL_DB source type');
        }
        results = await executeSQLQuery(connectionString, query, dataSourceId);
        break;

      case 'CSV_FILE':
        if (!filePath) {
          throw new Error('File path required for CSV_FILE source type');
        }
        results = await executeSQLOnCSV(filePath, query);
        break;

      case 'CANONICAL_DB':
        // Canonical DB uses SQL_DB executor with translation
        if (!connectionString) {
          throw new Error('Connection string required for CANONICAL_DB source type');
        }
        results = await executeSQLQuery(connectionString, query, dataSourceId);
        break;

      default:
        throw new Error(`Unsupported source type: ${sourceType}`);
    }

    return {
      success: true,
      results,
      rowCount: results.length,
    };
  } catch (error) {
    console.error('[QUERY-EXECUTOR] Execution error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
      results: [],
    };
  }
}

/**
 * Validates query before execution
 */
export function canExecuteQuery(query: string): boolean {
  if (!query || typeof query !== 'string') {
    return false;
  }

  const trimmed = query.trim().toUpperCase();
  
  // Must start with SELECT
  if (!trimmed.startsWith('SELECT')) {
    return false;
  }

  // Check for dangerous keywords
  const dangerousKeywords = [
    'INSERT', 'UPDATE', 'DELETE', 'DROP', 
    'CREATE', 'ALTER', 'TRUNCATE', 'EXEC', 
    'EXECUTE', 'CALL'
  ];

  for (const keyword of dangerousKeywords) {
    const regex = new RegExp(`\\b${keyword}\\b`, 'i');
    if (regex.test(query)) {
      return false;
    }
  }

  return true;
}

