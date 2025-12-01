# Complete System Flow - End-to-End Explanation

## 🎯 Overview

This document explains the **complete flow** of the analytics engine from file upload to visualization, covering all components and their interactions.

---

## 📊 **FLOW 1: File Upload & Schema Detection**

### Step-by-Step Flow:

```
1. User uploads file (CSV/JSON/Excel/Text)
   ↓
2. Frontend: FileUpload.tsx
   - Validates file type (.csv, .json, .xlsx, .xls, .txt)
   - Validates file size (< 10MB)
   - Shows upload progress
   ↓
3. POST /api/analytics/upload
   - Saves file to /uploads directory
   - Generates unique filename: timestamp_filename.ext
   - Returns: { file_path, file_name, file_size, file_type }
   ↓
4. Frontend calls POST /api/analytics/schema
   - Sends: { source_type: 'CSV_FILE', file_path, file_type }
   ↓
5. Backend: processFile() in file-processor.ts
   - Reads file content
   - Detects file type (CSV/JSON/Excel/Text)
   - Parses first few rows
   - Infers column types (INT, DECIMAL, TEXT, DATE, BOOLEAN)
   - Creates TableMetadata structure
   ↓
6. Backend saves to FileMetadata table (Prisma)
   - Stores: fileName, filePath, fileType, fileSize, metadata (JSON)
   ↓
7. Returns DataSourceMetadata:
   {
     source_type: 'CSV_FILE',
     tables: [{
       name: 'comprehensive_student_data_5k',
       columns: [
         { name: 'cgpa', type: 'DECIMAL' },
         { name: 'full_name', type: 'TEXT' },
         ...
       ]
     }],
     file_path: '/uploads/1234567890_file.csv'
   }
   ↓
8. Frontend updates metadata state
   - DashboardMetrics and AdhocQuery components receive metadata
   - Ready for queries!
```

**Key Files:**
- `components/analytics/FileUpload.tsx`
- `app/api/analytics/upload/route.ts`
- `app/api/analytics/schema/route.ts`
- `analytics-engine/services/file-processor.ts`
- `analytics-engine/services/query-history-service.ts` (saves FileMetadata)

---

## 📊 **FLOW 2: Dashboard Metrics Generation**

### Step-by-Step Flow:

```
1. User navigates to Dashboard Metrics tab
   ↓
2. Frontend: DashboardMetrics.tsx
   - useEffect triggers loadDashboardMetrics()
   - Shows loading spinner
   ↓
3. POST /api/analytics
   Body: {
     mode: 'DASHBOARD_METRICS',
     metadata: { source_type, tables, file_path, ... }
   }
   ↓
4. Backend: llm-service.ts → generateDashboardMetrics()
   - Constructs MASTER_PROMPT_TEMPLATE with metadata
   - Sends to OpenAI GPT-4
   - Prompt instructs AI to:
     * Analyze metadata to understand data domain
     * Generate 6-8 key metrics covering ALL chart types
     * Use actual column names from metadata
     * Create queries that return multiple rows for visualization
   ↓
5. OpenAI returns JSON:
   {
     dashboard_metrics: [
       {
         metric_name: "Average CGPA by Academic Stream",
         query_type: "SQL_QUERY",
         query_content: "SELECT academic_stream, AVG(cgpa) as avg_cgpa FROM comprehensive_student_data_5k GROUP BY academic_stream ORDER BY avg_cgpa DESC",
         visualization_type: "auto",
         insight_summary: "..."
       },
       // ... 5-7 more metrics
     ]
   }
   ↓
6. Backend: query-post-processor.ts
   - Post-processes queries to ensure correct table names
   - Fixes any table name mismatches
   ↓
7. Returns dashboard_metrics array to frontend
   ↓
8. Frontend: DashboardMetrics.tsx
   - Sets metrics state
   - For each metric, calls executeMetricQuery()
   ↓
9. For each metric:
   POST /api/analytics/execute
   Body: {
     query_type: 'SQL_QUERY',
     query_content: 'SELECT ...',
     source_type: 'CSV_FILE',
     file_path: '/uploads/...',
     file_type: 'CSV'
   }
   ↓
10. Backend: csv-query-executor.ts → executeCSVQuery()
    - Reads CSV file
    - Parses SQL query (SELECT, FROM, WHERE, GROUP BY, ORDER BY, LIMIT)
    - Applies WHERE filters
    - Groups records (if GROUP BY)
    - Calculates aggregates (COUNT, SUM, AVG, MAX, MIN)
    - Sorts results (ORDER BY)
    - Limits results (LIMIT)
    - Returns array of objects
    ↓
11. Frontend receives results
    - Stores in metricResults state: { [metric_name]: results[] }
    ↓
12. Frontend: VisualizationRenderer
    - Calls autoSelectVisualizationType() to choose chart type
    - Renders appropriate chart component (BarChart, LineChart, PieChart, etc.)
    ↓
13. User sees 6-8 beautiful visualizations!
```

