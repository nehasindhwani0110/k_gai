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
     * **"by X" or "grouped by X"** → **ALWAYS means GROUP BY X, NEVER WHERE X = value**
       - ✅ CORRECT: "average time by student names" → SELECT Student.name, AVG(timeTaken) FROM QuizAttempt JOIN Student ON QuizAttempt.studentId = Student.id GROUP BY Student.name
       - ❌ WRONG: "average time by student names" → SELECT AVG(timeTaken) FROM QuizAttempt WHERE studentName = 'by student names' (THIS IS COMPLETELY WRONG!)
       - ✅ CORRECT: "count by category" → SELECT category, COUNT(*) FROM table GROUP BY category
       - ❌ WRONG: "count by category" → SELECT COUNT(*) FROM table WHERE category = 'by category' (THIS IS WRONG!)
       - **PATTERN**: When user says "metric by dimension", it means GROUP BY dimension
       - **IF dimension is a name/entity** (like "student names", "class names"): JOIN with the related table to get the name, then GROUP BY that name
       - **NEVER** treat "by X" as a WHERE clause filter value - it's ALWAYS a GROUP BY requirement
   - Generate SQL that directly answers the question

2. **USE EXACT COLUMN AND TABLE NAMES FROM METADATA (CRITICAL - NO EXCEPTIONS)**:
   - **NEVER INVENT COLUMN NAMES** - You MUST ONLY use columns that are explicitly listed in the metadata
   - Check the metadata provided in Section 3 for exact column names
   - **VERIFY COLUMN EXISTS**: Before using any column, check if it exists in the metadata tables
   - Use the exact table name from metadata (usually filename without .csv extension)
   - Match column names exactly (case-sensitive, spelling-sensitive)
   - If column name is unclear or doesn't exist, use the closest matching column that DOES exist in the metadata
   - **If user asks about a concept but metadata shows a different column name, use the column name from metadata**
   - **If user asks about something that doesn't exist, find the closest match in metadata OR use COUNT(*) for counting**

3. **HANDLE DATE/TIME COLUMNS PROPERLY WITH PROPER FORMATTING**:
   - When user asks about "time", "date", "month", "year", "day", "period", "over time", "trends":
     * FIRST: Look for date/time columns in metadata (columns with types: DATE, DATETIME, TIMESTAMP, or names containing: date, time, year, month, day, period, created, updated)
     * Use SQL date/time functions: YEAR(), MONTH(), DAY(), DATE(), DATEPART(), EXTRACT()
     * **CRITICAL**: For "distribution over month" or "X over month" → ALWAYS use DATE() for grouping: GROUP BY DATE(date_column)
     * For "over time" or "trends" → GROUP BY DATE(date_column) or GROUP BY YEAR(date_column) depending on span
     * For "by year" → GROUP BY YEAR(date_column) ORDER BY YEAR
     * For "by month" (when user wants monthly aggregation across multiple months) → GROUP BY MONTH(date_column), YEAR(date_column) ORDER BY YEAR, MONTH
     * ALWAYS use the actual date/time column name from metadata
   
   - **CRITICAL: ALWAYS FORMAT DATES PROPERLY FOR DISPLAY**:
     * When selecting dates, use DATE_FORMAT() or equivalent to show readable dates:
       - "SELECT DATE_FORMAT(date_column, '%Y-%m-%d') as date, ..." for dates
       - "SELECT DATE_FORMAT(date_column, '%M %Y') as month_year, ..." for month/year
       - "SELECT DATE_FORMAT(date_column, '%W, %M %d, %Y') as full_date, ..." for full dates
     * When grouping by month number, ALSO include month name:
       - "SELECT MONTH(date_column) as month_number, MONTHNAME(date_column) as month_name, YEAR(date_column) as year, COUNT(*) as count FROM table GROUP BY MONTH(date_column), YEAR(date_column) ORDER BY year, month_number"
     * When grouping by year, format properly:
       - "SELECT YEAR(date_column) as year, COUNT(*) as count FROM table GROUP BY YEAR(date_column) ORDER BY year"
     * For MySQL: Use DATE_FORMAT(date_column, '%M') for month names, DATE_FORMAT(date_column, '%Y') for years
     * Always include both the numeric value AND the formatted readable value when possible
   
   - Examples of proper date/time queries WITH FORMATTING:
     * "distribution over month" → **ALWAYS USE**: "SELECT DATE(date_column) as date, DATE_FORMAT(date_column, '%M %d, %Y') as date_label, COUNT(*) as count FROM table GROUP BY DATE(date_column) ORDER BY date"
     * "trends over time" → "SELECT YEAR(date_column) as year, CONCAT('Year ', YEAR(date_column)) as year_label, COUNT(*) as count FROM table GROUP BY YEAR(date_column) ORDER BY YEAR(date_column)"
     * "by month" (monthly aggregation) → "SELECT MONTH(date_column) as month_number, MONTHNAME(date_column) as month_name, YEAR(date_column) as year, COUNT(*) as count FROM table GROUP BY MONTH(date_column), YEAR(date_column) ORDER BY YEAR(date_column), MONTH(date_column)"
     * "over period" → **ALWAYS USE**: "SELECT DATE(date_column) as date, DATE_FORMAT(date_column, '%M %d, %Y') as date_label, COUNT(*) as count FROM table GROUP BY DATE(date_column) ORDER BY date"
   
   - IMPORTANT: If user asks about a metric (like "attendance") over time, use the metric column AND the date column:
     * "attendance over month" → **ALWAYS USE**: "SELECT DATE(date_column) as date, DATE_FORMAT(date_column, '%M %d, %Y') as date_label, AVG(attendance_column) as avg_attendance FROM table GROUP BY DATE(date_column) ORDER BY date"
     * NOT: "SELECT YEAR(date_of_birth)..." when user asks about attendance
     * **REMEMBER**: "over month" means daily trends within a month, not monthly aggregation. Use DATE() not MONTH().
   
   - DO NOT confuse date columns with metric columns:
     * Date columns: Used for grouping/time analysis (date, time, created_at, etc.)
     * Metric columns: Used for calculations (attendance, score, amount, etc.)
     * When user asks "X over time", use: date column for grouping, X column for calculation

4. **INCLUDE PROPER NAMES AND DESCRIPTIVE LABELS (CRITICAL)**:
   - **ALWAYS INCLUDE ENTITY NAMES WHEN IDs ARE PRESENT**:
     * If your query selects an ID column (ends with _id or id), ALSO include the corresponding name column
     * Look for name columns in the SAME table or related tables (e.g., student_id → student_name, category_id → category_name)
     * If name column exists in same table: "SELECT student_id, student_name, ... FROM table"
     * If name is in related table, use JOIN: "SELECT t1.student_id, t2.student_name, ... FROM table1 t1 JOIN students t2 ON t1.student_id = t2.id"
     * **NEVER show only IDs** - always include names for better readability
   
   - **USE DESCRIPTIVE COLUMN ALIASES**:
     * Instead of: "SELECT COUNT(*) as cnt FROM ..."
     * Use: "SELECT COUNT(*) as total_count FROM ..." or "SELECT COUNT(*) as student_count FROM ..."
     * Use clear, descriptive names: "avg_score" not "avg", "total_amount" not "sum", "month_name" not "mn"
     * Column aliases should describe WHAT the data represents, not just the function used
   
   - **FORMAT NUMBERS AND VALUES PROPERLY**:
     * For percentages: Use ROUND() and format: "SELECT ROUND(AVG(score) * 100, 2) as avg_score_percentage FROM ..."
     * For currency: Format appropriately: "SELECT CONCAT('$', FORMAT(amount, 2)) as formatted_amount FROM ..."
     * For counts: Use clear labels: "SELECT COUNT(*) as total_records FROM ..."
   
   - Examples of queries WITH PROPER NAMES:
     * "show students by class" → "SELECT class_id, class_name, COUNT(*) as student_count FROM students GROUP BY class_id, class_name ORDER BY student_count DESC"
     * "payments by mode" → "SELECT payment_mode_id, payment_mode_name, SUM(amount) as total_amount, COUNT(*) as payment_count FROM payments GROUP BY payment_mode_id, payment_mode_name"
     * If name column doesn't exist, use the ID but format it: "SELECT CONCAT('Mode ', mode_id) as mode_label, COUNT(*) as count FROM payments GROUP BY mode_id"
     * **CRITICAL**: "average time by student names" → "SELECT Student.name, AVG(QuizAttempt.timeTaken) as avg_time FROM QuizAttempt JOIN Student ON QuizAttempt.studentId = Student.id GROUP BY Student.name"
       - Note: "by student names" means GROUP BY student names, NOT WHERE studentName = 'by student names'
       - When dimension is a name/entity, JOIN with related table to get the name, then GROUP BY that name

5. **GENERATE ANY SQL QUERY AS NEEDED**:
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

6. **EXAMPLES OF ACCURATE QUERY GENERATION**:
   
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
     → Query: "SELECT MONTH(date_column) as month_number, MONTHNAME(date_column) as month_name, COUNT(*) as count FROM table_name GROUP BY MONTH(date_column) ORDER BY MONTH(date_column)"
   
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
     → Query: "SELECT YEAR(date_column) as year, MONTH(date_column) as month_number, MONTHNAME(date_column) as month_name, AVG(attendance_percentage) as avg_attendance FROM table_name GROUP BY YEAR(date_column), MONTH(date_column) ORDER BY year, month_number"
   
   **Queries with Proper Names and Labels:**
   - User: "payments by mode"
     → Query: "SELECT payment_mode_id, payment_mode_name, SUM(amount) as total_amount, COUNT(*) as payment_count FROM payments GROUP BY payment_mode_id, payment_mode_name ORDER BY total_amount DESC"
     → If payment_mode_name doesn't exist: "SELECT payment_mode_id, CONCAT('Mode ', payment_mode_id) as mode_label, SUM(amount) as total_amount, COUNT(*) as payment_count FROM payments GROUP BY payment_mode_id ORDER BY total_amount DESC"
   
   - User: "students by class"
     → Query: "SELECT class_id, class_name, COUNT(*) as student_count FROM students GROUP BY class_id, class_name ORDER BY student_count DESC"
     → If class_name doesn't exist, look for related table: "SELECT s.class_id, c.class_name, COUNT(*) as student_count FROM students s JOIN classes c ON s.class_id = c.id GROUP BY s.class_id, c.class_name ORDER BY student_count DESC"

7. **IMPORTANT NOTES**:
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
     * Example: Instead of using LIKE patterns in JOIN conditions that might create duplicates,
       use exact matches if possible, or add DISTINCT/GROUP BY to eliminate duplicates
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

Generate 8-10 sophisticated, domain-agnostic dashboard metrics that work with ANY dataset.

**KEY PRINCIPLES:**

1. **NO DOMAIN ASSUMPTIONS**: Do NOT assume business, education, healthcare, etc.

2. **USE ONLY PROVIDED COLUMNS**: Create metrics based on actual column names/types

3. **INTELLIGENT METRICS**: Generate insights, not just basic counts

4. **NATURAL VISUALIZATION**: Each metric should suit its chart type

**METRIC TYPES (8-10 total):**

- 2-3 Key Performance Indicators (gauge)

- 2-3 Comparisons/Rankings (bar chart)

- 1-2 Distributions (pie chart)

- 1-2 Time Trends (line chart - if date columns exist)

- 1 Correlation (scatter plot - if ≥2 numeric columns)

