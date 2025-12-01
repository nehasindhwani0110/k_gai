# Schema Detection Flow for SQL Databases

## 🎯 Overview

This document explains **how the system detects and maps database schemas** when a school logs in with their SQL database credentials.

---

## 📊 Complete Flow Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│  STEP 1: School Logs In with Credentials                        │
│  ┌──────────────────────────────────────────────────────────┐ │
│  │ POST /api/analytics/data-sources                          │ │
│  │ Body: {                                                    │ │
│  │   name: "School A",                                        │ │
│  │   sourceType: "SQL_DB",                                    │ │
│  │   connectionString: "mysql://user:pass@host:port/db",     │ │
│  │   autoRegisterSchema: true  ← KEY FLAG                    │ │
│  │ }                                                           │ │
│  └──────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────────┐
│  STEP 2: Register Data Source                                  │
│  ┌──────────────────────────────────────────────────────────┐ │
│  │ canonical-mapping-service.ts → registerDataSource()       │ │
│  │                                                             │ │
│  │ Creates DataSource record in database:                     │ │
│  │ {                                                           │ │
│  │   id: "clx123...",                                         │ │
│  │   name: "School A",                                        │ │
│  │   sourceType: "SQL_DB",                                    │ │
│  │   connectionString: "mysql://...",                        │ │
│  │   isActive: true                                           │ │
│  │ }                                                           │ │
│  └──────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────────┐
│  STEP 3: Schema Introspection (Python Backend)                 │
│  ┌──────────────────────────────────────────────────────────┐ │
│  │ IF autoRegisterSchema === true:                            │ │
│  │                                                             │ │
│  │ 1. Call Python backend:                                     │ │
│  │    schema_introspection.py → introspect_sql_schema()      │ │
│  │                                                             │ │
│  │ 2. Python uses SQLAlchemy:                                 │ │
│  │    engine = create_engine(connection_string)              │ │
│  │    inspector = inspect(engine)                            │ │
│  │                                                             │ │
│  │ 3. Query information_schema:                               │ │
│  │    - Get all table names                                   │ │
│  │    - Get all columns for each table                        │ │
│  │    - Get column data types                                 │ │
│  │                                                             │ │
│  │ 4. Returns source schema:                                  │ │
│  │    {                                                        │ │
│  │      source_type: "SQL_DB",                                │ │
│  │      tables: [                                             │ │
│  │        {                                                   │ │
│  │          name: "tbl_students",  ← Source name             │ │
│  │          columns: [                                        │ │
│  │            { name: "stu_id", type: "INTEGER" },           │ │
│  │            { name: "stu_name", type: "VARCHAR" },         │ │
│  │            { name: "cgpa", type: "DECIMAL" }              │ │
│  │          ]                                                 │ │
│  │        }                                                   │ │
│  │      ]                                                     │ │
│  │    }                                                       │ │
│  └──────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────────┐
│  STEP 4: Auto-Normalize to Canonical Names                     │
│  ┌──────────────────────────────────────────────────────────┐ │
│  │ canonical-mapping-service.ts → autoRegisterSchemaFrom...() │ │
│  │                                                             │ │
│  │ Normalization Rules:                                       │ │
│  │ 1. Remove prefixes:                                        │ │
│  │    tbl_students → students                                │ │
│  │    tb_grades → grades                                      │ │
│  │                                                             │ │
│  │ 2. Expand abbreviations:                                  │ │
│  │    stu_id → student_id                                     │ │
│  │    stu_name → student_name                                 │ │
│  │                                                             │ │
│  │ 3. Convert camelCase to snake_case:                        │ │
│  │    StudentName → student_name                              │ │
│  │                                                             │ │
│  │ Creates SchemaMapping records:                             │ │
│  │ {                                                           │ │
│  │   sourceTable: "tbl_students",                             │ │
│  │   sourceColumn: "stu_id",                                  │ │
│  │   canonicalTable: "students",                             │ │
│  │   canonicalColumn: "student_id"                            │ │
│  │ }                                                           │ │
│  └──────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────────┐
│  STEP 5: Store Mappings in Database                            │
│  ┌──────────────────────────────────────────────────────────┐ │
│  │ Prisma saves to SchemaMapping table:                       │ │
│  │                                                             │ │
│  │ SchemaMapping {                                            │ │
│  │   id: "clx456...",                                         │ │
│  │   dataSourceId: "clx123...",                               │ │
│  │   sourceTable: "tbl_students",                             │ │
│  │   sourceColumn: "stu_id",                                  │ │
│  │   canonicalTable: "students",                              │ │
│  │   canonicalColumn: "student_id",                           │ │
│  │   transformationRule: null                                 │ │
│  │ }                                                           │ │
│  │                                                             │ │
│  │ Also saves to SchemaRegistry:                              │ │
│  │ SchemaRegistry {                                           │ │
│  │   dataSourceId: "clx123...",                               │ │
│  │   tableName: "tbl_students",                               │ │
│  │   columnName: "stu_id",                                    │ │
│  │   canonicalTableName: "students",                           │ │
│  │   canonicalColumnName: "student_id",                        │ │
│  │   dataType: "INTEGER"                                       │ │
│  │ }                                                           │ │
│  └──────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────────┐
│  STEP 6: Return Canonical Schema to Frontend                   │
│  ┌──────────────────────────────────────────────────────────┐ │
│  │ GET /api/analytics/data-sources/clx123.../schema         │ │
│  │                                                             │ │
│  │ Returns canonical schema:                                   │ │
│  │ {                                                           │ │
│  │   source_type: "CANONICAL_DB",                             │ │
│  │   tables: [                                                │ │
│  │     {                                                      │ │
│  │       name: "students",  ← Canonical name                 │ │
│  │       columns: [                                          │ │
│  │         { name: "student_id", type: "INTEGER" },          │ │
│  │         { name: "student_name", type: "VARCHAR" },        │ │
│  │         { name: "cgpa", type: "DECIMAL" }                  │ │
│  │       ]                                                    │ │
│  │     }                                                      │ │
│  │   ]                                                        │ │
│  │ }                                                          │ │
│  └──────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────────┐
│  STEP 7: LLM Generates Queries Using Canonical Names           │
│  ┌──────────────────────────────────────────────────────────┐ │
│  │ User asks: "Show top 10 students by CGPA"                │ │
│  │                                                             │ │
│  │ LLM sees canonical schema:                                │ │
│  │   - Table: students                                        │ │
│  │   - Columns: student_id, student_name, cgpa                │ │
│  │                                                             │ │
│  │ LLM generates canonical query:                             │ │
│  │   SELECT student_name, cgpa                                │ │
│  │   FROM students                                            │ │
│  │   ORDER BY cgpa DESC                                       │ │
│  │   LIMIT 10                                                 │ │
│  └──────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────────┐
│  STEP 8: Translate Canonical Query to Source Query             │
│  ┌──────────────────────────────────────────────────────────┐ │
│  │ POST /api/analytics/execute                               │ │
│  │ Body: {                                                    │ │
│  │   query_content: "SELECT student_name, cgpa FROM...",      │ │
│  │   data_source_id: "clx123...",                            │ │
│  │   is_canonical_query: true  ← KEY FLAG                    │ │
│  │ }                                                           │ │
│  │                                                             │ │
│  │ canonical-mapping-service.ts → translateCanonicalQuery()   │ │
│  │                                                             │ │
│  │ Looks up mappings:                                         │ │
│  │   students → tbl_students                                 │ │
│  │   student_name → stu_name                                  │ │
│  │                                                             │ │
│  │ Translates query:                                         │ │
│  │   SELECT stu_name, cgpa                                    │ │
│  │   FROM tbl_students                                        │ │
│  │   ORDER BY cgpa DESC                                       │ │
│  │   LIMIT 10                                                 │ │
│  └──────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────────┐
│  STEP 9: Execute Query on Source Database                     │
│  ┌──────────────────────────────────────────────────────────┐ │
│  │ executeSQLQuery() executes translated query:              │ │
│  │                                                             │ │
│  │   SELECT stu_name, cgpa                                    │ │
│  │   FROM tbl_students                                        │ │
│  │   ORDER BY cgpa DESC                                       │ │
│  │   LIMIT 10                                                 │ │
│  │                                                             │ │
│  │ Returns results:                                           │ │
│  │   [                                                        │ │
│  │     { stu_name: "Rajesh", cgpa: 9.5 },                    │ │
│  │     { stu_name: "Priya", cgpa: 9.2 },                     │ │
│  │     ...                                                    │ │
│  │   ]                                                        │ │
│  └──────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────────┐
│  STEP 10: Display Results                                      │
│  ┌──────────────────────────────────────────────────────────┐ │
│  │ Frontend receives results and displays visualization      │ │
│  └──────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

