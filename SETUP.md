# Setup Guide

## Environment Variables

Create a `.env.local` file in the root directory with the following variables:

```env
# OpenAI API Configuration
OPENAI_API_KEY=your_openai_api_key_here
OPENAI_MODEL=gpt-4-turbo-preview

# Database Connection (optional, for SQL_DB source type)
NEXT_PUBLIC_DB_CONNECTION_STRING=postgresql://user:password@localhost:5432/dbname

# Alternative database formats:
# MySQL: mysql://user:password@localhost:3306/dbname
# SQLite: sqlite:///path/to/database.db
```

## Installation Steps

### 1. Install Node.js Dependencies

```powershell
npm install
```

### 2. Install Python Dependencies (for backend services)

```powershell
cd analytics-engine/python-backend
pip install -r requirements.txt
```

### 3. Start Development Server

```powershell
npm run dev
```

The application will be available at `http://localhost:3000`

## Usage

1. Navigate to `/analytics` to access the analytics dashboard
2. Use the **Dashboard Metrics** tab to see automatically generated metrics
3. Use the **Adhoc Query** tab to ask natural language questions

## API Integration

The analytics engine can be integrated via API endpoints:

- `POST /api/analytics` - Generate queries or dashboard metrics
- `POST /api/analytics/execute` - Execute generated queries
- `POST /api/analytics/schema` - Introspect database schemas

## Notes

- The Python backend services (`schema_introspection.py`, `csv_processor.py`, `query_executor.py`) are designed to be called from a Python microservice or integrated via API calls
- For production, consider setting up a Python FastAPI service to handle database operations
- CSV file processing uses DuckDB for efficient querying