- 1 Detailed List (table)

**QUALITY REQUIREMENTS:**

1. **INSIGHTFUL**: Show patterns, trends, comparisons

2. **CONTEXT-RICH**: Include statistics (total, average, range, max, min)

3. **ACTIONABLE**: Help understand data and make decisions

4. **PROFESSIONAL**: Names like "Performance Distribution" not "Count of things"

**EXAMPLES OF GOOD METRIC NAMES:**

- "Average Score Distribution Across Ranges"

- "Top Performing Entities by Metric"

- "Status Distribution Analysis"

- "Activity Trends Over Time"

- "Metric X vs Metric Y Correlation"

- "Detailed Performance Ranking"

**BAD METRIC NAMES TO AVOID:**

- "Total count"

- "List of all items"

- "Simple average"

**ADAPTATION GUIDE:**

1. Scan columns for: numeric values, dates, categories, names

2. Use numeric columns for calculations (AVG, SUM, COUNT)

3. Use date columns with DATE(), MONTH(), YEAR() functions

4. Use category columns for GROUP BY

5. Use name columns for labels in rankings

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

**CRITICAL**: Create metrics that would be valuable for ANY dataset, focusing on universal analytical patterns.

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
- **QUERY WILL FAIL IF YOU USE NON-EXISTENT COLUMNS** - The database will reject queries with unknown columns
- **VERIFY BEFORE USING**: Before using any column name, check if it exists in the metadata tables provided
- **If column doesn't exist**: 
  → Find the closest matching column that DOES exist in the metadata
  → Check what columns DO exist in the table and use those instead of inventing names
  → If counting and no specific column exists, use COUNT(*) instead of inventing a column name
- Use exact column and table names from metadata - check the metadata carefully
- **Example**: User asks about a concept but table metadata shows different column names
  → CORRECT: Use the actual column names from metadata that match the concept - DO NOT invent column names
  → WRONG: Using invented column names when they don't exist will cause query to fail
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
- **MANDATORY**: Generate MINIMUM 8 metrics (8-10 total)
- **MANDATORY**: Cover ALL visualization types: gauge, bar_chart, pie_chart, line_chart, scatter_plot, table
- **MANDATORY**: NEVER show only IDs - always JOIN to get names/descriptions when IDs are present
- **MANDATORY**: NEVER generate queries that return empty data - always ensure queries return results
- Use ACTUAL column names from the metadata provided
- Make questions RELEVANT to the data domain (infer from column names)
- Each query should NATURALLY produce the right visualization type
- Set visualization_type to "auto" for all metrics
- Questions should be the MOST IMPORTANT for this specific dataset
- When you see columns ending in "_id" or "Id", JOIN with related tables to get names
- Example: "SELECT Quiz.name, AVG(QuizAttempt.score) FROM QuizAttempt JOIN Quiz ON QuizAttempt.quizId = Quiz.id GROUP BY Quiz.name" (shows names, not IDs)

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

/**
 * Truncates text to fit within token limit
 * Tries to preserve important parts (metadata, user question) while truncating verbose instructions
 */
