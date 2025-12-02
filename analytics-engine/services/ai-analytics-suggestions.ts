import OpenAI from 'openai';
import { DataSourceMetadata } from '../types';
import { createTracedOpenAI } from '../utils/langsmith-tracer';

// Initialize traced OpenAI client
const openai = createTracedOpenAI();

/**
 * Helper function to identify key tables for analytics suggestions
 * Reuses logic from llm-service.ts
 */
async function identifyKeyTablesForSuggestions(
  metadata: DataSourceMetadata,
  maxTables: number = 10
): Promise<string[]> {
  const allTables = metadata.tables || [];
  
  // If we have few tables, return all
  if (allTables.length <= maxTables) {
    return allTables.map(t => t.name);
  }

  // Score tables based on their usefulness for analytics
  const tableScores = allTables.map(table => {
    let score = 0;
    const columns = table.columns || [];
    
    // Check for numeric columns (for aggregations)
    const numericColumns = columns.filter(col => 
      ['INT', 'INTEGER', 'BIGINT', 'DECIMAL', 'FLOAT', 'DOUBLE', 'NUMERIC', 'REAL'].includes(
        col.type?.toUpperCase() || ''
      ) || col.name?.match(/\b(count|total|sum|avg|amount|price|value|score|rating|percentage)\b/i)
    );
    score += numericColumns.length * 2;
    
    // Check for date columns (for time series)
    const dateColumns = columns.filter(col =>
      ['DATE', 'DATETIME', 'TIMESTAMP', 'TIME'].includes(col.type?.toUpperCase() || '') ||
      col.name?.match(/\b(date|time|created|updated|timestamp|period|year|month|day)\b/i)
    );
    score += dateColumns.length * 3; // Date columns are very valuable
    
    // Check for category/status columns (for distributions)
    const categoryColumns = columns.filter(col =>
      col.name?.match(/\b(status|type|category|class|group|region|state|country|department|stream)\b/i)
    );
    score += categoryColumns.length * 1.5;
    
    // Prefer tables with more columns (more data to analyze)
    score += columns.length * 0.1;
    
    return { name: table.name, score };
  });
  
  // Sort by score and take top tables
  tableScores.sort((a, b) => b.score - a.score);
  const selectedTables = tableScores.slice(0, maxTables).map(t => t.name);
  
  console.log(`[AI-SUGGESTIONS] Selected ${selectedTables.length} key tables: ${selectedTables.join(', ')}`);
  
  return selectedTables;
}

/**
 * Creates reduced metadata with only selected tables
 */
function createReducedMetadata(
  metadata: DataSourceMetadata,
  selectedTables: string[]
): DataSourceMetadata {
  return {
    ...metadata,
    tables: metadata.tables.filter(table => selectedTables.includes(table.name))
  };
}

interface AnalyticsSuggestion {
  question: string;
  description: string;
  category: string;
  priority: 'high' | 'medium' | 'low';
}

interface AnalyticsSuggestionsResponse {
  suggestions: AnalyticsSuggestion[];
}