---

## 🔍 Detailed Step-by-Step Explanation

### Step 1: School Provides Credentials

**API Endpoint**: `POST /api/analytics/data-sources`

**Request Body**:
```json
{
  "name": "School A",
  "sourceType": "SQL_DB",
  "connectionString": "mysql://root:neha@2004@localhost:3306/gai",
  "autoRegisterSchema": true
}
```

**Key Points**:
- `connectionString` contains all connection details (username, password, host, port, database)
- `autoRegisterSchema: true` triggers automatic schema detection and mapping

---

### Step 2: Register Data Source

**Service**: `canonical-mapping-service.ts` → `registerDataSource()`

**What Happens**:
1. Creates a `DataSource` record in the application database (SQLite)
2. Stores connection string securely
3. Returns `dataSourceId` (e.g., `"clx123..."`)

**Database Record**:
```typescript
{
  id: "clx123...",
  name: "School A",
  sourceType: "SQL_DB",
  connectionString: "mysql://root:neha@2004@localhost:3306/gai",
  isActive: true,
  createdAt: "2024-01-15T10:00:00Z"
}
```

---

### Step 3: Schema Introspection

**Service**: Python backend → `schema_introspection.py` → `introspect_sql_schema()`

**What Happens**:
1. **Connects to MySQL** using SQLAlchemy:
   ```python
   engine = create_engine("mysql://root:neha@2004@localhost:3306/gai")
   inspector = inspect(engine)
   ```