function truncateTextToTokenLimit(text: string, maxTokens: number, model: string): string {
  const { estimateTokenCount } = require('../utils/token-counter');
  
  let currentTokens = estimateTokenCount(text, model);
  if (currentTokens <= maxTokens) {
    return text;
  }
  
  // Extract key sections
  const metadataMatch = text.match(/\*\*DATA SOURCE METADATA:\*\*\s*([\s\S]*?)(?=\*\*USER QUESTION|\*\*REQUIRED OUTPUT|$)/i);
  const userQuestionMatch = text.match(/\*\*USER QUESTION[^:]*:\*\*\s*([\s\S]*?)(?=\*\*REQUIRED OUTPUT|$)/i);
  
  const metadataSection = metadataMatch ? metadataMatch[0] : '';
  const userQuestionSection = userQuestionMatch ? userQuestionMatch[0] : '';
  
  // Try to build minimal prompt with just essential parts
  // Keep: metadata + user question + output format
  const outputFormatMatch = text.match(/\*\*REQUIRED OUTPUT FORMAT[^:]*:\*\*\s*([\s\S]*?)(?=\*\*CRITICAL|$)/i);
  const outputFormatSection = outputFormatMatch ? outputFormatMatch[0] : '';
  
  // Build minimal version
  const essentialParts = [
    '1. ⚙️ System Role and Constraints\n\nYou are an expert SQL query generator. Generate accurate SQL queries using ONLY the table and column names from the metadata below.',
    metadataSection,
    userQuestionSection,
    outputFormatSection || '**REQUIRED OUTPUT FORMAT (JSON ONLY):**\n\nGenerate only the JSON object with query_type, query_content, visualization_type, and insight_summary.'
  ].filter(Boolean).join('\n\n');
  
  const essentialTokens = estimateTokenCount(essentialParts, model);
  
  if (essentialTokens <= maxTokens) {
    return essentialParts;
  }
  
  // If still too large, truncate metadata itself
  if (metadataMatch) {
    const metadataContent = metadataMatch[1];
    const maxMetadataTokens = maxTokens - estimateTokenCount(userQuestionSection + outputFormatSection, model) - 500;
    
    if (maxMetadataTokens > 0) {
      // Truncate metadata by removing tables/columns
      const lines = metadataContent.split('\n');
      const truncatedLines: string[] = [];
      let tokenCount = 0;
      
      for (const line of lines) {
        const lineTokens = estimateTokenCount(line, model);
        if (tokenCount + lineTokens <= maxMetadataTokens) {
          truncatedLines.push(line);
          tokenCount += lineTokens;
        } else {
          break;
        }
      }
      
      const truncatedMetadata = `**DATA SOURCE METADATA:**\n\n${truncatedLines.join('\n')}\n\n... (metadata truncated - using top ${truncatedLines.length} lines to fit token limit)`;
      return [
        '1. ⚙️ System Role and Constraints\n\nYou are an expert SQL query generator. Generate accurate SQL queries using ONLY the table and column names from the metadata below.',
        truncatedMetadata,
        userQuestionSection,
        outputFormatSection || '**REQUIRED OUTPUT FORMAT (JSON ONLY):**\n\nGenerate only the JSON object.'
      ].filter(Boolean).join('\n\n');
    }
  }
  
  // Last resort: return minimal version
  return `Generate a SQL query for: ${userQuestionSection}\n\nUse metadata tables and columns provided. Return JSON with query_type, query_content, visualization_type, and insight_summary.`;
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
    groupByPattern?: {
      detected: boolean;
      dimension: string;
      requiresJoin: boolean;
      joinEntity?: string;
    };
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
    // This ensures exact matches are preferred over partial matches
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
      
      // CRITICAL: If GROUP BY pattern detected and requires JOIN, find the related table
      if (questionUnderstanding.groupByPattern?.detected && questionUnderstanding.groupByPattern.requiresJoin && questionUnderstanding.groupByPattern.joinEntity) {
        const joinEntity = questionUnderstanding.groupByPattern.joinEntity;
        console.log(`[LLM-SERVICE] 🔗 GROUP BY requires JOIN with "${joinEntity}" table - searching for related table...`);
        
        // Find table that matches the join entity (e.g., "student" → "Student" or "students")
        const joinTableMatch = reducedMetadata.tables.find(table => {
          const tableNameLower = table.name.toLowerCase();
          return tableNameLower === joinEntity || 
                 tableNameLower === joinEntity + 's' ||
                 (joinEntity.endsWith('s') && tableNameLower === joinEntity.slice(0, -1)) ||
                 tableNameLower.includes(joinEntity);
        });
        
        if (joinTableMatch) {
          console.log(`[LLM-SERVICE] ✅ Found JOIN table: "${joinTableMatch.name}" for entity "${joinEntity}"`);
          
          // Find name column in the join table
          const nameColumns = joinTableMatch.columns.filter(col => {
            const colNameLower = col.name.toLowerCase();
            return colNameLower.includes('name') || 
                   colNameLower === 'name' ||
                   (joinEntity && colNameLower.includes(joinEntity) && colNameLower.includes('name'));
          });
          
          if (nameColumns.length > 0) {
            const nameColumn = nameColumns[0];
            console.log(`[LLM-SERVICE] ✅ Found name column in ${joinTableMatch.name}: "${nameColumn.name}"`);
            detectedColumns.push({
              table: joinTableMatch.name,
              column: nameColumn.name,
            });
          } else {
            // Fallback: use first column or id column
            const idColumn = joinTableMatch.columns.find(col => col.name.toLowerCase().includes('id')) || joinTableMatch.columns[0];
            if (idColumn) {
              console.log(`[LLM-SERVICE] ⚠️ No name column found, using: "${idColumn.name}"`);
              detectedColumns.push({
                table: joinTableMatch.name,
                column: idColumn.name,
              });
            }
          }
        } else {
          console.log(`[LLM-SERVICE] ⚠️ Could not find JOIN table for entity "${joinEntity}" - LLM will need to infer it`);
        }
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
    // Example: "show entity Multi Word Value" → "Multi Word Value"
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
        const commonWords = ['name', 'table', 'graph', 'details', 'show', 'find', 'list', 'get'];
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
  let groupByInstructions = '';
  
  // CRITICAL: Add GROUP BY instructions if pattern detected
  if (questionUnderstanding?.groupByPattern?.detected) {
    const dimension = questionUnderstanding.groupByPattern.dimension;
    const requiresJoin = questionUnderstanding.groupByPattern.requiresJoin;
    const joinEntity = questionUnderstanding.groupByPattern.joinEntity;
    
    groupByInstructions = `\n\n**🎯 CRITICAL GROUP BY PATTERN DETECTED**:
- The question asks for aggregation "${dimension}" - this REQUIRES GROUP BY, NOT WHERE clause
- Dimension: "${dimension}"
- Requires JOIN: ${requiresJoin ? 'YES' : 'NO'}${requiresJoin && joinEntity ? ` (JOIN with ${joinEntity} table)` : ''}

**MANDATORY GROUP BY RULES**:
1. You MUST use GROUP BY clause, NOT WHERE clause for "${dimension}"
2. ${requiresJoin ? `You MUST JOIN with the ${joinEntity} table to get the name column, then GROUP BY that name` : `GROUP BY the "${dimension}" column directly`}
3. Example: "average time by student names" → SELECT Student.name, AVG(timeTaken) FROM QuizAttempt JOIN Student ON QuizAttempt.studentId = Student.id GROUP BY Student.name
4. ❌ WRONG: SELECT AVG(timeTaken) FROM QuizAttempt WHERE studentName = 'by student names' (THIS IS COMPLETELY WRONG!)
5. ✅ CORRECT: SELECT dimension_column, AGGREGATE(metric_column) FROM table GROUP BY dimension_column
6. If dimension is entity names (like "student names"), JOIN with the entity table first, then GROUP BY the name column`;
  }
  
  if (topRelevantTable && detectedColumns.length > 0) {
    const detectedColumnNames = detectedColumns.map(c => `${c.table}.${c.column}`).join(', ');
    const uniqueTables = Array.from(new Set(detectedColumns.map(c => c.table)));
    detectedQueryInfo = `\n\n**SEMANTIC SEARCH RESULTS (USE THESE EXACT COLUMNS FROM SYSTEM CATALOG)**:
- Detected Table(s): ${uniqueTables.map(t => `"${t}"`).join(', ')} (found via semantic search from system catalog)
- Detected Columns: ${detectedColumnNames} (found via semantic search from system catalog)
- Extracted Values: ${extractedValues.length > 0 ? extractedValues.map(v => `'${v}'`).join(', ') : 'none'}

**CRITICAL INSTRUCTIONS**:
1. Use table(s) ${uniqueTables.map(t => `"${t}"`).join(', ')} - these were detected via semantic search from system catalog
2. Use columns: ${detectedColumnNames} - these were detected via semantic search from system catalog
3. ${extractedValues.length > 0 ? `If extracted values exist, use them in WHERE clause: WHERE ${detectedColumns[0]?.column || 'column'} = '${extractedValues[0]}'` : 'No WHERE clause needed for values'}
4. Do NOT use columns that were NOT detected - stick to the detected columns above
5. Preserve complete values: ${extractedValues.length > 0 ? `Use '${extractedValues[0]}' as single value, do NOT split` : 'no values to preserve'}${groupByInstructions}`;
  } else if (groupByInstructions) {
    detectedQueryInfo = groupByInstructions;
  }
  
  // Enhance prompt with semantic understanding and detected columns
  const columnNamesList = allColumnNames.slice(0, 100).join(', '); // Limit to first 100 to avoid token bloat
  const tableEmphasis = topRelevantTable 
    ? `\n\n**CRITICAL TABLE SELECTION**: The user's question "${userQuestion}" is asking about "${questionUnderstanding?.keyConcepts.join(', ') || 'data'}". The MOST RELEVANT table is "${topRelevantTable}" (detected via semantic search). Use table "${topRelevantTable}" in your query, NOT other tables.`
    : '';
  
  const semanticContext = questionUnderstanding
    ? `\n\nSemantic Understanding:\n- Intent: ${questionUnderstanding.intent}\n- Query Type: ${questionUnderstanding.queryType}\n- Key Concepts: ${questionUnderstanding.keyConcepts.join(', ')}\n- Entities: ${questionUnderstanding.entities.join(', ')}\n- Semantic Summary: ${questionUnderstanding.semanticSummary}${questionUnderstanding.groupByPattern?.detected ? `\n- 🎯 GROUP BY DETECTED: dimension="${questionUnderstanding.groupByPattern.dimension}", requiresJoin=${questionUnderstanding.groupByPattern.requiresJoin}${questionUnderstanding.groupByPattern.joinEntity ? `, joinEntity="${questionUnderstanding.groupByPattern.joinEntity}"` : ''}` : ''}`
    : '';
  
  // CRITICAL: Add value preservation instructions
  const valuePreservationInstructions = extractedValues.length > 0
    ? `\n\n**CRITICAL VALUE PRESERVATION RULES**:
1. The user question contains these COMPLETE VALUES: ${extractedValues.map(v => `"${v}"`).join(', ')}
2. These are SINGLE, COMPLETE values - do NOT split them into multiple parts
3. Example: If user asks "show entity Multi Word Value", use WHERE entityColumn = 'Multi Word Value' ✅
4. WRONG: WHERE entityColumn = 'Multi' AND category = 'Word Value' ❌ (DO NOT DO THIS!)
5. If a value has multiple words, preserve it as a SINGLE string literal
6. Use the EXACT value from the user question in WHERE clauses, do NOT split multi-word values`
    : '';

  const prompt = MASTER_PROMPT_TEMPLATE
    .replace('{MODE}', 'ADHOC_QUERY')
    .replace('{DATA_SOURCE_METADATA}', formatMetadata(reducedMetadata))
    .replace('{USER_QUESTION}', `${userQuestion}${semanticContext}${detectedQueryInfo}${tableEmphasis}${valuePreservationInstructions}\n\n**CRITICAL COLUMN NAME RULES**:\n1. Use ONLY these exact column names: ${columnNamesList}${allColumnNames.length > 100 ? ' (and more - see metadata above)' : ''}\n2. Do NOT invent column names. If you need a concept but see a different column name in the list above, use that exact column name.\n3. Check the metadata tables above for the EXACT column name before using it.\n4. If the user asks for something that doesn't exist, use the closest matching column from the list above OR use COUNT(*) for counting.`);

  // CRITICAL: Check total token count before sending to LLM
  const systemMessage = 'You are an expert SQL query generator. Generate accurate SQL queries that exactly match user questions. **CRITICAL RULES - READ CAREFULLY:**\n\n1) **TABLE SELECTION IS CRITICAL**: If the prompt mentions "MOST RELEVANT table", you MUST use that exact table name. Do NOT use other tables. Use the exact table name from metadata, not variations or similar names.\n\n2) **"BY X" MEANS GROUP BY X - CRITICAL PATTERN RECOGNITION**: When user asks for aggregations (AVG, COUNT, SUM, MAX, MIN) "by X" or "grouped by X", this ALWAYS means GROUP BY X, NOT WHERE X = value.\n   - ✅ CORRECT: "average time by student names" → SELECT Student.name, AVG(timeTaken) FROM QuizAttempt JOIN Student ON QuizAttempt.studentId = Student.id GROUP BY Student.name\n   - ❌ WRONG: "average time by student names" → SELECT AVG(timeTaken) FROM QuizAttempt WHERE studentName = \'by student names\' (THIS IS COMPLETELY WRONG!)\n   - ✅ CORRECT: "count by category" → SELECT category, COUNT(*) FROM table GROUP BY category\n   - ❌ WRONG: "count by category" → SELECT COUNT(*) FROM table WHERE category = \'by category\' (THIS IS WRONG!)\n   - **PATTERN**: "metric by dimension" = GROUP BY dimension + JOIN if dimension is in another table\n   - **IF dimension is a name/entity**: JOIN with the related table to get the name, then GROUP BY that name\n   - **NEVER** treat "by X" as a WHERE clause filter value - it\'s ALWAYS a GROUP BY requirement\n\n3) **VALUE PRESERVATION IS CRITICAL**: If the user question contains multi-word values, preserve them as SINGLE, COMPLETE values in WHERE clauses.\n   - CORRECT: WHERE columnName = \'Multi Word Value\' ✅\n   - WRONG: WHERE columnName = \'Multi\' AND otherColumn = \'Word Value\' ❌\n   - WRONG: WHERE columnName = \'Multi\' ❌ (missing part of value)\n   - If the prompt mentions "Extracted Values", use those EXACT values as single string literals\n   - NEVER split multi-word values into multiple conditions\n   - NEVER truncate values - use the complete value from the user question\n\n4) **NEVER INVENT COLUMN NAMES - THIS IS THE MOST CRITICAL RULE**: You MUST ONLY use column names that are EXPLICITLY listed in the metadata provided. If a column does not exist in the metadata, DO NOT use it. The query will FAIL if you use a non-existent column.\n   - ❌ WRONG: Using column names that don\'t exist in metadata\n   - ✅ CORRECT: Check metadata first, find the exact column name, use that exact name\n   - If user asks about a concept but the table has no matching column, you MUST find what columns DO exist and use those instead\n   - NEVER guess or invent column names based on the question - ALWAYS check metadata first\n   - **IF user asks for "student names" but table only has "studentId"**: JOIN with Student table to get names\n\n5) **COLUMN NAME MATCHING - VERIFY EXISTS**: When the user asks about something:\n   - FIRST: Search the metadata tables for columns that match the concept\n   - Look for EXACT matches first, then similar names\n   - If NO column matches the concept, use the closest column that DOES exist\n   - If you cannot find ANY matching column, use COUNT(*) or a column that exists\n\n6) **VERIFY BEFORE USING - MANDATORY STEP**: Before using ANY column name in your query:\n   - Search the metadata tables for that EXACT column name\n   - Verify it exists in the table you\'re querying\n   - If not found, search for similar names\n   - Use the EXACT column name from metadata, not a variation you invent\n   - If no match exists, DO NOT use that column - find an alternative that DOES exist\n\n7) For queries asking "over month" or "over period", ALWAYS use DATE(date_column) for grouping, NEVER use MONTH() or YEAR() - this ensures charts show multiple data points.\n\n8) MySQL ONLY_FULL_GROUP_BY mode: ALL non-aggregated columns in SELECT must be in GROUP BY clause. If you need a column that cannot be grouped, wrap it in MIN() or MAX() aggregate function.\n\n9) For "differences", "compare", "versus", "vs", "measure differences" questions: Group by ALL dimensions mentioned to enable comparison.\n\n10) **AVOID DUPLICATE ROWS**: When using JOINs, prefer exact matches (e.g., "ON table1.id = table2.id") over LIKE patterns. If you must use LIKE or the query might return duplicates, add DISTINCT or use GROUP BY with aggregations to eliminate duplicates.\n\n**REMEMBER**: The metadata contains the EXACT table and column names. Use them EXACTLY as shown. Never invent or guess names. Preserve complete values from user questions. "BY X" means GROUP BY X, not WHERE X = value. Always return valid JSON only.';
  
  const { estimateTokenCount, getContextLimit } = await import('../utils/token-counter');
  const systemTokens = estimateTokenCount(systemMessage, model);
  const promptTokens = estimateTokenCount(prompt, model);
  const totalTokens = systemTokens + promptTokens;
  const contextLimit = getContextLimit(model);
  const maxTokens = contextLimit - 2000; // Reserve 2000 tokens for response
  
  console.log(`[LLM-SERVICE] 📊 Final token check: System=${systemTokens}, Prompt=${promptTokens}, Total=${totalTokens}, Limit=${maxTokens}`);
  
  if (totalTokens > maxTokens) {
    const excessTokens = totalTokens - maxTokens;
    console.warn(`[LLM-SERVICE] ⚠️ Total tokens (${totalTokens}) exceed limit (${maxTokens}) by ${excessTokens} tokens. Applying aggressive truncation...`);
    
    // Truncate prompt to fit within limits
    const maxPromptTokens = maxTokens - systemTokens - 500; // Reserve extra buffer
    const truncatedPrompt = truncateTextToTokenLimit(prompt, maxPromptTokens, model);
    
    console.log(`[LLM-SERVICE] ✅ Truncated prompt from ${promptTokens} to ${estimateTokenCount(truncatedPrompt, model)} tokens`);
    
    const response = await openai.chat.completions.create({
      model: model,
      messages: [
        {
          role: 'system',
          content: systemMessage,
        },
        {
          role: 'user',
          content: truncatedPrompt,
        },
      ],
      temperature: 0.2,
      response_format: { type: 'json_object' },
    });
    
    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('No response from LLM');
    }
    
    return JSON.parse(content) as AdhocQueryResponse;
  }

  const response = await openai.chat.completions.create({
    model: model,
    messages: [
      {
        role: 'system',
        content: systemMessage,
      },
      {
        role: 'user',
        content: prompt,
      },
    ],
    temperature: 0.2,
    response_format: { type: 'json_object' },
  });

  const content = response.choices[0]?.message?.content;
  if (!content) {
    throw new Error('No response from LLM');
  }

  let result = JSON.parse(content) as AdhocQueryResponse;
  
  // CRITICAL: Post-process query to fix incorrectly split values
  // Example: Multi-word values should not be split into multiple WHERE conditions
  if (result.query_content && questionUnderstanding && extractedValues.length > 0) {
    result.query_content = postProcessQueryForSplitValues(
      result.query_content,
      userQuestion,
      extractedValues,
      questionUnderstanding
    );
  }
  
  // CRITICAL: Validate that the query uses columns that exist in FULL schema metadata BEFORE returning
  // Validation fetches FULL schema for tables in query (not limited columns)
  if (result.query_content && reducedMetadata.tables) {
    const validationResult = await validateQueryColumns(result.query_content, reducedMetadata, connectionString);
    
    if (!validationResult.isValid) {
      console.error(`[LLM-SERVICE] ❌ Query validation failed: ${validationResult.errors.join(', ')}`);
      console.log(`[LLM-SERVICE] 🔧 Attempting to fix query with FULL schema metadata...`);
      
      // Try to fix the query using LLM with FULL schema (validation already fetched it)
      try {
        // Get full metadata for fixing (validation function fetches it, but we need it here too)
        let fullMetadataForFix = reducedMetadata;
        if (connectionString && reducedMetadata.source_type === 'SQL_DB') {
          const tableMatches = [
            ...result.query_content.matchAll(/FROM\s+(\w+)(?:\s+(\w+))?/gi),
            ...result.query_content.matchAll(/JOIN\s+(\w+)(?:\s+(\w+))?/gi),
          ];
          const queryTableNames = Array.from(new Set(
            Array.from(tableMatches).map(m => m[1]).filter(Boolean)
          ));
          
          if (queryTableNames.length > 0) {
            try {
              const { getTablesMetadata } = await import('./system-catalog-service');
              const dataSourceId = (reducedMetadata as any).data_source_id;
              if (dataSourceId) {
                const { prisma } = await import('@/lib/prisma');
                const dataSource = await prisma.dataSource.findUnique({
                  where: { id: dataSourceId },
                });
                if (dataSource?.connectionString) {
                  const fullTables = await getTablesMetadata(
                    { connectionString: dataSource.connectionString },
                    queryTableNames
                  );
                  fullMetadataForFix = {
                    ...reducedMetadata,
                    tables: fullTables,
                  };
                  console.log(`[LLM-SERVICE] ✅ Using FULL schema for fixing (${fullTables.length} tables with complete columns)`);
                }
              }
            } catch (error) {
              console.warn(`[LLM-SERVICE] ⚠️ Could not fetch full schema for fixing, using provided metadata:`, error);
            }
          }
        }
        
        const fixedQuery = await fixQueryColumnsWithLLM(
          result.query_content,
          validationResult.invalidColumns,
          fullMetadataForFix, // Use FULL metadata with all columns
          userQuestion
        );
        
        if (fixedQuery && fixedQuery !== result.query_content) {
          console.log(`[LLM-SERVICE] ✅ Query fixed: ${validationResult.invalidColumns.join(', ')} → corrected`);
          result.query_content = fixedQuery;
          
          // Validate again after fix (will fetch full schema again)
          const revalidation = await validateQueryColumns(fixedQuery, reducedMetadata, connectionString);
          if (!revalidation.isValid) {
            console.warn(`[LLM-SERVICE] ⚠️ Query still has invalid columns after fix: ${revalidation.errors.join(', ')}`);
          } else {
            console.log(`[LLM-SERVICE] ✅ Query validation passed after fix`);
          }
        } else {
          console.warn(`[LLM-SERVICE] ⚠️ Could not fix query, returning original (may fail at execution)`);
        }
      } catch (fixError) {
        console.error(`[LLM-SERVICE] ❌ Failed to fix query:`, fixError);
        // Continue with original query - executor will catch and fix it
      }
    } else {
      console.log(`[LLM-SERVICE] ✅ Query validation passed - all columns exist in FULL schema`);
    }
  }
  
  return result;
}