**Key Files:**
- `components/analytics/DashboardMetrics.tsx`
- `app/api/analytics/route.ts`
- `analytics-engine/services/llm-service.ts`
- `analytics-engine/services/query-post-processor.ts`
- `app/api/analytics/execute/route.ts`
- `analytics-engine/services/csv-query-executor.ts`
- `analytics-engine/services/visualization-selector.ts`
- `components/analytics/VisualizationRenderer.tsx`

---

## 📊 **FLOW 3: Ad-Hoc Query (Natural Language → SQL → Results)**

### Step-by-Step Flow:

```
1. User types question: "What is the average CGPA by academic stream?"
   ↓
2. Frontend: AdhocQuery.tsx
   - User clicks "Ask" button
   - Shows loading state
   ↓
3. POST /api/analytics
   Body: {
     mode: 'ADHOC_QUERY',
     metadata: { source_type, tables, file_path, ... },
     user_question: "What is the average CGPA by academic stream?"
   }
   ↓
4. Backend: llm-service.ts → generateAdhocQuery()
   - Constructs MASTER_PROMPT_TEMPLATE with:
     * User question
     * Data source metadata (tables, columns, types)
     * Instructions to generate EXACT SQL query
   - Sends to OpenAI GPT-4
   ↓
5. OpenAI analyzes question and metadata:
   - Understands: "average CGPA" → AVG(cgpa)
   - Understands: "by academic stream" → GROUP BY academic_stream
   - Uses exact column names from metadata
   ↓
6. OpenAI returns JSON:
   {
     query_type: "SQL_QUERY",
     query_content: "SELECT academic_stream, AVG(cgpa) as avg_cgpa FROM comprehensive_student_data_5k GROUP BY academic_stream ORDER BY avg_cgpa DESC",
     visualization_type: "auto",
     insight_summary: "Average CGPA varies across academic streams..."
   }
   ↓
7. Frontend receives result
   - Displays generated SQL query
   - Displays insight summary
   - Automatically calls executeQuery()
   ↓
8. POST /api/analytics/execute
   Body: {
     query_type: 'SQL_QUERY',
     query_content: 'SELECT academic_stream, AVG(cgpa)...',
     source_type: 'CSV_FILE',
     file_path: '/uploads/...',
     file_type: 'CSV'
   }
   ↓
9. Backend: csv-query-executor.ts → executeCSVQuery()
   - Parses SQL query
   - Reads CSV file
   - Applies GROUP BY academic_stream
   - Calculates AVG(cgpa) per group
   - Orders by avg_cgpa DESC
   - Returns: [
       { academic_stream: 'Science', avg_cgpa: 8.5 },
       { academic_stream: 'Commerce', avg_cgpa: 7.8 },
       ...
     ]
   ↓
10. Frontend receives results
    - Stores in queryResults state
    ↓
11. Frontend: VisualizationRenderer
    - Calls autoSelectVisualizationType()
    - Analyzes: multiple rows, GROUP BY, numeric values
    - Selects: 'bar_chart' (best for comparisons)
    - Renders BarChart component
    ↓
12. User sees beautiful bar chart!
    ↓
13. Frontend automatically saves to QueryHistory
    POST /api/analytics/history
    Body: {
      userQuestion: "What is the average CGPA by academic stream?",
      queryType: "SQL_QUERY",
      queryContent: "SELECT ...",
      sourceType: "CSV_FILE",
      filePath: "/uploads/...",
      results: [...]
    }
    ↓
14. Saved to database (QueryHistory table)
```

**Key Files:**
- `components/analytics/AdhocQuery.tsx`
- `app/api/analytics/route.ts`
- `analytics-engine/services/llm-service.ts`
- `app/api/analytics/execute/route.ts`
- `analytics-engine/services/csv-query-executor.ts`
- `analytics-engine/services/visualization-selector.ts`
- `components/analytics/VisualizationRenderer.tsx`
- `app/api/analytics/history/route.ts`

---

## 📊 **FLOW 4: Query History**

### Step-by-Step Flow:

