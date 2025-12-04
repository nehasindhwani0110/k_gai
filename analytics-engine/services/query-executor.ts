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
 * Fixes column errors using LLM with full schema introspection
 * Used as fallback when system catalog matching fails
 */
async function fixColumnErrorWithLLM(
  query: string,
  errorMessage: string,
  connectionString: string,
  tableNames: string[]
): Promise<string> {
  try {
    console.log(`[QUERY] Using LLM to fix column error with schema context...`);
    
    // Get full schema for all tables in query
    const { getTablesMetadata } = await import('./system-catalog-service');
    const fullTables = await getTablesMetadata({ connectionString }, tableNames);
    
    // Build schema description
    const schemaDescription = fullTables.map(table => {
      const columns = table.columns?.map(c => `${c.name} (${c.type})`).join(', ') || 'No columns';
      return `Table: ${table.name}\nColumns: ${columns}`;
    }).join('\n\n');
    
    const prompt = `Fix this SQL query that has a column error. Use ONLY the columns from the schema provided below.

Error: ${errorMessage}

Original Query:
${query}

Database Schema:
${schemaDescription}

CRITICAL REQUIREMENTS:
1. The fixed query MUST answer the SAME question as the original query
2. Use ONLY column names that exist in the schema above
3. If a column doesn't exist, find the closest matching column from the schema
4. If the column is in a different table, add the appropriate JOIN
5. Maintain all WHERE clauses, GROUP BY, ORDER BY, and LIMIT logic
6. Return ONLY the corrected SQL query, no explanations or markdown`;

    const { default: OpenAI } = await import('openai');
    const { createTracedOpenAI } = await import('../utils/langsmith-tracer');
    const openai = createTracedOpenAI();

    const response = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-4-turbo-preview',
      messages: [
        {
          role: 'system',
          content: 'You are an expert SQL query fixer. Fix column errors by using the exact column names from the provided schema.',
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
    });

    return cleanedQuery;
  } catch (error) {
    console.error('[QUERY] Error fixing column error with LLM:', error);
    return query; // Return original on error
  }
}

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
 * Uses semantic matching to find the correct column based on query context
 */
async function findColumnWithSemanticMatching(
  query: string,
  incorrectColumn: string,
  possibleTables: Array<{ name: string; alias?: string }>,
  tableMetadataMap: Map<string, any>,
  connectionString: string
): Promise<{ column: string; table: string; score: number } | null> {
  try {
    // Extract query context - what is the query trying to do?
    const queryContext = extractQueryContext(query);
    
    // Build a semantic search query
    const searchQuery = `${queryContext} column ${incorrectColumn}`;
    
    console.log(`[QUERY] Semantic search query: "${searchQuery}"`);
    
    // Try semantic matching for each possible table
    const { findRelevantColumns } = await import('./semantic-matcher');
    const { generateSchemaHash } = await import('./embedding-cache');
    
    let bestSemanticMatch: { column: string; table: string; score: number } | null = null;
    
    for (const table of possibleTables) {
      const tableMetadata = tableMetadataMap.get(table.name.toLowerCase());
      if (!tableMetadata || !tableMetadata.columns || tableMetadata.columns.length === 0) continue;
      
      try {
        // Create a table metadata object for semantic matching
        const tableForSemantic: any = {
          name: table.name,
          columns: tableMetadata.columns.map((col: any) => ({
            name: col.name,
            type: col.type || 'UNKNOWN',
            description: col.description || `Column ${col.name}`
          }))
        };
        
        const schemaHash = generateSchemaHash({ tables: [tableForSemantic] } as any);
        const columnMatches = await findRelevantColumns(
          searchQuery,
          tableForSemantic,
          5, // Top 5 columns
          schemaHash
        );
        
        if (columnMatches.length > 0) {
          const topMatch = columnMatches[0];
          const score = topMatch.score * 100; // Convert to 0-100 scale
          
          console.log(`[QUERY]   Table "${table.name}": Top semantic match = "${topMatch.name}" (score: ${score.toFixed(1)})`);
          
          if (!bestSemanticMatch || score > bestSemanticMatch.score) {
            bestSemanticMatch = {
              column: topMatch.name,
              table: table.name,
              score: score
            };
          }
        }
      } catch (error) {
        console.warn(`[QUERY] Semantic matching failed for table "${table.name}":`, error);
      }
    }
    
    return bestSemanticMatch;
  } catch (error) {
    console.error('[QUERY] Error in semantic column matching:', error);
    return null;
  }
}