export async function generateDashboardMetrics(
  metadata: DataSourceMetadata
): Promise<DashboardMetricsResponse> {
  const { estimateMetadataTokens, isMetadataSizeSafe } = await import('../utils/token-counter');
  const model = process.env.OPENAI_MODEL || 'gpt-4-turbo-preview';
  
  // CRITICAL: Select BEST tables FIRST (not just first N tables)
  // This ensures we use the most analytically valuable tables for dashboard metrics
  const allTables = metadata.tables || [];
  let selectedTables: string[] = [];
  
  if (allTables.length > 10) {
    console.log(`[LLM-SERVICE] 🎯 Selecting BEST tables for dashboard (${allTables.length} total tables available)`);
    selectedTables = await identifyKeyTablesForDashboard(metadata, 10);
    console.log(`[LLM-SERVICE] ✅ Selected top ${selectedTables.length} tables: ${selectedTables.join(', ')}`);
  } else {
    selectedTables = allTables.map(t => t.name);
    console.log(`[LLM-SERVICE] ✅ Using all ${selectedTables.length} tables (small database)`);
  }
  
  // Create reduced metadata with ONLY the best tables
  let reducedMetadata: DataSourceMetadata = {
    ...metadata,
    tables: allTables.filter(table => selectedTables.includes(table.name)),
  };
  
  // Check if metadata needs further reduction (column-level)
  if (!isMetadataSizeSafe(reducedMetadata, model)) {
    console.log(`[LLM-SERVICE] ⚠️ Dashboard metadata too large (${estimateMetadataTokens(reducedMetadata)} tokens), reducing columns...`);
    reducedMetadata = {
      ...reducedMetadata,
      tables: reducedMetadata.tables.map(table => ({
        ...table,
        columns: table.columns.slice(0, 15), // Keep more columns for best tables
      })),
    };
    
    // If still too large, reduce further
    if (!isMetadataSizeSafe(reducedMetadata, model)) {
      reducedMetadata = {
        ...reducedMetadata,
        tables: reducedMetadata.tables.map(table => ({
          ...table,
          columns: table.columns.slice(0, 12),
        })),
      };
    }
    
    console.log(`[LLM-SERVICE] ✅ Reduced columns: ${reducedMetadata.tables.length} best tables, ${estimateMetadataTokens(reducedMetadata)} tokens`);
  } else {
    console.log(`[LLM-SERVICE] ✅ Using ${reducedMetadata.tables.length} best tables with all columns (${estimateMetadataTokens(reducedMetadata)} tokens)`);
  }
  
  // Analyze schema GENERICALLY (no domain assumptions)
  const schemaAnalysis = analyzeSchemaGenerically(reducedMetadata);
  
  const prompt = `You are an intelligent analytics engine. Your task is to analyze the schema provided below, detect the domain/business context, and generate MINIMUM 8 (8-10 total) sophisticated dashboard metrics that focus on what's IMPORTANT for that domain.

**CRITICAL REQUIREMENTS - READ CAREFULLY:**
1. **MINIMUM 8 METRICS REQUIRED** - Generate at least 8 metrics, up to 10 total
2. **ALL VISUALIZATION TYPES MUST BE COVERED**: gauge, bar_chart, pie_chart, line_chart, scatter_plot, table
3. **NEVER SHOW ONLY IDs** - Always JOIN with related tables to get names/descriptions when IDs are present
4. **NEVER GENERATE EMPTY QUERIES** - All queries must return data (use COUNT(*), WHERE IS NOT NULL, LIMIT)
5. **ALWAYS INCLUDE PROPER DETAILS** - Users need descriptive names, not just numeric IDs

**STEP 1: DOMAIN DETECTION FROM SCHEMA**
Before generating metrics, you MUST:
1. Analyze the table names and column names in the metadata below
2. Detect what domain/business this database represents (e.g., Education, Real Estate, Medical/Healthcare, Retail, Finance, etc.)
3. Identify what metrics/questions would be MOST IMPORTANT for that domain
4. Focus on business-critical metrics, NOT operational details

**EXAMPLES OF DOMAIN DETECTION:**
- If you see tables/columns like: student, class, attendance, fees, marks, teacher → This is EDUCATION domain
  → Important metrics: Total students, top performers, fees collection, attendance rates, staff metrics
  → AVOID: Unnecessary things like buses, time duration, etc.

- If you see tables/columns like: property, customer, revenue, price, sale, commission → This is REAL ESTATE domain
  → Important metrics: Revenue, customers, sales trends, property types, financial performance
  → AVOID: Unnecessary operational details

- If you see tables/columns like: patient, doctor, appointment, diagnosis, bill → This is MEDICAL domain
  → Important metrics: Patient counts, staff metrics, appointments, billing, treatment patterns
  → AVOID: Unnecessary operational details

**IMPORTANT**: The tables provided below have been INTELLIGENTLY SELECTED by AI as the BEST tables for analytics based on domain understanding and analytical value.

**PRIORITIZE THESE TABLES**: Focus your metrics on these selected tables - they offer the most analytical value.

**CRITICAL ANALYTICAL FOCUS AREAS**:
When generating metrics, ALWAYS prioritize and focus on:
1. **NUMERIC THINGS**: Metrics involving numeric columns (scores, amounts, counts, totals, percentages, quantities, metrics, KPIs)
2. **TIME THINGS**: Metrics involving time/date columns (trends over time, time-based patterns, temporal analysis)
3. **CATEGORY THINGS**: Metrics involving categories (distributions by category, comparisons across categories, category breakdowns)
4. **STATE THINGS**: Metrics involving states/status (state distributions, status analysis, phase/stage analysis)
5. **TOTAL COUNTS THINGS**: Metrics showing total counts, aggregations, summaries
6. **DISTRIBUTION TYPE THINGS**: Metrics suitable for distribution analysis (pie charts, bar charts by category, breakdowns)

**AI DECIDES**: The AI has already analyzed the domain and selected the best tables. Now generate metrics that leverage these tables' strengths in the areas above.

**DATASET STRUCTURE:**

${schemaAnalysis.structureSummary}

**AVAILABLE DATA TYPES:**

${schemaAnalysis.dataTypesSummary}

**CRITICAL REQUIREMENTS:**

1. **NEVER GENERATE QUERIES THAT RETURN EMPTY DATA - CRITICAL RULE**:
   - **MANDATORY**: Generate queries that are GUARANTEED to return data
   - **ALWAYS** use COUNT(*) queries when possible - they always return at least one row
   - **AVOID** complex WHERE clauses that might filter out all data
   - **AVOID** queries on empty tables or columns with all NULL values
   - **PREFER** simple aggregations (COUNT, SUM, AVG) over complex joins
   - **USE** GROUP BY only when you're confident the grouped column has data
   - **TEST** your query logic mentally: "Will this query return at least one row?"
   - If unsure, use simpler queries that are guaranteed to work:
     * "SELECT COUNT(*) as total FROM table" (always works)
     * "SELECT column, COUNT(*) as count FROM table GROUP BY column LIMIT 10" (works if column has values)
     * "SELECT AVG(numeric_column) as avg_value FROM table WHERE numeric_column IS NOT NULL" (works if column has non-null values)
   - **NEVER** generate queries that might return 0 rows - always ensure data exists

2. **NEVER SHOW ONLY IDs - ALWAYS INCLUDE PROPER NAMES/DETAILS - CRITICAL RULE**:
   - **MANDATORY**: If a table has an ID column, you MUST also include the corresponding name/description column
   - **ALWAYS JOIN** with related tables to get names when IDs are present
   - **EXAMPLE**: If querying "QuizAttempt" table with "quizId", JOIN with "Quiz" table to get "quizName" or "quizTitle"
   - **CORRECT**: "SELECT Quiz.name, AVG(QuizAttempt.score) FROM QuizAttempt JOIN Quiz ON QuizAttempt.quizId = Quiz.id GROUP BY Quiz.name"
   - **WRONG**: "SELECT quizId, AVG(score) FROM QuizAttempt GROUP BY quizId" (shows only IDs - users can't understand what quizId=8 means!)
   - **PATTERN**: When you see columns ending in "_id" or "Id", look for related tables with name columns
   - **JOIN PATTERN**: "SELECT RelatedTable.name, MainTable.metric FROM MainTable JOIN RelatedTable ON MainTable.foreignKeyId = RelatedTable.id"
   - **IF name column exists in same table**: Use it directly - "SELECT name, metric FROM table"
   - **IF only ID exists**: JOIN with related table to get name - "SELECT t2.name, t1.metric FROM table1 t1 JOIN table2 t2 ON t1.id = t2.id"
   - **NEVER** show results with just numeric IDs - users need descriptive names to understand the data

2. **DOMAIN-AWARE METRIC GENERATION**:
   - **FIRST**: Analyze the schema below to detect the domain/business context
   - **THEN**: Generate metrics that are IMPORTANT for that domain AND will return data
   - Focus on business-critical insights (e.g., for education: students, performance, fees, attendance)
   - AVOID unnecessary operational metrics (e.g., buses, time duration) unless they're core to the business
   - Use ONLY the actual column names from metadata - do NOT invent column names
   - Detect what's important from the schema structure itself (table names, column names, relationships)
   - **PRIORITIZE** queries that use the most populated tables/columns

2. **NEVER INVENT COLUMN NAMES - CRITICAL RULE**:
   - **MANDATORY**: Before using ANY column in a query, verify it EXISTS in the metadata tables below
   - **NEVER** use column names that are NOT listed in the metadata
   - **NEVER** assume common column names exist (e.g., "score", "name", "date", "status")
   - **ALWAYS** check the metadata first - if a column doesn't exist, find an alternative that DOES exist OR skip that metric
   - **WRONG**: Using "score" when metadata shows "totalMarks" or "percentage"
   - **WRONG**: Using "name" when metadata shows "title" or "label"
   - **CORRECT**: Use the EXACT column name from metadata (e.g., if metadata shows "totalMarks", use "totalMarks", not "score")

3. **USE ONLY WHAT'S ACTUALLY AVAILABLE**:
   - Create metrics based ONLY on the column names and types provided in the metadata
   - If a column type doesn't exist (e.g., no date columns), skip that metric type
   - Adapt your queries to work with whatever columns actually exist
   - Don't force domain-specific concepts onto generic data

4. **INTELLIGENT METRIC SELECTION** (MINIMUM 8 METRICS REQUIRED):

   **CRITICAL**: You MUST generate AT LEAST 8 metrics. Generate 8-10 metrics total.
   
   **MANDATORY VISUALIZATION TYPE COVERAGE** - You MUST include ALL of these types:
   1. **GAUGE** (1-2 metrics) - Key Performance Indicators, single important metrics
   2. **BAR CHART** (2-3 metrics) - Rankings, comparisons, top performers
   3. **PIE CHART** (1-2 metrics) - Distributions, breakdowns by category/status
   4. **LINE CHART** (1-2 metrics) - Time trends (only if date columns exist)
   5. **SCATTER PLOT** (1 metric) - Correlations (only if ≥2 numeric columns exist)
   6. **TABLE** (1 metric) - Detailed lists with proper names/details
   
   After detecting the domain from schema, generate metrics that are IMPORTANT for that domain, focusing on:
   
   **ALWAYS PRIORITIZE THESE ANALYTICAL PATTERNS:**
   - **NUMERIC THINGS**: 2-3 Key Performance Indicators (gauge charts) - Focus on numeric metrics, totals, averages, counts
   - **TIME THINGS**: 1-2 Trend/Time analyses (line charts - only if date columns exist) - Show trends over time, temporal patterns
   - **CATEGORY THINGS**: 1-2 Distribution/Breakdown analyses (pie/bar charts) - Show distributions by category, category comparisons
   - **STATE THINGS**: 1-2 State/Status analyses (bar/pie charts) - Show state distributions, status breakdowns
   - **TOTAL COUNTS THINGS**: 1-2 Count/Aggregation metrics (gauge/bar charts) - Show total counts, aggregations, summaries
   - **DISTRIBUTION TYPE THINGS**: 1-2 Distribution analyses (pie/bar charts) - Show breakdowns, distributions, segmentations
   - 1-2 Ranking/Comparison analyses (bar charts) - Show top performers, comparisons, rankings
   - 1 Correlation analysis (scatter plot - only if ≥2 numeric columns) - If relevant to the domain
   - 1 Detailed list (table) - Show detailed view of important entities

   **CRITICAL**: Choose metrics that answer IMPORTANT questions for the detected domain, ALWAYS focusing on:
   - Numeric metrics (scores, amounts, totals, averages)
   - Time-based patterns (trends, changes over time)
   - Category distributions (breakdowns by category, type, class)
   - State/status analysis (distributions by state, status, phase)
   - Total counts and aggregations
   - Distribution patterns

   **EXAMPLES** (adapt to actual domain):
   - Education: "Total Students" (numeric), "Attendance Trends Over Time" (time), "Performance by Category" (category), "Status Distribution" (state), "Total Counts by Class" (counts), "Grade Distribution" (distribution)
   - Real Estate: "Total Revenue" (numeric), "Sales Trends" (time), "Property Type Distribution" (category), "Status Breakdown" (state), "Total Counts" (counts), "Price Distribution" (distribution)
   - Medical: "Total Patients" (numeric), "Appointment Trends" (time), "Department Distribution" (category), "Treatment Status" (state), "Total Counts" (counts), "Diagnosis Distribution" (distribution)
   
   **AVOID**: Metrics about unnecessary operational details unless they're explicitly important in the schema

**METRIC QUALITY PRINCIPLES:**

1. **INSIGHTFUL**: Not just counts, but meaningful aggregations

2. **ACTIONABLE**: Helps understand patterns and make decisions

3. **CONTEXT-RICH**: Include statistics (totals, averages, ranges) in insight summaries

4. **NATURAL VISUALIZATION**: Each metric should lead naturally to its chart type

**GENERIC METRIC TEMPLATES (ADAPT TO ACTUAL COLUMNS - ALL GUARANTEED TO RETURN DATA):**

1. **GAUGE (Performance KPI)**:

   Query: "SELECT COUNT(*) as total_count FROM [table]" OR "SELECT AVG([numeric_column]) as avg_value FROM [table] WHERE [numeric_column] IS NOT NULL"
   → **ALWAYS** use COUNT(*) first (guaranteed to return data), or add WHERE IS NOT NULL for AVG

   Name: "Total Records" OR "Average [metric_column]"

   Insight: "Total number of records" OR "Overall average [metric] across all records"

2. **BAR CHART (Ranking)**:

   Query: "SELECT [category_column], COUNT(*) as count FROM [table] WHERE [category_column] IS NOT NULL GROUP BY [category_column] ORDER BY count DESC LIMIT 10"
   → **ALWAYS** add WHERE IS NOT NULL and LIMIT to ensure data exists
   → **CRITICAL**: If category_column is an ID, JOIN to get name: "SELECT RelatedTable.name, COUNT(*) as count FROM MainTable JOIN RelatedTable ON MainTable.categoryId = RelatedTable.id WHERE RelatedTable.name IS NOT NULL GROUP BY RelatedTable.name ORDER BY count DESC LIMIT 10"
   → **NEVER** show only IDs - always include names

   Name: "Top 10 [categories] by Count"

   Insight: "Ranking shows [top_category] has highest count"

3. **PIE CHART (Distribution)**:

   Query: "SELECT [status_column], COUNT(*) as count FROM [table] WHERE [status_column] IS NOT NULL GROUP BY [status_column] ORDER BY count DESC"
   → **ALWAYS** add WHERE IS NOT NULL to filter out NULLs

   Name: "[Status] Distribution"

   Insight: "[Most_common_status] accounts for [percentage]% of all records"

4. **LINE CHART (Trend)**:

   Query: "SELECT DATE([date_column]) as date, COUNT(*) as count FROM [table] WHERE [date_column] IS NOT NULL GROUP BY DATE([date_column]) ORDER BY date LIMIT 100"
   → **ALWAYS** add WHERE IS NOT NULL and LIMIT to ensure data exists

   Name: "[Activity] Trends Over Time"

   Insight: "Shows daily patterns with data points"

5. **SCATTER PLOT (Correlation)**:

   Query: "SELECT [numeric_column1], [numeric_column2] FROM [table] WHERE [numeric_column1] IS NOT NULL AND [numeric_column2] IS NOT NULL LIMIT 100"
   → **ALWAYS** add WHERE IS NOT NULL for both columns

   Name: "[Metric1] vs [Metric2] Relationship"

   Insight: "Analyzes correlation between two key metrics"

6. **TABLE (Detailed List)**:

   Query: "SELECT [name_column], [key_metric1], [key_metric2] FROM [table] WHERE [name_column] IS NOT NULL ORDER BY [key_metric1] DESC LIMIT 20"
   → **ALWAYS** add WHERE IS NOT NULL and LIMIT
   → **CRITICAL**: If table only has ID, JOIN with related table: "SELECT RelatedTable.name, MainTable.metric1, MainTable.metric2 FROM MainTable JOIN RelatedTable ON MainTable.foreignKeyId = RelatedTable.id WHERE RelatedTable.name IS NOT NULL ORDER BY MainTable.metric1 DESC LIMIT 20"
   → **NEVER** show only IDs - always include names/descriptions

   Name: "Top [items] by [metric]"

   Insight: "Detailed ranking with multiple metrics for comparison"

**CRITICAL QUERY PATTERNS TO ENSURE DATA:**
- Always start with COUNT(*) queries - they always return at least one row
- Always add WHERE column IS NOT NULL when filtering
- Always use LIMIT to prevent empty results from complex queries
- Always verify the table/column exists and has data before using it
- Prefer simple queries over complex ones - simple queries are more likely to work

**ADAPTATION RULES:**

1. **DOMAIN ANALYSIS PROCESS**:
   - **Step 1**: Read ALL table names and column names in the metadata below
   - **Step 2**: Identify patterns that suggest a domain (e.g., "student", "patient", "property", "customer")
   - **Step 3**: Determine what questions/metrics would be MOST IMPORTANT for that domain
   - **Step 4**: Generate metrics that answer those important questions using ONLY actual column names

2. **COLUMN PATTERN DETECTION**:
   - **Numeric metrics**: columns with numbers, scores, amounts, percentages, counts
   - **Categories**: columns with limited distinct values (status, type, category, class)
   - **Entities**: columns with names, IDs, labels
   - **Dates**: columns with date/time types or names containing date/time

3. **METRIC PRIORITIZATION**:
   - Focus on metrics that provide BUSINESS VALUE for the detected domain
   - Prioritize metrics that answer important questions (e.g., "How many students?", "What's the revenue?", "Who are the top performers?")
   - Avoid metrics about operational details unless they're core to the business
   - Choose the MOST APPROPRIATE columns for each metric type from the actual schema

4. If a column type doesn't exist, skip that metric type

**QUERY GENERATION RULES:**

1. **COLUMN VALIDATION (MANDATORY BEFORE EVERY QUERY)**:
   - **STEP 1**: Look at the metadata tables below
   - **STEP 2**: Find the EXACT column name you want to use
   - **STEP 3**: Verify it exists in the table you're querying
   - **STEP 4**: Use ONLY that exact column name (case-sensitive, spelling-sensitive)
   - **IF COLUMN DOESN'T EXIST**: Find the closest matching column in metadata OR skip that metric entirely
   - **NEVER** use column names like "score", "name", "date" without verifying they exist first

2. **USE EXACT COLUMN NAMES FROM METADATA**:
   - Copy column names EXACTLY as shown in metadata (including case, spelling, underscores)
   - Don't modify column names (e.g., don't change "totalMarks" to "score")
   - Don't assume synonyms exist (e.g., don't use "score" if metadata shows "totalMarks")

3. **FOR DATES**: Use DATE() function for daily trends, MONTH() for monthly, YEAR() for yearly
   - **ONLY** if date columns actually exist in metadata
   - Verify date column exists before using it

4. **INCLUDE AGGREGATE FUNCTIONS** where appropriate (AVG, SUM, COUNT, MAX, MIN)

5. **ADD ORDER BY** for rankings

6. **USE LIMIT** for "Top N" queries

7. **USE GROUP BY** for distributions

8. **SET visualization_type** to "auto"

**COLUMN VALIDATION EXAMPLES**:
- ❌ WRONG: Query uses "score" but metadata shows table has "totalMarks" and "percentage" → Use "totalMarks" or "percentage" instead
- ❌ WRONG: Query uses "name" but metadata shows "title" → Use "title" instead
- ❌ WRONG: Query uses "date" but metadata shows "createdAt" → Use "createdAt" instead
- ✅ CORRECT: Metadata shows table "QuizAttempt" has columns: "studentId", "score", "timeTaken" → Use these exact names
- ✅ CORRECT: Metadata shows table "AIQuiz" has columns: "subject", "totalMarks" → Use "totalMarks", NOT "score"

**DATA SOURCE METADATA:**

**⚠️ CRITICAL: ANALYZE THIS METADATA TO DETECT DOMAIN AND GENERATE IMPORTANT METRICS ⚠️**

The metadata below shows the EXACT tables and columns available. You MUST:

1. **DOMAIN DETECTION PHASE**:
   - Read through ALL tables and columns listed below
   - Analyze table names and column names to detect the domain/business context
   - Identify what metrics/questions would be MOST IMPORTANT for that domain
   - Example: If you see "Student", "Class", "Attendance", "Fees" → This is Education → Focus on students, performance, fees, attendance

2. **METRIC GENERATION PHASE**:
   - Identify which columns are numeric, which are dates, which are categories
   - Generate metrics that answer IMPORTANT questions for the detected domain
   - Use ONLY the column names shown below - do NOT invent or assume column names
   - Focus on business-critical metrics, avoid unnecessary operational details
   - If you need a column that doesn't exist, find the closest match OR skip that metric

${formatMetadata(reducedMetadata)}

**OUTPUT FORMAT:**

{
  "dashboard_metrics": [
    {
      "metric_name": "[Insightful, Generic Metric Name]",
      "query_type": "SQL_QUERY",
      "query_content": "[SQL query using EXACT column names from metadata - ALWAYS include names, never just IDs. JOIN with related tables when IDs are present]",
      "visualization_type": "auto",
      "insight_summary": "[Brief insight including key statistics like total, average, range if applicable]"
    }
    // MINIMUM 7 MORE METRICS (total of at least 8 metrics required)
    // Ensure ALL visualization types are covered: gauge, bar_chart, pie_chart, line_chart, scatter_plot, table
  ]
}

**FINAL VALIDATION CHECKLIST (MANDATORY FOR EVERY METRIC)**:

Before generating each metric, verify:
1. ✅ Domain detected from schema analysis (what domain does this database represent?)
2. ✅ Metric answers an IMPORTANT question for that domain (not just any metric)
3. ✅ All column names used in the query EXIST in the metadata tables above
4. ✅ Table names match EXACTLY what's in metadata
5. ✅ Column types match the query (e.g., using numeric columns for AVG, date columns for DATE())
6. ✅ Metric focuses on business value, avoids unnecessary operational details
7. ✅ If a required column doesn't exist, the metric is skipped or adapted
8. ✅ **CRITICAL**: Query will return data - use COUNT(*) or add WHERE IS NOT NULL, use LIMIT
9. ✅ **CRITICAL**: Query uses the most populated tables/columns (prioritize tables with more columns)
10. ✅ **CRITICAL**: Query is simple enough to execute successfully (avoid complex joins unless necessary)

**CRITICAL REMINDERS**:
- **NEVER RETURN EMPTY DATA** - Every query MUST return at least one row. Use COUNT(*), add WHERE IS NOT NULL, use LIMIT
- **DETECT DOMAIN FIRST** - Analyze schema to understand what domain this is (Education, Real Estate, Medical, etc.)
- **FOCUS ON IMPORTANT METRICS** - Generate metrics that matter for that domain (students/revenue/patients, not buses/time duration)
- **NEVER INVENT COLUMN NAMES** - If metadata shows "totalMarks", use "totalMarks", NOT "score"
- **VERIFY EVERY COLUMN** - Check metadata before using any column name
- **USE ACTUAL COLUMN NAMES** - Work with the actual schema, detect what's important from table/column names
- **ADAPT OR SKIP** - If a column doesn't exist, find an alternative or skip that metric type
- **EXACT MATCHES ONLY** - Use column names exactly as shown in metadata
- **PRIORITIZE SIMPLE QUERIES** - Simple COUNT(*) queries are more reliable than complex aggregations
- **ALWAYS ADD SAFEGUARDS** - Use WHERE IS NOT NULL, LIMIT clauses, and COUNT(*) to ensure data returns

**IMPORTANT**: 
1. First, analyze the schema below to detect the domain/business context
2. Then, generate metrics that answer IMPORTANT questions for that domain
3. Focus on business-critical insights (students, revenue, patients, etc.)
4. Avoid unnecessary operational details (buses, time duration, etc.)
5. Use ONLY the exact column names that exist in the metadata provided above`;

  const response = await openai.chat.completions.create({
    model: process.env.OPENAI_MODEL || 'gpt-4-turbo-preview',
    messages: [
      {
        role: 'system',
        content: 'You are an intelligent analytics dashboard generator that analyzes schemas to detect domains and generates domain-relevant metrics. **CRITICAL RULES**: 1) **MINIMUM 8 METRICS REQUIRED** - Generate at least 8 metrics (8-10 total). 2) **ALL VISUALIZATION TYPES MUST BE COVERED**: gauge, bar_chart, pie_chart, line_chart, scatter_plot, table. 3) **NEVER SHOW ONLY IDs** - Always JOIN with related tables to get names/descriptions when IDs are present. Example: "SELECT Quiz.name, AVG(QuizAttempt.score) FROM QuizAttempt JOIN Quiz ON QuizAttempt.quizId = Quiz.id GROUP BY Quiz.name" (shows names, not IDs). 4) **NEVER GENERATE EMPTY QUERIES** - All queries must return data (use COUNT(*), WHERE IS NOT NULL, LIMIT). 5) FIRST: Analyze the schema (table names, column names) to detect what domain/business this database represents (Education, Real Estate, Medical, etc.). 6) THEN: Generate metrics that answer IMPORTANT questions for that domain (e.g., for Education: students, performance, fees, attendance; for Real Estate: revenue, customers, sales; for Medical: patients, staff, appointments). 7) NEVER invent column names - ONLY use columns that EXIST in the metadata provided. Before using ANY column, you MUST verify it exists in the metadata tables. 8) Work with ONLY the actual column names provided - if metadata shows "totalMarks", use "totalMarks", NOT "score". 9) Focus on business-critical metrics, avoid unnecessary operational details (buses, time duration) unless core to the business. 10) Detect what\'s important from the schema structure itself - use table/column names to understand what matters. 11) Verify every column name against metadata before using it in queries. You create sophisticated metrics that reveal important domain-specific insights using ONLY the exact column names from metadata. Always return valid JSON only.',
      },
      {
        role: 'user',
        content: prompt,
      },
    ],
    temperature: 0.3,
    response_format: { type: 'json_object' },
  });

  const content = response.choices[0]?.message?.content;
  if (!content) {
    throw new Error('No response from LLM');
  }

  const result = JSON.parse(content) as DashboardMetricsResponse;
  
  // CRITICAL VALIDATION: Ensure minimum 8 metrics and all chart types
  if (result.dashboard_metrics && result.dashboard_metrics.length > 0) {
    const metrics = result.dashboard_metrics;
    
    // Check if we have at least 8 metrics
    if (metrics.length < 8) {
      console.warn(`[LLM-SERVICE] ⚠️ Only ${metrics.length} metrics generated, minimum 8 required. Requesting more metrics...`);
      // Note: In production, you might want to retry or add more metrics here
    }
    
    // Check visualization type coverage
    const visualizationTypes = new Set(metrics.map(m => (m.visualization_type || 'auto') as string));
    const requiredTypes = ['gauge', 'bar_chart', 'pie_chart', 'line_chart', 'scatter_plot', 'table'];
    const missingTypes = requiredTypes.filter(type => !visualizationTypes.has(type));
    
    if (missingTypes.length > 0) {
      console.warn(`[LLM-SERVICE] ⚠️ Missing visualization types: ${missingTypes.join(', ')}`);
    }
    
    console.log(`[LLM-SERVICE] ✅ Generated ${metrics.length} dashboard metrics`);
    console.log(`[LLM-SERVICE] 📊 Visualization types covered: ${Array.from(visualizationTypes).join(', ')}`);
  }

  return result;
}