```
1. User opens Query History section
   ↓
2. Frontend: QueryHistory.tsx
   - Calls GET /api/analytics/history?limit=50
   ↓
3. Backend: query-history-service.ts → getQueryHistory()
   - Queries Prisma: QueryHistory table
   - Orders by createdAt DESC
   - Returns last 50 queries
   ↓
4. Frontend displays list:
   - Question asked
   - SQL query generated
   - Timestamp
   - Source type
   - Click to reuse
   ↓
5. User clicks a query
   - Question populated in input field
   - User can modify and re-execute
   ↓
6. User clicks delete (✕)
   - DELETE /api/analytics/history?id=<id>
   - Removes from database
   - UI updates
```

**Key Files:**
- `components/analytics/QueryHistory.tsx`
- `app/api/analytics/history/route.ts`
- `analytics-engine/services/query-history-service.ts`
- `prisma/schema.prisma` (QueryHistory model)

---

## 📊 **FLOW 5: Multi-Tenant SQL Database (Canonical Mapping)**

### Step-by-Step Flow:

```
1. Admin registers School A database
   POST /api/analytics/data-sources
   Body: {
     name: "School A",
     sourceType: "SQL_DB",
     connectionString: "postgresql://...",
     autoRegisterSchema: true
   }
   ↓
2. Backend: canonical-mapping-service.ts → registerDataSource()
   - Creates DataSource record in database
   - Returns dataSourceId: "clx123..."
   ↓
3. Backend: introspectSQLSchema() (via SQLAlchemy)
   - Connects to PostgreSQL database
   - Queries information_schema
   - Discovers tables: tbl_students, tbl_grades, etc.
   - Discovers columns: stu_id, stu_name, cgpa, etc.
   ↓
4. Backend: autoRegisterSchemaFromIntrospection()
   - Normalizes names:
     * tbl_students → students
     * stu_id → student_id
     * stu_name → student_name
   - Creates SchemaMapping records:
     * sourceTable: "tbl_students" → canonicalTable: "students"
     * sourceColumn: "stu_id" → canonicalColumn: "student_id"
   - Creates SchemaRegistry records
   ↓
5. User asks: "Show top 10 students by CGPA"
   ↓
6. Frontend: GET /api/analytics/data-sources/clx123.../schema
   - Returns canonical schema:
     {
       source_type: "CANONICAL_DB",
       tables: [{
         name: "students",
         columns: [
           { name: "student_id", type: "INTEGER" },
           { name: "student_name", type: "VARCHAR" },
           { name: "cgpa", type: "DECIMAL" }
         ]
       }]
     }
   ↓
7. POST /api/analytics (mode: ADHOC_QUERY)
   - LLM sees canonical schema
   - Generates canonical query:
     "SELECT student_name, cgpa FROM students ORDER BY cgpa DESC LIMIT 10"
   ↓
8. POST /api/analytics/execute
   Body: {
     query_type: "SQL_QUERY",
     query_content: "SELECT student_name, cgpa FROM students...",
     source_type: "SQL_DB",
     connection_string: "postgresql://...",
     data_source_id: "clx123...",
     is_canonical_query: true
   }
   ↓
9. Backend: translateCanonicalQuery()
   - Looks up mappings for dataSourceId
   - Replaces: students → tbl_students
   - Replaces: student_name → stu_name
   - Returns: "SELECT stu_name, cgpa FROM tbl_students ORDER BY cgpa DESC LIMIT 10"
   ↓
10. Backend: executeSQLQuery()
    - Executes translated query on School A database
    - Returns results
    ↓
11. Frontend displays results!
```

**Key Files:**
- `app/api/analytics/data-sources/route.ts`
- `analytics-engine/services/canonical-mapping-service.ts`
- `analytics-engine/services/schema-introspection.ts`
- `app/api/analytics/data-sources/[id]/translate/route.ts`
- `prisma/schema.prisma` (DataSource, SchemaRegistry, SchemaMapping models)

---

## 📊 **FLOW 6: Auto-Refresh Dashboard**

### Step-by-Step Flow:

```
1. User opens Dashboard Metrics tab
   ↓
2. Frontend: DashboardMetrics.tsx
   - Loads metrics immediately
   - Sets up useEffect with setInterval
   ↓
3. Every hour (3600000ms):
   - Automatically calls loadDashboardMetrics()
   - Refreshes all metrics
   - Updates lastRefresh timestamp
   - Shows countdown timer
   ↓
4. User can also:
   - Click "🔄 Refresh Now" for manual refresh
   - Toggle "Auto-refresh ON/OFF"
   ↓
5. Timer shows: "Next refresh in: 45m 30s"
```

