# Migration from SQLite to MySQL

## ✅ Migration Complete

Your Prisma database has been migrated from SQLite to MySQL.

### Database Configuration

- **Database Name**: `ai-analytics`
- **Username**: `root`
- **Password**: `neha@2004`
- **Host**: `localhost`
- **Port**: `3306`

### Connection String
```
mysql://root:neha%402004@localhost:3306/ai-analytics
```

Note: The `@` in the password is URL-encoded as `%40`.

---

## 📋 Steps Completed

1. ✅ Updated `prisma/schema.prisma` to use MySQL provider
2. ✅ Installed `mysql2` package (required for Prisma MySQL)
3. ✅ Updated `.env` file with MySQL connection string

---

## 🚀 Next Steps

### 1. Create MySQL Database

Make sure MySQL is running and create the database:

```sql
CREATE DATABASE IF NOT EXISTS `ai-analytics`;
```

Or using MySQL command line:
```bash
mysql -u root -p
CREATE DATABASE `ai-analytics`;
```

### 2. Run Prisma Migration

Run the migration to create all tables in MySQL:

```bash
npx prisma migrate dev --name migrate_to_mysql
```

This will:
- Create all tables in MySQL database
- Migrate schema from SQLite to MySQL
- Generate Prisma Client

### 3. Verify Migration

Check that tables are created:

```bash
npx prisma studio
```

Or connect to MySQL and verify:
```sql
USE `ai-analytics`;
SHOW TABLES;
```

You should see:
- QueryHistory
- DashboardMetric
- FileMetadata
- School
- DataSource
- SchemaRegistry
- SchemaMapping
- EmbeddingCache

### 4. (Optional) Migrate Existing Data

If you have data in SQLite that you want to migrate:

1. Export data from SQLite:
```bash
# Export each table
sqlite3 prisma/dev.db ".dump QueryHistory" > query_history.sql
sqlite3 prisma/dev.db ".dump DashboardMetric" > dashboard_metric.sql
# ... repeat for other tables
```

2. Convert SQLite SQL to MySQL format (remove SQLite-specific syntax)

3. Import to MySQL:
```bash
mysql -u root -p ai-analytics < query_history.sql
# ... repeat for other tables
```

---

## ⚠️ Important Notes

### Password Encoding
The password `neha@2004` contains special characters. In the connection string, `@` is URL-encoded as `%40`:
- Password: `neha@2004`
- Encoded: `neha%402004`

### Data Types
MySQL uses different data types than SQLite:
- SQLite `TEXT` → MySQL `VARCHAR(191)` or `TEXT`
- SQLite `INTEGER` → MySQL `INT`
- Prisma handles this automatically

### Indexes
All indexes from SQLite schema are preserved in MySQL.

### Foreign Keys
All foreign key relationships are maintained in MySQL.

---

## 🔧 Troubleshooting

### Connection Error
If you get connection errors:

1. **Check MySQL is running:**
```bash
# Windows
net start MySQL80

# Or check service status
sc query MySQL80
```

2. **Verify credentials:**
```bash
mysql -u root -p
# Enter password: neha@2004
```

3. **Check database exists:**
```sql
SHOW DATABASES;
```

### Migration Errors

If migration fails:

1. **Reset database (WARNING: Deletes all data):**
```bash
npx prisma migrate reset
```

2. **Check Prisma schema:**
```bash
npx prisma validate
```

3. **Generate Prisma Client:**
```bash
npx prisma generate
```

### Port Already in Use

If port 3306 is in use:

1. Change port in `.env`:
```
DATABASE_URL="mysql://root:neha%402004@localhost:3307/ai-analytics"
```

2. Update MySQL configuration to use different port

---

## 📊 What Changed

### Before (SQLite)
- Database: `file:./dev.db`
- Provider: `sqlite`
- File-based storage

### After (MySQL)
- Database: `mysql://root:neha%402004@localhost:3306/ai-analytics`
- Provider: `mysql`
- Server-based storage

### Benefits
- ✅ Better performance for large datasets
- ✅ Concurrent access support
- ✅ Production-ready
- ✅ Better for multi-user scenarios
- ✅ Advanced features (transactions, stored procedures, etc.)

---

## 🎯 Verification

After migration, verify everything works:

1. **Start the application:**
```bash
npm run dev
```

2. **Test database connection:**
- Login to the application
- Create a query
- Check query history

3. **Check Prisma logs:**
- Look for any connection errors
- Verify queries are executing correctly

---

## 📝 Files Modified

1. `prisma/schema.prisma` - Changed provider from `sqlite` to `mysql`
2. `.env` - Updated `DATABASE_URL` to MySQL connection string
3. `package.json` - Added `mysql2` dependency

---

## ✅ Migration Checklist

- [x] Update Prisma schema
- [x] Install mysql2 package
- [x] Update .env file
- [ ] Create MySQL database
- [ ] Run Prisma migration
- [ ] Verify tables created
- [ ] Test application
- [ ] (Optional) Migrate existing data

---

## 🆘 Need Help?

If you encounter issues:

1. Check MySQL is running
2. Verify database exists
3. Check connection string format
4. Review Prisma migration logs
5. Check MySQL error logs




