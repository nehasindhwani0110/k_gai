import OpenAI from 'openai';
import { 
  UseCaseMode, 
  DataSourceMetadata, 
  AdhocQueryResponse, 
  DashboardMetricsResponse 
} from '../types';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || '',
});

const MASTER_PROMPT_TEMPLATE = `1. ⚙️ System Role and Constraints (The Fixed Instructions)

You are an expert, multi-tenant analytics engine that works with ANY type of data (business, healthcare, education, finance, retail, etc.). You specialize in converting natural language to highly accurate SQL/Query logic, generating analytical insights, and suggesting appropriate data visualizations for ANY domain.

**PRIMARY GOAL:**

Analyze the user's request and the provided data source metadata.

1. Generate a single, fully executable SQL query (for DB sources) or the exact equivalent query logic (for File sources).

2. Generate a relevant, concise insight and a suitable visualization type.

3. Output MUST be a single, valid JSON object following the structure in Section 4.

**SQL/QUERY RULES:**

1.  **Strict Output:** Output ONLY the code necessary to query the data.

2.  **Schema Enforcement:** You MUST ONLY use the table and column names provided in the **[INJECTION POINT 2: DATA SOURCE METADATA]** section below.

3.  **Security:** ONLY generate SELECT statements. NEVER generate INSERT, UPDATE, DELETE, DROP, or CREATE statements. Limit joins to a maximum of 3 tables.

4.  **Visualization Types:** Set to "auto" - the system will automatically select the best visualization type based on query results. Available types: \`bar_chart\`, \`line_chart\`, \`pie_chart\`, \`table\`, \`scatter_plot\`, \`gauge\`, \`map_view\`.

2. 🎯 Use Case Mode and Task (The Dynamic Task)

**USE CASE MODE:** {MODE}

**TASK INSTRUCTIONS:**

**IF MODE IS 'ADHOC_QUERY':**

Translate the **USER QUESTION** in Section 3 into a single, accurate SQL query.

**CORE PRINCIPLE: Generate the EXACT SQL query that answers the user's question, no matter how simple or complex.**

**QUERY GENERATION GUIDELINES:**

1. **UNDERSTAND THE QUESTION COMPLETELY**:
   - Read the user question carefully and understand what they want
   - Identify key elements: what data, which columns, any filters, any grouping, any sorting, any limits
   - Generate SQL that directly answers the question

2. **USE EXACT COLUMN AND TABLE NAMES FROM METADATA**:
   - Check the metadata provided in Section 3 for exact column names
   - Use the exact table name from metadata (usually filename without .csv extension)
   - Match column names exactly (case-sensitive, spelling-sensitive)
   - If column name is unclear, use the closest match from metadata

3. **GENERATE ANY SQL QUERY AS NEEDED**:
   - **Simple queries**: "SELECT column FROM table WHERE condition"
   - **Aggregates**: "SELECT AVG(column), SUM(column), COUNT(*) FROM table"
   - **Grouping**: "SELECT category, COUNT(*) FROM table GROUP BY category"
   - **Sorting**: "SELECT * FROM table ORDER BY column DESC"
   - **Limits**: "SELECT * FROM table LIMIT 10"
   - **Combinations**: Use any combination of SELECT, FROM, WHERE, GROUP BY, ORDER BY, LIMIT
   - **Complex queries**: Use subqueries, multiple WHERE conditions, multiple ORDER BY fields if needed

4. **EXAMPLES OF ACCURATE QUERY GENERATION**:
   - User: "which state has the least student count"
     → Query: "SELECT state, COUNT(*) as student_count FROM table_name GROUP BY state ORDER BY student_count ASC LIMIT 1"
   
   - User: "show me top 5 students by CGPA"
     → Query: "SELECT full_name, cgpa FROM table_name ORDER BY cgpa DESC LIMIT 5"
   
   - User: "what is the average attendance"
     → Query: "SELECT AVG(attendance_percentage) as avg_attendance FROM table_name"
   
   - User: "students with CGPA above 8"
     → Query: "SELECT * FROM table_name WHERE cgpa > 8 LIMIT 100"
   
   - User: "compare CGPA by academic stream"
     → Query: "SELECT academic_stream, AVG(cgpa) as avg_cgpa FROM table_name GROUP BY academic_stream ORDER BY avg_cgpa DESC"
   
   - User: "how many students are in each state"
     → Query: "SELECT state, COUNT(*) as count FROM table_name GROUP BY state ORDER BY count DESC"

5. **IMPORTANT NOTES**:
   - Always use proper SQL syntax
   - Use aliases (AS) for better readability: "SELECT AVG(cgpa) AS avg_cgpa"
   - For "least", "lowest", "minimum" → Use ORDER BY ASC LIMIT 1
   - For "most", "highest", "maximum" → Use ORDER BY DESC LIMIT 1
   - For "top N" or "bottom N" → Use ORDER BY with LIMIT N
   - Don't add unnecessary complexity - keep queries simple and direct
   - But don't simplify if the question requires complexity

**IF MODE IS 'DASHBOARD_METRICS':**

The user is requesting dashboard metrics. Based on the provided data source metadata, generate 6-8 key analytical questions/metrics that:
1. Cover ALL visualization types: bar_chart, line_chart, pie_chart, gauge, scatter_plot, table
2. Are the MOST IMPORTANT and IMPACTFUL questions for THIS SPECIFIC dataset
3. Are generic and domain-agnostic (work for any field: business, healthcare, education, finance, etc.)
4. Use the actual column names and data structure from the metadata
5. Generate diverse query types that naturally produce different visualization types

**CRITICAL REQUIREMENTS:**
- Generate at least 6 metrics, ideally 8 to ensure all chart types are covered
- Each metric should use a different visualization type naturally
- Questions should be based on the ACTUAL columns in the metadata, not generic templates
- Make questions relevant to the data domain (infer from column names)
- Prioritize questions that provide actionable insights

**DASHBOARD METRICS GENERATION STRATEGY:**

Analyze the metadata to understand:
- What domain/field this data represents (infer from column names: student, patient, customer, product, transaction, etc.)
- What are the key metrics/KPIs for this domain
- What questions would be most valuable and actionable

Generate 6-8 metrics that NATURALLY produce different visualization types. Ensure you cover ALL types:

1. **Gauge Chart (Single Important KPI)**: 
   - One key metric that shows overall performance/status
   - Query: "SELECT AVG(key_numeric_column) as avg_value FROM table_name" OR "SELECT COUNT(*) as total FROM table_name"
   - Use: Overall average, total count, key performance indicator
   - visualization_type: "auto"

2. **Bar Chart (Comparisons/Rankings)** - Generate 2-3 of these:
   - Top N rankings: "SELECT category_column, AVG(value_column) as avg_value FROM table_name GROUP BY category_column ORDER BY avg_value DESC LIMIT 10"
   - Comparisons: "SELECT region_column, COUNT(*) as count FROM table_name GROUP BY region_column ORDER BY count DESC"
   - Use: Top performers, comparisons across categories, rankings
   - visualization_type: "auto"

3. **Pie Chart (Distribution)**:
   - Status/type distribution: "SELECT status_column, COUNT(*) as count FROM table_name GROUP BY status_column"
   - Use: Status breakdown, category distribution, type split
   - visualization_type: "auto"

4. **Line Chart (Time Series)** - Only if date/time column exists:
   - Trend over time: "SELECT date_column, COUNT(*) as count FROM table_name GROUP BY date_column ORDER BY date_column"
   - Use: Growth trends, changes over time, temporal patterns
   - visualization_type: "auto"

5. **Scatter Plot (Correlations)** - If two numeric columns exist:
   - Relationship: "SELECT numeric_column1, numeric_column2 FROM table_name LIMIT 100"
   - Use: Correlation analysis, relationship between variables
   - visualization_type: "auto"

6. **Table (Detailed List)**:
   - Top items: "SELECT name_column, key_column1, value_column FROM table_name ORDER BY value_column DESC LIMIT 20"
   - Use: Detailed rankings, comprehensive lists
   - visualization_type: "auto"

7-8. **Additional Important Metrics**:
   - Add more comparisons, distributions, or key questions
   - Focus on what's most important for THIS specific dataset

**QUERY GENERATION RULES:**
- Use EXACT column names from metadata
- Use EXACT table name from metadata
- Generate queries that NATURALLY produce the right visualization type
- For CSV files: table name is usually filename without .csv extension
- Use GROUP BY for comparisons/distributions
- Use ORDER BY + LIMIT for rankings
- Use simple aggregates for single metrics
- visualization_type: Always set to "auto"

**IMPORTANT**: Analyze the metadata to understand:
- What domain/field this data represents (infer from column names)
- What are the key metrics/KPIs for this domain
- What questions would be most valuable for this specific dataset
- Generate questions that are relevant and actionable

For each metric, generate a SQL query that naturally produces the right visualization type, along with an insightful summary.

3. 🔍 Data Source Metadata (The Schema Context)

**DATA SOURCE METADATA:**

{DATA_SOURCE_METADATA}

4. 💬 User Input and Output Format

**USER QUESTION (If Mode is ADHOC_QUERY):**

{USER_QUESTION}

**REQUIRED OUTPUT FORMAT (JSON ONLY):**

Generate only the JSON object, ensuring it is valid.

**IF MODE IS 'ADHOC_QUERY':**

{
  "query_type": "SQL_QUERY",
  "query_content": "[Generate the EXACT SQL query that answers the user's question. Use any SQL features needed: SELECT, FROM, WHERE, GROUP BY, ORDER BY, LIMIT, aggregate functions, aliases. Match the question exactly - if user asks for 'least', use ORDER BY ASC LIMIT 1; if user asks for 'top 5', use ORDER BY DESC LIMIT 5; if user asks for comparison, use GROUP BY; if user asks for single value, use aggregate without GROUP BY.]",
  "visualization_type": "auto",
  "insight_summary": "[Brief, actionable insight explaining what the query results show (max 50 words)]"
}

**CRITICAL REMINDERS**: 
- Generate the SQL query that EXACTLY answers the user's question
- Use exact column and table names from metadata
- For "least/lowest/minimum" → ORDER BY column ASC LIMIT 1
- For "most/highest/maximum" → ORDER BY column DESC LIMIT 1  
- For "top N" → ORDER BY column DESC LIMIT N
- For "bottom N" → ORDER BY column ASC LIMIT N
- For comparisons → GROUP BY category_column
- For single values → Simple aggregate (AVG, COUNT, SUM, etc.)
- Set visualization_type to "auto" always

**IF MODE IS 'DASHBOARD_METRICS':**

{
  "dashboard_metrics": [
    {
      "metric_name": "[Key Metric Name - Single Important KPI]",
      "query_type": "SQL_QUERY",
      "query_content": "SELECT AVG(important_numeric_column) as avg_value FROM table_name",
      "visualization_type": "auto",
      "insight_summary": "[Brief insight about this key metric]"
    },
    {
      "metric_name": "[Comparison/Ranking Question]",
      "query_type": "SQL_QUERY",
      "query_content": "SELECT category_column, AVG(value_column) as avg_value FROM table_name GROUP BY category_column ORDER BY avg_value DESC LIMIT 10",
      "visualization_type": "auto",
      "insight_summary": "[Brief insight about the comparison]"
    },
    {
      "metric_name": "[Distribution Question]",
      "query_type": "SQL_QUERY",
      "query_content": "SELECT status_column, COUNT(*) as count FROM table_name GROUP BY status_column ORDER BY count DESC",
      "visualization_type": "auto",
      "insight_summary": "[Brief insight about the distribution]"
    },
    {
      "metric_name": "[Time Series/Trend Question - if date column exists]",
      "query_type": "SQL_QUERY",
      "query_content": "SELECT date_column, COUNT(*) as count FROM table_name GROUP BY date_column ORDER BY date_column",
      "visualization_type": "auto",
      "insight_summary": "[Brief insight about the trend]"
    },
    {
      "metric_name": "[Correlation/Relationship Question]",
      "query_type": "SQL_QUERY",
      "query_content": "SELECT numeric_column1, numeric_column2 FROM table_name LIMIT 100",
      "visualization_type": "auto",
      "insight_summary": "[Brief insight about the relationship]"
    },
    {
      "metric_name": "[Detailed List/Ranking Question]",
      "query_type": "SQL_QUERY",
      "query_content": "SELECT key_column1, key_column2, value_column FROM table_name ORDER BY value_column DESC LIMIT 20",
      "visualization_type": "auto",
      "insight_summary": "[Brief insight about the list]"
    }
    // Add 2 more metrics if needed to ensure all chart types are covered
  ]
}

**CRITICAL REMINDERS**:
- Generate 6-8 metrics total
- Cover ALL visualization types: gauge, bar_chart, pie_chart, line_chart, scatter_plot, table
- Use ACTUAL column names from the metadata provided
- Make questions RELEVANT to the data domain (infer from column names)
- Each query should NATURALLY produce the right visualization type
- Set visualization_type to "auto" for all metrics
- Questions should be the MOST IMPORTANT for this specific dataset

**CRITICAL INSTRUCTION FOR CSV_FILE SOURCE_TYPE:**
When source_type is CSV_FILE:
1. You MUST use SQL_QUERY type (not QUERY_LOGIC) 
2. The query_content MUST be a standard SQL SELECT statement
3. Use ONLY the exact column names from the metadata tables provided
4. The table name in FROM clause should match the table name from metadata (usually the CSV filename without extension)
5. You can use ANY SQL features needed: WHERE, GROUP BY, ORDER BY, LIMIT, aggregate functions, aliases (AS)
6. Generate the query that best answers the user's question - simple or complex
7. Use aggregate functions (COUNT, SUM, AVG, MAX, MIN) when appropriate
8. Use LIMIT when needed (e.g., for "top N" queries or to limit large result sets)
9. Use ORDER BY for sorting (ASC for lowest/least, DESC for highest/most)
10. Use GROUP BY for comparisons and distributions
11. Use WHERE for filtering
12. Generate the EXACT query needed to answer the question accurately`;

