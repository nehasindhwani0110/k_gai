
# AI Analytics Database Setup Guide

## Overview

The `ai-analytics` database is a **metadata database** that stores application-level information for the analytics system. It is **separate** from your actual business data sources.

## Purpose

This database stores:
- ✅ **Data source registrations** - Information about your Railway/other databases
- ✅ **Query history** - All queries you've run through the analytics system
- ✅ **Schema mappings** - Canonical mappings for multi-tenant support
- ✅ **File metadata** - Information about uploaded CSV/JSON/Excel files
- ✅ **Dashboard metrics** - Auto-generated metrics and visualizations
- ✅ **Schema registry** - Table and column mappings
- ✅ **Embedding cache** - Schema embeddings for semantic search

## Database Configuration

- **Database Name**: `ai-analytics`
- **Host**: `localhost`
- **Port**: `3306`
- **Username**: `root`
- **Password**: `neha@2004`
- **Connection String**: `mysql://root:neha%402004@localhost:3306/ai-analytics`

## Quick Setup

### Option 1: Using SQL File (Recommended)

```powershell
# Navigate to k_gai directory
cd k_gai

# Create database
Get-Content scripts/create_ai_analytics.sql | mysql -h localhost -u root -pneha@2004

# Run Prisma migrations
npx prisma migrate dev --name init

# Generate Prisma client
npx prisma generate
```

### Option 2: Manual MySQL Command

```powershell
# Connect to MySQL
mysql -u root -p
# Enter password: neha@2004

# Create database
CREATE DATABASE IF NOT EXISTS `ai-analytics` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

# Exit MySQL
exit

# Run Prisma migrations
cd k_gai
npx prisma migrate dev --name init
npx prisma generate
```

### Option 3: Using PowerShell Script

```powershell
cd k_gai/scripts
powershell -ExecutionPolicy Bypass -File setup_ai_analytics_db.ps1
```

## Environment Configuration

Ensure your `.env` file contains:

```env
DATABASE_URL="mysql://root:neha%402004@localhost:3306/ai-analytics"
```

**Note**: The `@` symbol in the password must be URL-encoded as `%40`.

## Tables Created

After running migrations, the following tables will be created:

1. **QueryHistory** - Stores all user queries
2. **DashboardMetric** - Stores dashboard metrics
3. **FileMetadata** - Stores uploaded file metadata
4. **DataSource** - Stores data source configurations
5. **SchemaRegistry** - Stores schema mappings
6. **SchemaMapping** - Stores canonical mappings
7. **EmbeddingCache** - Stores schema embeddings
8. **_prisma_migrations** - Prisma migration history

## Verification

Verify the database setup:

```powershell
# Check database exists
mysql -h localhost -u root -pneha@2004 -e "SHOW DATABASES LIKE 'ai-analytics';"

# Check tables
mysql -h localhost -u root -pneha@2004 -D ai-analytics -e "SHOW TABLES;"
```

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│  Your Application (Next.js)                            │
└────────────────────┬──────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│  ai-analytics Database (Metadata)                      │
│  - DataSource registrations                            │
│  - Query history                                       │
│  - Schema mappings                                      │
└────────────────────┬──────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│  Your Data Sources (Railway, Local MySQL, etc.)       │
│  - Your actual business data                           │
│  - Your tables (Student, FeeStructure, etc.)          │
└─────────────────────────────────────────────────────────┘
```

## Troubleshooting

### Database Already Exists

If the database already exists, migrations will still run and update tables as needed.

### Prisma Client Generation Error

If you see `EPERM: operation not permitted` when generating Prisma client:
- Stop your development server
- Run `npx prisma generate` again
- Restart your development server

### Connection Issues

1. Verify MySQL is running:
   ```powershell
   mysql --version
   ```

2. Test connection:
   ```powershell
   mysql -h localhost -u root -pneha@2004 -e "SELECT 1;"
   ```

3. Check .env file has correct DATABASE_URL

## Next Steps

After setup:
1. ✅ Database created
2. ✅ Tables migrated
3. ✅ Start your application: `npm run dev`
4. ✅ Register your data sources in the UI
5. ✅ Start using the analytics system!

---

**Your analytics system is now ready to use!** 🚀

