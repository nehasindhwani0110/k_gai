# ============================================
# PowerShell Script to Setup AI Analytics Database
# Database: ai-analytics
# Host: localhost
# Purpose: Stores application metadata (data sources, query history, schema mappings)
# ============================================

Write-Host "============================================" -ForegroundColor Cyan
Write-Host "AI Analytics Database Setup Script" -ForegroundColor Cyan
Write-Host "Database: ai-analytics" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

# MySQL connection details
$dbName = "ai-analytics"
$dbHost = "localhost"
$dbUser = "root"
$dbPassword = "neha@2004"

Write-Host "This database stores APPLICATION metadata:" -ForegroundColor Yellow
Write-Host "  - Data source registrations (your Railway/other databases info)" -ForegroundColor White
Write-Host "  - Query history (all queries you've run)" -ForegroundColor White
Write-Host "  - Schema mappings (canonical mappings for multi-tenant support)" -ForegroundColor White
Write-Host "  - File metadata (uploaded CSV/JSON/Excel files)" -ForegroundColor White
Write-Host "  - Dashboard metrics" -ForegroundColor White
Write-Host ""
Write-Host "Note: This is SEPARATE from your actual data sources." -ForegroundColor Cyan
Write-Host "Your actual business data stays in your own databases (Railway, etc.)`n" -ForegroundColor Cyan

# Check if MySQL is installed
Write-Host "Step 1: Checking MySQL installation..." -ForegroundColor Yellow
try {
    $mysqlVersion = mysql --version 2>&1
    Write-Host "✓ MySQL found: $mysqlVersion" -ForegroundColor Green
} catch {
    Write-Host "ERROR: MySQL is not installed or not in PATH" -ForegroundColor Red
    Write-Host "Please install MySQL from: https://dev.mysql.com/downloads/mysql/" -ForegroundColor Yellow
    exit 1
}

Write-Host ""
Write-Host "Step 2: Creating database '$dbName'..." -ForegroundColor Yellow

# Create a temporary SQL file
$tempSqlFile = Join-Path $env:TEMP "create_ai_analytics_db.sql"
$createDbSql = "CREATE DATABASE IF NOT EXISTS `"$dbName`" CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
Set-Content -Path $tempSqlFile -Value $createDbSql

# Execute create database command
try {
    $createDbOutput = Get-Content $tempSqlFile | mysql -h $dbHost -u $dbUser -p$dbPassword 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✓ Database '$dbName' created successfully!" -ForegroundColor Green
    } else {
        # Check if database already exists
        if ($createDbOutput -match "already exists" -or $createDbOutput -match "1007") {
            Write-Host "✓ Database '$dbName' already exists!" -ForegroundColor Green
        } else {
            Write-Host "ERROR: Failed to create database" -ForegroundColor Red
            Write-Host $createDbOutput -ForegroundColor Red
            Write-Host ""
            Write-Host "Please try manually:" -ForegroundColor Yellow
            Write-Host "  mysql -u $dbUser -p" -ForegroundColor White
            Write-Host "  CREATE DATABASE IF NOT EXISTS `"$dbName`";" -ForegroundColor White
            Remove-Item $tempSqlFile -ErrorAction SilentlyContinue
            exit 1
        }
    }
} catch {
    Write-Host "ERROR: Failed to execute create database command" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    Write-Host ""
    Write-Host "Please try manually:" -ForegroundColor Yellow
    Write-Host "  mysql -u $dbUser -p" -ForegroundColor White
    Write-Host "  CREATE DATABASE IF NOT EXISTS `"$dbName`";" -ForegroundColor White
    Remove-Item $tempSqlFile -ErrorAction SilentlyContinue
    exit 1
}

# Clean up temp file
Remove-Item $tempSqlFile -ErrorAction SilentlyContinue

Write-Host ""
Write-Host "Step 3: Verifying database exists..." -ForegroundColor Yellow

# Verify database exists
$verifySqlFile = Join-Path $env:TEMP "verify_db.sql"
Set-Content -Path $verifySqlFile -Value "SHOW DATABASES LIKE '$dbName';"
try {
    $verifyOutput = Get-Content $verifySqlFile | mysql -h $dbHost -u $dbUser -p$dbPassword 2>&1
    if ($verifyOutput -match $dbName) {
        Write-Host "✓ Database '$dbName' verified!" -ForegroundColor Green
    } else {
        Write-Host "WARNING: Could not verify database creation" -ForegroundColor Yellow
    }
} catch {
    Write-Host "WARNING: Could not verify database" -ForegroundColor Yellow
    Write-Host $_.Exception.Message -ForegroundColor Yellow
}
Remove-Item $verifySqlFile -ErrorAction SilentlyContinue

Write-Host ""
Write-Host "Step 4: Checking .env configuration..." -ForegroundColor Yellow

# Change to k_gai directory if we're in scripts folder
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectRoot = Split-Path -Parent $scriptDir

if (Test-Path (Join-Path $projectRoot "prisma\schema.prisma")) {
    Push-Location $projectRoot
    Write-Host "Changed to project root: $projectRoot" -ForegroundColor Gray
} else {
    Write-Host "WARNING: Could not find prisma/schema.prisma" -ForegroundColor Yellow
    Write-Host "Please run Prisma migrations manually from the project root" -ForegroundColor Yellow
}

# Check if .env file exists and has correct DATABASE_URL
$envFile = Join-Path $projectRoot ".env"
$envLocalFile = Join-Path $projectRoot ".env.local"

$envFileToCheck = $null
if (Test-Path $envFile) {
    $envFileToCheck = $envFile
} elseif (Test-Path $envLocalFile) {
    $envFileToCheck = $envLocalFile
}

if ($envFileToCheck) {
    $envContent = Get-Content $envFileToCheck -Raw
    $expectedDbUrl = "mysql://root:neha%402004@localhost:3306/ai-analytics"
    
    if ($envContent -notmatch [regex]::Escape($expectedDbUrl)) {
        Write-Host ""
        Write-Host "WARNING: DATABASE_URL in $envFileToCheck may not be set correctly" -ForegroundColor Yellow
        Write-Host "Expected: DATABASE_URL=`"$expectedDbUrl`"" -ForegroundColor Cyan
        Write-Host ""
        Write-Host "Please ensure your .env file contains:" -ForegroundColor Yellow
        Write-Host "DATABASE_URL=`"$expectedDbUrl`"" -ForegroundColor White
    } else {
        Write-Host "✓ DATABASE_URL is correctly configured" -ForegroundColor Green
    }
} else {
    Write-Host ""
    Write-Host "WARNING: No .env or .env.local file found" -ForegroundColor Yellow
    Write-Host "Please create one with:" -ForegroundColor Yellow
    Write-Host "DATABASE_URL=`"mysql://root:neha%402004@localhost:3306/ai-analytics`"" -ForegroundColor White
}

