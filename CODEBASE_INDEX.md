# Codebase Index - Multi-Tenant Analytics Engine

## Overview
A Next.js-based multi-tenant analytics engine that converts natural language queries into SQL queries and generates visualizations. Supports multiple data sources (SQL databases, CSV, Excel, JSON, TXT files) with AI-powered query generation.

## Architecture

### Tech Stack
- **Frontend**: Next.js 14, React 18, TypeScript, Tailwind CSS
- **Backend**: Next.js API Routes, Python Flask API
- **Database**: MySQL (via Prisma ORM)
- **AI/ML**: OpenAI GPT, LangChain, LangGraph
- **Caching**: Redis
- **Visualization**: Recharts
- **File Processing**: PapaParse (CSV), XLSX (Excel)

---

## Directory Structure

```
k_gai/
├── app/                          # Next.js App Router
│   ├── analytics/                # Analytics page
│   │   └── page.tsx              # Main analytics dashboard
│   ├── api/                      # API routes
│   │   └── analytics/            # Analytics API endpoints
│   ├── page.tsx                  # Home/configuration page
│   └── layout.tsx                # Root layout
│
├── analytics-engine/             # Core analytics engine
│   ├── agents/                   # LangGraph agents
│   │   ├── query-agent.ts        # Main query generation agent
│   │   └── tools/                # Agent tools
│   ├── python-backend/           # Python Flask API
│   │   ├── api_server.py         # Flask server
│   │   ├── schema_introspection.py
│   │   ├── query_executor.py
│   │   ├── system_catalog.py
│   │   └── agent_service.py
│   ├── services/                 # TypeScript services
│   ├── types/                    # TypeScript type definitions
│   └── utils/                    # Utility functions
│
├── components/                   # React components
│   ├── analytics/               # Analytics-specific components
│   └── auth/                    # Authentication components
│
├── prisma/                       # Database schema & migrations
│   └── schema.prisma            # Prisma schema
│
└── scripts/                      # Utility scripts
```

---

## Core Components

### 1. Frontend Pages

#### `app/page.tsx`
- **Purpose**: Home/configuration page
- **Features**: Data source configuration, redirects to analytics if configured
- **Components Used**: `DataSourceConfiguration`

#### `app/analytics/page.tsx`
- **Purpose**: Main analytics dashboard
- **Features**: 
  - File upload for CSV/Excel/JSON data
  - Dashboard metrics tab
  - Ad-hoc query tab
  - Metadata loading from configured data source
- **Components Used**: `FileUpload`, `DashboardMetrics`, `AdhocQuery`

---

### 2. API Routes (`app/api/analytics/`)

#### `route.ts` (Main Analytics API)
- **Endpoint**: `POST /api/analytics`
- **Purpose**: Main entry point for query generation
- **Modes**: 
  - `ADHOC_QUERY`: Generate SQL from natural language
  - `DASHBOARD_METRICS`: Generate dashboard metrics
- **Features**:
  - Metadata validation
  - Query generation (LLM or Agent-based)
  - Query execution
  - Result caching (Redis)

#### `execute/route.ts`
- **Endpoint**: `POST /api/analytics/execute`
- **Purpose**: Execute SQL queries on data sources
- **Supports**: SQL databases, CSV files, Excel files

#### `schema/route.ts`
- **Endpoint**: `POST /api/analytics/schema`
- **Purpose**: Extract schema from file-based sources (CSV, Excel, JSON, TXT)

#### `data-sources/route.ts`
- **Endpoint**: `GET/POST /api/analytics/data-sources`
- **Purpose**: Manage data source configurations
- **Features**: CRUD operations for data sources

#### `data-sources/[id]/schema/route.ts`
- **Endpoint**: `GET /api/analytics/data-sources/[id]/schema`
- **Purpose**: Get schema metadata for a specific data source
- **Features**: System catalog queries, caching

#### `data-sources/[id]/translate/route.ts`
- **Endpoint**: `POST /api/analytics/data-sources/[id]/translate`
- **Purpose**: Translate canonical queries to actual database queries
- **Features**: Multi-tenant canonical mapping

#### `history/route.ts`
- **Endpoint**: `GET /api/analytics/history`
- **Purpose**: Retrieve query history
- **Features**: Pagination, filtering

#### `suggestions/route.ts`
- **Endpoint**: `POST /api/analytics/suggestions`
- **Purpose**: Generate AI-powered query suggestions

#### `upload/route.ts`
- **Endpoint**: `POST /api/analytics/upload`
- **Purpose**: Handle file uploads (CSV, Excel, JSON, TXT)
- **Features**: File validation, metadata extraction

