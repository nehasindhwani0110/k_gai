# School Login Setup Guide

## 🎯 Overview

This guide explains how to set up the school login system and test schema detection.

## 📋 Prerequisites

1. **MySQL Database** must be set up (see `SQL_DATABASE_SETUP.md`)
2. **Node.js dependencies** installed
3. **Prisma** configured

## 🚀 Setup Steps

### Step 1: Install Dependencies

```powershell
npm install
```

This will install:
- `bcryptjs` - For password hashing
- `tsx` - For running TypeScript seed scripts
- `@types/bcryptjs` - TypeScript types

### Step 2: Run Prisma Migration

```powershell
# Generate Prisma Client
npx prisma generate

# Create migration for School model
npx prisma migrate dev --name add_school_model
```

This will:
- Create the `School` table in your SQLite database
- Add relationship between `School` and `DataSource`

### Step 3: Seed Sample Schools

```powershell
npm run prisma:seed
```

Or manually:
```powershell
npx tsx prisma/seed.ts
```

This creates:
- **School A**: `schoola@gmail.com` / `neha`
- **School B**: `schoolb@gmail.com` / `neha`

### Step 4: Verify Setup

Check that schools were created:
```powershell
# Using Prisma Studio (GUI)
npx prisma studio

# Or check database directly
# Open prisma/dev.db with SQLite browser
```

## 🔐 Login Flow

### 1. User Visits Home Page

- URL: `http://localhost:3000`
- Shows login form
- If already logged in, redirects to `/analytics`

### 2. User Enters Credentials

**Test Credentials:**
- Email: `schoola@gmail.com`
- Password: `neha`

### 3. Login API Validates

**Endpoint**: `POST /api/auth/login`

**Process**:
1. Validates email and password
2. Checks if school is active
3. Creates `DataSource` if doesn't exist
4. Links `School` to `DataSource`
5. Returns school info and `dataSourceId`

### 4. Schema Auto-Detection

**When**: School accesses `/analytics` page

**Process**:
1. Frontend calls `GET /api/analytics/data-sources/[id]/schema`
2. If no mappings exist, system:
   - Introspects MySQL database using connection string
   - Auto-normalizes table/column names
   - Creates `SchemaMapping` records
   - Returns canonical schema

### 5. Redirect to Analytics

- Stores school info in `sessionStorage`
- Redirects to `/analytics`
- Analytics page loads with detected schema

## 📊 Testing Same Schema

### Scenario: Both Schools Use Same Database

**Setup**:
1. Both `schoola@gmail.com` and `schoolb@gmail.com` point to same database (`gai`)
2. Both have same table: `comprehensive_student_data`

**Expected Behavior**:
- Both schools see same canonical schema
- Both can query same data
- Queries work identically for both

**Test Steps**:
1. Login as `schoola@gmail.com`
2. Check schema detection
3. Logout (clear sessionStorage)
4. Login as `schoolb@gmail.com`
5. Check schema detection
6. Both should see same schema

## 📊 Testing Different Schemas

### Scenario: Schools Have Different Schemas

**Setup**:
1. Create second MySQL database: `gai_school_b`
2. Create different table structure (e.g., `tbl_students` instead of `comprehensive_student_data`)
3. Update `schoolb@gmail.com` connection string

**Expected Behavior**:
- School A sees: `students` table (canonical)
- School B sees: `students` table (canonical, but mapped from `tbl_students`)
- Both use same canonical queries
- System translates queries differently for each school

**Test Steps**:
1. Create second database:
   ```sql
   CREATE DATABASE gai_school_b;
   USE gai_school_b;
   CREATE TABLE tbl_students (
     stu_id INT PRIMARY KEY,
     stu_name VARCHAR(255),
     cgpa DECIMAL(4,2)
   );
   ```

2. Update School B connection string:
   ```typescript
   // In Prisma Studio or via API
   connectionString: 'mysql://root:neha@2004@localhost:3306/gai_school_b'
   ```

3. Login as School B
4. System auto-detects different schema
5. Creates different mappings
6. Both schools can use same canonical queries!

## 🔍 Debugging

### Check School Record

```typescript
// Using Prisma Studio
npx prisma studio

// Navigate to School table
// Check: email, password (hashed), connectionString, dataSourceId
```

### Check DataSource Record

```typescript
// In Prisma Studio
// Navigate to DataSource table
// Check: name, sourceType, connectionString, isActive
```

### Check Schema Mappings

```typescript
// In Prisma Studio
// Navigate to SchemaMapping table
// Check: sourceTable, sourceColumn, canonicalTable, canonicalColumn
```

### Check Logs

```powershell
# Terminal logs will show:
[LOGIN] Auto-detecting schema for school: School A
[LOGIN] DataSource created: clx123...
[LOGIN] Schema will be auto-detected when school accesses analytics
```

## 🛠️ Troubleshooting

### Password Not Working

**Issue**: Login fails with correct password

**Solution**:
1. Check password hash in database
2. Re-seed database: `npm run prisma:seed`
3. Verify bcrypt is installed: `npm list bcryptjs`

### Schema Not Detecting

**Issue**: Schema not detected after login

**Solution**:
1. Check connection string is correct
2. Verify MySQL database is accessible
3. Check `dataSourceId` is linked to School
4. Manually trigger schema detection:
   ```
   GET /api/analytics/data-sources/[dataSourceId]/schema
   ```

### DataSource Not Created

**Issue**: `dataSourceId` is null after login

**Solution**:
1. Check `registerDataSource` function
2. Verify Prisma connection
3. Check database permissions
4. Review login API logs

## 📝 API Endpoints

### Login
```
POST /api/auth/login
Body: { email: "schoola@gmail.com", password: "neha" }
Response: { school: {...}, dataSourceId: "clx123..." }
```

### Get Schema
```
GET /api/analytics/data-sources/[id]/schema
Response: { source_type: "CANONICAL_DB", tables: [...] }
```

### Get Source Schema
```
GET /api/analytics/data-sources/[id]/schema?type=source
Response: { source_type: "SQL_DB", tables: [...] }
```

## ✅ Verification Checklist

After setup, verify:

- [ ] School table exists in database
- [ ] Sample schools created (`schoola@gmail.com`, `schoolb@gmail.com`)
- [ ] Login form displays on home page
- [ ] Login works with test credentials
- [ ] DataSource created after login
- [ ] Schema detected when accessing analytics
- [ ] Canonical mappings created
- [ ] Queries work with canonical names

## 🎯 Next Steps

1. **Test Same Schema**: Login as both schools, verify same schema
2. **Test Different Schemas**: Create different database for School B
3. **Test Queries**: Run queries using canonical names
4. **Verify Translation**: Check that queries translate correctly

---

**Ready to test school login!** 🚀