**Key Files:**
- `components/analytics/DashboardMetrics.tsx`
- `app/api/analytics/refresh/route.ts`

---

## 📊 **FLOW 7: AI Suggestions**

### Step-by-Step Flow:

```
1. User opens Adhoc Query tab
   ↓
2. Frontend: AIAnalyticsSuggestions.tsx
   - Expands suggestions panel
   - Calls POST /api/analytics/suggestions
   ↓
3. Backend: ai-analytics-suggestions.ts → generateAISuggestions()
   - Sends metadata to OpenAI
   - Asks AI to generate 10-15 relevant questions
   - Categorizes by priority (High/Medium/Low)
   ↓
4. OpenAI returns:
   [
     {
       question: "What is the average CGPA by academic stream?",
       category: "Performance",
       priority: "High"
     },
     ...
   ]
   ↓
5. Frontend displays suggestions
   - Color-coded by priority
   - Clickable to populate question field
   ↓
6. User clicks suggestion
   - Question auto-filled
   - Can modify and submit
```

**Key Files:**
- `components/analytics/AIAnalyticsSuggestions.tsx`
- `app/api/analytics/suggestions/route.ts`
- `analytics-engine/services/ai-analytics-suggestions.ts`

---

## 🔄 **Complete End-to-End Flow Diagram**

```
┌─────────────────────────────────────────────────────────────────┐
│                    USER INTERFACE                                │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐        │
│  │ File Upload  │  │  Dashboard    │  │  Adhoc Query │        │
│  │   Component  │  │   Metrics     │  │   Component   │        │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘        │
└─────────┼──────────────────┼──────────────────┼────────────────┘
          │                  │                  │
          ▼                  ▼                  ▼
┌─────────────────────────────────────────────────────────────────┐
│                    API ROUTES (Next.js)                          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐        │
│  │ /upload      │  │ /analytics   │  │ /execute     │        │
│  │ /schema      │  │ /suggestions  │  │ /history     │        │
│  │ /refresh     │  │ /data-sources│  │              │        │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘        │
└─────────┼──────────────────┼──────────────────┼────────────────┘
          │                  │                  │
          ▼                  ▼                  ▼
┌─────────────────────────────────────────────────────────────────┐
│              ANALYTICS ENGINE SERVICES                           │
│  ┌──────────────────────────────────────────────────────┐     │
│  │  File Processor (CSV/JSON/Excel/Text)                 │     │
│  │  - Reads file, infers schema, creates metadata        │     │
│  └──────────────────────────────────────────────────────┘     │
│  ┌──────────────────────────────────────────────────────┐     │
│  │  LLM Service (OpenAI GPT-4)                          │     │
│  │  - Generates SQL queries from natural language       │     │
│  │  - Generates dashboard metrics                       │     │
│  │  - Generates AI suggestions                          │     │
│  └──────────────────────────────────────────────────────┘     │
│  ┌──────────────────────────────────────────────────────┐     │
│  │  Query Executor                                       │     │
│  │  - CSV Query Executor (in-memory SQL parser)          │     │
│  │  - File Query Executor (JSON/Excel/Text)             │     │
│  │  - SQL Query Executor (for databases)                │     │
│  └──────────────────────────────────────────────────────┘     │
│  ┌──────────────────────────────────────────────────────┐     │
│  │  Canonical Mapping Service                            │     │
│  │  - Registers data sources                            │     │
│  │  - Maps schemas (source → canonical)                 │     │
│  │  - Translates queries (canonical → source)          │     │
│  └──────────────────────────────────────────────────────┘     │
│  ┌──────────────────────────────────────────────────────┐     │
│  │  Visualization Selector                              │     │
│  │  - Analyzes query results                            │     │
│  │  - Auto-selects best chart type                     │     │
│  └──────────────────────────────────────────────────────┘     │
│  ┌──────────────────────────────────────────────────────┐     │
│  │  Query History Service                               │     │
│  │  - Saves queries to database                        │     │
│  │  - Retrieves query history                          │     │
│  └──────────────────────────────────────────────────────┘     │
└─────────────────────────────────────────────────────────────────┘
          │                  │                  │
          ▼                  ▼                  ▼
┌─────────────────────────────────────────────────────────────────┐
│                    DATA STORAGE                                  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐        │
│  │ File System  │  │  Database    │  │  Database    │        │
│  │  /uploads/   │  │ (SQLite)     │  │ (SQLite)     │        │
│  │              │  │ QueryHistory │  │ System Tables│        │
│  │              │  │ FileMetadata │  │ DataSource   │        │
│  │              │  │ Dashboard    │  │ SchemaReg    │        │
│  │              │  │ Metric        │  │ SchemaMap    │        │
│  └──────────────┘  └──────────────┘  └──────────────┘        │
└─────────────────────────────────────────────────────────────────┘
```