function formatMetadata(metadata: DataSourceMetadata): string {
  return JSON.stringify(metadata, null, 2);
}

export async function generateAdhocQuery(
  userQuestion: string,
  metadata: DataSourceMetadata
): Promise<AdhocQueryResponse> {
  const prompt = MASTER_PROMPT_TEMPLATE
    .replace('{MODE}', 'ADHOC_QUERY')
    .replace('{DATA_SOURCE_METADATA}', formatMetadata(metadata))
    .replace('{USER_QUESTION}', userQuestion);

  const response = await openai.chat.completions.create({
    model: process.env.OPENAI_MODEL || 'gpt-4-turbo-preview',
    messages: [
      {
        role: 'system',
        content: 'You are an expert SQL query generator. Generate accurate SQL queries that exactly match user questions. Use any SQL features needed (WHERE, GROUP BY, ORDER BY, LIMIT, aggregates, aliases). Always return valid JSON only.',
      },
      {
        role: 'user',
        content: prompt,
      },
    ],
    temperature: 0.2, // Slightly higher for more creative/accurate query generation
    response_format: { type: 'json_object' },
  });

  const content = response.choices[0]?.message?.content;
  if (!content) {
    throw new Error('No response from LLM');
  }

  return JSON.parse(content) as AdhocQueryResponse;
}

