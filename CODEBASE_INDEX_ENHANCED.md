# Enhanced Codebase Index - Multi-Tenant Analytics Engine

**Generated:** 2024  
**Project:** k-gai-analytics  
**Version:** 1.0.0

---

## 📋 Quick Navigation

- [Project Overview](#project-overview)
- [File Structure](#file-structure)
- [API Endpoints](#api-endpoints)
- [Core Services](#core-services)
- [Components](#components)
- [Database Schema](#database-schema)
- [Configuration](#configuration)
- [Key Functions Reference](#key-functions-reference)

---

## Project Overview

**Purpose:** Multi-tenant analytics engine that converts natural language queries into SQL queries and generates visualizations.

**Tech Stack:**
- **Frontend:** Next.js 14 (App Router), React 18, TypeScript, Tailwind CSS
- **Backend:** Next.js API Routes, Python Flask API (port 8000)
- **Database:** MySQL (via Prisma ORM)
- **AI/ML:** OpenAI GPT-4, LangChain, LangGraph
- **Caching:** Redis (optional)
- **Visualization:** Recharts
- **File Processing:** PapaParse (CSV), XLSX (Excel)

---

## File Structure

```
k_gai/
├── app/                                    # Next.js App Router
│   ├── analytics/
│   │   └── page.tsx                        # Main analytics dashboard (264 lines)
│   ├── api/
│   │   ├── analytics/
│   │   │   ├── route.ts                    # Main analytics API (317 lines)
│   │   │   ├── execute/route.ts            # Query execution endpoint
│   │   │   ├── schema/route.ts             # Schema extraction endpoint
│   │   │   ├── data-sources/
│   │   │   │   ├── route.ts                # Data source CRUD
│   │   │   │   └── [id]/
│   │   │   │       ├── schema/route.ts     # Get schema for data source
│   │   │   │       └── translate/route.ts  # Canonical query translation
│   │   │   ├── history/route.ts            # Query history endpoint
│   │   │   ├── suggestions/route.ts       # AI suggestions endpoint
│   │   │   ├── upload/route.ts             # File upload endpoint
│   │   │   ├── google-drive/download/route.ts
│   │   │   ├── refresh/route.ts
│   │   │   └── redis-status/route.ts
│   │   └── auth/
│   │       └── route.ts                    # Authentication endpoint
│   ├── page.tsx                            # Home/configuration page (19 lines)
│   ├── layout.tsx                           # Root layout
│   └── globals.css                         # Global styles
│
├── analytics-engine/                       # Core analytics engine
│   ├── agents/
│   │   ├── query-agent.ts                  # LangGraph query generation agent
│   │   └── tools/
│   │       ├── query-validator.ts          # Query validation tool
│   │       └── schema-explorer.ts          # Schema exploration tool
│   │
│   ├── python-backend/                     # Python Flask API
│   │   ├── api_server.py                   # Flask server (470+ lines)
│   │   ├── schema_introspection.py         # SQLAlchemy schema introspection (249 lines)
│   │   ├── query_executor.py               # SQL query execution (236 lines)
│   │   ├── system_catalog.py               # System catalog queries (563 lines)
│   │   ├── agent_service.py                # LangChain SQL agent
│   │   ├── csv_processor.py                # CSV processing
│   │   ├── requirements.txt                 # Python dependencies
│   │   └── venv/                           # Python virtual environment
│   │
│   ├── services/                           # TypeScript services
│   │   ├── llm-service.ts                  # LLM query generation (1914 lines)
│   │   ├── query-executor.ts               # Query execution (898 lines)
│   │   ├── schema-introspection.ts         # Schema extraction
│   │   ├── canonical-mapping-service.ts    # Multi-tenant canonical mapping
│   │   ├── system-catalog-service.ts       # System catalog queries
│   │   ├── python-agent-bridge.ts          # Python agent bridge (170 lines)
│   │   ├── query-history-service.ts        # Query history management
│   │   ├── query-post-processor.ts         # Result post-processing
│   │   ├── visualization-selector.ts       # Auto-select visualization types
│   │   ├── semantic-matcher.ts             # Semantic matching
│   │   ├── embedding-cache.ts              # Embedding caching
│   │   ├── redis-cache.ts                  # Redis caching layer
│   │   ├── file-processor.ts               # File processing
│   │   ├── csv-query-executor.ts           # CSV query execution
│   │   ├── file-query-executor.ts          # File-based query execution
│   │   ├── hybrid-metadata-service.ts      # Hybrid metadata retrieval
│   │   ├── performance-optimizer.ts        # Performance optimization
│   │   └── ai-analytics-suggestions.ts     # AI-powered suggestions
│   │
│   ├── types/
│   │   └── index.ts                        # TypeScript type definitions
│   │
│   └── utils/
│       ├── date-utils.ts                    # Date utilities
│       ├── langsmith-tracer.ts             # LangSmith tracing
│       ├── metadata-formatter.ts            # Metadata formatting
│       ├── rate-limiter.ts                 # Rate limiting
│       └── token-counter.ts                # Token counting
│
├── components/                             # React components
│   ├── analytics/
│   │   ├── AdhocQuery.tsx                  # Ad-hoc query interface
│   │   ├── AIAnalyticsSuggestions.tsx      # AI suggestions component
│   │   ├── DashboardMetrics.tsx            # Dashboard metrics component
│   │   ├── DataSourceConfiguration.tsx     # Data source configuration
│   │   ├── FileUpload.tsx                  # File upload component
│   │   ├── QueryHistory.tsx                # Query history component
│   │   ├── VisualizationRenderer.tsx       # Visualization renderer
│   │   └── visualizations/
│   │       ├── BarChart.tsx                 # Bar chart
│   │       ├── LineChart.tsx                # Line chart
│   │       ├── PieChart.tsx                 # Pie chart
│   │       ├── ScatterPlot.tsx             # Scatter plot
│   │       ├── Gauge.tsx                   # Gauge/KPI
│   │       ├── Table.tsx                   # Table view
│   │       └── MapView.tsx                 # Map visualization
│   └── auth/
│       └── SchoolLogin.tsx                 # School login component
│
├── prisma/
│   ├── schema.prisma                       # Database schema (135 lines)
│   ├── migrations/                         # Database migrations
│   └── seed.ts                             # Database seeding
│
├── scripts/                                # Utility scripts
│   ├── create_realestate_tenant.ts         # Create real estate tenant
│   ├── test_realestate_tenant.ts           # Test real estate tenant
│   ├── test-redis-connection.ps1           # Redis connection test
│   └── start_python_backend.ps1            # Start Python backend
│
├── uploads/                                 # Uploaded files directory
├── lib/
│   └── prisma.ts                           # Prisma client initialization
├── package.json                            # Node.js dependencies & scripts
├── tsconfig.json                           # TypeScript configuration
├── next.config.js                          # Next.js configuration
├── tailwind.config.js                      # Tailwind CSS configuration
├── CODEBASE_INDEX.md                       # Original codebase index
├── QUICK_REFERENCE.md                      # Quick reference guide
└── CODEBASE_INDEX_ENHANCED.md              # This file
```

---

## API Endpoints

### Main Analytics API
- **POST** `/api/analytics`
  - **Modes:** `ADHOC_QUERY`, `DASHBOARD_METRICS`
  - **File:** `app/api/analytics/route.ts`
  - **Features:**
    - Natural language to SQL conversion
    - Metadata validation
    - Query generation (LLM or Agent-based)
    - Result caching (Redis)
    - Question understanding for better accuracy
    - Hybrid metadata fetching with semantic search

### Query Execution
- **POST** `/api/analytics/execute`
  - **File:** `app/api/analytics/execute/route.ts`
  - **Purpose:** Execute SQL queries on data sources
  - **Supports:** SQL databases, CSV files, Excel files

### Schema Extraction
- **POST** `/api/analytics/schema`
  - **File:** `app/api/analytics/schema/route.ts`
  - **Purpose:** Extract schema from file-based sources (CSV, Excel, JSON, TXT)

### Data Sources Management
- **GET/POST** `/api/analytics/data-sources`
  - **File:** `app/api/analytics/data-sources/route.ts`
  - **Purpose:** CRUD operations for data sources

- **GET** `/api/analytics/data-sources/[id]/schema`
  - **File:** `app/api/analytics/data-sources/[id]/schema/route.ts`
  - **Purpose:** Get schema metadata for a specific data source
  - **Query Params:** `forceRefresh=true` (optional)

- **POST** `/api/analytics/data-sources/[id]/translate`
  - **File:** `app/api/analytics/data-sources/[id]/translate/route.ts`
  - **Purpose:** Translate canonical queries to actual database queries

### Query History
- **GET** `/api/analytics/history`
  - **File:** `app/api/analytics/history/route.ts`
  - **Purpose:** Retrieve query history
  - **Features:** Pagination, filtering

### AI Suggestions
- **POST** `/api/analytics/suggestions`
  - **File:** `app/api/analytics/suggestions/route.ts`
  - **Purpose:** Generate AI-powered query suggestions

### File Upload
- **POST** `/api/analytics/upload`
  - **File:** `app/api/analytics/upload/route.ts`
  - **Purpose:** Handle file uploads (CSV, Excel, JSON, TXT)
  - **Features:** File validation, metadata extraction

### Google Drive
- **POST** `/api/analytics/google-drive/download`
  - **File:** `app/api/analytics/google-drive/download/route.ts`
  - **Purpose:** Download files from Google Drive

### Other Endpoints
- **GET** `/api/analytics/redis-status` - Redis connection status
- **POST** `/api/analytics/refresh` - Refresh metadata cache

### Python Backend Endpoints (Port 8000)
- **GET** `/health` - Health check
- **POST** `/introspect` - Introspect SQL schema
- **POST** `/execute` - Execute SQL queries
- **POST** `/agent/query` - Generate query via agent
- **POST** `/agent/explore-schema` - Explore schema via agent
- **POST** `/system-catalog` - Query system catalog
- **POST** `/system-catalog/tables` - Get table metadata
- **POST** `/system-catalog/statistics` - Get table statistics
- **POST** `/system-catalog/validate` - Validate table exists

---

## Core Services

### LLM Service (`analytics-engine/services/llm-service.ts`)
**Purpose:** Core LLM service for query generation

**Key Functions:**
- `generateAdhocQuery()` - Generate SQL from user question
- `generateDashboardMetrics()` - Generate dashboard metrics
- `generateAdhocQueryWithLangGraphAgent()` - Agent-based query generation
- `generateDashboardMetricsWithAgent()` - Agent-based dashboard metrics
- `understandQuestionSemantics()` - Understand question intent and concepts

**Features:**
- Natural language to SQL conversion
- Dashboard metrics generation
- LangSmith tracing integration
- Master prompt template management
- Question understanding for better accuracy

### Query Executor (`analytics-engine/services/query-executor.ts`)
**Purpose:** Execute queries on various data sources

**Key Functions:**
- `executeQuery()` - Main execution function
- `validateSQLQuery()` - Validate SQL syntax
- `executeSQLQuery()` - Execute on SQL databases
- `executeFileQuery()` - Execute on file-based sources

**Features:**
- SQL database query execution
- CSV/Excel file query execution
- Query validation
- Error handling

### Schema Introspection (`analytics-engine/services/schema-introspection.ts`)
**Purpose:** Extract schema metadata from data sources

**Key Functions:**
- `introspectSQLSchema()` - Introspect SQL databases
- `introspectFileSchema()` - Extract schema from files
- `validateMetadata()` - Validate metadata structure

**Features:**
- SQL database introspection (via Python API)
- File-based schema extraction
- Metadata caching

### Canonical Mapping Service (`analytics-engine/services/canonical-mapping-service.ts`)
**Purpose:** Multi-tenant canonical mapping

**Key Functions:**
- `translateCanonicalQuery()` - Translate queries
- `getCanonicalMappings()` - Get mapping rules

**Features:**
- Map actual database columns to canonical names
- Translate canonical queries to actual queries
- Schema registry management

### System Catalog Service (`analytics-engine/services/system-catalog-service.ts`)
**Purpose:** Query database system catalogs (INFORMATION_SCHEMA)

**Key Functions:**
- `getSystemCatalogMetadata()` - Get full metadata
- `getTablesMetadata()` - Get specific tables
- `getTableStatistics()` - Get table statistics

**Features:**
- Efficient metadata retrieval
- Table/column discovery
- Statistics gathering

### Python Agent Bridge (`analytics-engine/services/python-agent-bridge.ts`)
**Purpose:** Bridge to Python agent service

**Key Functions:**
- `generateQueryWithPythonAgent()` - Generate queries via Python agent

**Features:**
- Communicate with Python Flask API
- Agent-based query generation
- Schema exploration

### Hybrid Metadata Service (`analytics-engine/services/hybrid-metadata-service.ts`)
**Purpose:** Hybrid metadata retrieval

**Key Functions:**
- `getHybridMetadata()` - Get hybrid metadata

**Features:**
- Combine cached and fresh metadata
- Semantic search for relevant metadata
- Optimized for large databases (>30 tables)

### Redis Cache (`analytics-engine/services/redis-cache.ts`)
**Purpose:** Redis caching layer

**Key Functions:**
- `getCachedQuery()` - Get cached query result
- `setCachedQuery()` - Cache query result
- `getCachedSemanticMatch()` - Get cached semantic matches
- `initializeRedis()` - Initialize Redis connection

**Features:**
- Query result caching
- Metadata caching
- TTL management
- Semantic match caching

### Embedding Cache (`analytics-engine/services/embedding-cache.ts`)
**Purpose:** Cache embeddings for semantic matching

**Key Functions:**
- `getEmbedding()` - Get cached embedding
- `setEmbedding()` - Cache embedding

**Features:**
- LRU cache for embeddings
- Database-backed cache

### Semantic Matcher (`analytics-engine/services/semantic-matcher.ts`)
**Purpose:** Semantic matching for columns/tables

**Key Functions:**
- `findRelevantTables()` - Find relevant tables
- `findRelevantColumns()` - Find relevant columns

**Features:**
- Find relevant tables/columns for queries
- Embedding-based matching

---

## Components

### Analytics Components

#### `DataSourceConfiguration.tsx`
- **Purpose:** Configure data source
- **Features:**
  - SQL database connection
  - File upload
  - Google Drive integration
  - Data source selection

#### `FileUpload.tsx`
- **Purpose:** File upload component
- **Features:**
  - Drag-and-drop upload
  - CSV, Excel, JSON, TXT support
  - File validation
  - Progress indication

#### `DashboardMetrics.tsx`
- **Purpose:** Display dashboard metrics
- **Features:**
  - Generate dashboard metrics
  - Display multiple visualizations
  - Auto-refresh
- **Uses:** `VisualizationRenderer`

#### `AdhocQuery.tsx`
- **Purpose:** Ad-hoc query interface
- **Features:**
  - Natural language input
  - Query execution
  - Result visualization
  - Query history
- **Uses:** `VisualizationRenderer`, `QueryHistory`

#### `VisualizationRenderer.tsx`
- **Purpose:** Render visualizations
- **Features:**
  - Auto-select chart type
  - Multiple chart types support
  - Responsive design
- **Uses:** Chart components from `visualizations/`

#### `QueryHistory.tsx`
- **Purpose:** Display query history
- **Features:**
  - List previous queries
  - Re-run queries
  - Filter by source type

#### `AIAnalyticsSuggestions.tsx`
- **Purpose:** Display AI-powered suggestions
- **Features:**
  - Query suggestions
  - Dashboard metric suggestions
  - Click-to-execute

### Visualization Components (`components/analytics/visualizations/`)

- **BarChart.tsx** - Bar chart visualization
- **LineChart.tsx** - Line chart visualization
- **PieChart.tsx** - Pie chart visualization
- **ScatterPlot.tsx** - Scatter plot visualization
- **Gauge.tsx** - Gauge/KPI visualization
- **Table.tsx** - Table visualization
- **MapView.tsx** - Map visualization

---

## Database Schema

### Models (`prisma/schema.prisma`)

#### QueryHistory
- Stores executed queries and results
- **Fields:**
  - `id` (String, @id)
  - `userQuestion` (String)
  - `queryType` (String) - SQL_QUERY or QUERY_LOGIC
  - `queryContent` (String, @db.Text)
  - `sourceType` (String)
  - `filePath` (String?)
  - `results` (String?, @db.Text)
  - `createdAt` (DateTime)
- **Indexes:** `createdAt`, `sourceType`

#### DashboardMetric
- Stores dashboard metrics
- **Fields:**
  - `id` (String, @id)
  - `metricName` (String)
  - `queryContent` (String, @db.Text)
  - `visualizationType` (String)
  - `insightSummary` (String, @db.Text)
  - `sourceType` (String)
  - `filePath` (String?)
  - `createdAt` (DateTime)
  - `updatedAt` (DateTime)
- **Indexes:** `sourceType`

#### FileMetadata
- Stores uploaded file metadata
- **Fields:**
  - `id` (String, @id)
  - `fileName` (String)
  - `filePath` (String, @unique)
  - `fileType` (String) - CSV, JSON, EXCEL, TXT
  - `fileSize` (Int)
  - `tableName` (String?)
  - `metadata` (String, @db.Text) - JSON string
  - `uploadedAt` (DateTime)
- **Indexes:** `fileType`, `uploadedAt`

#### DataSource
- Stores data source configurations
- **Fields:**
  - `id` (String, @id)
  - `name` (String)
  - `sourceType` (String)
  - `connectionString` (String?)
  - `isActive` (Boolean, @default(true))
  - `description` (String?)
  - `createdAt` (DateTime)
  - `updatedAt` (DateTime)
- **Relations:** `schemaMappings`, `schemaRegistry`
- **Indexes:** `sourceType`, `isActive`, `name`

#### SchemaRegistry
- Stores canonical schema mappings
- **Fields:**
  - `id` (String, @id)
  - `dataSourceId` (String)
  - `tableName` (String)
  - `columnName` (String)
  - `canonicalTableName` (String)
  - `canonicalColumnName` (String)
  - `dataType` (String)
  - `description` (String?)
  - `isPrimaryKey` (Boolean, @default(false))
  - `isNullable` (Boolean, @default(true))
  - `createdAt` (DateTime)
  - `updatedAt` (DateTime)
- **Relations:** `dataSource` (DataSource)
- **Unique:** `[dataSourceId, tableName, columnName]`
- **Indexes:** Multiple composite indexes for performance

#### SchemaMapping
- Stores transformation rules
- **Fields:**
  - `id` (String, @id)
  - `dataSourceId` (String)
  - `sourceTable` (String)
  - `sourceColumn` (String)
  - `canonicalTable` (String)
  - `canonicalColumn` (String)
  - `transformationRule` (String?)
  - `createdAt` (DateTime)
  - `updatedAt` (DateTime)
- **Relations:** `dataSource` (DataSource)
- **Unique:** `[dataSourceId, sourceTable, sourceColumn]`
- **Indexes:** Multiple composite indexes

#### EmbeddingCache
- Caches embeddings for semantic matching
- **Fields:**
  - `id` (String, @id)
  - `cacheKey` (String, @unique, @db.VarChar(500))
  - `embedding` (String, @db.Text) - JSON array
  - `type` (String) - 'table', 'column', or 'question'
  - `text` (String?, @db.Text)
  - `createdAt` (DateTime)
  - `updatedAt` (DateTime)
- **Indexes:** `type`, `cacheKey`

---

## Configuration

### Environment Variables

```env
# Database
DATABASE_URL=mysql://user:password@host:port/database

# OpenAI
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4-turbo-preview  # Optional, defaults to gpt-4-turbo-preview

# LangSmith (optional)
LANGCHAIN_TRACING_V2=true
LANGCHAIN_API_KEY=ls-...
LANGCHAIN_PROJECT=analytics-engine

# Redis (optional)
REDIS_URL=redis://localhost:6379

# Python Backend
PYTHON_API_URL=http://localhost:8000
PORT=8000  # Python backend port

# Agent Configuration (optional)
USE_AGENT_BASED_QUERIES=false  # Use agent for query generation
```

### TypeScript Configuration (`tsconfig.json`)
- **Target:** ES2020
- **Module:** ESNext
- **JSX:** Preserve
- **Paths:** `@/*` maps to `./*`
- **Strict:** true

### Next.js Configuration (`next.config.js`)
- **React Strict Mode:** Enabled
- **Server Actions:** Experimental enabled
- **Webpack:** Custom configuration for Node.js modules

### Package Scripts (`package.json`)

**Development:**
- `npm run dev` - Start Next.js dev server
- `npm run build` - Build for production
- `npm run start` - Start production server

**Database:**
- `npm run prisma:generate` - Generate Prisma client
- `npm run prisma:migrate` - Run migrations
- `npm run prisma:seed` - Seed database

**Python Backend:**
- `npm run python:backend` - Start Python Flask API
- `npm run python:install` - Install Python dependencies

**Testing:**
- `npm run test:redis` - Test Redis connection
- `npm run test:realestate` - Test real estate tenant

---

## Key Functions Reference

### Query Generation Flow

1. **User Question → Question Understanding**
   - `understandQuestionSemantics()` - Extract intent, query type, key concepts
   - Location: `analytics-engine/services/llm-service.ts`

2. **Metadata Fetching**
   - `getHybridMetadata()` - Fetch metadata with semantic search for large DBs
   - Location: `analytics-engine/services/hybrid-metadata-service.ts`
   - For SQL DBs: Uses system catalog queries
   - For files: Uses file processor

3. **Query Generation**
   - Simple queries: `generateAdhocQuery()` - Direct LLM
   - Complex queries: `generateAdhocQueryWithLangGraphAgent()` - LangGraph agent
   - Python agent: `generateQueryWithPythonAgent()` - Python LangChain agent
   - Location: `analytics-engine/services/llm-service.ts`

4. **Query Validation**
   - `validateSQLQuery()` - Security and syntax validation
   - Location: `analytics-engine/services/query-executor.ts`

5. **Query Execution**
   - `executeQuery()` - Main execution function
   - `executeSQLQuery()` - SQL database execution
   - `executeFileQuery()` - File-based execution
   - Location: `analytics-engine/services/query-executor.ts`

6. **Result Caching**
   - `setCachedQuery()` - Cache query results
   - Location: `analytics-engine/services/redis-cache.ts`

### Schema Introspection Flow

1. **SQL Database**
   - `getSystemCatalogMetadata()` - Query INFORMATION_SCHEMA
   - Location: `analytics-engine/services/system-catalog-service.ts`
   - Python backend: `system_catalog.py`

2. **File-Based Sources**
   - `introspectFileSchema()` - Extract schema from files
   - Location: `analytics-engine/services/schema-introspection.ts`
   - Uses: `file-processor.ts`

### Canonical Mapping Flow

1. **Query Translation**
   - `translateCanonicalQuery()` - Translate canonical to actual query
   - Location: `analytics-engine/services/canonical-mapping-service.ts`
   - Uses: `SchemaRegistry` and `SchemaMapping` models

2. **Schema Registry**
   - Maps actual table/column names to canonical names
   - Stored in `SchemaRegistry` model
   - Used for multi-tenant support

---

## Data Flow Diagrams

### Ad-Hoc Query Flow
```
User Question
    ↓
Question Understanding (parallel with metadata fetch)
    ↓
Metadata Fetching (with semantic search for large DBs)
    ↓
Query Generation (LLM or Agent)
    ↓
Query Validation
    ↓
Query Execution
    ↓
Result Caching (Redis)
    ↓
Visualization Rendering
```

### Dashboard Metrics Flow
```
Dashboard Tab Load
    ↓
Generate 6-8 Metrics (LLM or Agent)
    ↓
Execute Each Query
    ↓
Cache Results
    ↓
Render Multiple Visualizations
```

### Schema Introspection Flow
```
Data Source Configuration
    ↓
Check Cache
    ↓
If SQL DB: System Catalog Query (Python API)
If File: File Processor
    ↓
Extract Schema Metadata
    ↓
Cache Metadata
    ↓
Return to Frontend
```

---

## Performance Optimizations

1. **Semantic Search Filtering**
   - For databases with >30 tables, uses semantic search to filter relevant tables
   - Reduces metadata size sent to LLM
   - Location: `app/api/analytics/route.ts` (lines 86-113)

2. **Parallel Processing**
   - Question understanding runs in parallel with metadata fetching
   - Location: `app/api/analytics/route.ts` (lines 77-118)

3. **Caching Strategy**
   - Redis for query results
   - Database cache for embeddings
   - Metadata caching with TTL

4. **Query Optimization**
   - Simple queries use direct LLM (faster)
   - Complex queries use agents (more accurate)
   - Location: `app/api/analytics/route.ts` (lines 155-225)

5. **Token Management**
   - Token counting for metadata
   - Metadata size validation
   - Automatic reduction for large schemas

---

## Common Patterns

### Adding New Visualization Type
1. Create component in `components/analytics/visualizations/`
2. Add type to `VisualizationType` in `types/index.ts`
3. Update `VisualizationRenderer.tsx` to handle new type
4. Update LLM prompt to suggest new type

### Adding New Data Source Type
1. Add type to `SourceType` in `types/index.ts`
2. Add processor in `analytics-engine/services/file-processor.ts`
3. Add executor in `analytics-engine/services/file-query-executor.ts`
4. Update schema introspection if needed

### Adding New API Endpoint
1. Create route file in `app/api/analytics/`
2. Add validation
3. Add error handling
4. Update API documentation

---

## Troubleshooting

### Python Backend Not Starting
- Check Python version (3.8+)
- Install dependencies: `npm run python:install`
- Check port 8000 is available
- Check `PYTHON_API_URL` environment variable

### Schema Not Loading
- Check data source is configured
- Check connection string is valid
- Try `forceRefresh=true` parameter
- Check Python backend is running
- Check Redis cache (may need clearing)

### Queries Failing
- Check query syntax
- Verify column names exist in metadata
- Check data source connection
- Review error logs
- Check query validation (security checks)

### Visualizations Not Rendering
- Check query returns data
- Verify visualization type is supported
- Check data format matches chart requirements
- Review browser console for errors

### Redis Connection Issues
- Run `npm run test:redis`
- Check `REDIS_URL` environment variable
- Redis is optional - app works without it (no caching)

---

## Development Workflow

1. **Start Development**
   ```powershell
   # Terminal 1: Start Next.js
   npm run dev
   
   # Terminal 2: Start Python Backend (if needed)
   npm run python:backend
   ```

2. **Database Setup**
   ```powershell
   # Generate Prisma client
   npm run prisma:generate
   
   # Run migrations
   npm run prisma:migrate
   
   # Seed database (optional)
   npm run prisma:seed
   ```

3. **Testing**
   ```powershell
   # Test Redis connection
   npm run test:redis
   
   # Test real estate tenant
   npm run test:realestate
   ```

---

## Key Files Summary

| File | Lines | Purpose |
|------|-------|---------|
| `app/api/analytics/route.ts` | 317 | Main analytics API endpoint |
| `analytics-engine/services/llm-service.ts` | 1914 | LLM query generation service |
| `analytics-engine/services/query-executor.ts` | 898 | Query execution service |
| `analytics-engine/python-backend/system_catalog.py` | 563 | System catalog queries |
| `analytics-engine/python-backend/schema_introspection.py` | 249 | Schema introspection |
| `analytics-engine/python-backend/query_executor.py` | 236 | Python query executor |
| `analytics-engine/services/python-agent-bridge.ts` | 170 | Python agent bridge |
| `app/analytics/page.tsx` | 264 | Analytics dashboard page |
| `prisma/schema.prisma` | 135 | Database schema |

---

## Notes

- Python backend runs on port 8000 by default
- Next.js runs on port 3000 by default
- Redis is optional but recommended for production
- LangSmith tracing is optional but useful for debugging
- Multi-tenant support requires canonical mapping configuration
- Large databases (>30 tables) automatically use semantic search filtering
- Simple queries use direct LLM, complex queries use agents

---

**Last Updated:** 2024  
**Maintained By:** Development Team

