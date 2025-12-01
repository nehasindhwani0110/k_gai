# System Flow - Visual Summary

## 🎯 **THE COMPLETE FLOW IN ONE DIAGRAM**

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           USER INTERFACE (React)                            │
│                                                                             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐ │
│  │ File Upload  │  │  Dashboard   │  │  Adhoc Query │  │  Query       │ │
│  │   Component  │  │   Metrics    │  │   Component  │  │  History    │ │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘ │
└─────────┼──────────────────┼──────────────────┼──────────────────┼─────────┘
          │                  │                  │                  │
          ▼                  ▼                  ▼                  ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                        API ROUTES (Next.js)                                │
│                                                                             │
│  POST /api/analytics/upload          POST /api/analytics                  │
│  POST /api/analytics/schema          POST /api/analytics/execute          │
│  POST /api/analytics/suggestions     GET/POST /api/analytics/history      │
│  POST /api/analytics/refresh         GET/POST /api/analytics/data-sources │
│                                      GET/POST /api/analytics/data-sources │
│                                      /[id]/schema                          │
│                                      POST /api/analytics/data-sources      │
│                                      /[id]/translate                       │
└─────────────────────────────────────────────────────────────────────────────┘
          │                  │                  │                  │
          ▼                  ▼                  ▼                  ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                    ANALYTICS ENGINE SERVICES                                │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐  │
│  │ 1. FILE PROCESSOR                                                    │  │
│  │    - Reads CSV/JSON/Excel/Text files                                │  │
│  │    - Infers schema (columns, types)                                │  │
│  │    - Creates metadata structure                                     │  │
│  └─────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐  │
│  │ 2. LLM SERVICE (OpenAI GPT-4)                                       │  │
│  │    - Natural Language → SQL Query                                  │  │
│  │    - Generates Dashboard Metrics (6-8)                             │  │
│  │    - Generates AI Suggestions                                      │  │
│  └─────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐  │
│  │ 3. QUERY EXECUTOR                                                   │  │
│  │    - CSV Query Executor: Parses SQL, executes on CSV data          │  │
│  │    - File Query Executor: Handles JSON/Excel/Text                 │  │
│  │    - SQL Query Executor: Executes on SQL databases                 │  │
│  └─────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐  │
│  │ 4. CANONICAL MAPPING SERVICE                                        │  │
│  │    - Registers SQL databases                                       │  │
│  │    - Maps source schema → canonical schema                        │  │
│  │    - Translates queries (canonical → source-specific)             │  │
│  └─────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐  │
│  │ 5. VISUALIZATION SELECTOR                                          │  │
│  │    - Analyzes query results                                        │  │
│  │    - Auto-selects best chart type                                  │  │
│  └─────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐  │
│  │ 6. QUERY HISTORY SERVICE                                           │  │
│  │    - Saves queries to database                                     │  │
│  │    - Retrieves query history                                      │  │
│  └─────────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────┘
          │                  │                  │                  │
          ▼                  ▼                  ▼                  ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         DATA STORAGE                                        │
│                                                                             │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐        │
│  │  File System     │  │  SQLite Database │  │  SQLite Database │        │
│  │  /uploads/       │  │  (Application)   │  │  (System Tables) │        │
│  │                  │  │                  │  │                  │        │
│  │  - CSV files     │  │  QueryHistory    │  │  DataSource      │        │
│  │  - JSON files    │  │  FileMetadata    │  │  SchemaRegistry  │        │
│  │  - Excel files   │  │  DashboardMetric │  │  SchemaMapping   │        │
│  │  - Text files    │  │                  │  │                  │        │
│  └──────────────────┘  └──────────────────┘  └──────────────────┘        │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 🔄 **MAIN FLOWS**

### **FLOW A: File Upload → Dashboard**

```
1. Upload File
   ↓
2. Detect Schema (columns, types)
   ↓
3. Save Metadata to Database
   ↓
4. Generate Dashboard Metrics (AI)
   ↓
5. Execute Each Metric Query
   ↓
6. Auto-Select Visualization
   ↓
7. Display Charts
   ↓
8. Auto-Refresh Every Hour
```

### **FLOW B: Natural Language Query**

```
1. User Types Question
   ↓
2. AI Generates SQL Query
   ↓
3. Execute Query on File/Database
   ↓
4. Get Results
   ↓
5. Auto-Select Chart Type
   ↓
6. Display Visualization
   ↓
7. Save to Query History
```

### **FLOW C: Multi-Tenant SQL Database**

```
1. Register Database
   ↓
2. Introspect Schema (SQLAlchemy)
   ↓
3. Auto-Map to Canonical Names
   ↓
4. User Asks Question (Canonical)
   ↓
5. AI Generates Canonical Query
   ↓
6. Translate to Source-Specific Query
   ↓
7. Execute on Source Database
   ↓
8. Return Results
```

---

## 📋 **COMPONENT RESPONSIBILITIES**

| Component | Responsibility |
|-----------|---------------|
| **FileUpload.tsx** | Handles file uploads, validation, drag-and-drop |
| **DashboardMetrics.tsx** | Displays auto-generated metrics, auto-refresh |
| **AdhocQuery.tsx** | Natural language query interface, executes queries |
| **QueryHistory.tsx** | Shows past queries, allows reuse |
| **AIAnalyticsSuggestions.tsx** | AI-generated question suggestions |
| **VisualizationRenderer.tsx** | Renders appropriate chart component |
| **file-processor.ts** | Processes CSV/JSON/Excel/Text, infers schema |
| **llm-service.ts** | OpenAI integration, query generation |
| **csv-query-executor.ts** | Executes SQL-like queries on CSV files |
| **canonical-mapping-service.ts** | Multi-tenant schema mapping, query translation |
| **query-history-service.ts** | Saves/retrieves query history |
| **visualization-selector.ts** | Auto-selects best chart type |

---

## 🎯 **DATA FLOW SUMMARY**

### **File-Based:**
```
File → Upload → Schema Detection → Metadata → 
LLM Query Generation → CSV Query Execution → 
Results → Visualization → History
```

### **SQL Database:**
```
Database → Registration → Schema Introspection → 
Canonical Mapping → LLM Query Generation → 
Query Translation → SQL Execution → 
Results → Visualization → History
```

---

## 💡 **KEY FEATURES**

✅ **Domain-Agnostic** - Works with ANY data  
✅ **Multi-Format** - CSV, JSON, Excel, Text  
✅ **Multi-Tenant SQL** - Canonical mapping  
✅ **AI-Powered** - GPT-4 generates queries  
✅ **Auto-Visualization** - Selects best chart  
✅ **Query History** - Saves and reuses  
✅ **Auto-Refresh** - Hourly dashboard refresh  

---

This is your **complete system flow**! 🚀

