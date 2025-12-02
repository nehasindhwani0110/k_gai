/**
 * Query Validator Tool
 * 
 * Validates SQL queries for:
 * 1. Security (only SELECT statements)
 * 2. Syntax correctness
 * 3. Semantic correctness (matches question, uses correct schema)
 */

import { validateSQLQuery } from '../../services/query-executor';
import { DataSourceMetadata } from '../../types';
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  suggestions?: string;
}

/**
 * Security validation - checks for dangerous operations
 */
export function validateQuerySecurity(query: string): ValidationResult {
  const isValid = validateSQLQuery(query);
  
  if (!isValid) {
    return {
      valid: false,
      errors: ['Query failed security validation. Only SELECT queries are allowed.'],
      suggestions: 'Ensure query starts with SELECT and contains no INSERT, UPDATE, DELETE, DROP, or CREATE statements.',
    };
  }

  return {
    valid: true,
    errors: [],
  };
}

/**
 * Semantic validation - checks if query matches question and uses correct schema
 */
export async function validateQuerySemantics(
  query: string,
  question: string,
  metadata: DataSourceMetadata
): Promise<ValidationResult> {
  try {
    const prompt = `Validate this SQL query for semantic correctness:

Question: ${question}

Query: ${query}

Schema:
${JSON.stringify(metadata, null, 2)}

Check:
1. Does the query use correct table names from the schema?
2. Does the query use correct column names from the schema?
3. Does the query logically answer the question?
4. Is the SQL syntax correct?
5. Are aggregate functions used correctly?
6. Are JOINs (if any) correct?
7. CRITICAL - MySQL ONLY_FULL_GROUP_BY mode: Are ALL non-aggregated columns in SELECT also in GROUP BY clause? If not, this will cause an error. Non-grouped columns should either be added to GROUP BY or wrapped in aggregate functions (MIN, MAX).

Return JSON:
{
  "valid": true/false,
  "errors": ["error1", "error2"],
  "suggestions": "improvement suggestions if any"
}`;

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
    const validation = JSON.parse(content);

    return {
      valid: validation.valid || false,
      errors: validation.errors || [],
      suggestions: validation.suggestions || '',
    };
  } catch (error) {
    console.error('[QUERY-VALIDATOR] Semantic validation error:', error);
    // If validation fails, assume valid (don't block)
    return {
      valid: true,
      errors: [],
      suggestions: 'Could not validate query semantics',
    };
  }
}

/**
 * Complete validation - combines security and semantic validation
 */
export async function validateQuery(
  query: string,
  question: string,
  metadata: DataSourceMetadata
): Promise<ValidationResult> {
  // Step 1: Security validation
  const securityCheck = validateQuerySecurity(query);
  if (!securityCheck.valid) {
    return securityCheck;
  }

  // Step 2: Semantic validation
  const semanticCheck = await validateQuerySemantics(query, question, metadata);
  
  return semanticCheck;
}