/**
 * Helper function: Generic schema analysis
 * Analyzes schema without making domain assumptions
 */
function analyzeSchemaGenerically(metadata: DataSourceMetadata): {
  structureSummary: string;
  dataTypesSummary: string;
} {
  const tables = metadata.tables || [];
  
  // Count different column types
  let numericCols = 0;
  let dateCols = 0;
  let textCols = 0;
  let categoryCols = 0;
  
  tables.forEach(table => {
    table.columns?.forEach(col => {
      const type = (col.type || '').toUpperCase();
      const name = (col.name || '').toLowerCase();
      
      // Check for numeric types
      if (['INT', 'INTEGER', 'BIGINT', 'DECIMAL', 'FLOAT', 'DOUBLE', 'NUMERIC', 'REAL'].some(t => type.includes(t))) {
        numericCols++;
      }
      // Check for date types
      else if (['DATE', 'DATETIME', 'TIMESTAMP', 'TIME'].some(t => type.includes(t)) || 
               name.includes('date') || name.includes('time') || name.includes('created') || name.includes('updated')) {
        dateCols++;
      }
      // Check for category columns (based on naming patterns)
      else if (name.includes('status') || name.includes('type') || name.includes('category') || 
               name.includes('class') || name.includes('group')) {
        categoryCols++;
        textCols++;
      }
      else {
        textCols++;
      }
    });
  });
  
  const structureSummary = `Tables: ${tables.length}\nColumns by type: Numeric (${numericCols}), Date/Time (${dateCols}), Text/Category (${textCols})`;
  
  const dataTypesSummary = `Available for analysis:
${numericCols > 0 ? '✓ Numeric metrics (for KPIs, averages, sums)' : '✗ No numeric columns'}
${dateCols > 0 ? '✓ Date/Time data (for trends over time)' : '✗ No date columns'}
${categoryCols > 0 ? '✓ Category columns (for distributions, comparisons)' : '✗ No obvious category columns'}
${textCols > 0 ? '✓ Text columns (for labels, names, entities)' : '✗ No text columns'}`;
  
  return { structureSummary, dataTypesSummary };
}