Write-Host ""
Write-Host "Step 5: Running Prisma migrations..." -ForegroundColor Yellow
Write-Host "This will create all tables in the database..." -ForegroundColor Gray

try {
    # Run Prisma migrations
    Write-Host "Running: npx prisma migrate dev --name init" -ForegroundColor Gray
    $migrateOutput = npx prisma migrate dev --name init 2>&1
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✓ Prisma migrations completed successfully!" -ForegroundColor Green
    } else {
        Write-Host "WARNING: Prisma migration may have issues" -ForegroundColor Yellow
        Write-Host $migrateOutput -ForegroundColor Yellow
        
        # Try to generate Prisma client anyway
        Write-Host ""
        Write-Host "Generating Prisma Client..." -ForegroundColor Yellow
        npx prisma generate 2>&1 | Out-Null
    }
} catch {
    Write-Host "ERROR: Failed to run Prisma migrations" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    Write-Host ""
    Write-Host "Please run manually:" -ForegroundColor Yellow
    Write-Host "  cd $projectRoot" -ForegroundColor White
    Write-Host "  npx prisma migrate dev --name init" -ForegroundColor White
    Write-Host "  npx prisma generate" -ForegroundColor White
}

Write-Host ""
Write-Host "Step 6: Verifying tables were created..." -ForegroundColor Yellow

# Verify tables exist
$verifyTablesSqlFile = Join-Path $env:TEMP "verify_tables.sql"
Set-Content -Path $verifyTablesSqlFile -Value "SHOW TABLES;"
try {
    $tablesOutput = Get-Content $verifyTablesSqlFile | mysql -h $dbHost -u $dbUser -p$dbPassword -D $dbName 2>&1
    if ($tablesOutput -match "QueryHistory|DataSource|FileMetadata|SchemaRegistry|SchemaMapping") {
        Write-Host "✓ Tables created successfully!" -ForegroundColor Green
        Write-Host ""
        Write-Host "Tables in database:" -ForegroundColor Cyan
        Write-Host $tablesOutput -ForegroundColor Gray
    } else {
        Write-Host "WARNING: Tables may not have been created yet" -ForegroundColor Yellow
        Write-Host "Please run: npx prisma migrate dev --name init" -ForegroundColor Yellow
    }
} catch {
    Write-Host "WARNING: Could not verify tables" -ForegroundColor Yellow
    Write-Host $_.Exception.Message -ForegroundColor Yellow
}
Remove-Item $verifyTablesSqlFile -ErrorAction SilentlyContinue

if ($null -ne (Get-Location).Path -and (Get-Location).Path -ne $PWD) {
    Pop-Location
}

Write-Host ""
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "Database Setup Complete!" -ForegroundColor Green
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Connection Details:" -ForegroundColor Yellow
Write-Host "  Host: $dbHost" -ForegroundColor Gray
Write-Host "  Database: $dbName" -ForegroundColor Gray
Write-Host "  Username: $dbUser" -ForegroundColor Gray
Write-Host "  Password: $dbPassword" -ForegroundColor Gray
Write-Host ""
Write-Host "Connection String:" -ForegroundColor Yellow
Write-Host "mysql://$dbUser`:neha%402004@$dbHost`:3306/$dbName" -ForegroundColor Cyan
Write-Host ""
Write-Host "Next Steps:" -ForegroundColor Yellow
Write-Host "  1. Ensure your .env file has:" -ForegroundColor White
Write-Host "     DATABASE_URL=`"mysql://root:neha%402004@localhost:3306/ai-analytics`"" -ForegroundColor Cyan
Write-Host "  2. Start your application: npm run dev" -ForegroundColor White
Write-Host "  3. Register your data sources in the UI" -ForegroundColor White
Write-Host ""
Write-Host "Your analytics system is now ready to use!" -ForegroundColor Green
Write-Host ""
