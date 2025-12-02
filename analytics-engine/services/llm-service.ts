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

**CRITICAL: DATE/TIME QUERY HANDLING**
When the user question mentions time-related terms (month, year, day, date, period, over time, trends, distribution over time):
1. **IDENTIFY THE RIGHT COLUMNS**:
   - DATE/TIME COLUMN: Find columns with DATE/DATETIME/TIMESTAMP type OR names containing: date, time, year, month, day, period, created, updated, recorded, timestamp
   - METRIC COLUMN: If user asks "X over time" or "X by month", find the column for X (attendance, sales, score, revenue, etc.)
   - DO NOT confuse date columns with metric columns!

2. **USE CORRECT SQL DATE FUNCTIONS**:
   - YEAR(column) - Extract year: "SELECT YEAR(date_col) as year, ..."
   - MONTH(column) - Extract month (1-12): "SELECT MONTH(date_col) as month, ..."
   - DAY(column) - Extract day: "SELECT DAY(date_col) as day, ..."
   - DATE(column) - Extract date part: "SELECT DATE(date_col) as date, ..."

3. **PROPER QUERY PATTERNS** (ALWAYS USE DATE() FOR "OVER MONTH/PERIOD" QUERIES):
   - **CRITICAL**: "distribution over month" or "over period of month" → **ALWAYS USE**: "SELECT DATE(date_col) as date, COUNT(*) as count FROM table GROUP BY DATE(date_col) ORDER BY date"
     → NEVER use MONTH() or YEAR(), MONTH() for "over month" queries - always use DATE() to show daily trends
     → DATE() shows daily trends which is more informative than a single monthly aggregate
     → This ensures charts show multiple data points (one per day) instead of a single monthly value
   - **CRITICAL**: "X over month" or "X over period" (where X is a metric) → **ALWAYS USE**: "SELECT DATE(date_col) as date, AVG(X_col) as avg_x FROM table GROUP BY DATE(date_col) ORDER BY date"
     → NEVER use MONTH() - always use DATE() to show daily trends
     → Shows daily trends within the period, which is more useful than a single monthly value
   - "over time" or "by year" → "SELECT YEAR(date_col) as year, COUNT(*) as count FROM table GROUP BY YEAR(date_col) ORDER BY YEAR(date_col)"
   - "trends" → Use DATE() for day-level trends (most granular and useful for showing patterns)
   - **REMEMBER**: When user says "over month" or "over period", they want to see a TREND with multiple data points, not a single aggregate value. DATE() provides this.

4. **MATCH USER'S INTENT**:
   - **CRITICAL RULE**: If user asks "attendance over month" or "attendance over period" → **MUST USE**: "SELECT DATE(date_col) as date, AVG(attendance_col) as avg_attendance FROM table GROUP BY DATE(date_col) ORDER BY date"
     → NEVER use MONTH() or YEAR(), MONTH() - always use DATE() to ensure multiple data points
   - **CRITICAL RULE**: If user asks "distribution over month" or "distribution over period" → **MUST USE**: "SELECT DATE(date_col) as date, COUNT(*) as count FROM table GROUP BY DATE(date_col) ORDER BY date"
     → NEVER use MONTH() - always use DATE() to ensure multiple data points
   - **KEY INSIGHT**: When user asks "over month" or "over period", they want to see TRENDS with MULTIPLE DATA POINTS. Using DATE() shows daily trends which creates multiple data points. Using MONTH() creates only ONE data point if all records are in the same month, which makes charts look broken.
   - NEVER use wrong columns: Don't use date_of_birth when user asks about attendance!
   - **REMEMBER**: Charts need multiple data points to display properly. DATE() ensures this, MONTH() does not.

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

