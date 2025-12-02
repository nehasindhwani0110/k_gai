/**
 * Schema Explorer Tool
 * 
 * Tool for exploring database schemas dynamically, especially useful
 * for large databases where we only want to explore relevant tables.
 */

import { DataSourceMetadata } from '../../types';
import OpenAI from 'openai';
import { createTracedOpenAI } from '../../utils/langsmith-tracer';

// Initialize traced OpenAI client
const openai = createTracedOpenAI();

/**
 * Identifies relevant tables for a given question
 */
export async function identifyRelevantTables(
  question: string,
  allTables: string[]
): Promise<string[]> {
  if (allTables.length === 0) {
    return [];
  }

  // If few tables, return all
  if (allTables.length <= 5) {
    return allTables;
  }

  try {
    const prompt = `Given this question: "${question}"

Available tables: ${allTables.join(', ')}

Which tables are likely needed to answer this question? 
Return a JSON object with a "tables" array containing table names.
Example: {"tables": ["students", "grades"]}

Be selective - only include tables that are directly relevant.`;

    const response = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-4-turbo-preview',
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
      temperature: 0,
      response_format: { type: 'json_object' },
    });

    const content = response.choices[0]?.message?.content || '{}';
    const result = JSON.parse(content);
    const relevantTables = result.tables || [];

    // Validate that returned tables exist
    const validTables = relevantTables.filter((table: string) =>
      allTables.includes(table)
    );

    // Return at least some tables (fallback to first 5)
    return validTables.length > 0 ? validTables : allTables.slice(0, 5);
  } catch (error) {
    console.error('[SCHEMA-EXPLORER] Error identifying tables:', error);
    // Fallback: return first 5 tables
    return allTables.slice(0, 5);
  }
}

/**
 * Explores schema for specific tables via Python backend
 */
export async function exploreTablesSchema(
  connectionString: string,
  tableNames: string[]
): Promise<DataSourceMetadata> {
  const pythonBackendUrl = process.env.PYTHON_BACKEND_URL || 'http://localhost:8000';

  try {
    const response = await fetch(`${pythonBackendUrl}/introspect`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        connection_string: connectionString,
        table_names: tableNames, // Pass specific tables
      }),
    });

    if (!response.ok) {
      throw new Error(`Schema introspection failed: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error('[SCHEMA-EXPLORER] Schema exploration error:', error);
    throw error;
  }
}

/**
 * Main schema exploration function
 * Combines table identification and schema introspection
 */
export async function exploreRelevantSchema(
  question: string,
  connectionString: string,
  allTables: string[]
): Promise<DataSourceMetadata> {
  // Step 1: Identify relevant tables
  const relevantTables = await identifyRelevantTables(question, allTables);
  
  console.log(`[SCHEMA-EXPLORER] Identified ${relevantTables.length} relevant tables: ${relevantTables.join(', ')}`);

  // Step 2: Explore schema for those tables
  const metadata = await exploreTablesSchema(connectionString, relevantTables);

  return metadata;
}

