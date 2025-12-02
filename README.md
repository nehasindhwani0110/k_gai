# K-GAI Analytics Engine - Complete System Flow & Documentation

## 📋 Table of Contents

1. [Overview](#overview)
2. [Technology Stack](#technology-stack)
3. [Architecture](#architecture)
4. [Complete System Flow](#complete-system-flow)
5. [Key Components](#key-components)
6. [API Endpoints](#api-endpoints)
7. [File Structure](#file-structure)
8. [Setup & Installation](#setup--installation)

---

## 🎯 Overview

**K-GAI Analytics Engine** is a multi-tenant, AI-powered analytics platform that converts natural language questions into SQL queries and generates beautiful visualizations. It supports both SQL databases and CSV files, with intelligent schema detection, query generation, and automatic visualization selection.

### Key Features

- 🔐 **Multi-tenant authentication** (School-based login)
- 🤖 **AI-powered query generation** (OpenAI GPT-4)
- 📊 **Automatic visualization** (Bar, Line, Pie, Scatter, Gauge, Table)
- 🔍 **Schema introspection** (Automatic table/column detection)
- 📁 **CSV file support** (Upload and query CSV files)
- 🗄️ **SQL database support** (MySQL, PostgreSQL, SQLite)
- 🔄 **Agent-based query generation** (LangChain/LangGraph)
- 📈 **Dashboard metrics** (Auto-generated analytics)
- 🔧 **Query auto-fixing** (Handles GROUP BY errors, column errors)
- 📝 **Query history** (Track all queries)
- 🎨 **PowerBI-style visualizations**

---

## 🛠️ Technology Stack

### Frontend
- **Framework**: Next.js 14 (React 18)
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **Charts**: Recharts
- **State Management**: React Hooks
- **Notifications**: react-hot-toast
- **File Parsing**: papaparse, xlsx, csv-parse

### Backend (TypeScript/Node.js)
- **Runtime**: Node.js
- **Framework**: Next.js API Routes
- **Database ORM**: Prisma
- **Database**: SQLite (for metadata), MySQL/PostgreSQL (for data sources)
- **Authentication**: bcryptjs (password hashing)
- **HTTP Client**: axios

### AI/ML Stack
- **LLM Provider**: OpenAI (GPT-4 Turbo)
- **Agent Framework**: LangChain, LangGraph
- **Observability**: LangSmith (tracing, token usage, latency)
- **Packages**:
  - `openai` - OpenAI SDK
  - `@langchain/openai` - LangChain OpenAI integration
  - `@langchain/core` - Core LangChain functionality
  - `@langchain/langgraph` - LangGraph for agent workflows
  - `langsmith` - LangSmith tracing

### Backend (Python)
- **Framework**: Flask
- **Database**: SQLAlchemy
- **Agent Framework**: LangChain (Python)
- **Purpose**: Schema introspection, SQL agent execution

### Development Tools
- **TypeScript**: Type checking
- **ESLint**: Code linting
- **PostCSS**: CSS processing
- **tsx**: TypeScript execution

---

## 🏗️ Architecture

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        Frontend (Next.js)                    │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │   Login      │  │  Analytics   │  │  Dashboard   │      │
│  │   Page       │  │    Page      │  │   Metrics    │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                    Next.js API Routes                        │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │  /api/auth   │  │ /api/analytics│  │ /api/execute │      │
│  │   /login     │  │               │  │              │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
└─────────────────────────────────────────────────────────────┘
                            │
        ┌───────────────────┼───────────────────┐
        │                   │                   │
        ▼                   ▼                   ▼
┌──────────────┐  ┌──────────────┐  ┌──────────────┐
│   LLM        │  │   Query      │  │   Python     │
│   Service    │  │   Executor   │  │   Backend    │
│              │  │              │  │   (Flask)    │
└──────────────┘  └──────────────┘  └──────────────┘
        │                   │                   │
        ▼                   ▼                   ▼
┌──────────────┐  ┌──────────────┐  ┌──────────────┐
│   OpenAI     │  │   Database   │  │  LangChain   │
│   API        │  │   (SQL)      │  │   Agent      │
└──────────────┘  └──────────────┘  └──────────────┘
```

### Component Architecture

```
Frontend Components
├── SchoolLogin.tsx          → Authentication UI
├── FileUpload.tsx           → CSV upload interface
├── AdhocQuery.tsx           → Natural language query input
├── DashboardMetrics.tsx     → Auto-generated metrics display
├── AIAnalyticsSuggestions.tsx → AI-powered question suggestions
├── QueryHistory.tsx         → Query history display
└── VisualizationRenderer.tsx → Chart rendering
    ├── BarChart.tsx
    ├── LineChart.tsx
    ├── PieChart.tsx
    ├── ScatterPlot.tsx
    ├── Gauge.tsx
    └── Table.tsx

Backend Services
├── llm-service.ts           → OpenAI query generation
├── query-executor.ts        → SQL execution & error fixing
├── schema-introspection.ts  → Database schema detection
├── visualization-selector.ts → Auto chart type selection
├── agent-service.ts         → LangChain agent integration
└── langsmith-tracer.ts     → LangSmith observability

Python Backend
├── api_server.py            → Flask REST API
├── schema_introspection.py  → SQLAlchemy schema detection
├── query_executor.py        → SQL query execution
└── agent_service.py         → LangChain SQL agent
```

---

## 🔄 Complete System Flow

### Flow 1: User Login & Initial Setup

```
1. User visits http://localhost:3000
   │
   ├─► app/page.tsx (Home page)
   │   └─► Checks sessionStorage for authentication
   │       ├─► If authenticated → Redirect to /analytics
   │       └─► If not → Show SchoolLogin component
   │
   ├─► User enters credentials (email, password)
   │
   ├─► POST /api/auth/login
   │   ├─► Validates credentials against Prisma DB
   │   ├─► Checks School table (email, password hash)
   │   ├─► Creates DataSource if doesn't exist
   │   ├─► Links School to DataSource
   │   └─► Returns: { schoolId, dataSourceId, schoolName }
   │
   └─► Frontend stores in sessionStorage
       └─► Redirects to /analytics page
```

### Flow 2: Schema Detection (First Time Access)

```
1. User lands on /analytics page
   │
   ├─► app/analytics/page.tsx
   │   └─► Checks if metadata exists in DataSource
   │
   ├─► If no metadata:
   │   │
   │   ├─► GET /api/analytics/data-sources/[id]/schema
   │   │   ├─► Checks source_type (SQL_DB or CSV_FILE)
   │   │   │
   │   │   ├─► If SQL_DB:
   │   │   │   ├─► Calls Python backend: POST http://localhost:8000/introspect
   │   │   │   │   ├─► schema_introspection.py
   │   │   │   │   │   ├─► SQLAlchemy connects to database
   │   │   │   │   │   ├─► Inspects all tables
   │   │   │   │   │   ├─► Gets columns, types, constraints
   │   │   │   │   │   └─► Returns: { tables: [{ name, columns: [...] }] }
   │   │   │   │   │
   │   │   │   │   └─► Saves metadata to Prisma DataSource
   │   │   │   │
   │   │   └─► If CSV_FILE:
   │   │       ├─► Reads CSV file from uploads/
   │   │       ├─► Parses headers and sample rows
   │   │       ├─► Detects data types (string, number, date)
   │   │       └─► Saves metadata to Prisma DataSource
   │   │
   │   └─► Frontend receives metadata
   │       └─► Displays FileUpload, AdhocQuery, DashboardMetrics components
```

### Flow 3: Ad-Hoc Query Generation

```
1. User types natural language question
   Example: "What is the distribution of payment methods?"
   │
   ├─► AdhocQuery.tsx component
   │   └─► User submits question
   │
   ├─► POST /api/analytics
   │   Body: {
   │     mode: "ADHOC_QUERY",
   │     user_question: "What is the distribution...",
   │     metadata: { tables: [...], columns: [...] },
   │     connection_string: "mysql://...",
   │     use_agent: true/false
   │   }
   │
   ├─► Route handler: app/api/analytics/route.ts
   │   └─► Validates request
   │
   ├─► Decision: Which query generation method?
   │   │
   │   ├─► Option A: LangGraph Agent (if use_langgraph=true)
   │   │   └─► generateAdhocQueryWithLangGraphAgent()
   │   │       ├─► QueryAgent.execute()
   │   │       │   ├─► Step 1: Analyze question complexity
   │   │       │   ├─► Step 2: Explore relevant schema (if needed)
   │   │       │   │   └─► Calls schema-explorer.ts tool
   │   │       │   │       └─► Identifies relevant tables based on question
   │   │       │   ├─► Step 3: Generate query using LLM
   │   │       │   │   └─► ChatOpenAI (LangChain) with metadata
   │   │       │   ├─► Step 4: Validate query
   │   │       │   │   └─► query-validator.ts tool
   │   │       │   └─► Step 5: Refine if needed
   │   │       └─► Returns: SQL query string
   │   │
   │   ├─► Option B: Python Agent (if use_agent=true)
   │   │   └─► generateQueryWithPythonAgent()
   │   │       ├─► POST http://localhost:8000/agent/query
   │   │       │   └─► agent_service.py
   │   │       │       ├─► Creates LangChain SQL Agent
   │   │       │       ├─► Agent explores schema dynamically
   │   │       │       ├─► Generates query using LLM
   │   │       │       └─► Returns: SQL query string
   │   │       └─► Returns: SQL query
   │   │
   │   └─► Option C: Direct LLM (default)
   │       └─► generateAdhocQuery()
   │           ├─► llm-service.ts
   │           │   ├─► Reduces metadata if large database (>10 tables)
   │           │   │   └─► Uses LLM to identify relevant tables
   │           │   ├─► Builds prompt with:
   │           │   │   ├─► User question
   │           │   │   ├─► Schema metadata
   │           │   │   └─► SQL generation rules
   │           │   ├─► Calls OpenAI API (with LangSmith tracing)
   │           │   │   └─► openai.chat.completions.create()
   │           │   │       ├─► Model: gpt-4-turbo-preview
   │           │   │       ├─► Response format: JSON
   │           │   │       └─► Returns: { query_content, visualization_type, insight_summary }
   │           │   └─► Parses JSON response
   │           └─► Returns: AdhocQueryResponse
   │
   ├─► Response sent to frontend
   │   └─► { query_content: "SELECT ...", visualization_type: "auto", insight_summary: "..." }
   │
   ├─► Frontend executes query
   │   └─► POST /api/analytics/execute
   │       ├─► query-executor.ts
   │       │   ├─► Validates SQL (security check)
   │       │   ├─► Executes query
   │       │   │   ├─► If SQL_DB: Calls Python backend
   │       │   │   │   └─► POST http://localhost:8000/execute
   │       │   │   │       └─► query_executor.py executes SQL
   │       │   │   └─► If CSV_FILE: Uses csv-query-executor.ts
   │       │   │       └─► Parses CSV and executes query logic
   │       │   │
   │       │   ├─► If error occurs:
   │       │   │   ├─► GROUP BY error? → fixGroupByWithLLM()
   │       │   │   │   └─► Uses LLM to fix GROUP BY violations
   │       │   │   └─► Column error? → fixColumnErrorWithLLM()
   │       │   │       ├─► Introspects schema for correct columns
   │       │   │       └─► Uses LLM to fix column names
   │       │   │
   │       │   └─► Returns: { results: [...] }
   │       │
   │       └─► Frontend receives results
   │
   ├─► Visualization Selection
   │   └─► visualization-selector.ts
   │       ├─► Analyzes data structure
   │       ├─► Checks query content
   │       ├─► Considers user question
   │       └─► Selects: bar_chart, pie_chart, line_chart, etc.
   │
   └─► Render Visualization
       └─► VisualizationRenderer.tsx
           ├─► BarChart.tsx (PowerBI-style)
           ├─► PieChart.tsx
           ├─► LineChart.tsx
           └─► etc.
```

### Flow 4: Dashboard Metrics Generation

```
1. User visits /analytics page
   │
   ├─► DashboardMetrics.tsx component loads
   │
   ├─► POST /api/analytics
   │   Body: {
   │     mode: "DASHBOARD_METRICS",
   │     metadata: { tables: [...], columns: [...] },
   │     connection_string: "mysql://...",
   │     use_agent: true/false
   │   }
   │
   ├─► Route handler: app/api/analytics/route.ts
   │
   ├─► Decision: Agent-based or direct LLM?
   │   │
   │   ├─► If use_agent=true or large database:
   │   │   └─► generateDashboardMetricsWithAgent()
   │   │       ├─► Identifies key tables (scoring algorithm)
   │   │       │   └─► Scores tables based on:
   │   │       │       ├─► Numeric columns (for aggregations)
   │   │       │       ├─► Date columns (for time series)
   │   │       │       └─► Category columns (for distributions)
   │   │       ├─► Reduces metadata to top 10 tables
   │   │       └─► Calls generateDashboardMetrics()
   │   │
   │   └─► generateDashboardMetrics()
   │       ├─► llm-service.ts
   │       │   ├─► Builds prompt requesting 6-8 metrics
   │       │   ├─► Includes metadata (reduced if agent-based)
   │       │   ├─► Calls OpenAI API
   │       │   └─► Returns: { dashboard_metrics: [...] }
   │       │
   │       └─► Each metric contains:
   │           ├─► metric_name: "Total Revenue"
   │           ├─► query_content: "SELECT SUM(amount)..."
   │           ├─► visualization_type: "auto"
   │           └─► insight_summary: "Shows total revenue..."
   │
   ├─► Post-processing
   │   └─► query-post-processor.ts
   │       └─► Ensures queries return data
   │
   ├─► Frontend receives metrics
   │
   ├─► For each metric:
   │   ├─► Execute query (POST /api/analytics/execute)
   │   ├─► Check if returns data
   │   ├─► Auto-select visualization type
   │   └─► Render chart
   │
   └─► Display grid of metrics with visualizations
```

### Flow 5: CSV File Upload & Query

```
1. User uploads CSV file
   │
   ├─► FileUpload.tsx component
   │   └─► User selects file
   │
   ├─► POST /api/analytics/upload
   │   ├─► Saves file to uploads/ directory
   │   ├─► Parses CSV headers
   │   ├─► Detects data types
   │   ├─► Creates DataSource record in Prisma
   │   └─► Returns: { dataSourceId, metadata }
   │
   ├─► Frontend stores metadata
   │
   ├─► User asks question
   │   └─► Same flow as Ad-Hoc Query (Flow 3)
   │
   └─► Query execution
       └─► csv-query-executor.ts
           ├─► Reads CSV file
           ├─► Parses into array of objects
           ├─► Executes query logic (filtering, grouping, etc.)
           └─► Returns results
```

### Flow 6: LangSmith Tracing (Observability)

```
Every LLM call is automatically traced:
│
├─► langsmith-tracer.ts
│   ├─► Checks: LANGCHAIN_TRACING_V2=true
│   ├─► Wraps OpenAI client with LangSmith
│   └─► All calls automatically traced
│
├─► LangSmith captures:
│   ├─► Input: Full prompt/messages
│   ├─► Output: LLM response
│   ├─► Tokens: Input/output token count
│   ├─► Latency: Execution time
│   ├─► Metadata: Model, temperature, etc.
│   └─► Errors: Failed calls with context
│
└─► View in LangSmith dashboard
    └─► https://smith.langchain.com
        └─► Projects → analytics-engine
```

---

## 🔧 Key Components

### Frontend Components

#### `SchoolLogin.tsx`
- **Purpose**: Authentication UI
- **Features**: Email/password login, session management
- **Flow**: Validates → Calls `/api/auth/login` → Stores session → Redirects

#### `FileUpload.tsx`
- **Purpose**: CSV file upload interface
- **Features**: Drag & drop, file validation, progress tracking
- **Flow**: Upload → Parse → Save → Create DataSource

#### `AdhocQuery.tsx`
- **Purpose**: Natural language query interface
- **Features**: Question input, query display, visualization, data modal
- **Flow**: Question → Generate query → Execute → Visualize

#### `DashboardMetrics.tsx`
- **Purpose**: Auto-generated dashboard display
- **Features**: Grid layout, metric cards, individual visualizations
- **Flow**: Load → Generate metrics → Execute queries → Display charts

#### `AIAnalyticsSuggestions.tsx`
- **Purpose**: AI-powered question suggestions
- **Features**: Generates relevant questions based on schema
- **Flow**: Analyze schema → Generate suggestions → Display → User clicks

#### `VisualizationRenderer.tsx`
- **Purpose**: Chart rendering wrapper
- **Features**: Routes to appropriate chart component
- **Components**: BarChart, LineChart, PieChart, ScatterPlot, Gauge, Table

### Backend Services

#### `llm-service.ts`
- **Purpose**: Core LLM query generation
- **Functions**:
  - `generateAdhocQuery()` - Direct LLM query generation
  - `generateDashboardMetrics()` - Dashboard metrics generation
  - `generateAdhocQueryWithLangGraphAgent()` - Agent-based generation
  - `reduceMetadataForAdhocQuery()` - Metadata reduction for large DBs

#### `query-executor.ts`
- **Purpose**: SQL query execution and error handling
- **Functions**:
  - `executeSQLQuery()` - Execute query with error handling
  - `fixGroupByWithLLM()` - Auto-fix GROUP BY violations
  - `fixColumnErrorWithLLM()` - Auto-fix column name errors

#### `schema-introspection.ts`
- **Purpose**: Database schema detection
- **Functions**:
  - `introspectSQLSchema()` - Get schema from SQL database
  - `introspectCSVSchema()` - Get schema from CSV file

#### `visualization-selector.ts`
- **Purpose**: Automatic chart type selection
- **Function**: `autoSelectVisualizationType()` - Analyzes data and query to select best chart

#### `agent-service.ts`
- **Purpose**: LangChain agent integration
- **Functions**:
  - `generateQueryWithSQLAgent()` - LangChain SQL agent
  - `exploreRelevantSchema()` - Schema exploration tool

#### `langsmith-tracer.ts`
- **Purpose**: LangSmith observability
- **Functions**:
  - `createTracedOpenAI()` - Wraps OpenAI client with tracing
  - `traceFunction()` - Trace custom functions
  - `getLangSmithStatus()` - Get tracing status

### Python Backend

#### `api_server.py`
- **Purpose**: Flask REST API server
- **Endpoints**:
  - `POST /introspect` - Schema introspection
  - `POST /execute` - SQL query execution
  - `POST /agent/query` - LangChain agent query
  - `POST /agent/explore-schema` - Schema exploration

#### `schema_introspection.py`
- **Purpose**: SQLAlchemy-based schema detection
- **Function**: `introspect_sql_schema()` - Inspects database structure

#### `agent_service.py`
- **Purpose**: LangChain SQL agent service
- **Function**: `generate_query()` - Uses LangChain SQL agent

---

## 🌐 API Endpoints

### Authentication
- `POST /api/auth/login` - School login

### Analytics
- `POST /api/analytics` - Generate queries/metrics
  - Mode: `ADHOC_QUERY` or `DASHBOARD_METRICS`
- `POST /api/analytics/execute` - Execute SQL query
- `POST /api/analytics/upload` - Upload CSV file
- `GET /api/analytics/schema` - Get schema
- `GET /api/analytics/data-sources/[id]/schema` - Get data source schema
- `POST /api/analytics/suggestions` - Get AI suggestions
- `GET /api/analytics/history` - Get query history
- `POST /api/analytics/history` - Save query to history

### Python Backend (Flask)
- `GET /health` - Health check
- `POST /introspect` - Schema introspection
- `POST /execute` - Execute SQL query
- `POST /agent/query` - LangChain agent query
- `POST /agent/explore-schema` - Schema exploration

---

## 📁 File Structure

```
k_gai/
├── app/                          # Next.js app directory
│   ├── page.tsx                  # Home page (login)
│   ├── analytics/
│   │   └── page.tsx              # Analytics dashboard
│   └── api/                      # API routes
│       ├── auth/login/route.ts   # Login endpoint
│       └── analytics/
│           ├── route.ts           # Main analytics endpoint
│           ├── execute/route.ts   # Query execution
│           ├── upload/route.ts    # File upload
│           └── suggestions/route.ts
│
├── components/                   # React components
│   ├── auth/
│   │   └── SchoolLogin.tsx
│   └── analytics/
│       ├── AdhocQuery.tsx
│       ├── DashboardMetrics.tsx
│       ├── FileUpload.tsx
│       ├── AIAnalyticsSuggestions.tsx
│       ├── QueryHistory.tsx
│       ├── VisualizationRenderer.tsx
│       └── visualizations/
│           ├── BarChart.tsx
│           ├── LineChart.tsx
│           ├── PieChart.tsx
│           └── ...
│
├── analytics-engine/              # Core analytics engine
│   ├── services/                 # Business logic
│   │   ├── llm-service.ts        # LLM query generation
│   │   ├── query-executor.ts     # Query execution
│   │   ├── schema-introspection.ts
│   │   ├── visualization-selector.ts
│   │   ├── agent-service.ts
│   │   └── langsmith-tracer.ts
│   ├── agents/                   # Agent implementations
│   │   ├── query-agent.ts        # LangGraph agent
│   │   └── tools/
│   │       ├── query-validator.ts
│   │       └── schema-explorer.ts
│   ├── python-backend/           # Python Flask server
│   │   ├── api_server.py
│   │   ├── schema_introspection.py
│   │   ├── query_executor.py
│   │   └── agent_service.py
│   ├── types/
│   │   └── index.ts              # TypeScript types
│   └── utils/
│       ├── date-utils.ts
│       └── langsmith-tracer.ts
│
├── lib/
│   └── prisma.ts                 # Prisma client
│
├── prisma/
│   ├── schema.prisma             # Database schema
│   └── seed.ts                   # Seed data
│
├── scripts/                      # Utility scripts
│   ├── create_realestate_tenant.ts
│   └── test_realestate_tenant.ts
│
├── uploads/                      # Uploaded CSV files
│
├── package.json                  # Dependencies
├── tsconfig.json                 # TypeScript config
├── tailwind.config.js           # Tailwind config
└── README.md                     # This file
```

---

## 🚀 Setup & Installation

### Prerequisites
- Node.js 18+
- Python 3.8+
- MySQL/PostgreSQL (for SQL databases)
- OpenAI API key

### Installation Steps

1. **Install Node.js dependencies**
```bash
npm install
```

2. **Install Python dependencies**
```bash
cd analytics-engine/python-backend
pip install -r requirements.txt
```

3. **Setup Prisma database**
```bash
npx prisma generate
npx prisma migrate dev
npm run prisma:seed
```

4. **Configure environment variables**
Create `.env.local`:
```env
# OpenAI
OPENAI_API_KEY=your-openai-api-key
OPENAI_MODEL=gpt-4-turbo-preview

# Database (for SQL sources)
DATABASE_URL=mysql://user:password@localhost:3306/dbname

# LangSmith (optional)
LANGCHAIN_TRACING_V2=true
LANGCHAIN_API_KEY=your-langsmith-api-key
LANGCHAIN_PROJECT=analytics-engine
```

5. **Start Python backend** (in separate terminal)
```bash
npm run python:backend
# Or: cd analytics-engine/python-backend && python api_server.py
```

6. **Start Next.js dev server**
```bash
npm run dev
```

7. **Access application**
- Frontend: http://localhost:3000
- Python API: http://localhost:8000

### Default Login Credentials
- Email: `schoola@gmail.com`
- Password: `neha`

---

## 📊 Data Flow Summary

1. **User Login** → Authenticate → Create DataSource → Store metadata
2. **Schema Detection** → Introspect database/CSV → Save schema → Display UI
3. **Query Generation** → User question → LLM/Agent → SQL query → Execute → Visualize
4. **Dashboard Metrics** → Generate 6-8 metrics → Execute queries → Display charts
5. **Observability** → All LLM calls traced → View in LangSmith dashboard

---

## 🔍 Key Technologies Explained

### Next.js 14
- **App Router**: File-based routing with `app/` directory
- **Server Components**: Server-side rendering by default
- **API Routes**: Backend endpoints in `app/api/`

### Prisma
- **ORM**: Type-safe database access
- **Schema**: Defined in `prisma/schema.prisma`
- **Client**: Generated TypeScript client

### LangChain/LangGraph
- **Agents**: Multi-step reasoning workflows
- **Tools**: Reusable functions (schema exploration, validation)
- **SQL Agent**: Specialized agent for SQL generation

### LangSmith
- **Tracing**: Automatic LLM call tracking
- **Observability**: Token usage, latency, costs
- **Debugging**: Full request/response logging

### Recharts
- **Chart Library**: React chart components
- **Types**: Bar, Line, Pie, Scatter, etc.
- **Styling**: PowerBI-inspired design

---

## 🎯 Summary

This application is a **complete AI-powered analytics platform** that:

1. **Authenticates** users (multi-tenant)
2. **Detects** database/CSV schemas automatically
3. **Generates** SQL queries from natural language using AI
4. **Executes** queries with automatic error fixing
5. **Visualizes** results with beautiful charts
6. **Tracks** everything with LangSmith observability

The system uses **Next.js** for the frontend, **TypeScript** for type safety, **OpenAI GPT-4** for AI, **LangChain** for agents, **Prisma** for database access, and **Python Flask** for schema introspection.

---

## 📚 Additional Documentation

- `LANGSMITH_SETUP.md` - LangSmith integration guide
- `REALESTATE_TENANT_SETUP.md` - Multi-tenant setup guide
- `prisma/schema.prisma` - Database schema definition

---

**Built with ❤️ using Next.js, TypeScript, OpenAI, LangChain, and Python**