/**
 * Post-process SQL query to fix incorrectly split values
 * Example: Multi-word values should not be split into multiple WHERE conditions
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
  groupByPattern?: {
    detected: boolean;
    dimension: string;
    requiresJoin: boolean;
    joinEntity?: string;
  };
}> {
  try {
    console.log(`[LLM-SERVICE] 🧠 Step 1: Understanding question semantics: "${userQuestion}"`);
    
    // CRITICAL: Detect GROUP BY patterns BEFORE LLM analysis
    const groupByPattern = detectGroupByPattern(userQuestion);
    
    const understandingPrompt = `Analyze this natural language question and extract its semantic meaning:

Question: "${userQuestion}"

Extract and return JSON with:
1. "intent": The main intent/goal of the question (e.g., "compare", "find trends", "calculate average", "identify top performers")
2. "keyConcepts": Array of key concepts/domains mentioned (e.g., ["students", "scores", "assignments", "performance"])
3. "entities": Array of specific entities/objects mentioned (e.g., ["student", "quiz", "assignment", "score"])
4. "queryType": Type of query needed (e.g., "aggregation", "comparison", "trend_analysis", "filtering", "ranking", "grouped_aggregation")
5. "semanticSummary": A concise semantic summary that captures the meaning and context
6. "groupByDetected": Boolean indicating if the question requires GROUP BY (e.g., "by X", "grouped by X", "per X")
7. "groupByDimension": If groupByDetected is true, the dimension to group by (e.g., "student names", "category", "month")
8. "requiresJoin": Boolean indicating if grouping by entity names requires JOIN with another table (e.g., "by student names" requires JOIN with Student table)

CRITICAL PATTERN RECOGNITION:
- "metric by X" or "metric grouped by X" → groupByDetected: true, groupByDimension: X
- "by X names" or "by X" where X is an entity → requiresJoin: true (need to JOIN with X table to get names)
- Examples:
  * "average time by student names" → groupByDetected: true, groupByDimension: "student names", requiresJoin: true, joinEntity: "student"
  * "count by category" → groupByDetected: true, groupByDimension: "category", requiresJoin: false
  * "sum by month" → groupByDetected: true, groupByDimension: "month", requiresJoin: false

Return ONLY valid JSON, no explanations:`;

    const response = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-4-turbo-preview',
      messages: [
        {
          role: 'system',
          content: 'You are an expert at understanding natural language questions and extracting their semantic meaning, especially GROUP BY patterns. Return only valid JSON.',
        },
        {
          role: 'user',
          content: understandingPrompt,
        },
      ],
      temperature: 0.1, // Low temperature for consistent understanding
      response_format: { type: 'json_object' },
      max_tokens: 400, // Increased to accommodate GROUP BY detection
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('No response from LLM for question understanding');
    }

    const understanding = JSON.parse(content);
    
    // Merge detected pattern with LLM understanding (pattern detection takes precedence)
    const finalGroupByPattern = groupByPattern.detected ? groupByPattern : {
      detected: understanding.groupByDetected || false,
      dimension: understanding.groupByDimension || '',
      requiresJoin: understanding.requiresJoin || false,
      joinEntity: understanding.joinEntity || undefined,
    };
    
    console.log(`[LLM-SERVICE] ✅ Question understanding complete:`);
    console.log(`[LLM-SERVICE]   Intent: ${understanding.intent}`);
    console.log(`[LLM-SERVICE]   Query Type: ${understanding.queryType}`);
    console.log(`[LLM-SERVICE]   Key Concepts: ${understanding.keyConcepts?.join(', ') || 'none'}`);
    console.log(`[LLM-SERVICE]   Entities: ${understanding.entities?.join(', ') || 'none'}`);
    if (finalGroupByPattern.detected) {
      console.log(`[LLM-SERVICE]   🎯 GROUP BY DETECTED: dimension="${finalGroupByPattern.dimension}", requiresJoin=${finalGroupByPattern.requiresJoin}${finalGroupByPattern.joinEntity ? `, joinEntity="${finalGroupByPattern.joinEntity}"` : ''}`);
    }
    
    return {
      intent: understanding.intent || '',
      keyConcepts: understanding.keyConcepts || [],
      entities: understanding.entities || [],
      queryType: understanding.queryType || 'general',
      semanticSummary: understanding.semanticSummary || userQuestion,
      groupByPattern: finalGroupByPattern,
    };
  } catch (error) {
    console.error('[LLM-SERVICE] ⚠️ Question understanding failed, using original question:', error);
    // Fallback: detect GROUP BY pattern even on error
    const groupByPattern = detectGroupByPattern(userQuestion);
    return {
      intent: 'general_query',
      keyConcepts: [],
      entities: [],
      queryType: groupByPattern.detected ? 'grouped_aggregation' : 'general',
      semanticSummary: userQuestion,
      groupByPattern,
    };
  }
}

/**
 * Detects GROUP BY patterns in natural language questions
 * This is a critical pattern recognition function to prevent "by X" being treated as WHERE clause values
 */