3. **HANDLE DATE/TIME COLUMNS PROPERLY**:
   - When user asks about "time", "date", "month", "year", "day", "period", "over time", "trends":
     * FIRST: Look for date/time columns in metadata (columns with types: DATE, DATETIME, TIMESTAMP, or names containing: date, time, year, month, day, period, created, updated)
     * Use SQL date/time functions: YEAR(), MONTH(), DAY(), DATE(), DATEPART(), EXTRACT()
     * **CRITICAL**: For "distribution over month" or "X over month" → ALWAYS use DATE() for grouping: GROUP BY DATE(date_column)
     * For "over time" or "trends" → GROUP BY DATE(date_column) or GROUP BY YEAR(date_column) depending on span
     * For "by year" → GROUP BY YEAR(date_column) ORDER BY YEAR
     * For "by month" (when user wants monthly aggregation across multiple months) → GROUP BY MONTH(date_column), YEAR(date_column) ORDER BY YEAR, MONTH
     * ALWAYS use the actual date/time column name from metadata
   
   - Examples of proper date/time queries:
     * "distribution over month" → **ALWAYS USE**: "SELECT DATE(date_column) as date, COUNT(*) as count FROM table GROUP BY DATE(date_column) ORDER BY date"
     * "trends over time" → "SELECT YEAR(date_column) as year, COUNT(*) as count FROM table GROUP BY YEAR(date_column) ORDER BY YEAR(date_column)" OR use DATE() for daily trends
     * "by month" (monthly aggregation) → "SELECT MONTH(date_column) as month, YEAR(date_column) as year, COUNT(*) as count FROM table GROUP BY MONTH(date_column), YEAR(date_column) ORDER BY YEAR(date_column), MONTH(date_column)"
     * "over period" → **ALWAYS USE**: "SELECT DATE(date_column) as date, COUNT(*) as count FROM table GROUP BY DATE(date_column) ORDER BY date"
   
   - IMPORTANT: If user asks about a metric (like "attendance") over time, use the metric column AND the date column:
     * "attendance over month" → **ALWAYS USE**: "SELECT DATE(date_column) as date, AVG(attendance_column) as avg_attendance FROM table GROUP BY DATE(date_column) ORDER BY date"
     * NOT: "SELECT YEAR(date_of_birth)..." when user asks about attendance
     * **REMEMBER**: "over month" means daily trends within a month, not monthly aggregation. Use DATE() not MONTH().
   
   - DO NOT confuse date columns with metric columns:
     * Date columns: Used for grouping/time analysis (date, time, created_at, etc.)
     * Metric columns: Used for calculations (attendance, score, amount, etc.)
     * When user asks "X over time", use: date column for grouping, X column for calculation

4. **GENERATE ANY SQL QUERY AS NEEDED**:
   - **Simple queries**: "SELECT column FROM table WHERE condition"
   - **Aggregates**: "SELECT AVG(column), SUM(column), COUNT(*) FROM table"
   - **Grouping**: "SELECT category, COUNT(*) FROM table GROUP BY category"
   - **Date/Time grouping**: "SELECT YEAR(date_col) as year, MONTH(date_col) as month, COUNT(*) FROM table GROUP BY YEAR(date_col), MONTH(date_col) ORDER BY year, month"
   - **Sorting**: "SELECT * FROM table ORDER BY column DESC"
   - **Limits**: "SELECT * FROM table LIMIT 10"
   - **Combinations**: Use any combination of SELECT, FROM, WHERE, GROUP BY, ORDER BY, LIMIT
   - **Complex queries**: Use subqueries, multiple WHERE conditions, multiple ORDER BY fields if needed