2. **Queries `information_schema`** (MySQL system tables):
   ```sql
   SELECT TABLE_NAME FROM information_schema.TABLES 
   WHERE TABLE_SCHEMA = 'gai';
   ```
   Returns: `['comprehensive_student_data']`

3. **Gets column information**:
   ```sql
   SELECT COLUMN_NAME, DATA_TYPE, COLUMN_TYPE 
   FROM information_schema.COLUMNS 
   WHERE TABLE_SCHEMA = 'gai' AND TABLE_NAME = 'comprehensive_student_data';
   ```
   Returns: Column details (name, type, etc.)

4. **Returns Source Schema**:
   ```json
   {
     "source_type": "SQL_DB",
     "tables": [
       {
         "name": "comprehensive_student_data",
         "columns": [
           { "name": "id", "type": "INTEGER" },
           { "name": "full_name", "type": "VARCHAR" },
           { "name": "cgpa", "type": "DECIMAL" },
           ...
         ]
       }
     ]
   }
   ```

---

### Step 4: Auto-Normalize to Canonical Names

**Service**: `canonical-mapping-service.ts` → `autoRegisterSchemaFromIntrospection()`

**Normalization Rules**:

1. **Remove Table Prefixes**:
   - `tbl_students` → `students`
   - `tb_grades` → `grades`
   - `table_comprehensive_student_data` → `comprehensive_student_data`

2. **Expand Column Abbreviations**:
   - `stu_id` → `student_id`
   - `stu_name` → `student_name`
   - `full_name` → `full_name` (no change if already normalized)

3. **Convert camelCase to snake_case**:
   - `StudentName` → `student_name`
   - `CGPA` → `cgpa`

4. **Create Mappings**:
   ```typescript
   [
     {
       sourceTable: "comprehensive_student_data",
       sourceColumn: "id",
       canonicalTable: "students",  // Normalized
       canonicalColumn: "student_id"  // Normalized
     },
     {
       sourceTable: "comprehensive_student_data",
       sourceColumn: "full_name",
       canonicalTable: "students",
       canonicalColumn: "full_name"  // No change
     },
     ...
   ]
   ```

---

### Step 5: Store Mappings in Database

**Tables**: `SchemaMapping` and `SchemaRegistry` (in SQLite application database)

**SchemaMapping Records**:
```sql
INSERT INTO SchemaMapping (
  dataSourceId, sourceTable, sourceColumn, 
  canonicalTable, canonicalColumn
) VALUES
('clx123...', 'comprehensive_student_data', 'id', 'students', 'student_id'),
('clx123...', 'comprehensive_student_data', 'full_name', 'students', 'full_name'),
('clx123...', 'comprehensive_student_data', 'cgpa', 'students', 'cgpa'),
...
```

**SchemaRegistry Records**:
```sql
INSERT INTO SchemaRegistry (
  dataSourceId, tableName, columnName, 
  canonicalTableName, canonicalColumnName, dataType
) VALUES
('clx123...', 'comprehensive_student_data', 'id', 'students', 'student_id', 'INTEGER'),
('clx123...', 'comprehensive_student_data', 'full_name', 'students', 'full_name', 'VARCHAR'),
...
```