function detectGroupByPattern(question: string): {
  detected: boolean;
  dimension: string;
  requiresJoin: boolean;
  joinEntity?: string;
} {
  const questionLower = question.toLowerCase();
  
  // Pattern: "metric by X" or "metric grouped by X" or "metric per X"
  const groupByPatterns = [
    /\b(?:by|grouped by|per|for each)\s+([^?.,!]+?)(?:\s+in\s+|\s*$|\?|\.|,|!)/i,
    /\b(?:by|grouped by|per)\s+([^?.,!]+?)\s+names/i,
  ];
  
  for (const pattern of groupByPatterns) {
    const match = question.match(pattern);
    if (match) {
      const dimension = match[1].trim();
      
      // Check if dimension mentions entity names (requires JOIN)
      const entityNamePatterns = [
        /(\w+)\s+names?/i,  // "student names", "class names"
        /names?\s+of\s+(\w+)/i,  // "names of students"
      ];
      
      let requiresJoin = false;
      let joinEntity: string | undefined;
      
      for (const entityPattern of entityNamePatterns) {
        const entityMatch = dimension.match(entityPattern);
        if (entityMatch) {
          requiresJoin = true;
          joinEntity = entityMatch[1].toLowerCase();
          break;
        }
      }
      
      // Also check for common entity patterns
      if (!requiresJoin && /names?|name/i.test(dimension)) {
        // Extract entity before "names"
        const beforeNames = dimension.match(/(\w+)\s+names?/i);
        if (beforeNames) {
          requiresJoin = true;
          joinEntity = beforeNames[1].toLowerCase();
        }
      }
      
      console.log(`[LLM-SERVICE] 🎯 GROUP BY pattern detected: "${dimension}" (requiresJoin: ${requiresJoin}${joinEntity ? `, joinEntity: ${joinEntity}` : ''})`);
      
      return {
        detected: true,
        dimension,
        requiresJoin,
        joinEntity,
      };
    }
  }
  
  return {
    detected: false,
    dimension: '',
    requiresJoin: false,
  };
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
    groupByPattern?: {
      detected: boolean;
      dimension: string;
      requiresJoin: boolean;
      joinEntity?: string;
    };
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
 * Identifies key tables for dashboard metrics generation using AI
 * 
 * Uses AI to:
 * 1. Understand the domain/business context from database schema
 * 2. Select BEST tables based on domain understanding and analytical value
 * 3. Focus on: numeric things, time things, category things, state things, total counts, distributions
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

  console.log(`[LLM-SERVICE] 🤖 Using AI to understand domain and select best ${maxTables} tables from ${allTables.length} total tables...`);

  try {
    // Step 1: Prepare schema summary for AI analysis
    const schemaSummary = allTables.map(table => {
      const columns = table.columns || [];
      const columnTypes = columns.map(col => ({
        name: col.name,
        type: col.type || 'unknown',
      }));
      
      return {
        tableName: table.name,
        description: table.description || '',
        columnCount: columns.length,
        columns: columnTypes.slice(0, 20), // Limit to first 20 columns for token efficiency
      };
    });

    // Step 2: Use AI to understand domain and select best tables
    const domainAnalysisPrompt = `You are an expert database analyst. Analyze the database schema below and:

1. **UNDERSTAND THE DOMAIN**: What business/domain does this database represent? (Education, Healthcare, Finance, Retail, Real Estate, etc.)
   - Analyze table names, column names, and descriptions
   - Identify the primary business context

2. **SELECT BEST TABLES FOR ANALYTICS**: From the ${allTables.length} tables provided, select the top ${maxTables} tables that are MOST VALUABLE for dashboard analytics.

**SELECTION CRITERIA - Focus on tables with:**
- **NUMERIC THINGS**: Tables with numeric columns (scores, amounts, counts, totals, percentages, quantities, metrics)
- **TIME THINGS**: Tables with date/time columns (created_at, updated_at, date, timestamp, period, deadline)
- **CATEGORY THINGS**: Tables with category/classification columns (status, type, category, class, group, department, level)
- **STATE THINGS**: Tables with state/status columns (state, status, phase, stage, condition)
- **TOTAL COUNTS THINGS**: Tables that track counts, totals, aggregations
- **DISTRIBUTION TYPE THINGS**: Tables suitable for distribution analysis (pie charts, bar charts by category)

**AVOID:**
- Lookup/reference tables (only IDs and names)
- System tables (log, audit, temp, cache, session)
- Tables with very few columns (< 3 columns)
- Tables that don't support meaningful analytics

**DATABASE SCHEMA:**
${JSON.stringify(schemaSummary, null, 2)}

**RETURN JSON FORMAT:**
{
  "domain": "Detected domain (e.g., Education, Healthcare, Finance, etc.)",
  "domainReasoning": "Brief explanation of why you identified this domain",
  "selectedTables": [
    {
      "tableName": "exact table name",
      "priority": 1-${maxTables},
      "reasoning": "Why this table is valuable for analytics - mention numeric/time/category/state/count/distribution aspects"
    }
  ]
}

**CRITICAL**: Return ONLY valid JSON. Select exactly ${maxTables} tables, ordered by priority (1 = highest priority).`;

    const response = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-4-turbo-preview',
      messages: [
        {
          role: 'system',
          content: 'You are an expert database analyst specializing in identifying the best tables for business analytics and dashboard metrics. Return only valid JSON.',
        },
        {
          role: 'user',
          content: domainAnalysisPrompt,
        },
      ],
      temperature: 0.2, // Low temperature for consistent analysis
      response_format: { type: 'json_object' },
      max_tokens: 2000,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('No response from AI for domain analysis');
    }

    const analysis = JSON.parse(content);
    
    console.log(`[LLM-SERVICE] 🎯 Domain detected: ${analysis.domain || 'Unknown'}`);
    if (analysis.domainReasoning) {
      console.log(`[LLM-SERVICE] 📊 Domain reasoning: ${analysis.domainReasoning}`);
    }

    const selectedTables = analysis.selectedTables || [];
    
    if (selectedTables.length === 0) {
      console.warn(`[LLM-SERVICE] ⚠️ AI returned no tables, falling back to first ${maxTables} tables`);
      return allTables.slice(0, maxTables).map(t => t.name);
    }

    // Extract table names in priority order
    const tableNames = selectedTables
      .sort((a: any, b: any) => (a.priority || 999) - (b.priority || 999))
      .map((item: any) => item.tableName)
      .filter((name: string) => allTables.some(t => t.name === name)); // Validate table exists

    // Ensure we have exactly maxTables (or as many as available)
    const finalTables = tableNames.slice(0, maxTables);

    console.log(`[LLM-SERVICE] 🎯 AI Selected ${finalTables.length} BEST tables for dashboard (${analysis.domain || 'domain'}):`);
    selectedTables.slice(0, finalTables.length).forEach((item: any, idx: number) => {
      console.log(`[LLM-SERVICE]   ${idx + 1}. ${item.tableName}${item.reasoning ? ` - ${item.reasoning}` : ''}`);
    });

    return finalTables;
  } catch (error) {
    console.error('[LLM-SERVICE] ❌ AI-based table selection failed:', error);
    console.log('[LLM-SERVICE] ⚠️ Falling back to simple selection (first tables with most columns)');
    
    // Fallback: Select tables with most columns (simple heuristic)
    const fallbackTables = allTables
      .map(table => ({
        name: table.name,
        columnCount: (table.columns || []).length,
      }))
      .filter(t => t.columnCount >= 3) // At least 3 columns
      .sort((a, b) => b.columnCount - a.columnCount)
      .slice(0, maxTables)
      .map(t => t.name);

    console.log(`[LLM-SERVICE] ✅ Fallback: Selected ${fallbackTables.length} tables by column count`);
    return fallbackTables;
  }
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
 * Validates that all columns in a SQL query exist in the metadata
 * CRITICAL: Fetches FULL schema metadata for validation (not limited columns)
 */