---

## 🎯 **Key Components Summary**

### **Frontend Components:**
1. **FileUpload.tsx** - Handles file uploads
2. **DashboardMetrics.tsx** - Displays auto-generated metrics
3. **AdhocQuery.tsx** - Natural language query interface
4. **QueryHistory.tsx** - Shows past queries
5. **AIAnalyticsSuggestions.tsx** - AI-generated question suggestions
6. **VisualizationRenderer.tsx** - Renders charts (Bar, Line, Pie, etc.)

### **Backend Services:**
1. **file-processor.ts** - Processes CSV/JSON/Excel/Text files
2. **llm-service.ts** - OpenAI integration for query generation
3. **csv-query-executor.ts** - Executes SQL-like queries on CSV files
4. **file-query-executor.ts** - Executes queries on JSON/Excel/Text files
5. **canonical-mapping-service.ts** - Multi-tenant schema mapping
6. **query-history-service.ts** - Query history management
7. **visualization-selector.ts** - Auto-selects chart types
8. **query-post-processor.ts** - Post-processes generated queries

### **API Endpoints:**
1. `/api/analytics/upload` - File upload
2. `/api/analytics/schema` - Schema introspection
3. `/api/analytics` - Generate queries/metrics
4. `/api/analytics/execute` - Execute queries
5. `/api/analytics/suggestions` - AI suggestions
6. `/api/analytics/history` - Query history
7. `/api/analytics/refresh` - Refresh dashboard
8. `/api/analytics/data-sources` - Manage data sources
9. `/api/analytics/data-sources/[id]/schema` - Manage schemas
10. `/api/analytics/data-sources/[id]/translate` - Translate queries

### **Database Tables (Prisma):**
1. **QueryHistory** - Stores past queries
2. **FileMetadata** - Tracks uploaded files
3. **DashboardMetric** - Caches dashboard metrics
4. **DataSource** - Stores SQL database connections
5. **SchemaRegistry** - Maps source → canonical schemas
6. **SchemaMapping** - Stores transformation rules

---

## 🔄 **Data Flow Summary**

### **File-Based Analytics:**
```
File Upload → Schema Detection → Metadata Creation → 
Query Generation (LLM) → Query Execution (CSV Parser) → 
Results → Visualization → History Save
```

### **SQL Database Analytics (Multi-tenant):**
```
Register Database → Schema Introspection → Canonical Mapping → 
Query Generation (LLM with Canonical Schema) → 
Query Translation (Canonical → Source) → 
Query Execution (SQLAlchemy) → Results → Visualization
```

---

## 💡 **Key Features**

1. **Domain-Agnostic**: Works with ANY data (education, business, healthcare, etc.)
2. **Multi-Format Support**: CSV, JSON, Excel, Text files
3. **Multi-Tenant SQL**: Canonical mapping for multiple databases
4. **AI-Powered**: GPT-4 generates queries and suggestions
5. **Auto-Visualization**: Automatically selects best chart type
6. **Query History**: Saves and reuses past queries
7. **Auto-Refresh**: Dashboard refreshes every hour
8. **Beautiful UI**: Modern, colorful visualizations

---

## 🎯 **Complete Example: User Journey**

### **Scenario**: User wants to analyze student data

1. **Upload File**
   - User drags `students.csv` to upload area
   - System detects: 5000 rows, columns: cgpa, full_name, academic_stream, etc.
   - Metadata created and saved

2. **View Dashboard**
   - System generates 6-8 metrics automatically
   - Shows: Average CGPA, CGPA by Stream, Placement Status, etc.
   - Beautiful charts displayed

3. **Ask Question**
   - User types: "Which state has the most students?"
   - AI generates: `SELECT state, COUNT(*) as count FROM students GROUP BY state ORDER BY count DESC LIMIT 1`
   - Query executes on CSV file
   - Bar chart shows results
   - Query saved to history

4. **Reuse Query**
   - User opens Query History
   - Clicks previous query
   - Question populated, can modify and re-run

5. **Connect SQL Database** (if needed)
   - Admin registers School A database
   - System auto-maps schema
   - User can now query using canonical names
   - Queries automatically translate to School A's schema

---

This is the **complete flow** of your analytics engine! 🚀

