# PowerShell script to set up MySQL database for Prisma

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "MySQL Database Setup for Prisma" -ForegroundColor Cyan
Write-Host "========================================`n" -ForegroundColor Cyan

$databaseName = "ai-analytics"
$username = "root"
$password = "neha@2004"

Write-Host "Database Configuration:" -ForegroundColor Yellow
Write-Host "  Database: $databaseName" -ForegroundColor White
Write-Host "  Username: $username" -ForegroundColor White
Write-Host "  Password: $password`n" -ForegroundColor White

# Check if MySQL is running
Write-Host "Checking MySQL service..." -ForegroundColor Yellow
$mysqlService = Get-Service -Name "MySQL*" -ErrorAction SilentlyContinue

if ($mysqlService) {
    $running = $mysqlService | Where-Object { $_.Status -eq "Running" }
    if ($running) {
        Write-Host "✅ MySQL service is running" -ForegroundColor Green
    } else {
        Write-Host "⚠️  MySQL service found but not running" -ForegroundColor Yellow
        Write-Host "Starting MySQL service..." -ForegroundColor Yellow
        Start-Service -Name $mysqlService[0].Name
        Start-Sleep -Seconds 3
        Write-Host "✅ MySQL service started" -ForegroundColor Green
    }
} else {
    Write-Host "⚠️  MySQL service not found. Please make sure MySQL is installed and running." -ForegroundColor Yellow
    Write-Host "You can start MySQL manually or check if it's running on a different port.`n" -ForegroundColor Yellow
}

# Create database SQL script
$createDbSql = @"
CREATE DATABASE IF NOT EXISTS \`$databaseName\`;
USE \`$databaseName\`;
SELECT 'Database created successfully!' AS Status;
"@

$sqlFile = "create-database.sql"
Set-Content -Path $sqlFile -Value $createDbSql

Write-Host "`nCreated SQL script: $sqlFile" -ForegroundColor Green
Write-Host "`nTo create the database, run one of these commands:" -ForegroundColor Yellow
Write-Host "`nOption 1: Using MySQL command line (recommended):" -ForegroundColor Cyan
Write-Host "  mysql -u $username -p < $sqlFile" -ForegroundColor White
Write-Host "  (Enter password when prompted: $password)" -ForegroundColor Gray

Write-Host "`nOption 2: Using MySQL Workbench or phpMyAdmin:" -ForegroundColor Cyan
Write-Host "  Run: CREATE DATABASE IF NOT EXISTS \`$databaseName\`;" -ForegroundColor White

Write-Host "`nOption 3: Interactive MySQL:" -ForegroundColor Cyan
Write-Host "  mysql -u $username -p" -ForegroundColor White
Write-Host "  Then run: CREATE DATABASE IF NOT EXISTS \`$databaseName\`;" -ForegroundColor White

Write-Host "`nAfter creating the database, run:" -ForegroundColor Yellow
Write-Host "  npx prisma migrate dev --name migrate_to_mysql" -ForegroundColor Green
Write-Host "`nThis will create all tables in the MySQL database.`n" -ForegroundColor Gray

