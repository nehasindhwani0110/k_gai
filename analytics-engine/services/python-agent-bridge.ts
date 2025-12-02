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
 */
export async function exploreSchemaWithPythonAgent(
  userQuestion: string,
  connectionString: string
): Promise<DataSourceMetadata> {
  const pythonBackendUrl = process.env.PYTHON_BACKEND_URL || 'http://localhost:8000';
  
  try {
    const response = await fetch(`${pythonBackendUrl}/agent/explore-schema`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        question: userQuestion,
        connection_string: connectionString,
      }),
    });

    if (!response.ok) {
      throw new Error(`Schema exploration failed: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error('[PYTHON-AGENT] Schema exploration error:', error);
    throw error;
  }
}