const ANALYTICS_SUGGESTIONS_PROMPT = `You are an expert data analyst. Analyze the provided data source metadata and generate 10-15 highly relevant, actionable analytics questions based on the ACTUAL data schema provided.

**CRITICAL REQUIREMENTS:**
1. FIRST, analyze the table names and column names to determine the DOMAIN/DOMAIN (e.g., finance/payments, education, healthcare, retail, real estate, etc.)
2. Generate questions ONLY using the actual table names and column names that exist in the metadata
3. DO NOT generate questions about data that doesn't exist (e.g., don't ask about "student grades" if there are no grade-related columns)
4. Base questions on the actual column names, data types, and relationships visible in the schema
5. Infer the business domain from table/column names (e.g., "cheque", "payment", "transaction" = finance domain; "student", "course", "grade" = education domain)

**DATA SOURCE METADATA:**
{DATA_SOURCE_METADATA}

**INSTRUCTIONS:**
1. Analyze the schema to identify:
   - What domain/industry this data belongs to (finance, education, healthcare, retail, etc.)
   - Key entities (tables) and their relationships
   - Important metrics/measures (numeric columns)
   - Time dimensions (date columns)
   - Categories/dimensions (categorical columns)
   - Status/state columns

2. Generate questions that:
   - Use EXACT table and column names from the metadata
   - Are relevant to the identified domain
   - Would provide actionable business insights
   - Can be answered with the available data

3. Include a mix of question types:
   - Performance metrics (aggregations, averages, totals)
   - Distribution analysis (group by categories, statuses)
   - Trend analysis (over time using date columns)
   - Comparative analytics (comparisons across groups)
   - Risk analysis (identifying outliers, defaults, issues)
   - Predictive insights (correlations, patterns)

4. Make questions specific and actionable - reference actual column names

**OUTPUT FORMAT (JSON ONLY):**
{
  "suggestions": [
    {
      "question": "Question using actual column names from the schema",
      "description": "Clear explanation of what insights this question would provide",
      "category": "Performance Analysis | Trend Analysis | Risk Analysis | Comparative Analytics | Predictive Analytics | Demographic Insights",
      "priority": "high | medium | low"
    }
  ]
}

**IMPORTANT:** Only generate questions about data that actually exists in the schema. Do not make assumptions about data that isn't present.

Generate 10-15 diverse, high-quality analytics questions based on the actual schema.`;

/**
 * Extracts a schema summary to help identify domain and key entities
 */
function extractSchemaSummary(metadata: DataSourceMetadata): string {
  const tables = metadata.tables || [];
  const tableNames = tables.map(t => t.name).join(', ');
  
  // Extract key column patterns to identify domain
  const allColumns = tables.flatMap(t => t.columns || []);
  const columnNames = allColumns.map(c => c.name).join(', ');
  
  // Identify domain indicators
  const domainIndicators: Record<string, string[]> = {
    finance: ['cheque', 'payment', 'transaction', 'installment', 'amount', 'gst', 'bank', 'invoice'],
    education: ['student', 'course', 'grade', 'attendance', 'cgpa', 'semester', 'faculty'],
    healthcare: ['patient', 'diagnosis', 'treatment', 'prescription', 'appointment'],
    retail: ['product', 'order', 'customer', 'inventory', 'sales', 'price'],
    realestate: ['property', 'tenant', 'lease', 'rent', 'building', 'apartment'],
  };
  
  const lowerColumnNames = columnNames.toLowerCase();
  const lowerTableNames = tableNames.toLowerCase();
  
  let detectedDomain = 'general business';
  for (const [domain, keywords] of Object.entries(domainIndicators)) {
    if (keywords.some(keyword => lowerColumnNames.includes(keyword) || lowerTableNames.includes(keyword))) {
      detectedDomain = domain;
      break;
    }
  }
  
  // Build summary
  const summary = {
    domain: detectedDomain,
    tableCount: tables.length,
    tableNames: tableNames,
    keyColumns: allColumns
      .filter(c => {
        const name = c.name.toLowerCase();
        return name.includes('amount') || name.includes('date') || name.includes('status') || 
               name.includes('type') || name.includes('name') || name.includes('id');
      })
      .slice(0, 20)
      .map(c => `${c.name} (${c.type})`)
      .join(', '),
  };
  
  return `Schema Summary:
- Detected Domain: ${summary.domain}
- Tables (${summary.tableCount}): ${summary.tableNames}
- Key Columns: ${summary.keyColumns || 'See full metadata below'}

Full Metadata:`;
}