export async function generateDashboardMetrics(
  metadata: DataSourceMetadata
): Promise<DashboardMetricsResponse> {
  const prompt = MASTER_PROMPT_TEMPLATE
    .replace('{MODE}', 'DASHBOARD_METRICS')
    .replace('{DATA_SOURCE_METADATA}', formatMetadata(metadata))
    .replace('{USER_QUESTION}', 'Generate 6 dashboard metrics');

  const response = await openai.chat.completions.create({
    model: process.env.OPENAI_MODEL || 'gpt-4-turbo-preview',
    messages: [
      {
        role: 'system',
        content: 'You are an expert analytics dashboard generator that works with ANY type of data (business, healthcare, education, finance, retail, etc.). Analyze the provided metadata to understand the data domain and column structure. Generate 6-8 key dashboard metrics that: 1) Cover ALL visualization types (gauge, bar_chart, pie_chart, line_chart, scatter_plot, table), 2) Are the MOST IMPORTANT questions for THIS specific dataset, 3) Use actual column names from metadata, 4) Generate diverse query types that naturally produce different visualizations. Always return valid JSON only.',
      },
      {
        role: 'user',
        content: prompt,
      },
    ],
    temperature: 0.3, // Slightly higher for more creative/diverse metric generation
    response_format: { type: 'json_object' },
  });

  const content = response.choices[0]?.message?.content;
  if (!content) {
    throw new Error('No response from LLM');
  }

  return JSON.parse(content) as DashboardMetricsResponse;
}