/**
 * Extracts query context to help with semantic matching
 */
function extractQueryContext(query: string): string {
  // Extract key parts of the query
  const selectMatch = query.match(/SELECT\s+(.+?)\s+FROM/i);
  const fromMatch = query.match(/FROM\s+(\w+)/i);
  const joinMatches = Array.from(query.matchAll(/JOIN\s+(\w+)/gi));
  const whereMatch = query.match(/WHERE\s+(.+?)(?:\s+GROUP|\s+ORDER|\s+LIMIT|$)/i);
  
  const contextParts: string[] = [];
  
  if (selectMatch) {
    contextParts.push(`selecting ${selectMatch[1]}`);
  }
  if (fromMatch) {
    contextParts.push(`from ${fromMatch[1]}`);
  }
  if (joinMatches.length > 0) {
    const joinedTables = joinMatches.map(m => m[1]).join(', ');
    contextParts.push(`joining ${joinedTables}`);
  }
  if (whereMatch) {
    contextParts.push(`filtering by ${whereMatch[1]}`);
  }
  
  return contextParts.join(' ');
}

/**
 * Extracts JOIN context to understand which tables are being joined
 * Returns the referenced table name if found
 */
function extractJoinContext(query: string, incorrectColumn: string): { referencedTable: string | null; currentTable: string | null } | null {
  try {
    // Extract column name and table from incorrectColumn (e.g., "Student.class" -> table="Student", column="class")
    const columnParts = incorrectColumn.includes('.') ? incorrectColumn.split('.') : [null, incorrectColumn];
    const incorrectTableName = columnParts[0];
    const incorrectColName = columnParts[1];
    
    // Find JOIN clauses - match pattern: JOIN TableName ON Table1.column = Table2.column
    // More flexible pattern to handle various JOIN formats
    const joinPattern = /JOIN\s+(\w+)(?:\s+AS\s+\w+)?\s+ON\s+([^=]+?)\s*=\s*([^=]+?)(?:\s+WHERE|\s+GROUP|\s+ORDER|\s+LIMIT|$)/gi;
    const matches = Array.from(query.matchAll(joinPattern));
    
    console.log(`[QUERY] Extracting JOIN context for "${incorrectColumn}" (table: ${incorrectTableName}, column: ${incorrectColName})`);
    console.log(`[QUERY] Found ${matches.length} JOIN clauses in query`);
    
    for (const match of matches) {
      const joinedTable = match[1]; // The table being joined (e.g., "Student")
      const leftSide = match[2].trim();
      const rightSide = match[3].trim();
      
      console.log(`[QUERY]   JOIN ${joinedTable} ON ${leftSide} = ${rightSide}`);
      
      // Extract table.column from both sides
      const leftMatch = leftSide.match(/(\w+)\.(\w+)/);
      const rightMatch = rightSide.match(/(\w+)\.(\w+)/);
      
      if (!leftMatch || !rightMatch) {
        console.log(`[QUERY]   Could not parse table.column from ON clause`);
        continue;
      }
      
      const leftTable = leftMatch[1];
      const leftCol = leftMatch[2];
      const rightTable = rightMatch[1];
      const rightCol = rightMatch[2];
      
      console.log(`[QUERY]   Parsed: ${leftTable}.${leftCol} = ${rightTable}.${rightCol}`);
      
      // Check if incorrect column matches the right side (the joined table side)
      // Example: JOIN Student ON Class.id = Student.class
      // incorrectColumn = "Student.class", incorrectTableName = "Student", incorrectColName = "class"
      if (incorrectTableName && incorrectColName &&
          rightTable.toLowerCase() === incorrectTableName.toLowerCase() &&
          rightCol.toLowerCase() === incorrectColName.toLowerCase()) {
        // The left side should be the referenced table (e.g., "Class.id")
        console.log(`[QUERY]   ✅ Found match: ${rightTable}.${rightCol} references ${leftTable}.${leftCol}`);
        return {
          referencedTable: leftTable, // e.g., "Class" from "Class.id"
          currentTable: joinedTable // e.g., "Student" from "JOIN Student"
        };
      }
      // Check if incorrect column matches the left side
      else if (incorrectTableName && incorrectColName &&
               leftTable.toLowerCase() === incorrectTableName.toLowerCase() &&
               leftCol.toLowerCase() === incorrectColName.toLowerCase()) {
        // The right side should be the referenced table
        console.log(`[QUERY]   ✅ Found match: ${leftTable}.${leftCol} references ${rightTable}.${rightCol}`);
        return {
          referencedTable: rightTable,
          currentTable: joinedTable
        };
      }
      // Fallback: Check if just the column name matches (without table prefix)
      else if (incorrectColName && 
               (rightCol.toLowerCase() === incorrectColName.toLowerCase() || 
                leftCol.toLowerCase() === incorrectColName.toLowerCase())) {
        // Determine which side has the incorrect column
        if (rightCol.toLowerCase() === incorrectColName.toLowerCase() && 
            rightTable.toLowerCase() === joinedTable.toLowerCase()) {
          console.log(`[QUERY]   ✅ Found match (column only): ${rightCol} in ${rightTable} references ${leftTable}`);
          return {
            referencedTable: leftTable,
            currentTable: joinedTable
          };
        } else if (leftCol.toLowerCase() === incorrectColName.toLowerCase() &&
                   leftTable.toLowerCase() === joinedTable.toLowerCase()) {
          console.log(`[QUERY]   ✅ Found match (column only): ${leftCol} in ${leftTable} references ${rightTable}`);
          return {
            referencedTable: rightTable,
            currentTable: joinedTable
          };
        }
      }
    }
    
    // Fallback: Look for pattern where one side has ".id" (the referenced table's primary key)
    for (const match of matches) {
      const joinedTable = match[1];
      const leftSide = match[2].trim();
      const rightSide = match[3].trim();
      
      const leftMatch = leftSide.match(/(\w+)\.(\w+)/);
      const rightMatch = rightSide.match(/(\w+)\.(\w+)/);
      
      if (leftMatch && rightMatch) {
        const leftTable = leftMatch[1];
        const leftCol = leftMatch[2].toLowerCase();
        const rightTable = rightMatch[1];
        const rightCol = rightMatch[2].toLowerCase();
        
        // If one side has "id" and the other side matches the incorrect column
        if (leftCol === 'id' && 
            rightTable.toLowerCase() === joinedTable.toLowerCase() &&
            (incorrectColName && rightCol.includes(incorrectColName.toLowerCase()) ||
             incorrectTableName && rightTable.toLowerCase() === incorrectTableName.toLowerCase())) {
          console.log(`[QUERY]   ✅ Found match (fallback): ${rightTable} references ${leftTable} via ${leftTable}.id`);
          return {
            referencedTable: leftTable,
            currentTable: joinedTable
          };
        } else if (rightCol === 'id' &&
                   leftTable.toLowerCase() === joinedTable.toLowerCase() &&
                   (incorrectColName && leftCol.includes(incorrectColName.toLowerCase()) ||
                    incorrectTableName && leftTable.toLowerCase() === incorrectTableName.toLowerCase())) {
          console.log(`[QUERY]   ✅ Found match (fallback): ${leftTable} references ${rightTable} via ${rightTable}.id`);
          return {
            referencedTable: rightTable,
            currentTable: joinedTable
          };
        }
      }
    }
    
    console.log(`[QUERY]   ❌ Could not extract JOIN context`);
  } catch (error) {
    console.log(`[QUERY] Error extracting JOIN context:`, error);
  }
  
  return null;
}

