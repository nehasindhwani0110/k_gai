# System Tables & Canonical Mapping - Implementation Guide

## ✅ **YES, System Tables Are Now Implemented!**

Since you have **both file-based AND SQL database systems**, I've implemented the complete system tables concept for multi-tenant SQL database support.

## 🏗️ What's Been Implemented

### 1. **Database Schema (Prisma)**

Three new system tables:

#### **DataSource Table**
- Stores information about each data source (SQL database or file)
- Fields: `id`, `name`, `sourceType`, `connectionString`, `isActive`
- Example: "School A", "Company B", "Tenant 1"

#### **SchemaRegistry Table**
- Stores the mapping between source tables/columns and canonical names
- Fields: `tableName`, `columnName`, `canonicalTableName`, `canonicalColumnName`, `dataType`
- Example: `tbl_students.stu_id` → `students.student_id`

#### **SchemaMapping Table**
- Stores transformation rules for query translation
- Fields: `sourceTable`, `sourceColumn`, `canonicalTable`, `canonicalColumn`, `transformationRule`
- Example: Maps `UPPER(name)` transformations

### 2. **Canonical Mapping Service**

**File**: `analytics-engine/services/canonical-mapping-service.ts`

**Functions**:
- `registerDataSource()` - Register a new SQL database or file source
- `registerSchemaMappings()` - Map source schema to canonical schema
- `translateCanonicalQuery()` - Translate canonical queries to source-specific queries
- `getCanonicalSchema()` - Get metadata using canonical names
- `getSourceMetadata()` - Get metadata using source-specific names
- `autoRegisterSchemaFromIntrospection()` - Auto-map schema when connecting to SQL database

### 3. **API Endpoints**

#### **Data Sources Management**
- `GET /api/analytics/data-sources` - List all data sources
- `GET /api/analytics/data-sources?id=<id>` - Get specific data source
- `POST /api/analytics/data-sources` - Register new data source

#### **Schema Management**
- `GET /api/analytics/data-sources/[id]/schema` - Get canonical schema
- `GET /api/analytics/data-sources/[id]/schema?type=source` - Get source schema
- `POST /api/analytics/data-sources/[id]/schema` - Register schema mappings

#### **Query Translation**
- `POST /api/analytics/data-sources/[id]/translate` - Translate canonical query

### 4. **Query Execution Integration**

Updated `executeSQLQuery()` to support canonical query translation:
- If `dataSourceId` is provided, automatically translates canonical queries
- Example: `SELECT student_id FROM students` → `SELECT stu_id FROM tbl_students`

## 📊 How It Works

### Scenario: Multiple Schools with Different Schemas

**School A Database:**
- Table: `tbl_students`
- Columns: `stu_id`, `stu_name`, `cgpa`

**School B Database:**
- Table: `students`
- Columns: `student_id`, `full_name`, `grade_point_average`

### Step 1: Register Data Sources

```typescript
// Register School A
POST /api/analytics/data-sources
{
  "name": "School A",
  "sourceType": "SQL_DB",
  "connectionString": "postgresql://...",
  "autoRegisterSchema": true  // Auto-introspect and map
}

// Register School B
POST /api/analytics/data-sources
{
  "name": "School B",
  "sourceType": "SQL_DB",
  "connectionString": "mysql://...",
  "autoRegisterSchema": true
}
```

### Step 2: Schema Mapping (Auto or Manual)

**Auto-mapping** (when `autoRegisterSchema: true`):
- System introspects database using SQLAlchemy
- Automatically normalizes names:
  - `tbl_students` → `students`
  - `stu_id` → `student_id`
  - `stu_name` → `student_name`

**Manual mapping** (if needed):
```typescript
POST /api/analytics/data-sources/[id]/schema
{
  "mappings": [
    {
      "sourceTable": "tbl_students",
      "sourceColumn": "stu_id",
      "canonicalTable": "students",
      "canonicalColumn": "student_id",
      "dataType": "INTEGER"
    },
    {
      "sourceTable": "tbl_students",
      "sourceColumn": "stu_name",
      "canonicalTable": "students",
      "canonicalColumn": "student_name",
      "dataType": "VARCHAR"
    }
  ]
}
```

### Step 3: Query Using Canonical Names

**User asks**: "Show me top 10 students by CGPA"

**LLM generates canonical query**:
```sql
SELECT student_name, cgpa 
FROM students 
ORDER BY cgpa DESC 
LIMIT 10
```

### Step 4: Automatic Translation

**For School A**:
```sql
SELECT stu_name, cgpa 
FROM tbl_students 
ORDER BY cgpa DESC 
LIMIT 10
```

**For School B**:
```sql
SELECT full_name, grade_point_average 
FROM students 
ORDER BY grade_point_average DESC 
LIMIT 10
```

## 🔧 Setup Instructions

### 1. Update Database Schema

```powershell
# Generate Prisma Client with new models
npx prisma generate

# Create migration
npx prisma migrate dev --name add_system_tables
```