#### `google-drive/download/route.ts`
- **Endpoint**: `POST /api/analytics/google-drive/download`
- **Purpose**: Download files from Google Drive

---

### 3. Analytics Engine Services (`analytics-engine/services/`)

#### `llm-service.ts`
- **Purpose**: Core LLM service for query generation
- **Features**:
  - Natural language to SQL conversion
  - Dashboard metrics generation
  - LangSmith tracing integration
  - Master prompt template management
- **Key Functions**:
  - `generateAdhocQuery()`: Generate SQL from user question
  - `generateDashboardMetrics()`: Generate dashboard metrics
  - `generateAdhocQueryWithLangGraphAgent()`: Agent-based query generation

#### `query-executor.ts`
- **Purpose**: Execute queries on various data sources
- **Features**:
  - SQL database query execution
  - CSV/Excel file query execution
  - Query validation
  - Error handling
- **Key Functions**:
  - `executeQuery()`: Main execution function
  - `validateSQLQuery()`: Validate SQL syntax
  - `executeSQLQuery()`: Execute on SQL databases
  - `executeFileQuery()`: Execute on file-based sources

#### `schema-introspection.ts`
- **Purpose**: Extract schema metadata from data sources
- **Features**:
  - SQL database introspection (via Python API)
  - File-based schema extraction
  - Metadata caching
- **Key Functions**:
  - `introspectSQLSchema()`: Introspect SQL databases
  - `introspectFileSchema()`: Extract schema from files

#### `canonical-mapping-service.ts`
- **Purpose**: Multi-tenant canonical mapping
- **Features**:
  - Map actual database columns to canonical names
  - Translate canonical queries to actual queries
  - Schema registry management
- **Key Functions**:
  - `translateCanonicalQuery()`: Translate queries
  - `getCanonicalMappings()`: Get mapping rules

#### `system-catalog-service.ts`
- **Purpose**: Query database system catalogs (INFORMATION_SCHEMA)
- **Features**:
  - Efficient metadata retrieval
  - Table/column discovery
  - Statistics gathering
- **Key Functions**:
  - `getSystemCatalogMetadata()`: Get full metadata
  - `getTablesMetadata()`: Get specific tables
  - `getTableStatistics()`: Get table statistics

#### `python-agent-bridge.ts`
- **Purpose**: Bridge to Python agent service
- **Features**:
  - Communicate with Python Flask API
  - Agent-based query generation
  - Schema exploration
- **Key Functions**:
  - `generateQueryWithPythonAgent()`: Generate queries via Python agent

#### `query-history-service.ts`
- **Purpose**: Manage query history
- **Features**:
  - Save queries and results
  - Retrieve history with pagination
  - Filter by source type
- **Key Functions**:
  - `saveQuery()`: Save query to database
  - `getQueryHistory()`: Retrieve history

#### `query-post-processor.ts`
- **Purpose**: Post-process query results
- **Features**:
  - Result formatting
  - Dashboard metrics enhancement
- **Key Functions**:
  - `postProcessDashboardMetrics()`: Enhance dashboard metrics

#### `visualization-selector.ts`
- **Purpose**: Auto-select visualization types
- **Features**:
  - Analyze query results
  - Select appropriate chart type
- **Key Functions**:
  - `selectVisualizationType()`: Auto-select chart type

#### `semantic-matcher.ts`
- **Purpose**: Semantic matching for columns/tables
- **Features**:
  - Find relevant tables/columns for queries
  - Embedding-based matching
- **Key Functions**:
  - `findRelevantTables()`: Find relevant tables
  - `findRelevantColumns()`: Find relevant columns

#### `embedding-cache.ts`
- **Purpose**: Cache embeddings for semantic matching
- **Features**:
  - LRU cache for embeddings
  - Database-backed cache
- **Key Functions**:
  - `getEmbedding()`: Get cached embedding
  - `setEmbedding()`: Cache embedding

#### `redis-cache.ts`
- **Purpose**: Redis caching layer
- **Features**:
  - Query result caching
  - Metadata caching
  - TTL management
- **Key Functions**:
  - `getCachedQuery()`: Get cached query result
  - `setCachedQuery()`: Cache query result

#### `file-processor.ts`
- **Purpose**: Process uploaded files
- **Features**:
  - CSV parsing
  - Excel parsing
  - JSON parsing
  - Metadata extraction
- **Key Functions**:
  - `processCSVFile()`: Process CSV files
  - `processExcelFile()`: Process Excel files
  - `processJSONFile()`: Process JSON files

