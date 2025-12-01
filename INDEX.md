# Codebase Index

**Last Updated:** 2024  
**Project:** Multi-Tenant Analytics Engine for Education Systems  
**Version:** 1.0.0

---

## 📋 Table of Contents

1. [Project Overview](#project-overview)
2. [Technology Stack](#technology-stack)
3. [Directory Structure](#directory-structure)
4. [Key Files Reference](#key-files-reference)
5. [API Endpoints](#api-endpoints)
6. [Database Schema](#database-schema)
7. [Architecture Overview](#architecture-overview)
8. [Entry Points](#entry-points)
9. [Dependencies](#dependencies)

---

## 🎯 Project Overview

A comprehensive analytics engine that converts natural language queries into SQL/query logic, generates insights, and provides data visualizations for education systems. Supports multiple data sources (CSV, JSON, Excel, SQL databases) with multi-tenant capabilities.

**Key Features:**
- Natural language to SQL conversion using OpenAI GPT-4
- Multi-format file support (CSV, JSON, Excel, Text)
- Multi-tenant SQL database support with canonical schema mapping
- Auto-generated dashboard metrics
- AI-powered query suggestions
- Automatic visualization selection
- Query history tracking
- Auto-refresh dashboard

---

## 🛠 Technology Stack

### Frontend
- **Framework:** Next.js 14 (App Router)
- **Language:** TypeScript 5.3
- **UI:** React 18, Tailwind CSS
- **Charts:** Recharts 2.10
- **File Processing:** PapaParse, XLSX

### Backend
- **Runtime:** Node.js 18+
- **API:** Next.js API Routes
- **Database ORM:** Prisma 5.7
- **Database:** SQLite (dev), PostgreSQL/MySQL (production)
- **AI:** OpenAI API (GPT-4)

### Python Backend
- **Runtime:** Python 3.9+
- **Libraries:** SQLAlchemy, Pandas, DuckDB
- **Purpose:** Schema introspection, CSV processing, SQL query execution

---

## 📁 Directory Structure

```
k_gai/
├── analytics-engine/              # Core analytics engine
│   ├── python-backend/           # Python services
│   │   ├── api_server.py        # Python API server (if used)
│   │   ├── csv_processor.py     # CSV file processing
│   │   ├── query_executor.py    # SQL query execution
│   │   ├── schema_introspection.py # Database schema detection
│   │   └── requirements.txt     # Python dependencies
│   ├── services/                 # TypeScript services
│   │   ├── llm-service.ts       # OpenAI integration
│   │   ├── schema-introspection.ts # Schema validation
│   │   ├── csv-processor.ts     # CSV processing (TypeScript)
│   │   ├── csv-query-executor.ts # CSV query execution
│   │   ├── file-processor.ts    # Multi-format file processing
│   │   ├── file-query-executor.ts # File query execution
│   │   ├── query-executor.ts    # Main query executor router
│   │   ├── query-history-service.ts # Query history management
│   │   ├── query-post-processor.ts # Query post-processing
│   │   ├── canonical-mapping-service.ts # Multi-tenant mapping
│   │   ├── visualization-selector.ts # Chart type selection
│   │   └── ai-analytics-suggestions.ts # AI suggestions
│   ├── types/                    # TypeScript type definitions
│   │   └── index.ts             # All type definitions
│   └── utils/                    # Utility functions
│       └── date-utils.ts        # Date manipulation utilities
│
├── app/                          # Next.js App Router
│   ├── api/                      # API routes
│   │   └── analytics/           # Analytics API endpoints
│   │       ├── route.ts         # Main analytics API (query generation)
│   │       ├── upload/          # File upload endpoint
│   │       ├── schema/          # Schema introspection endpoint
│   │       ├── execute/         # Query execution endpoint
│   │       ├── history/         # Query history endpoints
│   │       ├── suggestions/     # AI suggestions endpoint
│   │       ├── refresh/         # Dashboard refresh endpoint
│   │       └── data-sources/    # Data source management
│   │           ├── route.ts    # CRUD operations
│   │           └── [id]/       # Data source specific routes
│   │               ├── schema/ # Get schema for data source
│   │               └── translate/ # Translate canonical queries
│   ├── analytics/               # Analytics page
│   │   └── page.tsx            # Main analytics dashboard
│   ├── auth/                    # Authentication routes
│   │   └── login/              # School login
│   │       └── route.ts
│   ├── layout.tsx               # Root layout
│   ├── page.tsx                 # Home page
│   └── globals.css              # Global styles
│
├── components/                   # React components
│   ├── analytics/               # Analytics components
│   │   ├── AdhocQuery.tsx      # Natural language query interface
│   │   ├── DashboardMetrics.tsx # Dashboard metrics display
│   │   ├── FileUpload.tsx      # File upload component
│   │   ├── QueryHistory.tsx    # Query history display
│   │   ├── AIAnalyticsSuggestions.tsx # AI suggestions panel
│   │   ├── VisualizationRenderer.tsx # Chart renderer router
│   │   └── visualizations/     # Chart components
│   │       ├── BarChart.tsx    # Bar chart visualization
│   │       ├── LineChart.tsx   # Line chart visualization
│   │       ├── PieChart.tsx    # Pie chart visualization
│   │       ├── Table.tsx       # Table visualization
│   │       ├── ScatterPlot.tsx # Scatter plot visualization
│   │       ├── Gauge.tsx       # Gauge/KPI visualization
│   │       └── MapView.tsx     # Map visualization
│   └── auth/                    # Authentication components
│       └── SchoolLogin.tsx     # School login form
│
├── lib/                          # Library code
│   └── prisma.ts                # Prisma client instance
│
├── prisma/                       # Prisma configuration
│   ├── schema.prisma            # Database schema definition
│   └── seed.ts                  # Database seeding script
│
├── scripts/                      # Setup and utility scripts
│   ├── setup-db.ps1            # Database setup script
│   ├── setup_mysql_database.ps1 # MySQL setup
│   ├── start_python_backend.ps1 # Python backend starter
│   ├── create_schools.sql      # School creation SQL
│   ├── create_student_tables.sql # Student tables SQL
│   ├── insert_student_data.sql  # Sample data insertion
│   └── *.md                     # Setup documentation
│
├── package.json                  # Node.js dependencies
├── tsconfig.json                 # TypeScript configuration
├── tailwind.config.js            # Tailwind CSS configuration
├── next.config.js                # Next.js configuration
├── postcss.config.js             # PostCSS configuration
│
└── Documentation Files:
    ├── README.md                 # Main project documentation
    ├── COMPLETE_SYSTEM_FLOW.md  # End-to-end flow documentation
    ├── IMPLEMENTATION_STATUS.md  # Implementation status
    ├── PRODUCTION_READINESS_ASSESSMENT.md # Production checklist
    ├── QUICK_START.md           # Quick start guide
    ├── SETUP.md                 # Setup instructions
    ├── SCHOOL_LOGIN_SUMMARY.md  # School login documentation
    ├── SYSTEM_FLOW_VISUAL.md    # Visual flow diagrams
    └── SYSTEM_TABLES_*.md       # Database schema documentation
```

---

## 📄 Key Files Reference

### Core Services

#### `analytics-engine/services/llm-service.ts`
**Purpose:** OpenAI GPT-4 integration for query generation  
**Key Functions:**
- `generateAdhocQuery()` - Converts natural language to SQL
- `generateDashboardMetrics()` - Generates dashboard metrics
- `generateAISuggestions()` - Creates query suggestions

#### `analytics-engine/services/query-executor.ts`
**Purpose:** Main query executor router  
**Key Functions:**
- Routes queries to appropriate executor (CSV, File, SQL)
- Handles different source types

#### `analytics-engine/services/csv-query-executor.ts`
**Purpose:** Executes SQL-like queries on CSV files  
**Key Functions:**
- `executeCSVQuery()` - Parses SQL and executes on CSV data
- Supports: SELECT, WHERE, GROUP BY, ORDER BY, LIMIT, aggregates

#### `analytics-engine/services/file-processor.ts`
**Purpose:** Multi-format file processing  
**Key Functions:**
- `processFile()` - Detects file type and processes
- Supports: CSV, JSON, Excel, Text files
- Infers schema and column types

#### `analytics-engine/services/canonical-mapping-service.ts`
**Purpose:** Multi-tenant schema mapping  
**Key Functions:**
- `registerDataSource()` - Registers new data source
- `translateCanonicalQuery()` - Translates canonical to source schema
- `autoRegisterSchemaFromIntrospection()` - Auto-maps schemas

#### `analytics-engine/services/visualization-selector.ts`
**Purpose:** Auto-selects best chart type  
**Key Functions:**
- `autoSelectVisualizationType()` - Analyzes results and selects chart
- Supports: bar, line, pie, table, scatter, gauge, map

### API Routes

#### `app/api/analytics/route.ts`
**Purpose:** Main analytics API endpoint  
**Modes:**
- `ADHOC_QUERY` - Natural language query generation
- `DASHBOARD_METRICS` - Dashboard metrics generation

#### `app/api/analytics/execute/route.ts`
**Purpose:** Query execution endpoint  
**Handles:** SQL queries, CSV queries, file queries

#### `app/api/analytics/upload/route.ts`
**Purpose:** File upload handling  
**Saves:** Files to `/uploads` directory

#### `app/api/analytics/schema/route.ts`
**Purpose:** Schema introspection  
**Returns:** Table and column metadata

#### `app/api/analytics/data-sources/route.ts`
**Purpose:** Data source CRUD operations  
**Operations:** Create, Read, Update, Delete data sources

### Components

#### `components/analytics/AdhocQuery.tsx`
**Purpose:** Natural language query interface  
**Features:** Input field, query execution, result display

#### `components/analytics/DashboardMetrics.tsx`
**Purpose:** Dashboard metrics display  
**Features:** Auto-refresh, metric cards, visualizations

#### `components/analytics/VisualizationRenderer.tsx`
**Purpose:** Chart renderer router  
**Routes:** To appropriate chart component based on type

### Database

#### `prisma/schema.prisma`
**Purpose:** Database schema definition  
**Models:**
- `QueryHistory` - Past queries
- `FileMetadata` - Uploaded files
- `DashboardMetric` - Cached metrics
- `School` - School accounts
- `DataSource` - Data source connections
- `SchemaRegistry` - Schema mappings
- `SchemaMapping` - Transformation rules

---

## 🔌 API Endpoints

### Analytics Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/analytics` | POST | Generate queries/metrics (ADHOC_QUERY or DASHBOARD_METRICS) |
| `/api/analytics/execute` | POST | Execute generated queries |
| `/api/analytics/upload` | POST | Upload files (CSV, JSON, Excel, Text) |
| `/api/analytics/schema` | POST | Get schema for data source |
| `/api/analytics/history` | GET/POST/DELETE | Query history operations |
| `/api/analytics/suggestions` | POST | Get AI-generated query suggestions |
| `/api/analytics/refresh` | POST | Refresh dashboard metrics |

### Data Source Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/analytics/data-sources` | GET/POST | List/Create data sources |
| `/api/analytics/data-sources/[id]` | GET/PUT/DELETE | Data source CRUD |
| `/api/analytics/data-sources/[id]/schema` | GET | Get schema for data source |
| `/api/analytics/data-sources/[id]/translate` | POST | Translate canonical query |

### Authentication Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/analytics/auth/login` | POST | School login |

---

## 🗄 Database Schema

### QueryHistory
Stores past queries and results
- `id` (String, Primary Key)
- `userQuestion` (String)
- `queryType` (String)
- `queryContent` (String)
- `sourceType` (String)
- `filePath` (String, Optional)
- `results` (String, Optional, JSON)
- `createdAt` (DateTime)

### FileMetadata
Tracks uploaded files
- `id` (String, Primary Key)
- `fileName` (String)
- `filePath` (String, Unique)
- `fileType` (String)
- `fileSize` (Int)
- `tableName` (String, Optional)
- `metadata` (String, JSON)
- `uploadedAt` (DateTime)

### DashboardMetric
Caches dashboard metrics
- `id` (String, Primary Key)
- `metricName` (String)
- `queryContent` (String)
- `visualizationType` (String)
- `insightSummary` (String)
- `sourceType` (String)
- `filePath` (String, Optional)
- `createdAt` (DateTime)
- `updatedAt` (DateTime)

### School
School accounts for multi-tenant access
- `id` (String, Primary Key)
- `email` (String, Unique)
- `password` (String, Hashed)
- `name` (String)
- `connectionString` (String)
- `dataSourceId` (String, Optional, Unique)
- `isActive` (Boolean)
- `createdAt` (DateTime)
- `updatedAt` (DateTime)

### DataSource
Data source connections
- `id` (String, Primary Key)
- `name` (String)
- `sourceType` (String)
- `connectionString` (String, Optional)
- `isActive` (Boolean)
- `description` (String, Optional)
- `createdAt` (DateTime)
- `updatedAt` (DateTime)

### SchemaRegistry
Schema mappings (source → canonical)
- `id` (String, Primary Key)
- `dataSourceId` (String, Foreign Key)
- `tableName` (String)
- `columnName` (String)
- `canonicalTableName` (String)
- `canonicalColumnName` (String)
- `dataType` (String)
- `description` (String, Optional)
- `isPrimaryKey` (Boolean)
- `isNullable` (Boolean)
- `createdAt` (DateTime)
- `updatedAt` (DateTime)

### SchemaMapping
Transformation rules
- `id` (String, Primary Key)
- `dataSourceId` (String, Foreign Key)
- `sourceTable` (String)
- `sourceColumn` (String)
- `canonicalTable` (String)
- `canonicalColumn` (String)
- `transformationRule` (String, Optional)
- `createdAt` (DateTime)
- `updatedAt` (DateTime)

---

## 🏗 Architecture Overview

### Request Flow

```
User Input (Natural Language)
    ↓
Frontend Component (AdhocQuery.tsx / DashboardMetrics.tsx)
    ↓
API Route (/api/analytics)
    ↓
LLM Service (OpenAI GPT-4)
    ↓
Query Generation (SQL Query)
    ↓
Query Post-Processor (Fix table names, validate)
    ↓
Query Executor Router
    ↓
Specific Executor (CSV / File / SQL)
    ↓
Results Processing
    ↓
Visualization Selector (Auto-select chart type)
    ↓
Visualization Renderer (Render chart)
    ↓
Query History Service (Save to database)
```

### Multi-Tenant Flow

```
School Login
    ↓
Register Data Source
    ↓
Schema Introspection (Python Backend)
    ↓
Canonical Mapping Service (Auto-map schema)
    ↓
Schema Registry (Store mappings)
    ↓
User Query (Uses canonical schema)
    ↓
Query Translation (Canonical → Source)
    ↓
Query Execution (On source database)
    ↓
Results Display
```

---

## 🚀 Entry Points

### Development Server
```bash
npm run dev
```
**Starts:** Next.js development server on http://localhost:3000

### Production Build
```bash
npm run build
npm start
```

### Database Operations
```bash
npm run prisma:generate  # Generate Prisma client
npm run prisma:migrate   # Run migrations
npm run prisma:seed      # Seed database
```

### Python Backend
```bash
cd analytics-engine/python-backend
pip install -r requirements.txt
python api_server.py  # If using standalone Python server
```

---

## 📦 Dependencies

### Core Dependencies
- `next` (^14.0.0) - Next.js framework
- `react` (^18.2.0) - React library
- `typescript` (^5.3.2) - TypeScript compiler
- `prisma` (^5.7.0) - Database ORM
- `@prisma/client` (^5.7.0) - Prisma client
- `openai` (^4.20.0) - OpenAI API client

### Data Processing
- `csv-parse` (^5.5.3) - CSV parsing
- `papaparse` (^5.5.3) - CSV parsing (browser)
- `xlsx` (^0.18.5) - Excel file processing
- `pandas` (Python) - Data manipulation
- `sqlalchemy` (Python) - SQL toolkit

### Visualization
- `recharts` (^2.10.3) - Chart library

### Utilities
- `axios` (^1.6.2) - HTTP client
- `zod` (^3.22.4) - Schema validation
- `bcryptjs` (^2.4.3) - Password hashing
- `react-hot-toast` (^2.4.1) - Toast notifications

### Development
- `tailwindcss` (^3.3.6) - CSS framework
- `eslint` (^8.55.0) - Linting
- `tsx` (^4.7.0) - TypeScript execution

---

## 🔍 Quick Reference

### Finding Code by Feature

**File Upload:**
- Component: `components/analytics/FileUpload.tsx`
- API: `app/api/analytics/upload/route.ts`
- Service: `analytics-engine/services/file-processor.ts`

**Query Generation:**
- Component: `components/analytics/AdhocQuery.tsx`
- API: `app/api/analytics/route.ts`
- Service: `analytics-engine/services/llm-service.ts`

**Query Execution:**
- API: `app/api/analytics/execute/route.ts`
- Service: `analytics-engine/services/query-executor.ts`
- CSV Executor: `analytics-engine/services/csv-query-executor.ts`

**Visualization:**
- Component: `components/analytics/VisualizationRenderer.tsx`
- Selector: `analytics-engine/services/visualization-selector.ts`
- Charts: `components/analytics/visualizations/*.tsx`

**Multi-Tenant:**
- Service: `analytics-engine/services/canonical-mapping-service.ts`
- API: `app/api/analytics/data-sources/route.ts`
- Schema: `prisma/schema.prisma` (DataSource, SchemaRegistry, SchemaMapping)

**Dashboard:**
- Component: `components/analytics/DashboardMetrics.tsx`
- API: `app/api/analytics/route.ts` (DASHBOARD_METRICS mode)
- Service: `analytics-engine/services/llm-service.ts`

---

## 📝 Notes

- **Environment Variables:** Required in `.env.local`
  - `OPENAI_API_KEY` - OpenAI API key
  - `OPENAI_MODEL` - Model name (default: gpt-4-turbo-preview)
  - `DATABASE_URL` - Database connection string
  - `NEXT_PUBLIC_DB_CONNECTION_STRING` - Public DB connection (optional)

- **File Storage:** Uploaded files stored in `/uploads` directory

- **Database:** SQLite for development, PostgreSQL/MySQL for production

- **Python Backend:** Used for schema introspection and SQL query execution on databases

---

**For detailed setup instructions, see:** `README.md`  
**For system flow documentation, see:** `COMPLETE_SYSTEM_FLOW.md`  
**For quick start guide, see:** `QUICK_START.md`