### 2. Register Your SQL Databases

```typescript
// Example: Register a PostgreSQL database
const response = await fetch('/api/analytics/data-sources', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    name: 'School A Database',
    sourceType: 'SQL_DB',
    connectionString: 'postgresql://user:password@localhost:5432/school_a',
    autoRegisterSchema: true, // Auto-introspect and map
  }),
});
```

### 3. Use Canonical Queries

When executing queries, include `dataSourceId` and `is_canonical_query: true`:

```typescript
POST /api/analytics/execute
{
  "query_type": "SQL_QUERY",
  "query_content": "SELECT student_id, student_name FROM students",
  "source_type": "SQL_DB",
  "connection_string": "...",
  "data_source_id": "clx123...",
  "is_canonical_query": true  // Enable translation
}
```

## 📝 Example: Complete Workflow

### 1. Connect to School A Database

```typescript
POST /api/analytics/data-sources
{
  "name": "School A",
  "sourceType": "SQL_DB",
  "connectionString": "postgresql://...",
  "autoRegisterSchema": true
}

// Response: { dataSource: { id: "clx123..." } }
```

### 2. Get Canonical Schema

```typescript
GET /api/analytics/data-sources/clx123.../schema

// Response:
{
  "source_type": "CANONICAL_DB",
  "tables": [
    {
      "name": "students",
      "columns": [
        { "name": "student_id", "type": "INTEGER" },
        { "name": "student_name", "type": "VARCHAR" },
        { "name": "cgpa", "type": "DECIMAL" }
      ]
    }
  ]
}
```

### 3. Generate Query Using Canonical Names

```typescript
POST /api/analytics
{
  "mode": "ADHOC_QUERY",
  "metadata": {
    "source_type": "CANONICAL_DB",
    "tables": [...]
  },
  "user_question": "Show top 10 students by CGPA"
}

// LLM generates: SELECT student_name, cgpa FROM students ORDER BY cgpa DESC LIMIT 10
```

### 4. Execute with Translation

```typescript
POST /api/analytics/execute
{
  "query_type": "SQL_QUERY",
  "query_content": "SELECT student_name, cgpa FROM students ORDER BY cgpa DESC LIMIT 10",
  "source_type": "SQL_DB",
  "connection_string": "postgresql://...",
  "data_source_id": "clx123...",
  "is_canonical_query": true
}

// System automatically translates to:
// SELECT stu_name, cgpa FROM tbl_students ORDER BY cgpa DESC LIMIT 10
```

## 🎯 Benefits

1. **Unified Queries**: Write queries once using canonical names, works for all schools
2. **Schema Abstraction**: Don't worry about different table/column names
3. **Multi-tenant Support**: Handle multiple SQL databases seamlessly
4. **Auto-mapping**: Automatically normalize schema names
5. **Manual Override**: Can manually adjust mappings if needed

## 🔍 Key Features

### Auto-Normalization Rules

The system automatically normalizes names:
- Removes prefixes: `tbl_`, `tb_`, `table_`, `t_`
- Converts camelCase to snake_case: `StudentName` → `student_name`
- Expands abbreviations: `stu` → `student`, `id` → `id`

### Transformation Rules

Support for data transformations:
- `UPPER` - Convert to uppercase
- `LOWER` - Convert to lowercase
- Custom: `DATE_FORMAT({column}, '%Y-%m-%d')`

### Query Translation

Intelligent query translation:
- Replaces table names in FROM/JOIN clauses
- Replaces column names in SELECT/WHERE/GROUP BY/ORDER BY
- Applies transformation rules when specified
- Preserves SQL structure and logic

## 📚 API Reference

### Register Data Source
```typescript
POST /api/analytics/data-sources
Body: {
  name: string;
  sourceType: 'SQL_DB' | 'CSV_FILE';
  connectionString?: string;
  description?: string;
  autoRegisterSchema?: boolean; // For SQL_DB
}
```

### Get Canonical Schema
```typescript
GET /api/analytics/data-sources/[id]/schema
// Returns canonical schema (standardized names)
```

### Get Source Schema
```typescript
GET /api/analytics/data-sources/[id]/schema?type=source
// Returns source schema (actual database names)
```

### Translate Query
```typescript
POST /api/analytics/data-sources/[id]/translate
Body: {
  canonicalQuery: string;
}
// Returns: { canonicalQuery, translatedQuery }
```

## ✅ Summary

**System Tables**: ✅ **FULLY IMPLEMENTED**
- DataSource table for managing multiple databases
- SchemaRegistry for storing schema metadata
- SchemaMapping for canonical mapping

**Canonical Mapping**: ✅ **FULLY IMPLEMENTED**
- Auto-normalization of schema names
- Query translation from canonical to source-specific
- Support for transformation rules

**Multi-tenant SQL Support**: ✅ **READY**
- Register multiple SQL databases
- Use canonical queries across all databases
- Automatic query translation

Now your system supports **both file-based AND multi-tenant SQL database analytics** with canonical mapping! 🎉