#### `csv-query-executor.ts`
- **Purpose**: Execute queries on CSV files
- **Features**:
  - SQL-like query execution on CSV data
  - Filtering, grouping, aggregation
- **Key Functions**:
  - `executeCSVQuery()`: Execute query on CSV

#### `file-query-executor.ts`
- **Purpose**: Execute queries on file-based sources
- **Features**:
  - Unified interface for file queries
  - Supports CSV, Excel, JSON, TXT
- **Key Functions**:
  - `executeFileQuery()`: Execute query on files

#### `hybrid-metadata-service.ts`
- **Purpose**: Hybrid metadata retrieval
- **Features**:
  - Combine cached and fresh metadata
  - Semantic search for relevant metadata
- **Key Functions**:
  - `getHybridMetadata()`: Get hybrid metadata

#### `performance-optimizer.ts`
- **Purpose**: Performance optimization
- **Features**:
  - Query optimization
  - Caching strategies
- **Key Functions**:
  - `optimizeQuery()`: Optimize queries

#### `ai-analytics-suggestions.ts`
- **Purpose**: Generate AI-powered suggestions
- **Features**:
  - Query suggestions based on metadata
  - Dashboard metric suggestions
- **Key Functions**:
  - `generateSuggestions()`: Generate suggestions

---

### 4. Agents (`analytics-engine/agents/`)

#### `query-agent.ts`
- **Purpose**: LangGraph-based query generation agent
- **Features**:
  - Multi-step query generation
  - Schema exploration
  - Query validation
  - Automatic refinement
- **Workflow**:
  1. Analyze question
  2. Explore schema
  3. Generate query
  4. Validate query
  5. Refine if needed (max 3 attempts)

#### `tools/query-validator.ts`
- **Purpose**: Validate generated queries
- **Features**:
  - SQL syntax validation
  - Schema validation
  - Security checks

#### `tools/schema-explorer.ts`
- **Purpose**: Explore database schema
- **Features**:
  - Find relevant tables
  - Find relevant columns
  - Schema introspection

---

### 5. Python Backend (`analytics-engine/python-backend/`)

#### `api_server.py`
- **Purpose**: Flask API server for schema introspection
- **Endpoints**:
  - `GET /health`: Health check
  - `POST /introspect`: Introspect SQL schema
  - `POST /execute`: Execute SQL queries
  - `POST /agent/query`: Generate query via agent
  - `POST /agent/explore-schema`: Explore schema via agent
  - `POST /system-catalog`: Query system catalog
  - `POST /system-catalog/tables`: Get table metadata
  - `POST /system-catalog/statistics`: Get table statistics
  - `POST /system-catalog/validate`: Validate table exists

#### `schema_introspection.py`
- **Purpose**: SQLAlchemy-based schema introspection
- **Features**:
  - Extract table/column metadata
  - Handle multiple database types
  - Connection string normalization
- **Key Functions**:
  - `introspect_sql_schema()`: Main introspection function

#### `query_executor.py`
- **Purpose**: Execute SQL queries via SQLAlchemy
- **Features**:
  - Safe query execution
  - Result formatting
  - Error handling
- **Key Functions**:
  - `execute_sql_query()`: Execute SQL query

#### `system_catalog.py`
- **Purpose**: Query database system catalogs
- **Features**:
  - INFORMATION_SCHEMA queries
  - Efficient metadata retrieval
  - Support for MySQL, PostgreSQL, SQL Server
- **Key Functions**:
  - `get_system_catalog_metadata()`: Get full metadata
  - `get_tables_metadata()`: Get specific tables
  - `get_table_statistics()`: Get statistics

#### `agent_service.py`
- **Purpose**: LangChain SQL agent service
- **Features**:
  - Natural language to SQL conversion
  - Schema exploration
  - Query generation
- **Key Functions**:
  - `generate_query()`: Generate SQL query
  - `explore_schema()`: Explore schema

#### `csv_processor.py`
- **Purpose**: Process CSV files
- **Features**:
  - CSV parsing
  - Schema extraction
  - Data type inference

---

### 6. React Components (`components/analytics/`)

#### `DataSourceConfiguration.tsx`
- **Purpose**: Configure data source
- **Features**:
  - SQL database connection
  - File upload
  - Google Drive integration
  - Data source selection

#### `FileUpload.tsx`
- **Purpose**: File upload component
- **Features**:
  - Drag-and-drop upload
  - CSV, Excel, JSON, TXT support
  - File validation
  - Progress indication

#### `DashboardMetrics.tsx`
- **Purpose**: Display dashboard metrics
- **Features**:
  - Generate dashboard metrics
  - Display multiple visualizations
  - Auto-refresh
