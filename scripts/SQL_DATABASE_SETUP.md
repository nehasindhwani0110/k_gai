# SQL Database Setup Guide

## 📋 Overview

This guide explains how to set up the MySQL database (`gai`) with student data tables for testing the analytics engine with SQL database connections.

## 🎯 Database Details

- **Database Name**: `gai`
- **Host**: `localhost`
- **Username**: `root`
- **Password**: `neha@2004`
- **Port**: `3306` (default MySQL port)

## 📁 Files Included

1. **`create_student_tables.sql`** - Creates the database and table structure
2. **`insert_student_data.sql`** - Inserts sample student data (40+ records)
3. **`setup_mysql_database.ps1`** - PowerShell script to automate setup

## 🚀 Quick Setup (PowerShell)

### Prerequisites

1. **MySQL Server** must be installed and running
   - Download from: https://dev.mysql.com/downloads/mysql/
   - Make sure MySQL is in your PATH

2. **Verify MySQL Installation**:
   ```powershell
   mysql --version
   ```

### Run Setup Script

```powershell
# Navigate to scripts folder
cd scripts

# Run the setup script
.\setup_mysql_database.ps1
```

The script will:
1. ✅ Create the `gai` database
2. ✅ Create the `comprehensive_student_data` table
3. ✅ Insert sample data (40+ records)
4. ✅ Verify the setup

## 🔧 Manual Setup

If you prefer to run SQL scripts manually:

### Step 1: Create Database and Tables

```powershell
mysql -h localhost -u root -pneha@2004 < create_student_tables.sql
```

### Step 2: Insert Sample Data

```powershell
mysql -h localhost -u root -pneha@2004 < insert_student_data.sql
```

### Step 3: Verify Setup

```powershell
mysql -h localhost -u root -pneha@2004 -D gai -e "SELECT COUNT(*) FROM comprehensive_student_data;"
```

## 📊 Table Structure

### `comprehensive_student_data` Table

| Column | Type | Description |
|--------|------|-------------|
| `id` | INT AUTO_INCREMENT PRIMARY KEY | Unique identifier |
| `full_name` | VARCHAR(255) | Student full name |
| `cgpa` | DECIMAL(4,2) | Cumulative Grade Point Average (0.00-10.00) |
| `academic_stream` | VARCHAR(100) | Science, Commerce, Arts |
| `enrollment_year` | INT | Year of enrollment |
| `graduation_year` | INT NULL | Year of graduation |
| `state` | VARCHAR(100) | State/Province |
| `city` | VARCHAR(100) | City |
| `email` | VARCHAR(255) | Student email |
| `phone` | VARCHAR(20) | Contact number |
| `date_of_birth` | DATE | Date of birth |
| `gender` | VARCHAR(20) | Gender |
| `admission_type` | VARCHAR(50) | Regular, Merit, Scholarship |
| `placement_status` | VARCHAR(50) | Placed, Not Placed, Pending |
| `placement_salary` | DECIMAL(10,2) | Salary if placed |
| `company_name` | VARCHAR(255) | Company name if placed |
| `attendance_percentage` | DECIMAL(5,2) | Overall attendance |
| `problem_solving_score` | DECIMAL(5,2) | Problem solving score |
| `communication_score` | DECIMAL(5,2) | Communication score |
| `leadership_score` | DECIMAL(5,2) | Leadership score |
| `project_count` | INT | Number of projects |
| `internship_completed` | BOOLEAN | Internship status |
| `scholarship_received` | BOOLEAN | Scholarship status |
| `record_created_date` | DATE | Record creation date |
| `record_updated_date` | TIMESTAMP | Last update timestamp |

### Indexes

The table includes indexes on:
- `cgpa`
- `academic_stream`
- `state`
- `enrollment_year`
- `placement_status`
- `record_created_date`
- `full_name`

## 🔗 Connection String Format

For use in your application:

```
mysql://root:neha@2004@localhost:3306/gai
```

Or in connection string format:
```
mysql://username:password@host:port/database
```

## 🧪 Testing Queries

After setup, you can test with these queries:

### Count Records
```sql
SELECT COUNT(*) FROM comprehensive_student_data;
```

### Average CGPA by Stream
```sql
SELECT academic_stream, AVG(cgpa) as avg_cgpa 
FROM comprehensive_student_data 
GROUP BY academic_stream;
```

### Records by Date
```sql
SELECT DATE(record_created_date) as date, COUNT(*) as count 
FROM comprehensive_student_data 
GROUP BY DATE(record_created_date) 
ORDER BY date;
```

### Top Students by CGPA
```sql
SELECT full_name, cgpa, academic_stream 
FROM comprehensive_student_data 
ORDER BY cgpa DESC 
LIMIT 10;
```

## 🔍 Schema Detection Flow

When a school logs in with credentials, the system:

1. **Connects to MySQL Database**
   - Uses connection string: `mysql://root:neha@2004@localhost:3306/gai`

2. **Introspects Schema** (via Python backend)
   - Uses SQLAlchemy's `inspect()` function
   - Queries `information_schema` tables
   - Discovers all tables and columns

3. **Auto-Maps to Canonical Names** (if enabled)
   - Normalizes table names: `comprehensive_student_data` → `students`
   - Normalizes column names: `full_name` → `student_name`
   - Stores mappings in `SchemaMapping` table

4. **Returns Metadata**
   - Returns canonical schema to frontend
   - LLM uses canonical names to generate queries

5. **Query Translation** (when executing)
   - Translates canonical queries back to source-specific queries
   - Executes on actual database

## 📝 Example: Registering Database in Application

```typescript
// POST /api/analytics/data-sources
{
  "name": "School A Database",
  "sourceType": "SQL_DB",
  "connectionString": "mysql://root:neha@2004@localhost:3306/gai",
  "autoRegisterSchema": true
}
```

## 🛠️ Troubleshooting

### MySQL Not Found
- **Error**: `mysql: command not found`
- **Solution**: Add MySQL to PATH or use full path to mysql.exe

### Access Denied
- **Error**: `Access denied for user 'root'@'localhost'`
- **Solution**: Check password is correct: `neha@2004`

### Database Already Exists
- **Error**: `Database 'gai' already exists`
- **Solution**: Drop existing database first:
  ```sql
  DROP DATABASE IF EXISTS gai;
  ```

### Table Already Exists
- **Error**: `Table 'comprehensive_student_data' already exists`
- **Solution**: The script includes `DROP TABLE IF EXISTS`, but if issues persist:
  ```sql
  DROP TABLE IF EXISTS comprehensive_student_data;
  ```

## ✅ Verification Checklist

After setup, verify:

- [ ] Database `gai` exists
- [ ] Table `comprehensive_student_data` exists
- [ ] Table has 40+ records
- [ ] Can query data successfully
- [ ] Connection string works in application

## 🎯 Next Steps

1. **Test Connection**: Use the connection string in your application
2. **Register Data Source**: POST to `/api/analytics/data-sources`
3. **Get Schema**: GET `/api/analytics/data-sources/[id]/schema`
4. **Run Queries**: Use ad-hoc query feature with SQL database

---

**Ready to test SQL database analytics!** 🚀

