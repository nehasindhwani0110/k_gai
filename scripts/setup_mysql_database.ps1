# ============================================
# PowerShell Script to Setup MySQL Database
# Database: gai
# Host: localhost
# ============================================

Write-Host "============================================" -ForegroundColor Cyan
Write-Host "MySQL Database Setup Script" -ForegroundColor Cyan
Write-Host "Database: gai" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

# MySQL connection details
$dbName = "gai"
$dbHost = "localhost"
$dbUser = "root"
$dbPassword = "neha@2004"

# Paths to SQL scripts
$createTableScript = Join-Path $PSScriptRoot "create_student_tables.sql"
$insertDataScript = Join-Path $PSScriptRoot "insert_student_data.sql"

# Check if MySQL is installed
Write-Host "Checking MySQL installation..." -ForegroundColor Yellow
try {
    $mysqlVersion = mysql --version
    Write-Host "MySQL found: $mysqlVersion" -ForegroundColor Green
} catch {
    Write-Host "ERROR: MySQL is not installed or not in PATH" -ForegroundColor Red
    Write-Host "Please install MySQL from: https://dev.mysql.com/downloads/mysql/" -ForegroundColor Yellow
    exit 1
}

# Check if SQL scripts exist
if (-not (Test-Path $createTableScript)) {
    Write-Host "ERROR: Create table script not found: $createTableScript" -ForegroundColor Red
    exit 1
}

if (-not (Test-Path $insertDataScript)) {
    Write-Host "ERROR: Insert data script not found: $insertDataScript" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "Step 1: Creating database and tables..." -ForegroundColor Yellow
Write-Host "Executing: $createTableScript" -ForegroundColor Gray

# Execute create table script
$createTableCommand = "mysql -h $dbHost -u $dbUser -p$dbPassword < `"$createTableScript`""
try {
    $createTableOutput = Invoke-Expression $createTableCommand 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✓ Tables created successfully!" -ForegroundColor Green
    } else {
        Write-Host "ERROR: Failed to create tables" -ForegroundColor Red
        Write-Host $createTableOutput -ForegroundColor Red
        exit 1
    }
} catch {
    Write-Host "ERROR: Failed to execute create table script" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "Step 2: Inserting sample data..." -ForegroundColor Yellow
Write-Host "Executing: $insertDataScript" -ForegroundColor Gray

# Execute insert data script
$insertDataCommand = "mysql -h $dbHost -u $dbUser -p$dbPassword < `"$insertDataScript`""
try {
    $insertDataOutput = Invoke-Expression $insertDataCommand 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✓ Data inserted successfully!" -ForegroundColor Green
    } else {
        Write-Host "ERROR: Failed to insert data" -ForegroundColor Red
        Write-Host $insertDataOutput -ForegroundColor Red
        exit 1
    }
} catch {
    Write-Host "ERROR: Failed to execute insert data script" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "Step 3: Verifying database setup..." -ForegroundColor Yellow

# Verify table exists and has data
$verifyCommand = "mysql -h $dbHost -u $dbUser -p$dbPassword -D $dbName -e `"SELECT COUNT(*) as total_records FROM comprehensive_student_data;`""
try {
    $verifyOutput = Invoke-Expression $verifyCommand 2>&1
    Write-Host $verifyOutput -ForegroundColor Cyan
    
    # Extract record count
    if ($verifyOutput -match "(\d+)") {
        $recordCount = $matches[1]
        Write-Host ""
        Write-Host "✓ Database setup complete!" -ForegroundColor Green
        Write-Host "Total records in database: $recordCount" -ForegroundColor Cyan
    }
} catch {
    Write-Host "WARNING: Could not verify data count" -ForegroundColor Yellow
    Write-Host $_.Exception.Message -ForegroundColor Yellow
}

Write-Host ""
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "Database Setup Complete!" -ForegroundColor Green
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Connection String:" -ForegroundColor Yellow
Write-Host "mysql://root:neha@2004@localhost:3306/gai" -ForegroundColor Cyan
Write-Host ""
Write-Host "You can now connect to the database using:" -ForegroundColor Yellow
Write-Host "  Host: localhost" -ForegroundColor Gray
Write-Host "  Database: gai" -ForegroundColor Gray
Write-Host "  Username: root" -ForegroundColor Gray
Write-Host "  Password: neha@2004" -ForegroundColor Gray
Write-Host ""