- **Components Used**: `VisualizationRenderer`

#### `AdhocQuery.tsx`
- **Purpose**: Ad-hoc query interface
- **Features**:
  - Natural language input
  - Query execution
  - Result visualization
  - Query history
- **Components Used**: `VisualizationRenderer`, `QueryHistory`

#### `VisualizationRenderer.tsx`
- **Purpose**: Render visualizations
- **Features**:
  - Auto-select chart type
  - Multiple chart types support
  - Responsive design
- **Components Used**: Chart components from `visualizations/`

#### `QueryHistory.tsx`
- **Purpose**: Display query history
- **Features**:
  - List previous queries
  - Re-run queries
  - Filter by source type

#### `AIAnalyticsSuggestions.tsx`
- **Purpose**: Display AI-powered suggestions
- **Features**:
  - Query suggestions
  - Dashboard metric suggestions
  - Click-to-execute

#### `visualizations/`
- **BarChart.tsx**: Bar chart visualization
- **LineChart.tsx**: Line chart visualization
- **PieChart.tsx**: Pie chart visualization
- **ScatterPlot.tsx**: Scatter plot visualization
- **Gauge.tsx**: Gauge/KPI visualization
- **Table.tsx**: Table visualization
- **MapView.tsx**: Map visualization

---

### 7. Database Schema (`prisma/schema.prisma`)

#### Models

**QueryHistory**
- Stores executed queries and results
- Fields: `id`, `userQuestion`, `queryType`, `queryContent`, `sourceType`, `filePath`, `results`, `createdAt`

**DashboardMetric**
- Stores dashboard metrics
- Fields: `id`, `metricName`, `queryContent`, `visualizationType`, `insightSummary`, `sourceType`, `filePath`, `createdAt`, `updatedAt`

**FileMetadata**
- Stores uploaded file metadata
- Fields: `id`, `fileName`, `filePath`, `fileType`, `fileSize`, `tableName`, `metadata`, `uploadedAt`

**DataSource**
- Stores data source configurations
- Fields: `id`, `name`, `sourceType`, `connectionString`, `isActive`, `description`, `createdAt`, `updatedAt`

**SchemaRegistry**
- Stores canonical schema mappings
- Fields: `id`, `dataSourceId`, `tableName`, `columnName`, `canonicalTableName`, `canonicalColumnName`, `dataType`, `description`, `isPrimaryKey`, `isNullable`

**SchemaMapping**
- Stores transformation rules
- Fields: `id`, `dataSourceId`, `sourceTable`, `sourceColumn`, `canonicalTable`, `canonicalColumn`, `transformationRule`

**EmbeddingCache**
- Caches embeddings for semantic matching
- Fields: `id`, `cacheKey`, `embedding`, `type`, `text`, `createdAt`, `updatedAt`

---

### 8. Types (`analytics-engine/types/index.ts`)

#### Key Types

**UseCaseMode**: `'ADHOC_QUERY' | 'DASHBOARD_METRICS'`

**SourceType**: `'SQL_DB' | 'CANONICAL_DB' | 'CSV_FILE' | 'EXCEL_FILE' | 'JSON_FILE' | 'TXT_FILE' | 'GOOGLE_DRIVE'`

**QueryType**: `'SQL_QUERY' | 'QUERY_LOGIC'`

**VisualizationType**: `'bar_chart' | 'line_chart' | 'pie_chart' | 'table' | 'scatter_plot' | 'gauge' | 'map_view' | 'auto'`

**DataSourceMetadata**: Schema metadata structure

**AdhocQueryResponse**: Response structure for ad-hoc queries

**DashboardMetricsResponse**: Response structure for dashboard metrics

**AnalyticsRequest**: Request structure for analytics API

---

## Key Features

### 1. Multi-Tenant Support
- Canonical mapping system
- Schema registry
- Query translation
- Support for multiple database schemas

### 2. Natural Language to SQL
- LLM-powered query generation
- Agent-based query generation (LangGraph)
- Schema-aware query generation
- Automatic query refinement

### 3. Multiple Data Sources
- SQL databases (MySQL, PostgreSQL, SQL Server)
- CSV files
- Excel files
- JSON files
- Text files
- Google Drive integration

### 4. Visualization
- Auto-selection of chart types
- Multiple chart types (bar, line, pie, scatter, gauge, table, map)
- Responsive design
- Interactive charts

### 5. Performance Optimization
- Redis caching
- Embedding cache
- Query result caching
- Metadata caching
- Semantic search for relevant metadata