5. **EXAMPLES OF ACCURATE QUERY GENERATION**:
   
   **Category/Grouping Queries:**
   - User: "which state has the least student count"
     → Query: "SELECT state, COUNT(*) as student_count FROM table_name GROUP BY state ORDER BY student_count ASC LIMIT 1"
   
   - User: "compare CGPA by academic stream"
     → Query: "SELECT academic_stream, AVG(cgpa) as avg_cgpa FROM table_name GROUP BY academic_stream ORDER BY avg_cgpa DESC"
   
   **Date/Time Queries (CRITICAL):**
   - User: "distribution over month" or "over period of month"
     → Query: **ALWAYS USE**: "SELECT DATE(date_column) as date, COUNT(*) as count FROM table_name GROUP BY DATE(date_column) ORDER BY date"
     → **NEVER USE**: MONTH() or YEAR(), MONTH() for "over month" queries - always use DATE() to ensure multiple data points
     → DATE() shows daily trends which creates multiple data points for charts. MONTH() creates only one data point if all records are in the same month.
   
   - User: "attendance over month" or "attendance distribution over month"
     → Query: **ALWAYS USE**: "SELECT DATE(date_column) as date, AVG(attendance_column) as avg_attendance FROM table_name GROUP BY DATE(date_column) ORDER BY date"
     → **NEVER USE**: MONTH() or YEAR(), MONTH() - always use DATE() to ensure multiple data points
     → Use attendance_column for calculation, date_column for grouping with DATE() function
     → DATE() ensures charts show daily trends with multiple data points, not a single monthly aggregate
   
   - User: "trends over time" or "over years"
     → Query: "SELECT YEAR(date_column) as year, COUNT(*) as count FROM table_name GROUP BY YEAR(date_column) ORDER BY YEAR(date_column)"
   
   - User: "by month" or "monthly distribution"
     → Query: "SELECT MONTH(date_column) as month, COUNT(*) as count FROM table_name GROUP BY MONTH(date_column) ORDER BY MONTH(date_column)"
   
   - User: "over period" (when date column exists)
     → Query: "SELECT DATE(date_column) as date, COUNT(*) as count FROM table_name GROUP BY DATE(date_column) ORDER BY DATE(date_column)"
   
   **Ranking Queries:**
   - User: "show me top 5 students by CGPA"
     → Query: "SELECT full_name, cgpa FROM table_name ORDER BY cgpa DESC LIMIT 5"
   
   **Single Value Queries:**
   - User: "what is the average attendance"
     → Query: "SELECT AVG(attendance_percentage) as avg_attendance FROM table_name"
   
   **Filter Queries:**
   - User: "students with CGPA above 8"
     → Query: "SELECT * FROM table_name WHERE cgpa > 8 LIMIT 100"
   
   - User: "admission over period of month" or "attendance over period of month" (when date column exists)
     → Query: **ALWAYS USE**: "SELECT DATE(date_column) as date, COUNT(*) as count FROM table_name GROUP BY DATE(date_column) ORDER BY date"
     → **NEVER USE**: YEAR(), MONTH() for "over period of month" - always use DATE() to ensure multiple data points
     OR: "SELECT DATE(date_column) as date, COUNT(*) as count FROM table_name GROUP BY DATE(date_column) ORDER BY date"
   
   - User: "admission trends by year" (when date column exists)
     → Query: "SELECT YEAR(date_column) as year, COUNT(*) as admission_count FROM table_name GROUP BY YEAR(date_column) ORDER BY year"
   
   - User: "monthly attendance average" (when date column exists)
     → Query: "SELECT YEAR(date_column) as year, MONTH(date_column) as month, AVG(attendance_percentage) as avg_attendance FROM table_name GROUP BY YEAR(date_column), MONTH(date_column) ORDER BY year, month"