async function validateQueryColumns(
  query: string,
  metadata: DataSourceMetadata,
  connectionString?: string
): Promise<{
  isValid: boolean;
  invalidColumns: string[];
  errors: string[];
}> {
  const invalidColumns: string[] = [];
  const errors: string[] = [];
  
  // CRITICAL: Extract tables from query to fetch FULL schema metadata
  const tableMatches = [
    ...query.matchAll(/FROM\s+(\w+)(?:\s+(\w+))?/gi),
    ...query.matchAll(/JOIN\s+(\w+)(?:\s+(\w+))?/gi),
  ];
  
  const queryTableNames = new Set<string>();
  tableMatches.forEach(match => {
    if (match[1]) queryTableNames.add(match[1]);
  });
  
  // CRITICAL: Fetch FULL schema metadata for tables used in query (not limited columns)
  let fullMetadata = metadata;
  if (connectionString && metadata.source_type === 'SQL_DB' && queryTableNames.size > 0) {
    try {
      console.log(`[LLM-SERVICE] 🔍 Fetching FULL schema metadata for validation (tables: ${Array.from(queryTableNames).join(', ')})`);
      const { getTablesMetadata } = await import('./system-catalog-service');
      const dataSourceId = (metadata as any).data_source_id;
      
      if (dataSourceId) {
        const { prisma } = await import('@/lib/prisma');
        const dataSource = await prisma.dataSource.findUnique({
          where: { id: dataSourceId },
        });
        
        if (dataSource?.connectionString) {
          const fullTables = await getTablesMetadata(
            { connectionString: dataSource.connectionString },
            Array.from(queryTableNames)
          );
          
          // Build full column map from complete schema
          fullMetadata = {
            ...metadata,
            tables: fullTables,
          };
          console.log(`[LLM-SERVICE] ✅ Fetched FULL schema: ${fullTables.length} tables with complete columns`);
        }
      }
    } catch (error) {
      console.warn(`[LLM-SERVICE] ⚠️ Could not fetch full schema for validation, using provided metadata:`, error);
      // Continue with provided metadata
    }
  }
  
  // Build column map from FULL metadata (all columns, not limited)
  const columnMap = new Map<string, Set<string>>(); // table -> set of columns
  const allColumns = new Set<string>();
  
  fullMetadata.tables?.forEach(table => {
    const tableColumns = new Set<string>();
    table.columns?.forEach(col => {
      const colLower = col.name.toLowerCase();
      tableColumns.add(colLower);
      allColumns.add(colLower);
      // Also add table.column format
      allColumns.add(`${table.name.toLowerCase()}.${colLower}`);
    });
    columnMap.set(table.name.toLowerCase(), tableColumns);
  });
  
  // Extract table names from query (already extracted above, reuse)
  const queryTables = new Map<string, string>(); // alias -> actual table name
  tableMatches.forEach(match => {
    const tableName = match[1];
    const alias = match[2] || match[4];
    if (tableName) {
      queryTables.set(tableName.toLowerCase(), tableName.toLowerCase());
      if (alias) {
        queryTables.set(alias.toLowerCase(), tableName.toLowerCase());
      }
    }
  });
  
  // Extract column references from query
  // CRITICAL: Skip SQL aliases (AS alias_name) and functions (GROUP_CONCAT, COUNT, etc.)
  // Only validate actual column references, not aliases or function names
  
  // SQL keywords and functions to skip
  const sqlKeywords = new Set([
    'select', 'from', 'where', 'group', 'by', 'order', 'join', 'inner', 'outer',
    'left', 'right', 'on', 'and', 'or', 'not', 'in', 'like', 'between', 'is',
    'null', 'as', 'distinct', 'count', 'sum', 'avg', 'max', 'min', 'case',
    'when', 'then', 'else', 'end', 'limit', 'offset', 'having', 'union',
    'group_concat', 'concat', 'date', 'year', 'month', 'day', 'upper', 'lower',
    'trim', 'substring', 'coalesce', 'ifnull', 'cast', 'convert'
  ]);
  
  // Get all table names (case-insensitive) to skip them
  const allTableNamesLower = new Set(
    Array.from(queryTableNames).map(t => t.toLowerCase())
  );
  
  // Extract column references more carefully:
  // 1. Match table.column patterns
  // 2. Match bare columns in SELECT, WHERE, GROUP BY, ORDER BY, JOIN ON
  // 3. Skip aliases (anything after AS)
  // 4. Skip function calls (GROUP_CONCAT(...), COUNT(...), etc.)
  
  // Pattern 1: table.column (e.g., FeeStructure.className)
  const tableColumnPattern = /\b(\w+)\.(\w+)\b/gi;
  const tableColumnMatches = Array.from(query.matchAll(tableColumnPattern));
  
  // Pattern 2: Bare columns in SELECT clause (before FROM)
  const selectClause = query.match(/SELECT\s+(.*?)\s+FROM/gi)?.[0] || '';
  // Remove function calls and aliases from SELECT clause
  const cleanedSelect = selectClause
    .replace(/\b(GROUP_CONCAT|CONCAT|COUNT|SUM|AVG|MAX|MIN|DATE|YEAR|MONTH|DAY|UPPER|LOWER|TRIM|SUBSTRING|COALESCE|IFNULL|CAST|CONVERT)\s*\([^)]*\)/gi, '')
    .replace(/\bAS\s+\w+/gi, '')
    .replace(/\([^)]*\)/g, '');
  
  const bareColumnPattern = /\b(\w+)\b/gi;
  const bareColumnMatches = Array.from(cleanedSelect.matchAll(bareColumnPattern));
  
  const seenColumns = new Set<string>();
  
  // Validate table.column patterns (e.g., FeeStructure.className)
  for (const match of tableColumnMatches) {
    const tableName = match[1].toLowerCase();
    const columnName = match[2].toLowerCase();
    
    // Skip if it's a SQL keyword
    if (sqlKeywords.has(columnName) || sqlKeywords.has(tableName)) continue;
    
    // Find the actual table (handle case-insensitive matching)
    const actualTable = queryTables.get(tableName) || 
                        Array.from(queryTables.values()).find(t => t.toLowerCase() === tableName);
    
    if (actualTable) {
      const tableColumns = columnMap.get(actualTable.toLowerCase());
      if (tableColumns && !tableColumns.has(columnName)) {
        const key = `${tableName}.${columnName}`;
        if (!seenColumns.has(key)) {
          invalidColumns.push(key);
          errors.push(`Column "${columnName}" does not exist in table "${actualTable}"`);
          seenColumns.add(key);
        }
      }
    }
  }
  
  // Validate bare columns in SELECT clause (excluding functions and aliases)
  for (const match of bareColumnMatches) {
    const columnName = match[1].toLowerCase();
    
    // Skip SQL keywords and functions
    if (sqlKeywords.has(columnName)) continue;
    
    // Skip if it's a table name (case-insensitive)
    if (allTableNamesLower.has(columnName)) continue;
    
    // Check if column exists in any query table
    let found = false;
    for (const [alias, actualTable] of queryTables) {
      const tableColumns = columnMap.get(actualTable.toLowerCase());
      if (tableColumns && tableColumns.has(columnName)) {
        found = true;
        break;
      }
    }
    
    if (!found && !allColumns.has(columnName)) {
      const key = columnName;
      if (!seenColumns.has(key)) {
        invalidColumns.push(key);
        errors.push(`Column "${columnName}" does not exist in any table used in the query`);
        seenColumns.add(key);
      }
    }
  }
  
  return {
    isValid: invalidColumns.length === 0,
    invalidColumns,
    errors
  };
}

/**
 * Fixes query columns using LLM when validation fails
 */
async function fixQueryColumnsWithLLM(
  query: string,
  invalidColumns: string[],
  metadata: DataSourceMetadata,
  userQuestion: string
): Promise<string> {
  try {
    // Build schema context for tables used in query
    const tableMatches = [
      ...query.matchAll(/FROM\s+(\w+)(?:\s+(\w+))?/gi),
      ...query.matchAll(/JOIN\s+(\w+)(?:\s+(\w+))?/gi),
    ];
    
    const queryTables = new Set<string>();
    tableMatches.forEach(match => {
      if (match[1]) queryTables.add(match[1].toLowerCase());
    });
    
    let schemaContext = '';
    metadata.tables?.forEach(table => {
      if (queryTables.has(table.name.toLowerCase())) {
        const columns = table.columns?.map(c => c.name).join(', ') || 'none';
        schemaContext += `\nTable ${table.name}: ${columns}`;
      }
    });
    
    const { createTracedOpenAI } = await import('../utils/langsmith-tracer');
    const openai = createTracedOpenAI();
    
    const prompt = `Fix this SQL query by replacing invalid columns with correct ones from the schema.

Original Query:
${query}

Invalid Columns: ${invalidColumns.join(', ')}

Available Schema:${schemaContext}

${userQuestion ? `User Question: "${userQuestion}"\n` : ''}

CRITICAL REQUIREMENTS:
1. Replace ONLY the invalid columns with correct column names from the schema above
2. Maintain the EXACT intent and logic of the original query
3. Use EXACT column names from the schema - do NOT invent new names
4. Find columns in the schema that match the concept/intent of the invalid column
5. Keep all other parts of the query identical (WHERE, GROUP BY, ORDER BY, etc.)
6. Return ONLY the corrected SQL query, no explanations

Return ONLY the corrected SQL query:`;

    const response = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-4-turbo-preview',
      messages: [
        {
          role: 'system',
          content: 'You are an expert SQL query fixer. Fix column name errors by replacing invalid columns with correct ones from the provided schema. Never invent column names - only use columns that exist in the schema.',
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
    
    // Clean up query
    const cleanedQuery = fixedQuery
      .replace(/^```sql\s*/i, '')
      .replace(/```\s*$/i, '')
      .replace(/^```\s*/i, '')
      .trim();

    return cleanedQuery;
  } catch (error) {
    console.error('[LLM-SERVICE] Error fixing query columns:', error);
    return query;
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