/**
 * Fast column error fixing using system catalog (no LLM - instant!)
 * Fetches ALL columns from system catalog and does direct fuzzy matching
 * Also handles missing JOINs when a table is referenced but not joined
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

    // Detect if this is a JOIN ON clause error - if so, we need to find foreign key columns
    const isJoinOnClause = errorMessage.includes('on clause') || errorMessage.includes('ON clause');
    const joinContext = isJoinOnClause ? extractJoinContext(query, incorrectColumnFull) : null;
    
    if (joinContext) {
      console.log(`[QUERY] JOIN context detected:`, {
        referencedTable: joinContext.referencedTable,
        currentTable: joinContext.currentTable,
        incorrectColumn: incorrectColumnFull
      });
    }

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

    // Check if referenced table is missing from JOINs
    const referencedTable = tableAlias || (incorrectColumnFull.includes('.') ? incorrectColumnFull.split('.')[0] : null);
    const isTableMissing = referencedTable && !tables.some(t => 
      t.name.toLowerCase() === referencedTable.toLowerCase() || 
      t.alias?.toLowerCase() === referencedTable.toLowerCase()
    );

    if (tables.length === 0) {
      console.log('[QUERY] Could not extract tables from query');
      return query;
    }

    // Fetch ALL columns from system catalog for tables in query (FAST - no LLM!)
    const { getTablesMetadata } = await import('./system-catalog-service');
    let tableNames = tables.map(t => t.name);
    
    // If table is missing, fetch its metadata too
    if (isTableMissing && referencedTable) {
      tableNames.push(referencedTable);
      console.log(`[QUERY] Detected missing table "${referencedTable}" in query, fetching its metadata`);
    }
    
    console.log(`[QUERY] Fetching ALL columns from system catalog for tables: ${tableNames.join(', ')}`);
    const fullTables = await getTablesMetadata(
      { connectionString },
      tableNames
    );

    // Build column map: table name -> all columns
    const columnMap = new Map<string, string[]>();
    const tableMetadataMap = new Map<string, any>();
    fullTables.forEach(table => {
      const allColumns = table.columns?.map(c => c.name) || [];
      columnMap.set(table.name.toLowerCase(), allColumns);
      tableMetadataMap.set(table.name.toLowerCase(), table);
      console.log(`[QUERY] Found ${allColumns.length} columns for table ${table.name} (COMPLETE)`);
    });

    // If table is missing, try to add JOIN
    if (isTableMissing && referencedTable) {
      const missingTableName = referencedTable;
      const missingTableMetadata = tableMetadataMap.get(missingTableName.toLowerCase());
      
      if (missingTableMetadata) {
        console.log(`[QUERY] Attempting to add missing JOIN for table "${missingTableName}"`);
        
        // Try to find a relationship between existing tables and missing table
        // Common patterns: Student.schoolId -> School.id, Class.schoolId -> School.id
        // Look for foreign key columns in existing tables that might reference the missing table
        for (const existingTable of tables) {
          const existingTableMetadata = tableMetadataMap.get(existingTable.name.toLowerCase());
          if (!existingTableMetadata) continue;
          
          // Look for columns that might reference the missing table (e.g., schoolId, school_id)
          const possibleFKColumns = existingTableMetadata.columns?.filter((col: any) => {
            const colLower = col.name.toLowerCase();
            const missingTableLower = missingTableName.toLowerCase();
            // Check for patterns like: schoolId, school_id, schoolId, etc.
            return colLower.includes(missingTableLower) || 
                   colLower === `${missingTableLower}id` ||
                   colLower === `${missingTableLower}_id` ||
                   colLower === `id${missingTableLower}` ||
                   colLower === `id_${missingTableLower}`;
          }) || [];
          
          // Also check for id column in missing table
          const missingTableIdColumn = missingTableMetadata.columns?.find((col: any) => 
            col.name.toLowerCase() === 'id' || col.isPrimaryKey
          );
          
          if (possibleFKColumns.length > 0 && missingTableIdColumn) {
            const fkColumn = possibleFKColumns[0].name;
            const idColumn = missingTableIdColumn.name;
            
            // Add JOIN after existing JOINs, before WHERE clause (or at end if no WHERE clause)
            const joinClause = ` JOIN ${missingTableName} ON ${existingTable.name}.${fkColumn} = ${missingTableName}.${idColumn}`;
            
            // Find WHERE/GROUP BY/ORDER BY/LIMIT to insert JOIN before them
            const whereIndex = query.toUpperCase().indexOf(' WHERE ');
            const groupByIndex = query.toUpperCase().indexOf(' GROUP BY ');
            const orderByIndex = query.toUpperCase().indexOf(' ORDER BY ');
            const limitIndex = query.toUpperCase().indexOf(' LIMIT ');
            
            let insertIndex = -1;
            if (whereIndex > 0) {
              insertIndex = whereIndex;
            } else if (groupByIndex > 0) {
              insertIndex = groupByIndex;
            } else if (orderByIndex > 0) {
              insertIndex = orderByIndex;
            } else if (limitIndex > 0) {
              insertIndex = limitIndex;
            } else {
              // No WHERE/GROUP BY/ORDER BY/LIMIT, add at end
              insertIndex = query.length;
            }
            
            // Ensure we have a space before the JOIN
            const spaceBefore = insertIndex > 0 && query[insertIndex - 1] !== ' ' ? ' ' : '';
            const fixedQuery = query.slice(0, insertIndex) + spaceBefore + joinClause + query.slice(insertIndex);
            console.log(`[QUERY] Added missing JOIN: ${joinClause}`);
            
            // Now fix the column name
            const missingTableColumns = columnMap.get(missingTableName.toLowerCase()) || [];
            let bestColumnMatch: { column: string; score: number } | null = null;
            const incorrectLower = incorrectColumn.toLowerCase();
            
            for (const col of missingTableColumns) {
              const colLower = col.toLowerCase();
              let score = 0;
              
              if (colLower === incorrectLower) {
                score = 100;
              } else if (colLower.includes(incorrectLower) || incorrectLower.includes(colLower)) {
                score = 80;
              } else {
                const colNormalized = colLower.replace(/[_\s]/g, '');
                const incorrectNormalized = incorrectLower.replace(/[_\s]/g, '');
                if (colNormalized.includes(incorrectNormalized) || incorrectNormalized.includes(colNormalized)) {
                  score = 60;
                }
              }
              
              if (score > 0 && (!bestColumnMatch || score > bestColumnMatch.score)) {
                bestColumnMatch = { column: col, score };
              }
            }
            
            if (bestColumnMatch && bestColumnMatch.score >= 30) {
              const replacement = `${missingTableName}.${bestColumnMatch.column}`;
              const finalQuery = fixedQuery.replace(
                new RegExp(`\\b${incorrectColumnFull.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi'),
                replacement
              );
              
              console.log(`[QUERY] Fixed missing JOIN and column error:`, {
                original: query.substring(0, 100),
                fixed: finalQuery.substring(0, 100),
                addedJoin: joinClause,
                incorrectColumn: incorrectColumnFull,
                correctColumn: replacement,
                matchScore: bestColumnMatch.score
              });
              
              return finalQuery;
            } else {
              // JOIN added but column not found, return query with JOIN (will try again)
              console.log(`[QUERY] Added JOIN but could not find column "${incorrectColumn}" in table "${missingTableName}"`);
              return fixedQuery;
            }
          }
        }
        
        console.log(`[QUERY] Could not determine how to join table "${missingTableName}" - no foreign key relationship found`);
      }
    }

    // Enhanced logic: Find the correct column using aggressive fuzzy matching
    let bestMatch: { column: string; table: string; score: number } | null = null;
    const incorrectLower = incorrectColumn.toLowerCase();
    
    // Try to find which table the column belongs to
    const possibleTables = tableAlias 
      ? tables.filter(t => t.alias?.toLowerCase() === tableAlias.toLowerCase() || t.name.toLowerCase() === tableAlias.toLowerCase())
      : tables; // If no alias, check all tables
    
    // Log available columns for debugging - show ALL columns that might match
    console.log(`[QUERY] Searching for column "${incorrectColumn}" in tables: ${possibleTables.map(t => t.name).join(', ')}`);
    for (const table of possibleTables) {
      const tableColumns = columnMap.get(table.name.toLowerCase()) || [];
      if (tableColumns.length > 0) {
        // Show columns that contain the incorrect column name or related patterns
        const matchingColumns = tableColumns.filter(col => {
          const colLower = col.toLowerCase();
          const incorrectLower = incorrectColumn.toLowerCase();
          return colLower.includes(incorrectLower) || 
                 incorrectLower.includes(colLower) ||
                 colLower.includes(incorrectLower + 'id') ||
                 colLower.includes(incorrectLower + '_id');
        });
        
        console.log(`[QUERY] Table "${table.name}" has ${tableColumns.length} columns.`);
        if (matchingColumns.length > 0) {
          console.log(`[QUERY]   Potential matches: ${matchingColumns.join(', ')}`);
        } else {
          console.log(`[QUERY]   Sample columns: ${tableColumns.slice(0, 15).join(', ')}${tableColumns.length > 15 ? '...' : ''}`);
        }
      }
    }
    
    // Collect all potential matches for logging
    const allMatches: Array<{ column: string; table: string; score: number; reason: string }> = [];
    
    for (const table of possibleTables) {
      const tableColumns = columnMap.get(table.name.toLowerCase()) || [];
      
      for (const col of tableColumns) {
        const colLower = col.toLowerCase();
        let score = 0;
        let reason = '';
        
        // CRITICAL: If this is a JOIN ON clause, prioritize foreign key columns
        if (joinContext && joinContext.referencedTable && table.name.toLowerCase() === joinContext.currentTable?.toLowerCase()) {
          const referencedTableLower = joinContext.referencedTable.toLowerCase();
          
          // Check if this column is a foreign key to the referenced table
          // Pattern: classId, class_id, ClassId, etc. when referencing Class table
          // Also check if column name contains the referenced table name
          if (
            colLower === referencedTableLower + 'id' ||
            colLower === referencedTableLower + '_id' ||
            colLower === referencedTableLower + 'Id' ||
            colLower.endsWith(referencedTableLower + 'id') ||
            colLower.endsWith(referencedTableLower + '_id') ||
            (colLower.includes(referencedTableLower) && (colLower.includes('id') || colLower.includes('_id')))
          ) {
            score = 95; // Very high score for foreign key columns in JOIN ON
            reason = `FK to ${joinContext.referencedTable}`;
            console.log(`[QUERY] ✅ Found foreign key column "${col}" in table "${table.name}" referencing "${joinContext.referencedTable}" (score: ${score})`);
          }
          // Also check if incorrect column name matches the referenced table (e.g., "class" when referencing "Class")
          // This handles cases where query uses "Student.class" but should be "Student.classId"
          else if (incorrectLower === referencedTableLower || 
              incorrectLower === referencedTableLower.replace(/s$/, '') || // Handle plural/singular
              referencedTableLower.includes(incorrectLower)) {
            // The column should be the foreign key (referencedTable + "id")
            if (colLower.includes(referencedTableLower) && (colLower.includes('id') || colLower.endsWith('id'))) {
              score = Math.max(score, 90); // High score for FK when column name matches referenced table
              reason = `FK matching ${joinContext.referencedTable}`;
              console.log(`[QUERY] ✅ Found foreign key column "${col}" matching referenced table "${joinContext.referencedTable}" (score: ${score})`);
            }
          }
        }
        
        // Exact match
        if (colLower === incorrectLower) {
          score = Math.max(score, 100);
        }
        // Contains match (very common pattern)
        else if (colLower.includes(incorrectLower) || incorrectLower.includes(colLower)) {
          score = Math.max(score, 80);
        }
        // Pattern matching for common variations
        // class -> className, classId, class_id, currentClass, etc.
        // CRITICAL: Check camelCase patterns (classId, className) - these are very common
        const camelCasePattern = incorrectLower.charAt(0).toUpperCase() + incorrectLower.slice(1);
        if (
          colLower.includes(incorrectLower + 'name') ||
          colLower.includes(incorrectLower + 'id') ||
          colLower.includes(incorrectLower + '_name') ||
          colLower.includes(incorrectLower + '_id') ||
          colLower.includes('current' + incorrectLower) ||
          colLower.includes('current_' + incorrectLower) ||
          col.includes(camelCasePattern + 'Id') || // camelCase: classId
          col.includes(camelCasePattern + 'Name') || // camelCase: className
          col.includes(camelCasePattern + 'ID') || // classID
          colLower.endsWith(incorrectLower + 'id') || // ends with classid
          colLower.endsWith(incorrectLower + '_id') // ends with class_id
        ) {
          score = Math.max(score, 85); // Very high score for common FK patterns
          if (!reason) reason = 'FK pattern match';
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
            const prefixesToRemove = ['is', 'has', 'can', 'should', 'current', 'last', 'first', 'total', 'avg', 'sum', 'count', 'max', 'min', 'get', 'set'];
            const suffixesToRemove = ['id', 'name', 'value', 'key', 'code', 'type', 'status'];
            
            let colBase = colLower;
            let incorrectBase = incorrectLower;
            
            // Remove prefixes
            for (const prefix of prefixesToRemove) {
              if (colBase.startsWith(prefix)) {
                colBase = colBase.substring(prefix.length);
              }
              if (incorrectBase.startsWith(prefix)) {
                incorrectBase = incorrectBase.substring(prefix.length);
              }
            }
            
            // Remove suffixes
            for (const suffix of suffixesToRemove) {
              if (colBase.endsWith(suffix)) {
                colBase = colBase.substring(0, colBase.length - suffix.length);
              }
              if (incorrectBase.endsWith(suffix)) {
                incorrectBase = incorrectBase.substring(0, incorrectBase.length - suffix.length);
              }
            }
            
            if (colBase === incorrectBase || colBase.includes(incorrectBase) || incorrectBase.includes(colBase)) {
              score = 50;
            }
            // Even more aggressive: check if any word in the column name matches
            else {
              const colWords = colBase.split(/[_\s]+/);
              const incorrectWords = incorrectBase.split(/[_\s]+/);
              const hasCommonWord = colWords.some(cw => incorrectWords.some(iw => cw === iw || cw.includes(iw) || iw.includes(cw)));
              if (hasCommonWord && colBase.length > 0 && incorrectBase.length > 0) {
                score = 40; // Lower score but still acceptable
              }
            }
          }
        }
        
        if (score > 0) {
          allMatches.push({ column: col, table: table.name, score, reason: reason || 'fuzzy match' });
          if (!bestMatch || score > bestMatch.score) {
            bestMatch = { column: col, table: table.name, score };
          }
        }
      }
    }
    
    // Log all matches sorted by score for debugging
    if (allMatches.length > 0) {
      allMatches.sort((a, b) => b.score - a.score);
      console.log(`[QUERY] All potential matches (${allMatches.length} total):`);
      allMatches.slice(0, 10).forEach((match, idx) => {
        console.log(`[QUERY]   ${idx + 1}. ${match.table}.${match.column} (score: ${match.score}, reason: ${match.reason})`);
      });
    }

    // Lower threshold for common words - accept matches with score >= 20
    const minScore = incorrectLower.length <= 5 ? 20 : 30; // Lower threshold for short/common words
    if (!bestMatch || bestMatch.score < minScore) {
      console.log(`[QUERY] ⚠️ System catalog matching failed for "${incorrectColumn}" (best score: ${bestMatch?.score || 0}, threshold: ${minScore})`);
      
      // Try semantic matching as fallback - use the query context to find the right column
      console.log(`[QUERY] 🔍 Attempting semantic column matching as fallback...`);
      try {
        const semanticMatch = await findColumnWithSemanticMatching(
          query,
          incorrectColumn,
          possibleTables,
          tableMetadataMap,
          connectionString
        );
        
        if (semanticMatch) {
          console.log(`[QUERY] ✅ Semantic matching found: "${semanticMatch.column}" in table "${semanticMatch.table}" (score: ${semanticMatch.score})`);
          const replacement = tableAlias ? `${tableAlias}.${semanticMatch.column}` : semanticMatch.column;
          const fixedQuery = query.replace(
            new RegExp(`\\b${incorrectColumnFull.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi'),
            replacement
          );
          
          console.log(`[QUERY] Fixed column error using semantic matching:`, {
            original: query.substring(0, 100),
            fixed: fixedQuery.substring(0, 100),
            incorrectColumn: incorrectColumnFull,
            correctColumn: replacement,
            method: 'semantic'
          });
          
          return fixedQuery;
        }
      } catch (semanticError) {
        console.warn(`[QUERY] Semantic matching failed:`, semanticError);
      }
      
      // Last resort: Check if column might be in a related table that needs JOIN
      // Example: "class" might be in Class table, not Student table
      if (tableAlias && possibleTables.length > 0) {
        const currentTable = possibleTables[0];
        console.log(`[QUERY] Column "${incorrectColumn}" not found in table "${currentTable.name}". Checking if related table exists...`);
        
        // Try to find a table that matches the column name (e.g., "class" -> "Class" table)
        const relatedTableName = incorrectColumn.charAt(0).toUpperCase() + incorrectColumn.slice(1);
        const relatedTablePlural = relatedTableName + 's';
        
        // Check if related table exists in database
        try {
          const { getTablesMetadata } = await import('./system-catalog-service');
          const allTablesMetadata = await getTablesMetadata({ connectionString }, [relatedTableName, relatedTablePlural]);
          
          if (allTablesMetadata.length > 0) {
            const relatedTable = allTablesMetadata[0];
            const relatedTableColumns = relatedTable.columns?.map(c => c.name) || [];
            
            // Check if related table has a name column or the column itself
            const nameColumn = relatedTableColumns.find(c => 
              c.toLowerCase() === 'name' || 
              c.toLowerCase() === incorrectLower ||
              c.toLowerCase().includes(incorrectLower)
            );
            
            if (nameColumn) {
              // Check if current table has foreign key to related table
              const currentTableMetadata = tableMetadataMap.get(currentTable.name.toLowerCase());
              const fkColumn = currentTableMetadata?.columns?.find((col: any) => {
                const colLower = col.name.toLowerCase();
                return colLower.includes(relatedTableName.toLowerCase()) ||
                       colLower === `${relatedTableName.toLowerCase()}id` ||
                       colLower === `${relatedTableName.toLowerCase()}_id`;
              });
              
              if (fkColumn) {
                console.log(`[QUERY] Found related table "${relatedTable.name}" with column "${nameColumn}". Adding JOIN...`);
                
                // Add JOIN to related table
                const joinClause = ` JOIN ${relatedTable.name} ON ${currentTable.name}.${fkColumn.name} = ${relatedTable.name}.id`;
                const whereIndex = query.toUpperCase().indexOf(' WHERE ');
                const groupByIndex = query.toUpperCase().indexOf(' GROUP BY ');
                const insertIndex = whereIndex > 0 ? whereIndex : (groupByIndex > 0 ? groupByIndex : query.length);
                
                const fixedQuery = query.slice(0, insertIndex) + joinClause + query.slice(insertIndex);
                
                // Replace column reference
                const replacement = `${relatedTable.name}.${nameColumn}`;
                const finalQuery = fixedQuery.replace(
                  new RegExp(`\\b${incorrectColumnFull.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi'),
                  replacement
                );
                
                console.log(`[QUERY] Fixed by adding JOIN to "${relatedTable.name}" and using "${replacement}"`);
                return finalQuery;
              }
            }
          }
        } catch (error) {
          console.log(`[QUERY] Could not check for related table:`, error);
        }
      }
      
      // Final fallback: Use LLM to fix the column error with full schema context
      console.log(`[QUERY] System catalog matching failed. Using LLM fallback to fix column error...`);
      try {
        const fixedQuery = await fixColumnErrorWithLLM(query, errorMessage, connectionString, tableNames);
        if (fixedQuery && fixedQuery !== query) {
          console.log(`[QUERY] LLM fixed column error successfully`);
          return fixedQuery;
        }
      } catch (llmError) {
        console.error('[QUERY] LLM fallback also failed:', llmError);
      }
      
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