5. **IMPORTANT NOTES**:
   - Always use proper SQL syntax
   - Use aliases (AS) for better readability: "SELECT AVG(cgpa) AS avg_cgpa"
   - For "least", "lowest", "minimum" → Use ORDER BY ASC LIMIT 1
   - For "most", "highest", "maximum" → Use ORDER BY DESC LIMIT 1
   - For "top N" or "bottom N" → Use ORDER BY with LIMIT N
   - **CRITICAL FOR DATE/TIME QUERIES**: When user asks about "over time", "by month", "by year", "trends", "period", etc.:
     * Check metadata for DATE or DATETIME columns
     * Use date extraction functions: YEAR(column), MONTH(column), DATE(column), DAY(column)
     * **CRITICAL**: For "over period of month" or "over month" → **ALWAYS USE**: "SELECT DATE(date_col) as date, ... GROUP BY DATE(date_col) ORDER BY date"
     * For "by month" (monthly aggregation across multiple months) → Use "SELECT YEAR(date_col), MONTH(date_col), ... GROUP BY YEAR(date_col), MONTH(date_col)"
     * For "by year" → Use "SELECT YEAR(date_col) as year, ... GROUP BY YEAR(date_col)"
     * Always ORDER BY the date fields chronologically (year, month, day)
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
   - Trend over time: "SELECT YEAR(date_column) as year, MONTH(date_column) as month, COUNT(*) as count FROM table_name GROUP BY YEAR(date_column), MONTH(date_column) ORDER BY year, month"
   - OR: "SELECT DATE(date_column) as date, COUNT(*) as count FROM table_name GROUP BY DATE(date_column) ORDER BY date"
   - Use: Growth trends, changes over time, temporal patterns
   - **IMPORTANT**: Always use YEAR(), MONTH(), or DATE() functions for date grouping, never group by raw date column
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
12. Generate the EXACT query needed to answer the question accurately

**CRITICAL: DATE/TIME QUERY HANDLING**
When user asks about time-based queries (month, year, day, date, period, over time, trends):
1. **IDENTIFY COLUMNS CORRECTLY**:
   - Find DATE/TIME column: Look for columns with type DATE, DATETIME, TIMESTAMP, or names containing: date, time, year, month, day, period, created, updated, recorded, timestamp
   - Find METRIC column: If user asks "X over time", find the column for X (attendance, sales, score, etc.)
   - DO NOT confuse date columns with metric columns!

2. **USE PROPER SQL DATE FUNCTIONS**:
   - YEAR(column) - Extract year from date
   - MONTH(column) - Extract month (1-12) from date
   - DAY(column) - Extract day from date
   - DATE(column) - Extract date part (for daily grouping)
   - For CSV files, these functions work on date-like columns

3. **PROPER GROUPING PATTERNS**:
   - **CRITICAL**: "over month" or "over period of month" → **ALWAYS USE**: GROUP BY DATE(date_col) ORDER BY date
     → NEVER use MONTH() or YEAR(), MONTH() for "over month" queries - always use DATE() to ensure multiple data points
   - "by month" (monthly aggregation across multiple months) → GROUP BY MONTH(date_col), YEAR(date_col) ORDER BY YEAR(date_col), MONTH(date_col)
   - "over year" or "by year" → GROUP BY YEAR(date_col) ORDER BY YEAR(date_col)
   - "over time" or "trends" → GROUP BY DATE(date_col) ORDER BY date (preferred for daily trends) or GROUP BY YEAR(date_col) ORDER BY YEAR(date_col)
   - "distribution over period" → **ALWAYS USE**: GROUP BY DATE(date_col) ORDER BY date

4. **METRIC OVER TIME PATTERN**:
   - User: "attendance over month" → **ALWAYS USE**: "SELECT DATE(date_col) as date, AVG(attendance_col) as avg_attendance FROM table GROUP BY DATE(date_col) ORDER BY date"
     → NEVER use MONTH() or YEAR(), MONTH() - always use DATE() to ensure multiple data points
   - User: "sales by year" → "SELECT YEAR(date_col) as year, SUM(sales_col) as total_sales FROM table GROUP BY YEAR(date_col) ORDER BY YEAR(date_col)"
   - Pattern: SELECT date_part(date_col), aggregate(metric_col) FROM table GROUP BY date_part ORDER BY date_part
   - **REMEMBER**: "over month" means daily trends, use DATE(). "by month" means monthly aggregation, use MONTH(), YEAR().

