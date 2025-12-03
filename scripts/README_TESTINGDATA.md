# Create Testing Database Script

This script creates a MySQL database named `testingdata` with 100 tables, each containing 30+ columns with diverse data types and sample data.

## Prerequisites

1. **MySQL Server** must be installed and running
2. **Python 3.7+** must be installed
3. **mysql-connector-python** package

## Installation

Install the required Python package:

```powershell
pip install mysql-connector-python
```

Or if you're using a virtual environment:

```powershell
python -m venv venv
.\venv\Scripts\Activate.ps1
pip install mysql-connector-python
```

## Usage

### Basic Usage (Default Configuration)

```powershell
python scripts/create_testingdata_db.py
```

This will:
- Connect to `localhost:3306` as `root` user
- Use password `neha@2004`
- Create database `testingdata`
- Create 100 tables with 30-45 columns each
- Populate each table with 1000 sample rows

### Custom Configuration

```powershell
python scripts/create_testingdata_db.py --host localhost --port 3306 --user root --password "neha@2004" --database testingdata
```

### Options

- `--host`: MySQL host (default: `localhost`)
- `--port`: MySQL port (default: `3306`)
- `--user`: MySQL username (default: `root`)
- `--password`: MySQL password (default: `neha@2004`)
- `--database`: Database name (default: `testingdata`)
- `--skip-data`: Skip populating tables with sample data (only creates empty tables)
- `--rows-per-table`: Number of rows to insert per table (default: `1000`)

### Examples

**Create database without sample data (faster):**
```powershell
python scripts/create_testingdata_db.py --skip-data
```

**Create database with 500 rows per table:**
```powershell
python scripts/create_testingdata_db.py --rows-per-table 500
```

**Create database with custom connection:**
```powershell
python scripts/create_testingdata_db.py --host 192.168.1.100 --port 3306 --user admin --password "mypassword" --database testdb
```

## Database Structure

- **100 tables** with realistic names (e.g., `student_info_001`, `employee_data_002`, etc.)
- **30-45 columns per table** with diverse data types:
  - INTEGER, BIGINT
  - DECIMAL, FLOAT, DOUBLE
  - VARCHAR, TEXT, CHAR
  - DATE, DATETIME, TIMESTAMP, TIME, YEAR
  - BOOLEAN
- **Indexes** on frequently queried columns
- **Sample data** in each table (configurable)

## Connection String

After creation, use this connection string in your application:

```
mysql://root:neha%402004@localhost:3306/testingdata
```

Note: The `@` in the password is URL-encoded as `%40`.

## Verification

After running the script, verify the database:

```sql
-- Connect to MySQL
mysql -u root -p

-- Use the database
USE testingdata;

-- Count tables
SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'testingdata';

-- View table list
SHOW TABLES;

-- Check columns in a table
DESCRIBE student_info_001;

-- Count rows in a table
SELECT COUNT(*) FROM student_info_001;
```

## Testing with Analytics Engine

Once the database is created, you can test it with your analytics engine:

### Quick Test

Run a quick test to verify everything works:

```powershell
python scripts/quick_test_db.py
```

This will test:
- Server connection
- Schema retrieval
- Query generation
- Query execution

### Full Test Suite

Run comprehensive tests:

```powershell
python scripts/test_testingdata_db.py
```

This will test multiple query types:
- Simple SELECT queries
- Aggregations
- GROUP BY queries
- ORDER BY queries
- WHERE clauses
- Time-based queries

### Manual Testing

1. **Add as Data Source** in your application:
   - Host: `localhost`
   - Port: `3306`
   - Username: `root`
   - Password: `neha@2004`
   - Database: `testingdata`

2. **Test Queries**:
   - "Show me top 10 records from any table"
   - "What is the average value of numeric columns?"
   - "Count records grouped by category"
   - "Show records ordered by date"
   - "Compare values across different groups"

## Troubleshooting

### Connection Error
```
Error: Can't connect to MySQL server
```
**Solution**: Make sure MySQL is running and credentials are correct.

### Permission Error
```
Error: Access denied for user
```
**Solution**: Check username and password, ensure user has CREATE DATABASE permission.

### Database Already Exists
The script uses `CREATE DATABASE IF NOT EXISTS`, so it won't fail if the database exists. However, if you want to recreate it:

```sql
DROP DATABASE IF EXISTS testingdata;
```

Then run the script again.

### Out of Memory
If you get memory errors with large datasets:
- Use `--skip-data` to create tables without data
- Reduce `--rows-per-table` to a smaller number (e.g., 100)

## Performance Notes

- Creating 100 tables: ~30-60 seconds
- Populating with 1000 rows per table: ~5-10 minutes
- Total database size: ~500MB - 1GB (depending on data)

For faster testing, use `--skip-data` to create empty tables quickly.

