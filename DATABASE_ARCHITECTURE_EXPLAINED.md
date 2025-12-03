# Database Architecture Explained

## 🎯 Two Different Databases

Your application uses **TWO separate databases** for different purposes:

### 1. **Prisma Application Database** (`ai-analytics` on localhost)
**Purpose**: Stores APPLICATION metadata and configuration

**What it stores:**
- ✅ Data source registrations (info about your Railway database)
- ✅ Query history (all queries you've run)
- ✅ Schema mappings (how tables/columns map to canonical names)
- ✅ Dashboard metrics
- ✅ File metadata (if you upload CSV/JSON files)

**Think of it as**: A "catalog" or "registry" that remembers information ABOUT your data sources

---

### 2. **Your Data Source Database** (Railway: `shortline.proxy.rlwy.net:15695/railway`)
**Purpose**: Stores YOUR actual business data

**What it stores:**
- ✅ Your actual tables (FeeStructure, Student, etc.)
- ✅ Your actual data (rows, records)
- ✅ Your business logic

**Think of it as**: Your actual database with real data

---

## 🔄 How It Works

```
┌─────────────────────────────────────────────────────────┐
│  You Register Railway Database in UI                    │
│  (shortline.proxy.rlwy.net:15695/railway)              │
└────────────────────┬──────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│  Application saves registration info to:                │
│  Prisma Database (ai-analytics)                        │
│  - Name: "Production"                                   │
│  - Connection String: "mysql://..."                     │
│  - Type: SQL_DB                                        │
└────────────────────┬──────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│  Application uses saved connection to query:            │
│  Your Railway Database                                  │
│  - Reads FeeStructure table                            │
│  - Executes queries                                     │
│  - Returns YOUR actual data                            │
└─────────────────────────────────────────────────────────┘
```

---

## ❌ Current Error

**Error**: `Database 'ai-analytics' does not exist`

**Why**: When you try to register your Railway database, the application needs to save that registration to its own database (`ai-analytics`), but that database doesn't exist yet.

**Solution**: Create the `ai-analytics` database on your local MySQL server.

---

## ✅ Quick Fix

### Option 1: Using MySQL Command Line
```powershell
# Connect to MySQL
mysql -u root -p

# Create the database
CREATE DATABASE IF NOT EXISTS `ai-analytics`;

# Exit
exit
```

### Option 2: Using MySQL Workbench
1. Connect to MySQL server
2. Run: `CREATE DATABASE IF NOT EXISTS \`ai-analytics\`;`

### Option 3: Using PowerShell Script
```powershell
.\create-prisma-database.ps1
```

---

## 🚀 After Creating Database

Run Prisma migrations to create all tables:

```powershell
npx prisma migrate dev --name init
```

This creates tables like:
- `DataSource` (stores your Railway database info)
- `QueryHistory` (stores query logs)
- `SchemaMapping` (stores schema mappings)
- etc.

---

## 📊 Summary

| Database | Location | Purpose | Contains |
|----------|----------|---------|----------|
| **Prisma DB** | `localhost:3306/ai-analytics` | Application metadata | Data source registrations, query history, mappings |
| **Your Data Source** | `shortline.proxy.rlwy.net:15695/railway` | Your business data | FeeStructure, Student, etc. |

**They are completely separate!** The Prisma database just remembers information about your Railway database, but doesn't store your actual data.