### 6. Query History
- Save queries and results
- Re-run previous queries
- Filter by source type
- Pagination support

### 7. AI Features
- Query suggestions
- Dashboard metric suggestions
- Semantic matching
- Schema exploration

---

## Data Flow

### Ad-Hoc Query Flow
1. User enters natural language question
2. Frontend sends request to `/api/analytics` with `ADHOC_QUERY` mode
3. API validates metadata and question
4. Service generates SQL query (LLM or Agent)
5. Query is validated
6. Query is executed on data source
7. Results are cached (Redis)
8. Results are returned to frontend
9. Frontend renders visualization

### Dashboard Metrics Flow
1. User navigates to dashboard tab
2. Frontend sends request to `/api/analytics` with `DASHBOARD_METRICS` mode
3. API generates 6-8 dashboard metrics
4. Each metric query is executed
5. Results are cached
6. Results are returned to frontend
7. Frontend renders multiple visualizations

### Schema Introspection Flow
1. User configures data source
2. Frontend requests schema from `/api/analytics/data-sources/[id]/schema`
3. API checks cache
4. If not cached, queries Python backend or file processor
5. Schema metadata is cached
6. Metadata is returned to frontend

---

## Environment Variables

```env
# Database
DATABASE_URL=mysql://user:password@host:port/database

# OpenAI
OPENAI_API_KEY=sk-...

# LangSmith (optional)
LANGCHAIN_TRACING_V2=true
LANGCHAIN_API_KEY=ls-...
LANGCHAIN_PROJECT=analytics-engine

# Redis (optional)
REDIS_URL=redis://localhost:6379

# Python Backend
PYTHON_API_URL=http://localhost:8000
```

---

## Scripts

### Development
- `npm run dev`: Start Next.js dev server
- `npm run build`: Build for production
- `npm run start`: Start production server

### Database
- `npm run prisma:generate`: Generate Prisma client
- `npm run prisma:migrate`: Run migrations
- `npm run prisma:seed`: Seed database

### Python Backend
- `npm run python:backend`: Start Python Flask API
- `npm run python:install`: Install Python dependencies

### Testing
- `npm run test:redis`: Test Redis connection
- `npm run test:realestate`: Test real estate tenant

---

## Key Files Reference

### Configuration
- `package.json`: Dependencies and scripts
- `next.config.js`: Next.js configuration
- `tailwind.config.js`: Tailwind CSS configuration
- `tsconfig.json`: TypeScript configuration
- `prisma/schema.prisma`: Database schema

### Core Services
- `analytics-engine/services/llm-service.ts`: LLM query generation
- `analytics-engine/services/query-executor.ts`: Query execution
- `analytics-engine/services/schema-introspection.ts`: Schema extraction
- `analytics-engine/services/canonical-mapping-service.ts`: Multi-tenant mapping

### API Routes
- `app/api/analytics/route.ts`: Main analytics API
- `app/api/analytics/execute/route.ts`: Query execution API
- `app/api/analytics/schema/route.ts`: Schema API

### Components
- `components/analytics/DashboardMetrics.tsx`: Dashboard component
- `components/analytics/AdhocQuery.tsx`: Query component
- `components/analytics/VisualizationRenderer.tsx`: Visualization component

---

## Architecture Patterns

### 1. Service Layer Pattern
- Services handle business logic
- API routes are thin controllers
- Clear separation of concerns

### 2. Multi-Tenant Pattern
- Canonical mapping for schema abstraction
- Schema registry for mapping rules
- Query translation layer

### 3. Caching Strategy
- Redis for query results
- Database cache for embeddings
- Metadata caching

### 4. Agent Pattern
- LangGraph agents for complex queries
- Multi-step query generation
- Automatic refinement

### 5. Hybrid Approach
- LLM for simple queries
- Agent for complex queries
- Python backend for schema introspection

---

## Future Enhancements

1. **More Data Sources**: MongoDB, PostgreSQL, BigQuery
2. **Advanced Visualizations**: Custom charts, dashboards
3. **Query Optimization**: Query plan optimization
4. **Security**: Row-level security, query sanitization
5. **Collaboration**: Shared dashboards, query sharing
6. **Scheduling**: Scheduled queries, automated reports
7. **Export**: PDF reports, Excel exports
8. **Mobile**: Mobile-responsive design

---

## Notes

- Python backend runs on port 8000 by default
- Next.js runs on port 3000 by default
- Redis is optional but recommended for production
- LangSmith tracing is optional but useful for debugging
- Multi-tenant support requires canonical mapping configuration

---

*Last Updated: 2024*
*Version: 1.0.0*

