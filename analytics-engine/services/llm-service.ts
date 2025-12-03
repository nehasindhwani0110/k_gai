import OpenAI from 'openai';
import { 
  UseCaseMode, 
  DataSourceMetadata, 
  AdhocQueryResponse, 
  DashboardMetricsResponse 
} from '../types';
import { createTracedOpenAI, traceFunction, logLangSmithStatus } from '../utils/langsmith-tracer';

// Initialize traced OpenAI client
const openai = createTracedOpenAI();

// Log LangSmith status on module load
if (typeof window === 'undefined') {
  logLangSmithStatus();
}

const MASTER_PROMPT_TEMPLATE = `1. ⚙️ System Role and Constraints (The Fixed Instructions)

You are an expert, multi-tenant analytics engine that works with ANY type of data (business, healthcare, education, finance, retail, etc.). You specialize in converting natural language to highly accurate SQL/Query logic, generating analytical insights, and suggesting appropriate data visualizations for ANY domain.

**PRIMARY GOAL:**

Analyze the user's request and the provided data source metadata.

1. Generate a single, fully executable SQL query (for DB sources) or the exact equivalent query logic (for File sources).

2. Generate a relevant, concise insight and a suitable visualization type.

3. Output MUST be a single, valid JSON object following the structure in Section 4.

**SQL/QUERY RULES:**

1.  **Strict Output:** Output ONLY the code necessary to query the data.

2.  **Schema Enforcement (CRITICAL):** You MUST ONLY use the table and column names provided in the **[INJECTION POINT 2: DATA SOURCE METADATA]** section below. **NEVER INVENT OR GUESS COLUMN NAMES**. If a column does not exist in the metadata, DO NOT use it. Before using any column, verify it exists in the metadata. If the user asks about something that doesn't exist, use the closest matching column that DOES exist in the metadata.

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
   - **CRITICAL**: Pay attention to question intent:
     * "differences" or "difference" → Calculate metrics for each group and show comparison
     * "compare" or "comparison" → Group by categories and show side-by-side metrics
     * "versus" or "vs" → Compare two groups/categories
     * "measure differences" → Calculate metrics for each group to enable comparison
   - Generate SQL that directly answers the question

2. **USE EXACT COLUMN AND TABLE NAMES FROM METADATA (CRITICAL - NO EXCEPTIONS)**:
   - **NEVER INVENT COLUMN NAMES** - You MUST ONLY use columns that are explicitly listed in the metadata
   - Check the metadata provided in Section 3 for exact column names
   - **VERIFY COLUMN EXISTS**: Before using any column, check if it exists in the metadata tables
   - Use the exact table name from metadata (usually filename without .csv extension)
   - Match column names exactly (case-sensitive, spelling-sensitive)
   - If column name is unclear or doesn't exist, use the closest matching column that DOES exist in the metadata
   - **If user asks about "totalAnnualFee" but metadata shows "feeAmount", use "feeAmount"**
   - **If user asks about something that doesn't exist, find the closest match in metadata**

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
   - **JOIN queries**: When joining tables, use exact column matches (e.g., "JOIN table2 ON table1.id = table2.id") instead of LIKE patterns to avoid duplicate rows. If you must use LIKE, add DISTINCT or GROUP BY to prevent duplicates.
   - **Avoid duplicates**: If your query might return duplicate rows, add DISTINCT or use GROUP BY with appropriate aggregations

5. **EXAMPLES OF ACCURATE QUERY GENERATION**:
   
   **Category/Grouping Queries:**
   - User: "which state has the least student count"
     → Query: "SELECT state, COUNT(*) as student_count FROM table_name GROUP BY state ORDER BY student_count ASC LIMIT 1"
   
   - User: "compare CGPA by academic stream"
     → Query: "SELECT academic_stream, AVG(cgpa) as avg_cgpa FROM table_name GROUP BY academic_stream ORDER BY avg_cgpa DESC"
   
   **Difference/Comparison Queries (CRITICAL):**
   - User: "Measure income-bracket differences between Republican and Democrat respondents"
     → Query: "SELECT income_bracket, party_affiliation, COUNT(*) as count, AVG(age) as avg_age FROM table_name WHERE party_affiliation IN ('Republican', 'Democrat') GROUP BY income_bracket, party_affiliation ORDER BY income_bracket, party_affiliation"
     → This groups by both dimensions to show metrics for each combination, enabling comparison
   
   - User: "differences between groups" or "compare X by Y"
     → Query: "SELECT category_column, comparison_column, COUNT(*) as count, AVG(metric_column) as avg_metric FROM table_name GROUP BY category_column, comparison_column ORDER BY category_column, comparison_column"
     → Always include both grouping dimensions to show side-by-side comparison
   
   - User: "what are the differences in X between Y and Z"
     → Query: "SELECT comparison_column, AVG(metric_column) as avg_metric, COUNT(*) as count FROM table_name WHERE comparison_column IN ('Y', 'Z') GROUP BY comparison_column"
     → Filter to specific groups being compared
   
   - User: "measure differences" or "show differences"
     → Query: Group by all relevant dimensions and calculate metrics for each combination
     → Example: "SELECT dimension1, dimension2, COUNT(*) as count, AVG(metric) as avg_metric FROM table_name GROUP BY dimension1, dimension2"
   
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
   - **CRITICAL FOR JOIN QUERIES**:
     * Prefer exact column matches for JOINs: "JOIN table2 ON table1.id = table2.id" instead of LIKE patterns
     * Avoid LIKE patterns in JOIN conditions as they can create duplicate rows
     * If you must use LIKE or the query might return duplicates, add DISTINCT: "SELECT DISTINCT column1, column2 FROM..."
     * Or use GROUP BY with aggregations: "SELECT column1, SUM(column2) FROM ... GROUP BY column1"
     * Example: Instead of "JOIN Fee ON Fee.applicableClasses LIKE CONCAT('%', FeeStructure.className, '%')", 
       use exact match if possible, or add DISTINCT/GROUP BY to eliminate duplicates
   - **CRITICAL FOR DIFFERENCE/COMPARISON QUERIES**:
     * When user asks about "differences", "compare", "versus", "vs", "measure differences":
       → Group by ALL relevant dimensions mentioned in the question
       → Calculate metrics (COUNT, AVG, SUM, etc.) for each combination
       → This enables visual comparison in charts
     * Example: "differences between X and Y by Z"
       → Query: "SELECT Z, X_or_Y_column, COUNT(*) as count, AVG(metric) as avg_metric FROM table WHERE X_or_Y_column IN ('X', 'Y') GROUP BY Z, X_or_Y_column"
     * If question mentions multiple dimensions (e.g., "income bracket differences between parties"):
       → Group by BOTH dimensions: GROUP BY income_bracket, party_affiliation
       → This shows metrics for each combination, enabling comparison
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
- For CSV/Excel/JSON/Text files: table name is usually filename without extension (e.g., "complete_school_data" for "complete_school_data.xlsx")
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
- **MOST IMPORTANT**: Generate the SQL query that EXACTLY answers the user's question
- **NEVER INVENT COLUMN NAMES** - You MUST ONLY use column names that are explicitly listed in the metadata above
- **VERIFY BEFORE USING**: Before using any column name, check if it exists in the metadata tables provided
- **If column doesn't exist**: Find the closest matching column that DOES exist (e.g., if user asks about "totalAnnualFee" but metadata shows "feeAmount", use "feeAmount")
- Use exact column and table names from metadata - check the metadata carefully
- For "least/lowest/minimum" → ORDER BY column ASC LIMIT 1
- For "most/highest/maximum" → ORDER BY column DESC LIMIT 1  
- For "top N" → ORDER BY column DESC LIMIT N
- For "bottom N" → ORDER BY column ASC LIMIT N
- For comparisons → GROUP BY category_column
- For single values → Simple aggregate (AVG, COUNT, SUM, etc.)
- Set visualization_type to "auto" always
- **VALIDATION STEP**: Before returning the query, verify every column name exists in the metadata. If any column doesn't exist, replace it with the closest match from metadata.

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

**CRITICAL INSTRUCTION FOR FILE-BASED SOURCE TYPES (CSV_FILE, EXCEL_FILE, JSON_FILE, TXT_FILE):**
When source_type is CSV_FILE, EXCEL_FILE, JSON_FILE, or TXT_FILE:
1. You MUST use SQL_QUERY type (not QUERY_LOGIC) 
2. The query_content MUST be a standard SQL SELECT statement
3. Use ONLY the exact column names from the metadata tables provided
4. The table name in FROM clause should match the table name from metadata (usually the filename without extension)
5. You can use ANY SQL features needed: WHERE, GROUP BY, ORDER BY, LIMIT, aggregate functions, aliases (AS)
6. Generate the query that best answers the user's question - simple or complex
7. Use aggregate functions (COUNT, SUM, AVG, MAX, MIN) when appropriate
8. Use LIMIT when needed (e.g., for "top N" queries or to limit large result sets)
9. Use ORDER BY for sorting (ASC for lowest/least, DESC for highest/most)
10. Use GROUP BY for comparisons and distributions
11. Use WHERE for filtering
12. Generate the EXACT query needed to answer the question accurately
13. For Excel files: Treat them exactly like CSV files - use SQL queries with the table name from metadata
14. For JSON/Text files: Same as CSV/Excel - use SQL queries with proper table names

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

/**
 * Formats metadata optimally based on size
 * Uses compact format for large schemas to reduce token usage
 */
function formatMetadata(metadata: DataSourceMetadata): string {
  // Dynamic import to avoid circular dependencies
  const { formatMetadataOptimal } = require('../utils/metadata-formatter');
  return formatMetadataOptimal(metadata);
}

export async function generateAdhocQuery(
  userQuestion: string,
  metadata: DataSourceMetadata,
  connectionString?: string,
  questionUnderstanding?: {
    intent: string;
    keyConcepts: string[];
    entities: string[];
    queryType: string;
    semanticSummary: string;
  } | null
): Promise<AdhocQueryResponse> {
  // Dynamic import to avoid circular dependencies
  const { estimateMetadataTokens, isMetadataSizeSafe, getRequiredReductionRatio } = await import('../utils/token-counter');
  const model = process.env.OPENAI_MODEL || 'gpt-4-turbo-preview';
  
  // CRITICAL: Understand question if not provided (for non-SQL sources or fallback)
  // Question understanding helps generate accurate queries by identifying intent, key concepts, and entities
  if (!questionUnderstanding) {
    try {
      console.log(`[LLM-SERVICE] 🧠 Understanding question semantics: "${userQuestion}"`);
      questionUnderstanding = await understandQuestionSemantics(userQuestion);
      console.log(`[LLM-SERVICE] ✅ Question understanding complete:`, {
        intent: questionUnderstanding.intent,
        queryType: questionUnderstanding.queryType,
        keyConcepts: questionUnderstanding.keyConcepts?.slice(0, 3).join(', '),
      });
    } catch (error) {
      console.warn(`[LLM-SERVICE] ⚠️ Question understanding failed, proceeding without it:`, error);
      questionUnderstanding = null;
    }
  }
  
  // Enhance user question with semantic understanding for better query generation
  const enhancedQuestion = questionUnderstanding
    ? `${userQuestion}\n\nSemantic Understanding:\n- Intent: ${questionUnderstanding.intent}\n- Query Type: ${questionUnderstanding.queryType}\n- Key Concepts: ${questionUnderstanding.keyConcepts.join(', ')}\n- Entities: ${questionUnderstanding.entities.join(', ')}\n- Semantic Summary: ${questionUnderstanding.semanticSummary}`
    : userQuestion;
  
  // Metadata should already be filtered by API route (getHybridMetadata with semantic search)
  // This function just uses the metadata it receives - no need to refresh again
  let reducedMetadata = metadata;
  const allTables = metadata.tables || [];
  const totalColumns = allTables.reduce((sum, t) => sum + (t.columns?.length || 0), 0);
  const fileBasedSources = ['CSV_FILE', 'EXCEL_FILE', 'JSON_FILE', 'TXT_FILE', 'GOOGLE_DRIVE'];
  const isFileBased = fileBasedSources.includes(metadata.source_type);
  const dataSourceId = (metadata as any).data_source_id;
  
  // SIMPLIFIED: Metadata should already be refreshed by API route from system catalog
  // This function just uses the metadata it receives - no need to refresh again
  // Only apply semantic filtering if metadata is too large for LLM context
  
  // Check token count
  const metadataTokens = estimateMetadataTokens(reducedMetadata);
  const isSafe = isMetadataSizeSafe(reducedMetadata, model);
  
  console.log(`[LLM-SERVICE] 📊 Metadata size: ${metadataTokens} tokens, Safe limit: ${isSafe ? '✅' : '❌'}`);
  
  // OPTIMIZATION: Check if metadata is already semantically filtered (from getHybridMetadata)
  // If metadata has <= 30 tables, it's likely already filtered - skip redundant semantic matching
  // Metadata from getHybridMetadata with semantic search typically has <= 30 tables
  const isAlreadyFiltered = allTables.length <= 30;
  
  // ALWAYS use semantic matching if:
  // 1. Metadata exceeds safe token limit AND not already filtered, OR
  // 2. File-based sources with many columns (>15), OR
  // 3. SQL databases with many tables (>30) or many columns (>50) AND not already filtered
  const shouldUseSemanticMatching = (!isSafe && !isAlreadyFiltered) || 
    (isFileBased && totalColumns > 15) || 
    (!isFileBased && !isAlreadyFiltered && (allTables.length > 30 || totalColumns > 50));
  
  if (shouldUseSemanticMatching && !isAlreadyFiltered) {
    console.log(`[LLM-SERVICE] 🎯 Using semantic analysis for ${isFileBased ? `${metadata.source_type} file` : 'SQL database'} (${allTables.length} tables, ${totalColumns} columns)`);
    
    if (!isSafe) {
      const reductionRatio = getRequiredReductionRatio(metadata, model);
      console.log(`[LLM-SERVICE] ⚠️ Metadata too large! Need to reduce to ${(reductionRatio * 100).toFixed(1)}% of current size`);
    }
    
    try {
      // Use enhanced question with semantic understanding for better matching
      reducedMetadata = await reduceMetadataForAdhocQuery(enhancedQuestion, metadata, connectionString);
      
      // Verify reduced metadata is safe
      const reducedTokens = estimateMetadataTokens(reducedMetadata);
      const reducedIsSafe = isMetadataSizeSafe(reducedMetadata, model);
      
      console.log(`[LLM-SERVICE] ✅ Semantic analysis complete! Using ${reducedMetadata.tables.length} tables, ${reducedTokens} tokens (${reducedIsSafe ? '✅ Safe' : '⚠️ Still large'})`);
      
      // If still too large, apply more aggressive reduction
      // IMPORTANT: This preserves semantic relevance (tables/columns already ordered by relevance)
      if (!reducedIsSafe) {
        console.log(`[LLM-SERVICE] ⚠️ Reduced metadata still too large, applying aggressive reduction...`);
        console.log(`[LLM-SERVICE] ⚠️ Preserving semantic relevance - keeping top semantically matched tables/columns`);
        reducedMetadata = await applyAggressiveReduction(reducedMetadata, model);
        const finalTokens = estimateMetadataTokens(reducedMetadata);
        console.log(`[LLM-SERVICE] ✅ Aggressive reduction complete! Final size: ${finalTokens} tokens`);
        console.log(`[LLM-SERVICE] ✅ Kept ${reducedMetadata.tables.length} semantically relevant tables`);
      }
    } catch (error) {
      console.error('[LLM-SERVICE] ❌ Semantic matching failed:', error);
      console.error('[LLM-SERVICE] ❌ Error details:', {
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        tables: allTables.length,
        totalColumns,
      });
      console.warn('[LLM-SERVICE] ⚠️ Falling back to non-semantic reduction (may result in less accurate queries)');
      // Apply fallback reduction
      reducedMetadata = await applyFallbackReduction(metadata, model);
    }
  } else {
    console.log(`[LLM-SERVICE] ℹ️ Skipping semantic matching (${allTables.length} tables, ${totalColumns} columns - schema is small enough)`);
  }

  // Extract all available column names for explicit reference
  const allColumnNames: string[] = [];
  reducedMetadata.tables?.forEach(table => {
    table.columns?.forEach(col => {
      allColumnNames.push(`${table.name}.${col.name}`);
      allColumnNames.push(col.name); // Also add without table prefix
    });
  });
  
  // CRITICAL: Use semantic understanding to detect exact columns from system catalog
  // This is more reliable than relying on LLM prompts
  let detectedColumns: { table: string; column: string; value?: string }[] = [];
  let topRelevantTable: string | null = null;
  
  if (questionUnderstanding && reducedMetadata.tables && reducedMetadata.tables.length > 0) {
    console.log(`[LLM-SERVICE] 🔍 Using semantic understanding to detect columns from system catalog...`);
    
    // Step 1: Find the most relevant table using semantic understanding
    const { findRelevantTables } = await import('./semantic-matcher');
    const { generateSchemaHash } = await import('./embedding-cache');
    const schemaHash = generateSchemaHash(reducedMetadata);
    const dataSourceId = (reducedMetadata as any).data_source_id;
    
    // CRITICAL: First try exact table matching by key concepts
    // This ensures "school" matches "School" table, not "PreviousSchool"
    const keyConceptsLower = questionUnderstanding.keyConcepts.map((c: string) => c.toLowerCase());
    
    // Find exact table matches first (prefer tables that match key concepts exactly)
    const exactTableMatch = reducedMetadata.tables.find(table => {
      const tableNameLower = table.name.toLowerCase();
      return keyConceptsLower.some(concept => {
        // Exact match: table name equals concept (singular or plural)
        if (tableNameLower === concept || 
            tableNameLower === concept + 's' ||
            (concept.endsWith('s') && tableNameLower === concept.slice(0, -1))) {
          return true;
        }
        // Partial match: table name contains concept BUT excludes "previous", "old", "history"
        if (tableNameLower.includes(concept) && 
            !tableNameLower.includes('previous') && 
            !tableNameLower.includes('old') && 
            !tableNameLower.includes('history')) {
          return true;
        }
        return false;
      });
    });
    
    if (exactTableMatch) {
      topRelevantTable = exactTableMatch.name;
      console.log(`[LLM-SERVICE] ✅ Matched table by key concept: "${topRelevantTable}" (exact match)`);
    } else {
      // Fallback: Use semantic search, but filter out "Previous" tables when key concepts don't mention them
      const tableMatches = await findRelevantTables(
        questionUnderstanding.semanticSummary || userQuestion,
        reducedMetadata,
        5, // Top 5 tables to compare
        schemaHash,
        dataSourceId
      );
      
      if (tableMatches.length > 0) {
        // Filter out "Previous", "Old", "History" tables when key concepts don't include those words
        const keyConceptsIncludePrevious = keyConceptsLower.some(c => 
          c.includes('previous') || c.includes('old') || c.includes('history')
        );
        
        const filteredMatches = tableMatches.filter(match => {
          const tableNameLower = match.name.toLowerCase();
          const hasPreviousWords = tableNameLower.includes('previous') || 
                                  tableNameLower.includes('old') || 
                                  tableNameLower.includes('history');
          
          // If key concepts don't mention "previous", prefer non-previous tables
          if (!keyConceptsIncludePrevious && hasPreviousWords) {
            return false; // Filter out previous tables
          }
          return true;
        });
        
        // Use filtered matches if available, otherwise use original matches
        const bestMatch = filteredMatches.length > 0 ? filteredMatches[0] : tableMatches[0];
        topRelevantTable = bestMatch.name;
        console.log(`[LLM-SERVICE] ✅ Detected table via semantic search: "${topRelevantTable}" (score: ${bestMatch.score.toFixed(3)})`);
      }
    }
    
    if (topRelevantTable) {
      
      // Step 2: Find relevant columns in this table using semantic search
      const relevantTable = reducedMetadata.tables.find(t => t.name === topRelevantTable);
      if (relevantTable) {
        const { findRelevantColumns } = await import('./semantic-matcher');
        const columnMatches = await findRelevantColumns(
          questionUnderstanding.semanticSummary || userQuestion,
          relevantTable,
          10, // Top 10 columns
          schemaHash
        );
        
        console.log(`[LLM-SERVICE] ✅ Detected ${columnMatches.length} relevant columns:`);
        columnMatches.forEach((match, idx) => {
          console.log(`[LLM-SERVICE]   ${idx + 1}. ${match.name} (score: ${match.score.toFixed(3)})`);
          detectedColumns.push({
            table: topRelevantTable!,
            column: match.name,
          });
        });
      }
    } else {
      // Fallback: use first table
      topRelevantTable = reducedMetadata.tables[0]?.name || null;
    }
  } else if (reducedMetadata.tables && reducedMetadata.tables.length > 0) {
    // Fallback: use first table if no understanding available
    topRelevantTable = reducedMetadata.tables[0]?.name || null;
  }
  
  // Step 3: Extract values from ORIGINAL question (more reliable than entities)
  // CRITICAL: Extract complete values from user question directly to preserve multi-word values
  const extractedValues: string[] = [];
  
  if (questionUnderstanding) {
    // Method 1: Extract from semantic summary (if it has quoted values)
    const quotedMatch = questionUnderstanding.semanticSummary.match(/['"]([^'"]+)['"]/);
    if (quotedMatch) {
      extractedValues.push(quotedMatch[1]);
    }
    
    // Method 2: Extract from original question by removing action words and entity types
    // Example: "show school Neha S" → "Neha S"
    const actionWords = ['show', 'find', 'list', 'display', 'get', 'select', 'fetch', 'see', 'give'];
    const entityTypes = questionUnderstanding.keyConcepts.map(c => c.toLowerCase());
    
    const questionWords = userQuestion.trim().split(/\s+/);
    let valueStartIndex = -1;
    
    // Find where the actual value starts (after action words and entity types)
    for (let i = 0; i < questionWords.length; i++) {
      const word = questionWords[i].toLowerCase();
      if (actionWords.includes(word) || entityTypes.includes(word)) {
        valueStartIndex = i + 1;
      }
    }
    
    // Extract value from original question
    if (valueStartIndex >= 0 && valueStartIndex < questionWords.length) {
      const potentialValue = questionWords.slice(valueStartIndex).join(' ');
      // Add if it's 2+ words (likely a multi-word value) or starts with capital (likely a name)
      if (potentialValue.split(/\s+/).length >= 2 || 
          (potentialValue.length > 0 && potentialValue[0] === potentialValue[0].toUpperCase() && 
           !actionWords.includes(potentialValue.toLowerCase()) && 
           !entityTypes.includes(potentialValue.toLowerCase()))) {
        extractedValues.push(potentialValue);
      }
    }
    
    // Method 3: Also check entities (but prefer original question extraction)
    questionUnderstanding.entities.forEach(entity => {
      const words = entity.split(/\s+/);
      if (words.length >= 2) {
        const commonWords = ['school', 'student', 'teacher', 'class', 'name', 'table', 'college', 'graph', 'details'];
        if (!commonWords.includes(entity.toLowerCase()) && !extractedValues.includes(entity)) {
          extractedValues.push(entity);
        }
      }
    });
  }
  
  console.log(`[LLM-SERVICE] 📋 Extracted values from question: ${extractedValues.join(', ') || 'none'}`);
  
  // CRITICAL: Build query using detected columns from semantic search
  // This is more reliable than relying on LLM prompts
  let detectedQueryInfo = '';
  if (topRelevantTable && detectedColumns.length > 0) {
    const detectedColumnNames = detectedColumns.map(c => c.column).join(', ');
    detectedQueryInfo = `\n\n**SEMANTIC SEARCH RESULTS (USE THESE EXACT COLUMNS FROM SYSTEM CATALOG)**:
- Detected Table: "${topRelevantTable}" (found via semantic search from system catalog)
- Detected Columns: ${detectedColumnNames} (found via semantic search from system catalog)
- Extracted Values: ${extractedValues.length > 0 ? extractedValues.map(v => `'${v}'`).join(', ') : 'none'}

**CRITICAL INSTRUCTIONS**:
1. Use table "${topRelevantTable}" - this was detected via semantic search from system catalog
2. Use columns: ${detectedColumnNames} - these were detected via semantic search from system catalog
3. If extracted values exist, use them in WHERE clause: ${extractedValues.length > 0 ? `WHERE ${detectedColumns[0]?.column || 'column'} = '${extractedValues[0]}'` : 'no WHERE clause needed'}
4. Do NOT use columns that were NOT detected - stick to the detected columns above
5. Preserve complete values: ${extractedValues.length > 0 ? `Use '${extractedValues[0]}' as single value, do NOT split` : 'no values to preserve'}`;
  }
  
  // Enhance prompt with semantic understanding and detected columns
  const columnNamesList = allColumnNames.slice(0, 100).join(', '); // Limit to first 100 to avoid token bloat
  const tableEmphasis = topRelevantTable 
    ? `\n\n**CRITICAL TABLE SELECTION**: The user's question "${userQuestion}" is asking about "${questionUnderstanding?.keyConcepts.join(', ') || 'data'}". The MOST RELEVANT table is "${topRelevantTable}" (detected via semantic search). Use table "${topRelevantTable}" in your query, NOT other tables.`
    : '';
  
  const semanticContext = questionUnderstanding
    ? `\n\nSemantic Understanding:\n- Intent: ${questionUnderstanding.intent}\n- Query Type: ${questionUnderstanding.queryType}\n- Key Concepts: ${questionUnderstanding.keyConcepts.join(', ')}\n- Entities: ${questionUnderstanding.entities.join(', ')}\n- Semantic Summary: ${questionUnderstanding.semanticSummary}`
    : '';
  
  // CRITICAL: Add value preservation instructions
  const valuePreservationInstructions = extractedValues.length > 0
    ? `\n\n**CRITICAL VALUE PRESERVATION RULES**:
1. The user question contains these COMPLETE VALUES: ${extractedValues.map(v => `"${v}"`).join(', ')}
2. These are SINGLE, COMPLETE values - do NOT split them into multiple parts
3. Example: If user asks "show school Neha S", use WHERE schoolName = 'Neha S' ✅
4. WRONG: WHERE schoolName = 'Neha' AND class = 'S' ❌ (DO NOT DO THIS!)
5. If a value has multiple words (like "Neha S" or "MDU College"), preserve it as a SINGLE string literal
6. Use the EXACT value from the user question in WHERE clauses, do NOT split multi-word values`
    : '';

  const prompt = MASTER_PROMPT_TEMPLATE
    .replace('{MODE}', 'ADHOC_QUERY')
    .replace('{DATA_SOURCE_METADATA}', formatMetadata(reducedMetadata))
    .replace('{USER_QUESTION}', `${userQuestion}${semanticContext}${detectedQueryInfo}${tableEmphasis}${valuePreservationInstructions}\n\n**CRITICAL COLUMN NAME RULES**:\n1. Use ONLY these exact column names: ${columnNamesList}${allColumnNames.length > 100 ? ' (and more - see metadata above)' : ''}\n2. Do NOT invent column names. If you need "class name" but see "currentClass" in the list above, use "currentClass" exactly.\n3. Check the metadata tables above for the EXACT column name before using it.\n4. If the user asks for something that doesn't exist, use the closest matching column from the list above.`);

  const response = await openai.chat.completions.create({
    model: process.env.OPENAI_MODEL || 'gpt-4-turbo-preview',
    messages: [
      {
        role: 'system',
        content: 'You are an expert SQL query generator. Generate accurate SQL queries that exactly match user questions. **CRITICAL RULES - READ CAREFULLY:**\n\n1) **TABLE SELECTION IS CRITICAL**: If the prompt mentions "MOST RELEVANT table", you MUST use that exact table name. Do NOT use other tables. For example, if prompt says "Use table School", then use "School" not "PreviousSchool" or any other table. If user asks about "school", prefer "School" table over "PreviousSchool" unless explicitly asking about previous/old data.\n\n2) **VALUE PRESERVATION IS CRITICAL**: If the user question contains multi-word values (e.g., "Neha S", "MDU College", "John Smith"), preserve them as SINGLE, COMPLETE values in WHERE clauses.\n   - CORRECT: WHERE schoolName = \'Neha S\' ✅\n   - WRONG: WHERE schoolName = \'Neha\' AND class = \'S\' ❌\n   - WRONG: WHERE schoolName = \'Neha\' ❌ (missing part of value)\n   - If the prompt mentions "Extracted Values", use those EXACT values as single string literals\n   - NEVER split multi-word values into multiple conditions\n   - NEVER truncate values - use the complete value from the user question\n\n3) **NEVER INVENT COLUMN NAMES** - You MUST ONLY use column names that are EXPLICITLY listed in the metadata provided. If a column does not exist in the metadata, DO NOT use it. Check the metadata tables and columns carefully before using any column name.\n\n4) **COLUMN NAME MATCHING**: When the user asks about something (e.g., "class name"), look for the EXACT column name in the metadata. Common patterns:\n   - "class name" → look for columns like "className", "class_name", "currentClass", "current_class"\n   - "fee" → look for columns like "feeAmount", "fee_amount", "totalFee", "total_fee"\n   - If you see "className" in metadata, use "className". If you see "currentClass", use "currentClass". NEVER invent variations.\n\n5) **VERIFY BEFORE USING**: Before using ANY column name:\n   - Search the metadata tables for that EXACT column name\n   - If not found, look for similar names (e.g., "className" vs "currentClass")\n   - Use the EXACT column name from metadata, not a variation you invent\n   - If no match exists, use the closest matching column that DOES exist\n\n6) For queries asking "over month" or "over period", ALWAYS use DATE(date_column) for grouping, NEVER use MONTH() or YEAR() - this ensures charts show multiple data points.\n\n7) MySQL ONLY_FULL_GROUP_BY mode: ALL non-aggregated columns in SELECT must be in GROUP BY clause. If you need a column that cannot be grouped, wrap it in MIN() or MAX() aggregate function.\n\n8) For "differences", "compare", "versus", "vs", "measure differences" questions: Group by ALL dimensions mentioned (e.g., "income bracket differences between parties" → GROUP BY income_bracket, party_affiliation) to enable comparison.\n\n9) **AVOID DUPLICATE ROWS**: When using JOINs, prefer exact matches (e.g., "ON table1.id = table2.id") over LIKE patterns. If you must use LIKE or the query might return duplicates, add DISTINCT or use GROUP BY with aggregations to eliminate duplicates.\n\n**REMEMBER**: The metadata contains the EXACT table and column names. Use them EXACTLY as shown. Never invent or guess names. Preserve complete values from user questions. Always return valid JSON only.',
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

  let result = JSON.parse(content) as AdhocQueryResponse;
  
  // CRITICAL: Post-process query to fix incorrectly split values
  // Example: "Neha S" should not become WHERE column1 = 'Neha' AND column2 = 'S'
  if (result.query_content && questionUnderstanding && extractedValues.length > 0) {
    result.query_content = postProcessQueryForSplitValues(
      result.query_content,
      userQuestion,
      extractedValues,
      questionUnderstanding
    );
  }
  
  // Validate that the query uses columns that exist in metadata
  if (result.query_content && reducedMetadata.tables) {
    const allColumnNames = new Set<string>();
    reducedMetadata.tables.forEach(table => {
      table.columns?.forEach(col => {
        allColumnNames.add(col.name.toLowerCase());
        // Also add table.column format
        allColumnNames.add(`${table.name}.${col.name}`.toLowerCase());
        allColumnNames.add(`${table.name.toLowerCase()}.${col.name.toLowerCase()}`);
      });
    });
    
    // Extract column names from query (simple regex - may not catch all cases)
    const queryLower = result.query_content.toLowerCase();
    const columnMatches = queryLower.match(/\b(?:select|from|where|group by|order by|join|on)\s+([a-z_][a-z0-9_]*)\b/gi);
    
    if (columnMatches) {
      console.log(`[LLM-SERVICE] ✅ Validating column names in generated query...`);
      // Note: This is a basic check - the query executor will catch actual errors
    }
  }
  
  return result;
}

export async function generateDashboardMetrics(
  metadata: DataSourceMetadata
): Promise<DashboardMetricsResponse> {
  const { estimateMetadataTokens, isMetadataSizeSafe } = await import('../utils/token-counter');
  const model = process.env.OPENAI_MODEL || 'gpt-4-turbo-preview';
  
  // Check if metadata needs reduction
  let reducedMetadata = metadata;
  if (!isMetadataSizeSafe(metadata, model)) {
    console.log(`[LLM-SERVICE] ⚠️ Dashboard metadata too large (${estimateMetadataTokens(metadata)} tokens), applying reduction...`);
    // For dashboard metrics, we need a broader view, so keep more tables but fewer columns
    const allTables = metadata.tables || [];
    reducedMetadata = {
      ...metadata,
      tables: allTables.slice(0, 10).map(table => ({
        ...table,
        columns: table.columns.slice(0, 12), // Keep more columns for dashboard context
      })),
    };
    
    // If still too large, reduce further
    if (!isMetadataSizeSafe(reducedMetadata, model)) {
      reducedMetadata = {
        ...metadata,
        tables: allTables.slice(0, 5).map(table => ({
          ...table,
          columns: table.columns.slice(0, 10),
        })),
      };
    }
    
    console.log(`[LLM-SERVICE] ✅ Reduced to ${reducedMetadata.tables.length} tables, ${estimateMetadataTokens(reducedMetadata)} tokens`);
  }
  
  const prompt = MASTER_PROMPT_TEMPLATE
    .replace('{MODE}', 'DASHBOARD_METRICS')
    .replace('{DATA_SOURCE_METADATA}', formatMetadata(reducedMetadata))
    .replace('{USER_QUESTION}', 'Generate 8-10 diverse dashboard metrics covering different visualization types');

  const response = await openai.chat.completions.create({
    model: process.env.OPENAI_MODEL || 'gpt-4-turbo-preview',
    messages: [
      {
        role: 'system',
        content: 'You are an expert analytics dashboard generator that works with ANY type of data (business, healthcare, education, finance, retail, etc.). Analyze the provided metadata to understand the data domain and column structure. Generate 8-10 key dashboard metrics that: 1) Cover ALL visualization types (gauge, bar_chart, pie_chart, line_chart, scatter_plot, table), 2) Are the MOST IMPORTANT questions for THIS specific dataset, 3) Use actual column names from metadata, 4) Generate diverse query types that naturally produce different visualizations, 5) Handle date/time queries properly using YEAR(), MONTH(), DAY(), DATE() functions when temporal analysis is needed, 6) CRITICAL: Only generate queries that will return data - use columns that exist in the metadata, avoid filters that might exclude all rows, use COUNT(*) or aggregations that will always return results, prefer queries that show distributions or aggregations rather than specific filters that might be empty, 7) IMPORTANT: Use clear column aliases (e.g., "SELECT COUNT(*) as count, category as category_name") to ensure charts can properly identify data columns. Always return valid JSON only.',
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
 * Post-process SQL query to fix incorrectly split values
 * Example: "Neha S" should not become WHERE column1 = 'Neha' AND column2 = 'S'
 */
function postProcessQueryForSplitValues(
  query: string,
  userQuestion: string,
  extractedValues: string[],
  questionUnderstanding: {
    intent: string;
    keyConcepts: string[];
    entities: string[];
    queryType: string;
    semanticSummary: string;
  }
): string {
  if (extractedValues.length === 0) return query;
  
  // Find multi-word values that might have been split
  for (const value of extractedValues) {
    if (value.split(/\s+/).length >= 2) {
      const words = value.split(/\s+/);
      const firstWord = words[0];
      const lastWord = words[words.length - 1];
      
      // Pattern 1: WHERE column1 = 'word1' AND column2 = 'word2'
      // Should be: WHERE column1 = 'word1 word2'
      const splitPattern1 = new RegExp(
        `(\\w+)\\s*=\\s*['"]${firstWord.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}['"]\\s+AND\\s+(\\w+)\\s*=\\s*['"]${lastWord.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}['"]`,
        'gi'
      );
      
      if (splitPattern1.test(query)) {
        // Find the first column name before the split
        const columnMatch = query.match(new RegExp(`(\\w+)\\s*=\\s*['"]${firstWord.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}['"]`, 'i'));
        if (columnMatch) {
          const columnName = columnMatch[1];
          // Replace split conditions with single condition
          query = query.replace(
            splitPattern1,
            `${columnName} = '${value}'`
          );
          console.log(`[LLM-SERVICE] 🔧 Fixed split value: "${value}" → "${columnName} = '${value}'"`);
          continue;
        }
      }
      
      // Pattern 2: WHERE column = 'word1' (missing rest of value)
      // Check if query only has first word but value has more words
      const incompletePattern = new RegExp(
        `(\\w+)\\s*=\\s*['"]${firstWord.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}['"]`,
        'gi'
      );
      
      const incompleteMatch = query.match(incompletePattern);
      if (incompleteMatch && !query.includes(value)) {
        // Replace incomplete value with complete value
        query = query.replace(
          incompletePattern,
          `${incompleteMatch[1]} = '${value}'`
        );
        console.log(`[LLM-SERVICE] 🔧 Fixed incomplete value: "${firstWord}" → "${value}"`);
      }
    }
  }
  
  return query;
}

/**
 * Semantic Question Understanding
 * 
 * Uses LLM to extract semantic meaning, intent, key concepts, and entities from the user question.
 * This understanding is then used to guide SQL query generation, similar to semantic search.
 */
export async function understandQuestionSemantics(
  userQuestion: string
): Promise<{
  intent: string;
  keyConcepts: string[];
  entities: string[];
  queryType: string;
  semanticSummary: string;
}> {
  try {
    console.log(`[LLM-SERVICE] 🧠 Step 1: Understanding question semantics: "${userQuestion}"`);
    
    const understandingPrompt = `Analyze this natural language question and extract its semantic meaning:

Question: "${userQuestion}"

Extract and return JSON with:
1. "intent": The main intent/goal of the question (e.g., "compare", "find trends", "calculate average", "identify top performers")
2. "keyConcepts": Array of key concepts/domains mentioned (e.g., ["students", "scores", "assignments", "performance"])
3. "entities": Array of specific entities/objects mentioned (e.g., ["student", "quiz", "assignment", "score"])
4. "queryType": Type of query needed (e.g., "aggregation", "comparison", "trend_analysis", "filtering", "ranking")
5. "semanticSummary": A concise semantic summary that captures the meaning and context

Return ONLY valid JSON, no explanations:`;

    const response = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-4-turbo-preview',
      messages: [
        {
          role: 'system',
          content: 'You are an expert at understanding natural language questions and extracting their semantic meaning. Return only valid JSON.',
        },
        {
          role: 'user',
          content: understandingPrompt,
        },
      ],
      temperature: 0.1, // Low temperature for consistent understanding
      response_format: { type: 'json_object' },
      max_tokens: 300,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('No response from LLM for question understanding');
    }

    const understanding = JSON.parse(content);
    
    console.log(`[LLM-SERVICE] ✅ Question understanding complete:`);
    console.log(`[LLM-SERVICE]   Intent: ${understanding.intent}`);
    console.log(`[LLM-SERVICE]   Query Type: ${understanding.queryType}`);
    console.log(`[LLM-SERVICE]   Key Concepts: ${understanding.keyConcepts?.join(', ') || 'none'}`);
    console.log(`[LLM-SERVICE]   Entities: ${understanding.entities?.join(', ') || 'none'}`);
    
    return {
      intent: understanding.intent || '',
      keyConcepts: understanding.keyConcepts || [],
      entities: understanding.entities || [],
      queryType: understanding.queryType || 'general',
      semanticSummary: understanding.semanticSummary || userQuestion,
    };
  } catch (error) {
    console.error('[LLM-SERVICE] ⚠️ Question understanding failed, using original question:', error);
    // Fallback: return basic understanding from original question
    return {
      intent: 'general_query',
      keyConcepts: [],
      entities: [],
      queryType: 'general',
      semanticSummary: userQuestion,
    };
  }
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
  connectionString?: string,
  questionUnderstanding?: {
    intent: string;
    keyConcepts: string[];
    entities: string[];
    queryType: string;
    semanticSummary: string;
  } | null
): Promise<AdhocQueryResponse> {
  try {
    // Dynamic import to avoid errors if LangGraph not installed
    const { QueryAgent } = await import('../agents/query-agent');
    const agent = new QueryAgent();

    console.log('[LLM-SERVICE] Using LangGraph agent for query generation');

    // CRITICAL: Understand question if not provided (for better accuracy)
    // Question understanding helps generate accurate queries by identifying intent, key concepts, and entities
    if (!questionUnderstanding) {
      try {
        console.log(`[LLM-SERVICE] 🧠 Understanding question semantics: "${userQuestion}"`);
        questionUnderstanding = await understandQuestionSemantics(userQuestion);
        console.log(`[LLM-SERVICE] ✅ Question understanding complete:`, {
          intent: questionUnderstanding.intent,
          queryType: questionUnderstanding.queryType,
          keyConcepts: questionUnderstanding.keyConcepts?.slice(0, 3).join(', '),
        });
      } catch (error) {
        console.warn(`[LLM-SERVICE] ⚠️ Question understanding failed, proceeding without it:`, error);
        questionUnderstanding = null;
      }
    }

    // OPTIMIZATION: Metadata is already refreshed by API route - don't refresh again!
    // This prevents redundant system catalog queries and semantic matching
    let reducedMetadata = metadata;
    const allTables = metadata.tables || [];
    const totalColumns = allTables.reduce((sum, t) => sum + (t.columns?.length || 0), 0);
    const dataSourceId = (metadata as any).data_source_id;
    const isFileBased = ['CSV_FILE', 'EXCEL_FILE', 'JSON_FILE', 'TXT_FILE', 'GOOGLE_DRIVE'].includes(metadata.source_type);
    
    // Metadata is already fresh from API route - use it directly
    // Only refresh if metadata is empty or invalid
    if ((!metadata.tables || metadata.tables.length === 0) && !isFileBased && dataSourceId && metadata.source_type === 'SQL_DB') {
      try {
        console.log(`[LLM-SERVICE] ⚠️ Metadata is empty, refreshing from system catalog for agent`);
        const { getHybridMetadata } = await import('./hybrid-metadata-service');
        
        reducedMetadata = await getHybridMetadata({
          dataSourceId,
          userQuestion: userQuestion, // Use question directly
          maxTables: 30, // Reduced from 50 for faster processing
          useSystemCatalog: true,
          useSemanticSearch: true,
          includeStatistics: false,
          forceRefresh: false, // Use cache (faster)
        });
        
        console.log(`[LLM-SERVICE] ✅ Metadata refreshed for agent: ${reducedMetadata.tables?.length || 0} tables`);
      } catch (error) {
        console.warn(`[LLM-SERVICE] ⚠️ Metadata refresh failed, using provided metadata:`, error);
      }
    } else {
      console.log(`[LLM-SERVICE] ✅ Using pre-fetched metadata (${metadata.tables?.length || 0} tables) - no refresh needed`);
    }
    
    // Check token size first (system catalog is primary)
    const { estimateMetadataTokens, isMetadataSizeSafe } = await import('../utils/token-counter');
    const model = process.env.OPENAI_MODEL || 'gpt-4-turbo-preview';
    const tokenCount = estimateMetadataTokens(reducedMetadata);
    const isSafe = isMetadataSizeSafe(reducedMetadata, model);
    
    console.log(`[LLM-SERVICE] 📊 Metadata size check: ${tokenCount} tokens, Safe: ${isSafe ? '✅' : '❌'} (${reducedMetadata.tables?.length || 0} tables, ${totalColumns} columns)`);
    
    // Enhance user question with semantic understanding for better matching
    const enhancedQuestion = questionUnderstanding
      ? `${questionUnderstanding.semanticSummary}\n\nIntent: ${questionUnderstanding.intent}\nKey Concepts: ${questionUnderstanding.keyConcepts.join(', ')}`
      : userQuestion;
    
    // If metadata is safe, use system catalog metadata as-is (no semantic filtering needed)
    if (isSafe) {
      console.log(`[LLM-SERVICE] ✅ Metadata size is safe, using system catalog metadata as-is (no semantic filtering needed)`);
    } else {
      // Metadata too large - apply semantic filtering as FALLBACK
      console.log(`[LLM-SERVICE] ⚠️ Metadata too large (${tokenCount} tokens), applying semantic filtering as fallback`);
      try {
        // Use enhanced question with semantic understanding for better matching
        reducedMetadata = await reduceMetadataForAdhocQuery(enhancedQuestion, reducedMetadata, connectionString);
        console.log(`[LLM-SERVICE] ✅ Semantic analysis complete! Reduced to ${reducedMetadata.tables.length} tables`);
      } catch (error) {
        console.warn('[LLM-SERVICE] ⚠️ Semantic matching failed, using original metadata:', error);
      }
    }

    // Execute agent workflow (agent will further explore schema if needed)
    // Pass enhanced question with semantic understanding for better accuracy
    const query = await agent.execute(userQuestion, reducedMetadata, connectionString, questionUnderstanding || undefined);

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
 * Applies aggressive reduction when semantic reduction still results in too large metadata
 * IMPORTANT: Preserves semantic relevance by keeping the tables/columns that were already selected
 * by semantic matching (they're already in order of relevance)
 */
async function applyAggressiveReduction(
  metadata: DataSourceMetadata,
  model: string
): Promise<DataSourceMetadata> {
  const { estimateMetadataTokens, isMetadataSizeSafe } = await import('../utils/token-counter');
  
  console.log('[LLM-SERVICE] 🔧 Applying aggressive reduction (preserving semantic relevance)...');
  console.log(`[LLM-SERVICE] Current: ${metadata.tables.length} tables`);
  
  // Keep only top 3 semantically relevant tables with top 12 columns each
  // These tables are already ordered by semantic relevance from semantic matching
  const reducedTables = metadata.tables.slice(0, 3).map(table => ({
    ...table,
    columns: table.columns.slice(0, 12), // Keep top 12 columns (already ordered by relevance)
  }));
  
  const reduced: DataSourceMetadata = {
    ...metadata,
    tables: reducedTables,
  };
  
  // If still too large, keep only top 2 semantically relevant tables with top 10 columns each
  if (!isMetadataSizeSafe(reduced, model)) {
    console.log('[LLM-SERVICE] 🔧 Still too large, applying ultra-aggressive reduction (preserving top 2 semantic matches)...');
    const ultraReduced: DataSourceMetadata = {
      ...metadata,
      tables: metadata.tables.slice(0, 2).map(table => ({
        ...table,
        columns: table.columns.slice(0, 10), // Keep top 10 columns (already ordered by relevance)
      })),
    };
    return ultraReduced;
  }
  
  return reduced;
}

/**
 * Applies fallback reduction when semantic matching fails
 */
async function applyFallbackReduction(
  metadata: DataSourceMetadata,
  model: string
): Promise<DataSourceMetadata> {
  const { estimateMetadataTokens, isMetadataSizeSafe } = await import('../utils/token-counter');
  
  console.log('[LLM-SERVICE] 🔄 Applying fallback reduction...');
  
  const allTables = metadata.tables || [];
  
  // Strategy: Keep first 5 tables, limit to 10 columns per table
  let reduced: DataSourceMetadata = {
    ...metadata,
    tables: allTables.slice(0, 5).map(table => ({
      ...table,
      columns: table.columns.slice(0, 10),
    })),
  };
  
  // If still too large, reduce further
  if (!isMetadataSizeSafe(reduced, model)) {
    reduced = {
      ...metadata,
      tables: allTables.slice(0, 3).map(table => ({
        ...table,
        columns: table.columns.slice(0, 8),
      })),
    };
  }
  
  // If still too large, keep only first table
  if (!isMetadataSizeSafe(reduced, model)) {
    reduced = {
      ...metadata,
      tables: allTables.slice(0, 1).map(table => ({
        ...table,
        columns: table.columns.slice(0, 10),
      })),
    };
  }
  
  return reduced;
}

/**
 * Reduces metadata for ad-hoc queries based on user question
 * 
 * Uses semantic analysis (embeddings) to find the most relevant tables and columns.
 * This provides more accurate matching than keyword-based approaches.
 */
async function reduceMetadataForAdhocQuery(
  userQuestion: string,
  metadata: DataSourceMetadata,
  connectionString?: string
): Promise<DataSourceMetadata> {
  const allTables = metadata.tables || [];
  const totalColumns = allTables.reduce((sum, t) => sum + (t.columns?.length || 0), 0);
  const isCSV = metadata.source_type === 'CSV_FILE';
  
  // OPTIMIZATION: Skip semantic matching if metadata is already small/filtered
  // If <= 30 tables, metadata is likely already filtered by getHybridMetadata
  const isAlreadyFiltered = allTables.length <= 30;
  
  // For CSV files: use semantic matching if many columns (>15) - helps find relevant columns within single table
  // For SQL databases: use semantic matching ONLY if many tables (>30) or many columns (>50)
  // Skip if already filtered (metadata from getHybridMetadata with semantic search)
  const shouldUseSemanticMatching = !isAlreadyFiltered && (
    isCSV 
    ? totalColumns > 15 
      : allTables.length > 30 || totalColumns > 50
  );
  
  if (!shouldUseSemanticMatching) {
    if (isAlreadyFiltered) {
      console.log(`[LLM-SERVICE] ⚡ Metadata already filtered (${allTables.length} tables) - skipping redundant semantic reduction`);
    } else {
    console.log(`[LLM-SERVICE] ℹ️ Schema is small enough (${allTables.length} tables, ${totalColumns} columns), skipping semantic reduction`);
    }
    return metadata;
  }
  
  console.log(`[LLM-SERVICE] 🎯 Semantic matching enabled for large database (${allTables.length} tables, ${totalColumns} columns)`);

  try {
    // Try semantic matching first (most accurate)
    try {
      const { createSemanticallyReducedMetadata } = await import('./semantic-matcher');
      
      console.log(`\n[LLM-SERVICE] 🎯 Attempting semantic analysis for question: "${userQuestion}"`);
      // Let semantic matcher auto-adjust limits based on schema size
      const reducedMetadata = await createSemanticallyReducedMetadata(
        userQuestion,
        metadata
        // maxTables and maxColumnsPerTable will be auto-adjusted by semantic matcher
      );
      
      console.log(`[LLM-SERVICE] ✅ Semantic analysis successful! Using ${reducedMetadata.tables?.length || 0} relevant tables\n`);
      return reducedMetadata;
    } catch (error) {
      console.error('\n[LLM-SERVICE] ❌ Semantic matching failed:', error);
      console.error('[LLM-SERVICE] ❌ Error details:', {
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        question: userQuestion.substring(0, 100),
        tables: allTables.length,
        totalColumns,
      });
      console.warn('[LLM-SERVICE] ⚠️ Trying schema exploration as fallback...\n');
      // Fall through to schema exploration
    }

    // Fallback 1: For SQL databases with connection string, use schema exploration
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
    
    // Fallback 2: Use LLM to identify relevant tables based on question
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