5. **COMMON MISTAKES TO AVOID**:
   - ❌ WRONG: Using date_of_birth when user asks about attendance
   - ✅ RIGHT: Using attendance_column with date_column for grouping
   - ❌ WRONG: "SELECT YEAR(date_of_birth)" when user asks "attendance over month"
   - ❌ WRONG: "SELECT MONTH(attendance_date), AVG(attendance_value)" when user asks "attendance over month" (creates only 1 data point)
   - ✅ RIGHT: "SELECT DATE(attendance_date) as date, AVG(attendance_value) as avg_attendance FROM table GROUP BY DATE(attendance_date) ORDER BY date" when user asks "attendance over month"
   - ❌ WRONG: Not using the metric column when user asks about a specific metric
   - ✅ RIGHT: Always use the metric column for calculations when user mentions a specific metric
   - **CRITICAL**: For "over month" or "over period" queries, ALWAYS use DATE() not MONTH() to ensure multiple data points for charts`;

function formatMetadata(metadata: DataSourceMetadata): string {
  return JSON.stringify(metadata, null, 2);
}

export async function generateAdhocQuery(
  userQuestion: string,
  metadata: DataSourceMetadata,
  connectionString?: string
): Promise<AdhocQueryResponse> {
  // Reduce metadata for large databases based on user question
  let reducedMetadata = metadata;
  const allTables = metadata.tables || [];
  
  if (allTables.length > 10) {
    console.log(`[LLM-SERVICE] Large database detected (${allTables.length} tables), reducing metadata for ad-hoc query`);
    try {
      reducedMetadata = await reduceMetadataForAdhocQuery(userQuestion, metadata, connectionString);
      console.log(`[LLM-SERVICE] Using reduced metadata with ${reducedMetadata.tables.length} tables`);
    } catch (error) {
      console.warn('[LLM-SERVICE] Metadata reduction failed, using full metadata:', error);
      // Continue with full metadata (may fail with very large databases)
    }
  }

  const prompt = MASTER_PROMPT_TEMPLATE
    .replace('{MODE}', 'ADHOC_QUERY')
    .replace('{DATA_SOURCE_METADATA}', formatMetadata(reducedMetadata))
    .replace('{USER_QUESTION}', userQuestion);

  const response = await openai.chat.completions.create({
    model: process.env.OPENAI_MODEL || 'gpt-4-turbo-preview',
    messages: [
      {
        role: 'system',
        content: 'You are an expert SQL query generator. Generate accurate SQL queries that exactly match user questions. Use any SQL features needed (WHERE, GROUP BY, ORDER BY, LIMIT, aggregates, aliases). CRITICAL RULES: 1) For queries asking "over month" or "over period", ALWAYS use DATE(date_column) for grouping, NEVER use MONTH() or YEAR(), MONTH() - this ensures charts show multiple data points. 2) MySQL ONLY_FULL_GROUP_BY mode: ALL non-aggregated columns in SELECT must be in GROUP BY clause. If you need a column that cannot be grouped, wrap it in MIN() or MAX() aggregate function. Always return valid JSON only.',
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
        content: 'You are an expert analytics dashboard generator that works with ANY type of data (business, healthcare, education, finance, retail, etc.). Analyze the provided metadata to understand the data domain and column structure. Generate 6-8 key dashboard metrics that: 1) Cover ALL visualization types (gauge, bar_chart, pie_chart, line_chart, scatter_plot, table), 2) Are the MOST IMPORTANT questions for THIS specific dataset, 3) Use actual column names from metadata, 4) Generate diverse query types that naturally produce different visualizations, 5) Handle date/time queries properly using YEAR(), MONTH(), DAY(), DATE() functions when temporal analysis is needed, 6) CRITICAL: Only generate queries that will return data - use columns that exist in the metadata, avoid filters that might exclude all rows, use COUNT(*) or aggregations that will always return results, prefer queries that show distributions or aggregations rather than specific filters that might be empty. Always return valid JSON only.',
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

/**
 * Agent-based query generation using LangGraph
 * 
 * Uses the QueryAgent for multi-step query generation with validation and refinement
 * The agent internally handles schema exploration to reduce metadata based on the question
 */
export async function generateAdhocQueryWithLangGraphAgent(
  userQuestion: string,
  metadata: DataSourceMetadata,
  connectionString?: string
): Promise<AdhocQueryResponse> {
  try {
    // Dynamic import to avoid errors if LangGraph not installed
    const { QueryAgent } = await import('../agents/query-agent');
    const agent = new QueryAgent();

    console.log('[LLM-SERVICE] Using LangGraph agent for query generation');

    // Reduce metadata first for large databases (agent will further refine during schema exploration)
    let reducedMetadata = metadata;
    const allTables = metadata.tables || [];
    
    if (allTables.length > 10 && connectionString) {
      console.log(`[LLM-SERVICE] Pre-reducing metadata (${allTables.length} tables) before agent execution`);
      try {
        reducedMetadata = await reduceMetadataForAdhocQuery(userQuestion, metadata, connectionString);
        console.log(`[LLM-SERVICE] Pre-reduced to ${reducedMetadata.tables.length} tables`);
      } catch (error) {
        console.warn('[LLM-SERVICE] Pre-reduction failed, agent will handle it:', error);
      }
    }

    // Execute agent workflow (agent will further explore schema if needed)
    const query = await agent.execute(userQuestion, reducedMetadata, connectionString);

    // Generate insight summary
    const insightPrompt = `Explain what this SQL query does and what insights it provides:\n\n${query}\n\nQuestion: ${userQuestion}`;
    
    const insightResponse = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-4-turbo-preview',
      messages: [
        {
          role: 'user',
          content: insightPrompt,
        },
      ],
      temperature: 0.3,
      max_tokens: 150,
    });

    return {
      query_type: 'SQL_QUERY',
      query_content: query,
      visualization_type: 'auto',
      insight_summary: insightResponse.choices[0]?.message?.content || 'Query generated using LangGraph agent',
    };
  } catch (error) {
    console.error('[LLM-SERVICE] LangGraph agent failed, falling back to direct LLM:', error);
    // Fallback to original method (which also reduces metadata)
    return generateAdhocQuery(userQuestion, metadata, connectionString);
  }
}

/**
 * Identifies key tables for dashboard metrics generation
 * 
 * For dashboard metrics, we want tables that have:
 * - Numeric columns (for aggregations)
 * - Date columns (for time series)
 * - Category columns (for distributions)
 */
async function identifyKeyTablesForDashboard(
  metadata: DataSourceMetadata,
  maxTables: number = 10
): Promise<string[]> {
  const allTables = metadata.tables || [];
  
  // If we have few tables, return all
  if (allTables.length <= maxTables) {
    return allTables.map(t => t.name);
  }

    // Score tables based on their usefulness for dashboard metrics
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
  
  console.log(`[LLM-SERVICE] Selected ${selectedTables.length} key tables for dashboard: ${selectedTables.join(', ')}`);
  
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

/**
 * Reduces metadata for ad-hoc queries based on user question
 * 
 * For ad-hoc queries, we need to identify relevant tables based on the question,
 * not just based on column types. This prevents context length errors with large databases.
 */
async function reduceMetadataForAdhocQuery(
  userQuestion: string,
  metadata: DataSourceMetadata,
  connectionString?: string
): Promise<DataSourceMetadata> {
  const allTables = metadata.tables || [];
  
  // If we have few tables, return all
  if (allTables.length <= 10) {
    return metadata;
  }

  try {
    // For SQL databases with connection string, use schema exploration
    if (metadata.source_type === 'SQL_DB' && connectionString) {
      try {
        const { exploreSchemaWithPythonAgent } = await import('./python-agent-bridge');
        
        console.log(`[LLM-SERVICE] Exploring schema for question: "${userQuestion}"`);
        const exploredMetadata = await exploreSchemaWithPythonAgent(
          userQuestion,
          connectionString
        );
        
        console.log(`[LLM-SERVICE] Schema exploration found ${exploredMetadata.tables?.length || 0} relevant tables`);
        return exploredMetadata;
      } catch (error) {
        console.warn('[LLM-SERVICE] Schema exploration failed, using table identification:', error);
        // Fall through to table identification approach
      }
    }
    
    // Fallback: Use LLM to identify relevant tables based on question
    const { identifyRelevantTables } = await import('../agents/tools/schema-explorer');
    const relevantTables = await identifyRelevantTables(
      userQuestion,
      allTables.map(t => t.name)
    );
    
    console.log(`[LLM-SERVICE] Identified ${relevantTables.length} relevant tables for question: ${relevantTables.join(', ')}`);
    
    return createReducedMetadata(metadata, relevantTables);
  } catch (error) {
    console.error('[LLM-SERVICE] Metadata reduction failed, using first 10 tables:', error);
    // Last resort: use first 10 tables
    return createReducedMetadata(metadata, allTables.slice(0, 10).map(t => t.name));
  }
}

/**
 * Agent-based dashboard metrics generation
 * 
 * Uses schema exploration to identify key tables and reduce metadata size
 * before generating dashboard metrics. This prevents context length errors
 * with large databases.
 */
export async function generateDashboardMetricsWithAgent(
  metadata: DataSourceMetadata,
  connectionString?: string
): Promise<DashboardMetricsResponse> {
  try {
    console.log('[LLM-SERVICE] Using agent-based approach for dashboard metrics');
    
    // For SQL databases with connection string, use schema exploration
    if (metadata.source_type === 'SQL_DB' && connectionString) {
      try {
        // Import schema explorer
        const { exploreSchemaWithPythonAgent } = await import('./python-agent-bridge');
        
        // Use a generic question to identify key tables for dashboard
        const dashboardQuestion = 'Generate dashboard metrics showing key insights, trends, distributions, and comparisons';
        
        console.log('[LLM-SERVICE] Exploring schema for dashboard metrics');
        const exploredMetadata = await exploreSchemaWithPythonAgent(
          dashboardQuestion,
          connectionString
        );
        
        // Use explored metadata (already reduced to relevant tables)
        console.log(`[LLM-SERVICE] Using explored metadata with ${exploredMetadata.tables?.length || 0} tables`);
        return await generateDashboardMetrics(exploredMetadata);
      } catch (error) {
        console.warn('[LLM-SERVICE] Schema exploration failed, using table selection:', error);
        // Fall through to table selection approach
      }
    }
    
    // For other cases or if schema exploration fails, use table selection
    const allTables = metadata.tables.map(t => t.name);
    
    if (allTables.length > 10) {
      console.log(`[LLM-SERVICE] Large database detected (${allTables.length} tables), selecting key tables`);
      
      // Identify key tables
      const keyTables = await identifyKeyTablesForDashboard(metadata, 10);
      
      // Create reduced metadata
      const reducedMetadata = createReducedMetadata(metadata, keyTables);
      
      console.log(`[LLM-SERVICE] Using reduced metadata with ${reducedMetadata.tables.length} tables`);
      return await generateDashboardMetrics(reducedMetadata);
    }
    
    // For smaller databases, use original metadata
    console.log('[LLM-SERVICE] Using full metadata for dashboard metrics');
    return await generateDashboardMetrics(metadata);
    
  } catch (error) {
    console.error('[LLM-SERVICE] Agent-based dashboard metrics failed, falling back to direct LLM:', error);
    // Fallback: try with reduced metadata if original fails
    try {
      const keyTables = await identifyKeyTablesForDashboard(metadata, 8);
      const reducedMetadata = createReducedMetadata(metadata, keyTables);
      return await generateDashboardMetrics(reducedMetadata);
    } catch (fallbackError) {
      console.error('[LLM-SERVICE] Fallback also failed, using original method:', fallbackError);
      // Last resort: use original method (may fail with very large databases)
      return await generateDashboardMetrics(metadata);
    }
  }
}