export async function generateAnalyticsSuggestions(
  metadata: DataSourceMetadata
): Promise<AnalyticsSuggestionsResponse> {
  // Extract schema summary for better context
  const schemaSummary = extractSchemaSummary(metadata);
  
  const fullMetadata = JSON.stringify(metadata, null, 2);
  const prompt = ANALYTICS_SUGGESTIONS_PROMPT.replace(
    '{DATA_SOURCE_METADATA}',
    `${schemaSummary}\n${fullMetadata}`
  );

  const response = await openai.chat.completions.create({
    model: process.env.OPENAI_MODEL || 'gpt-4-turbo-preview',
    messages: [
      {
        role: 'system',
        content: `You are an expert data analyst that works with ANY type of data (business, healthcare, education, finance, retail, real estate, etc.). 

CRITICAL: You MUST analyze the provided schema to identify:
1. The domain/industry (finance, education, healthcare, etc.) based on table and column names
2. The actual available data (tables, columns, data types)
3. Generate questions ONLY about data that actually exists in the schema

DO NOT generate questions about data that doesn't exist. For example:
- If there are no "student" or "grade" columns, don't ask about student grades
- If there are "cheque" and "payment" columns, ask about cheque/payment analytics
- Use the exact table and column names from the schema

Always return valid JSON only.`,
      },
      {
        role: 'user',
        content: prompt,
      },
    ],
    temperature: 0.7,
    response_format: { type: 'json_object' },
  });

  const content = response.choices[0]?.message?.content;
  if (!content) {
    throw new Error('No response from LLM');
  }

  return JSON.parse(content) as AnalyticsSuggestionsResponse;
}

/**
 * Agent-based analytics suggestions generation
 * 
 * Uses metadata reduction to prevent context length errors with large databases.
 */
export async function generateAnalyticsSuggestionsWithAgent(
  metadata: DataSourceMetadata,
  connectionString?: string
): Promise<AnalyticsSuggestionsResponse> {
  try {
    console.log('[AI-SUGGESTIONS] Using agent-based approach for analytics suggestions');
    
    // For SQL databases with connection string, use schema exploration
    if (metadata.source_type === 'SQL_DB' && connectionString) {
      try {
        // Import schema explorer
        const { exploreSchemaWithPythonAgent } = await import('./python-agent-bridge');
        
        // Use a generic question to identify key tables for suggestions
        const suggestionsQuestion = 'Generate analytics questions and suggestions for this database';
        
        console.log('[AI-SUGGESTIONS] Exploring schema for suggestions');
        const exploredMetadata = await exploreSchemaWithPythonAgent(
          suggestionsQuestion,
          connectionString
        );
        
        // Use explored metadata (already reduced to relevant tables)
        console.log(`[AI-SUGGESTIONS] Using explored metadata with ${exploredMetadata.tables?.length || 0} tables`);
        return await generateAnalyticsSuggestions(exploredMetadata);
      } catch (error) {
        console.warn('[AI-SUGGESTIONS] Schema exploration failed, using table selection:', error);
        // Fall through to table selection approach
      }
    }
    
    // For other cases or if schema exploration fails, use table selection
    const allTables = metadata.tables.map(t => t.name);
    
    if (allTables.length > 10) {
      console.log(`[AI-SUGGESTIONS] Large database detected (${allTables.length} tables), selecting key tables`);
      
      // Identify key tables
      const keyTables = await identifyKeyTablesForSuggestions(metadata, 10);
      
      // Create reduced metadata
      const reducedMetadata = createReducedMetadata(metadata, keyTables);
      
      console.log(`[AI-SUGGESTIONS] Using reduced metadata with ${reducedMetadata.tables.length} tables`);
      return await generateAnalyticsSuggestions(reducedMetadata);
    }
    
    // For smaller databases, use original metadata
    console.log('[AI-SUGGESTIONS] Using full metadata for suggestions');
    return await generateAnalyticsSuggestions(metadata);
    
  } catch (error) {
    console.error('[AI-SUGGESTIONS] Agent-based suggestions failed, falling back to direct LLM:', error);
    // Fallback: try with reduced metadata if original fails
    try {
      const keyTables = await identifyKeyTablesForSuggestions(metadata, 8);
      const reducedMetadata = createReducedMetadata(metadata, keyTables);
      return await generateAnalyticsSuggestions(reducedMetadata);
    } catch (fallbackError) {
      console.error('[AI-SUGGESTIONS] Fallback also failed, using original method:', fallbackError);
      // Last resort: use original method (may fail with very large databases)
      return await generateAnalyticsSuggestions(metadata);
    }
  }
}

