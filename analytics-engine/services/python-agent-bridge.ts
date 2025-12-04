/**
 * Python Agent Bridge
 * 
 * Since LangChain SQL agents work better in Python, this bridge
 * allows us to use Python-based agents while keeping TypeScript frontend.
 * 
 * This is a simpler approach than full TypeScript implementation.
 */

import { DataSourceMetadata, AdhocQueryResponse } from '../types';
import { generateAdhocQuery } from './llm-service'; // Fallback

/**
 * Calls Python backend agent service for query generation
 * 
 * Python backend should have a LangChain SQL agent endpoint
 * Reduces metadata before calling Python backend to prevent context length errors
 */
export async function generateQueryWithPythonAgent(
  userQuestion: string,
  connectionString: string,
  metadata?: DataSourceMetadata
): Promise<AdhocQueryResponse> {
  const pythonBackendUrl = process.env.PYTHON_BACKEND_URL || 'http://localhost:8000';
  
  try {
    console.log('[PYTHON-AGENT] Using Python agent for query generation');
    
    // Reduce metadata for large databases before sending to Python backend
    let reducedMetadata = metadata;
    if (metadata && metadata.tables && metadata.tables.length > 10) {
      console.log(`[PYTHON-AGENT] Reducing metadata (${metadata.tables.length} tables) before sending to Python backend`);
      try {
        // Use schema exploration to identify relevant tables
        const exploredMetadata = await exploreSchemaWithPythonAgent(userQuestion, connectionString);
        reducedMetadata = exploredMetadata;
        console.log(`[PYTHON-AGENT] Reduced to ${exploredMetadata.tables?.length || 0} relevant tables`);
      } catch (error) {
        console.warn('[PYTHON-AGENT] Schema exploration failed, using original metadata:', error);
        // Continue with original metadata (Python backend may handle it)
      }
    }
    
    const response = await fetch(`${pythonBackendUrl}/agent/query`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        question: userQuestion,
        connection_string: connectionString,
        metadata: reducedMetadata,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Python agent error: ${response.status} - ${errorText}`);
    }

    const result = await response.json();
    
    if (result.error) {
      throw new Error(result.error);
    }

    return {
      query_type: 'SQL_QUERY',
      query_content: result.query,
      visualization_type: 'auto',
      insight_summary: result.insight_summary || 'Query generated using SQL agent',
    };
  } catch (error) {
    console.error('[PYTHON-AGENT] Error:', error);
    // Fallback to direct LLM (which also reduces metadata)
    console.log('[PYTHON-AGENT] Falling back to direct LLM');
    return generateAdhocQuery(userQuestion, metadata!, connectionString);
  }
}

/**
 * Explores schema using Python agent
 * Includes timeout handling and retry logic for transient failures
 */
export async function exploreSchemaWithPythonAgent(
  userQuestion: string,
  connectionString: string
): Promise<DataSourceMetadata> {
  const pythonBackendUrl = process.env.PYTHON_BACKEND_URL || 'http://localhost:8000';
  const SCHEMA_EXPLORATION_TIMEOUT_MS = 60000; // 60 seconds
  const MAX_RETRIES = 3;
  const RETRY_DELAY_MS = 2000; // 2 seconds
  
  let lastError: Error | null = null;
  
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      console.log(`[PYTHON-AGENT] Schema exploration attempt ${attempt}/${MAX_RETRIES}`);
      
      // Create timeout promise
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error(`Schema exploration timeout after ${SCHEMA_EXPLORATION_TIMEOUT_MS}ms`)), SCHEMA_EXPLORATION_TIMEOUT_MS);
      });
      
      // Create fetch promise
      const fetchPromise = fetch(`${pythonBackendUrl}/agent/explore-schema`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          question: userQuestion,
          connection_string: connectionString,
        }),
      });
      
      // Race between fetch and timeout
      const response = await Promise.race([fetchPromise, timeoutPromise]);
      
      if (!response.ok) {
        // Check if it's a transient error (503, 500) that we should retry
        if (response.status === 503 || response.status === 500) {
          const errorText = await response.text();
          lastError = new Error(`Schema exploration failed: ${response.status} - ${errorText}`);
          
          // If not the last attempt, wait and retry
          if (attempt < MAX_RETRIES) {
            console.warn(`[PYTHON-AGENT] Transient error (${response.status}), retrying in ${RETRY_DELAY_MS}ms...`);
            await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS * attempt)); // Exponential backoff
            continue;
          }
        }
        
        const errorText = await response.text();
        throw new Error(`Schema exploration failed: ${response.status} - ${errorText}`);
      }

      const result = await response.json();
      console.log(`[PYTHON-AGENT] Schema exploration successful on attempt ${attempt}`);
      return result;
      
    } catch (error: any) {
      lastError = error;
      
      // Check if it's a timeout or connection error that we should retry
      const isRetryableError = 
        error?.message?.includes('timeout') ||
        error?.message?.includes('ECONNREFUSED') ||
        error?.message?.includes('fetch failed') ||
        error?.code === 'ECONNREFUSED';
      
      if (isRetryableError && attempt < MAX_RETRIES) {
        console.warn(`[PYTHON-AGENT] Retryable error on attempt ${attempt}, retrying in ${RETRY_DELAY_MS * attempt}ms...`, error.message);
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS * attempt)); // Exponential backoff
        continue;
      }
      
      // If not retryable or last attempt, throw
      if (attempt === MAX_RETRIES) {
        console.error(`[PYTHON-AGENT] Schema exploration failed after ${MAX_RETRIES} attempts:`, error);
        throw error;
      }
    }
  }
  
  // Should never reach here, but just in case
  throw lastError || new Error('Schema exploration failed: Unknown error');
}

