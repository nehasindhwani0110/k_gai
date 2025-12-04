# Quick Reference Guide

## Common Tasks

### Start Development
```powershell
# Terminal 1: Start Next.js
npm run dev

# Terminal 2: Start Python Backend (if needed)
npm run python:backend
```

### Add New Data Source
1. Go to `/` (home page)
2. Configure SQL database or upload file
3. Redirects to `/analytics` automatically

### Generate Query from Natural Language
```typescript
// API Call
POST /api/analytics
{
  "mode": "ADHOC_QUERY",
  "metadata": { ... },
  "user_question": "What is the average attendance?"
}
```

### Generate Dashboard Metrics
```typescript
// API Call
POST /api/analytics
{
  "mode": "DASHBOARD_METRICS",
  "metadata": { ... }
}
```

### Execute Query
```typescript
// API Call
POST /api/analytics/execute
{
  "query": "SELECT AVG(attendance) FROM students",
  "source_type": "SQL_DB",
  "connection_string": "mysql://...",
  // OR for files:
  "source_type": "CSV_FILE",
  "file_path": "/path/to/file.csv"
}
```

### Get Schema
```typescript
// For SQL Database
GET /api/analytics/data-sources/[id]/schema?forceRefresh=true

// For File
POST /api/analytics/schema
{
  "source_type": "CSV_FILE",
  "file_path": "/path/to/file.csv",
  "file_type": "CSV"
}
```

## File Locations

### Key Services
- **Query Generation**: `analytics-engine/services/llm-service.ts`
- **Query Execution**: `analytics-engine/services/query-executor.ts`
- **Schema Introspection**: `analytics-engine/services/schema-introspection.ts`
- **Canonical Mapping**: `analytics-engine/services/canonical-mapping-service.ts`

### API Routes
- **Main API**: `app/api/analytics/route.ts`
- **Execute**: `app/api/analytics/execute/route.ts`
- **Schema**: `app/api/analytics/schema/route.ts`
- **Data Sources**: `app/api/analytics/data-sources/route.ts`

### Components
- **Dashboard**: `components/analytics/DashboardMetrics.tsx`
- **Query**: `components/analytics/AdhocQuery.tsx`
- **Visualization**: `components/analytics/VisualizationRenderer.tsx`
- **File Upload**: `components/analytics/FileUpload.tsx`

### Python Backend
- **API Server**: `analytics-engine/python-backend/api_server.py`
- **Schema Introspection**: `analytics-engine/python-backend/schema_introspection.py`
- **Query Executor**: `analytics-engine/python-backend/query_executor.py`
- **System Catalog**: `analytics-engine/python-backend/system_catalog.py`

## Type Definitions

### Source Types
- `SQL_DB`: SQL database
- `CSV_FILE`: CSV file
- `EXCEL_FILE`: Excel file
- `JSON_FILE`: JSON file
- `TXT_FILE`: Text file
- `GOOGLE_DRIVE`: Google Drive file

### Query Types
- `SQL_QUERY`: Standard SQL query
- `QUERY_LOGIC`: Query logic for file-based sources

### Visualization Types
- `bar_chart`: Bar chart
- `line_chart`: Line chart
- `pie_chart`: Pie chart
- `scatter_plot`: Scatter plot
- `gauge`: Gauge/KPI
- `table`: Table view
- `map_view`: Map visualization
- `auto`: Auto-select based on data

## Database Models

### QueryHistory
- Stores executed queries
- Fields: `userQuestion`, `queryContent`, `results`, `sourceType`

### DashboardMetric
- Stores dashboard metrics
- Fields: `metricName`, `queryContent`, `visualizationType`

### FileMetadata
- Stores uploaded file info
- Fields: `fileName`, `filePath`, `fileType`, `metadata`

### DataSource
- Stores data source configs
- Fields: `name`, `sourceType`, `connectionString`, `isActive`

### SchemaRegistry
- Stores canonical mappings
- Fields: `tableName`, `columnName`, `canonicalTableName`, `canonicalColumnName`

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
4. Add to API documentation

## Debugging

### Check Python Backend
```powershell
# Test health endpoint
curl http://localhost:8000/health

# Test introspection
curl -X POST http://localhost:8000/introspect -H "Content-Type: application/json" -d '{"connection_string": "mysql://..."}'
```

### Check Redis
```powershell
npm run test:redis
```

### Check Database
```powershell
# Generate Prisma client
npm run prisma:generate

# View database
npx prisma studio
```

### Enable LangSmith Tracing
```env
LANGCHAIN_TRACING_V2=true
LANGCHAIN_API_KEY=ls-...
LANGCHAIN_PROJECT=analytics-engine
```

## Common Issues

### Python Backend Not Starting
- Check Python version (3.8+)
- Install dependencies: `npm run python:install`
- Check port 8000 is available

### Schema Not Loading
- Check data source is configured
- Check connection string is valid
- Try `forceRefresh=true` parameter
- Check Python backend is running

### Queries Failing
- Check query syntax
- Verify column names exist in metadata
- Check data source connection
- Review error logs

### Visualizations Not Rendering
- Check query returns data
- Verify visualization type is supported
- Check data format matches chart requirements
- Review browser console for errors

## Environment Setup

### Required
- Node.js 18+
- Python 3.8+
- MySQL database
- npm/yarn

### Optional
- Redis (for caching)
- LangSmith account (for tracing)

### Install Dependencies
```powershell
# Node.js dependencies
npm install

# Python dependencies
npm run python:install

# Generate Prisma client
npm run prisma:generate

# Run migrations
npm run prisma:migrate
```