---

### Step 6: Return Canonical Schema

**API Endpoint**: `GET /api/analytics/data-sources/clx123.../schema`

**Response**:
```json
{
  "source_type": "CANONICAL_DB",
  "tables": [
    {
      "name": "students",  // Canonical name
      "columns": [
        { "name": "student_id", "type": "INTEGER" },
        { "name": "full_name", "type": "VARCHAR" },
        { "name": "cgpa", "type": "DECIMAL" },
        ...
      ]
    }
  ]
}
```

**Key Point**: Frontend receives **canonical names**, not source-specific names.

---

### Step 7: LLM Generates Queries

**User Question**: "Show top 10 students by CGPA"

**LLM Sees Canonical Schema**:
- Table: `students`
- Columns: `student_id`, `full_name`, `cgpa`, ...

**LLM Generates Canonical Query**:
```sql
SELECT full_name, cgpa 
FROM students 
ORDER BY cgpa DESC 
LIMIT 10
```

**Key Point**: LLM uses **canonical names** because that's what it sees in the metadata.

---

### Step 8: Translate Canonical Query

**API Endpoint**: `POST /api/analytics/execute`

**Request Body**:
```json
{
  "query_type": "SQL_QUERY",
  "query_content": "SELECT full_name, cgpa FROM students ORDER BY cgpa DESC LIMIT 10",
  "source_type": "SQL_DB",
  "connection_string": "mysql://root:neha@2004@localhost:3306/gai",
  "data_source_id": "clx123...",
  "is_canonical_query": true  // ← Triggers translation
}
```

**Translation Process**:
1. **Parse Query**: Extract table and column names
2. **Look Up Mappings**: 
   - `students` → `comprehensive_student_data`
   - `full_name` → `full_name` (no change)
   - `cgpa` → `cgpa` (no change)
3. **Replace Names**:
   ```sql
   SELECT full_name, cgpa 
   FROM comprehensive_student_data  -- Translated
   ORDER BY cgpa DESC 
   LIMIT 10
   ```

---

### Step 9: Execute Query

**Service**: `executeSQLQuery()`

**Executes Translated Query**:
```sql
SELECT full_name, cgpa 
FROM comprehensive_student_data 
ORDER BY cgpa DESC 
LIMIT 10
```

**Returns Results**:
```json
[
  { "full_name": "Swati Iyer", "cgpa": 9.10 },
  { "full_name": "Divya Iyer", "cgpa": 9.15 },
  { "full_name": "Priya Sharma", "cgpa": 9.20 },
  ...
]
```

---

### Step 10: Display Results

Frontend receives results and displays them in a visualization (bar chart, table, etc.).

---

## 🔑 Key Concepts

### 1. **Source Schema** vs **Canonical Schema**

- **Source Schema**: Actual table/column names in the school's database
  - Example: `comprehensive_student_data`, `full_name`, `cgpa`

- **Canonical Schema**: Normalized, standardized names
  - Example: `students`, `full_name`, `cgpa`

### 2. **Why Canonical Mapping?**

- **Multi-Tenant Support**: Different schools have different schemas
- **Unified Queries**: Write queries once using canonical names
- **Schema Abstraction**: Don't worry about different naming conventions

### 3. **Auto-Registration**

When `autoRegisterSchema: true`:
- Automatically introspects database
- Automatically normalizes names
- Automatically creates mappings
- No manual configuration needed!

### 4. **Query Translation**

When `is_canonical_query: true`:
- System automatically translates canonical queries to source queries
- Transparent to the user
- Works seamlessly!

---

## 📝 Example: Complete Workflow

### School A Database:
- Table: `tbl_students`
- Columns: `stu_id`, `stu_name`, `cgpa`

### School B Database:
- Table: `students`
- Columns: `student_id`, `full_name`, `grade_point_average`

### Both Schools Use Same Canonical Query:
```sql
SELECT student_name, cgpa 
FROM students 
ORDER BY cgpa DESC 
LIMIT 10
```

### System Automatically Translates:

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

---

## ✅ Summary

1. **School logs in** → Provides connection string
2. **System introspects** → Discovers actual schema
3. **System normalizes** → Creates canonical mappings
4. **System stores mappings** → Saves to database
5. **LLM uses canonical** → Generates queries with canonical names
6. **System translates** → Converts to source-specific queries
7. **System executes** → Runs on actual database
8. **Results displayed** → User sees visualization

**The entire process is automatic and transparent!** 🚀

