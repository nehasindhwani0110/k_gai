# Python Backend Setup Guide

## 🎯 Overview

The Python backend uses **SQLAlchemy** to introspect MySQL database schemas. This is called automatically when a school logs in and accesses analytics.

## 🚀 Quick Start

### Option 1: Using PowerShell Script (Recommended)

```powershell
cd scripts
.\start_python_backend.ps1
```

### Option 2: Manual Setup

```powershell
# Navigate to Python backend
cd analytics-engine\python-backend

# Create virtual environment (first time only)
python -m venv venv

# Activate virtual environment
.\venv\Scripts\Activate.ps1

# Install dependencies
pip install -r requirements.txt

# Start server
python api_server.py
```

## 📋 Prerequisites

1. **Python 3.9+** installed
2. **MySQL** database accessible (for schema introspection)
3. **Dependencies** installed (via `pip install -r requirements.txt`)

## 🔧 What It Does

The Python API server exposes:

### 1. Health Check
```
GET http://localhost:8000/health
Response: { "status": "ok", "service": "schema-introspection" }
```

### 2. Schema Introspection
```
POST http://localhost:8000/introspect
Body: {
  "connection_string": "mysql://root:neha@2004@localhost:3306/gai"
}
Response: {
  "source_type": "SQL_DB",
  "tables": [
    {
      "name": "comprehensive_student_data",
      "columns": [
        { "name": "id", "type": "INTEGER" },
        { "name": "full_name", "type": "VARCHAR" },
        ...
      ]
    }
  ]
}
```

## 🔄 Integration Flow

```
1. School logs in
   ↓
2. School accesses /analytics page
   ↓
3. Frontend calls: GET /api/analytics/data-sources/[id]/schema
   ↓
4. Node.js API checks if mappings exist
   ↓
5. If no mappings, calls Python backend:
   POST http://localhost:8000/introspect
   Body: { "connection_string": "mysql://..." }
   ↓
6. Python uses SQLAlchemy to introspect MySQL
   ↓
7. Returns schema metadata
   ↓
8. Node.js auto-registers canonical mappings
   ↓
9. Returns canonical schema to frontend
```

## 🛠️ Troubleshooting

### Python Backend Not Starting

**Error**: `python: command not found`

**Solution**:
- Install Python from https://www.python.org/downloads/
- Add Python to PATH during installation
- Restart terminal

### Dependencies Not Installing

**Error**: `pip install` fails

**Solution**:
```powershell
python -m pip install --upgrade pip
pip install -r requirements.txt
```

### Port 8000 Already in Use

**Error**: `Address already in use`

**Solution**:
- Change port in `api_server.py`: `port = int(os.environ.get('PORT', 8001))`
- Or stop the process using port 8000

### MySQL Connection Failed

**Error**: `Can't connect to MySQL server`

**Solution**:
- Verify MySQL is running: `mysql --version`
- Check connection string format: `mysql://user:password@host:port/database`
- Test connection manually:
  ```powershell
  mysql -h localhost -u root -pneha@2004 -D gai
  ```

### Schema Not Detecting

**Error**: `Schema introspection failed`

**Solution**:
1. Check Python backend is running: `http://localhost:8000/health`
2. Check connection string is correct
3. Verify database exists and is accessible
4. Check Python backend logs for errors

## 📝 Environment Variables

You can set these environment variables:

```powershell
# Change Python backend port
$env:PORT=8001

# Change Python backend URL (in Node.js)
$env:PYTHON_BACKEND_URL="http://localhost:8001"
```

## ✅ Verification

### Test Python Backend

```powershell
# Health check
curl http://localhost:8000/health

# Schema introspection
curl -X POST http://localhost:8000/introspect `
  -H "Content-Type: application/json" `
  -d '{"connection_string": "mysql://root:neha@2004@localhost:3306/gai"}'
```

### Test from Node.js

```typescript
// In browser console after login
fetch('/api/analytics/data-sources/[dataSourceId]/schema')
  .then(r => r.json())
  .then(console.log)
```

## 🎯 Next Steps

1. **Start Python Backend**: Run `.\start_python_backend.ps1`
2. **Start Node.js Server**: Run `npm run dev`
3. **Login**: Use `schoola@gmail.com` / `neha`
4. **Access Analytics**: Schema should auto-detect!

---

**Python backend is ready!** 🚀

