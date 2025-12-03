# PowerShell script to create Prisma database
# This database stores APPLICATION metadata (data source registrations, query history, etc.)

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Creating Prisma Application Database" -ForegroundColor Cyan
Write-Host "========================================`n" -ForegroundColor Cyan

$databaseName = "ai-analytics"
$username = "root"

Write-Host "This database stores:" -ForegroundColor Yellow
Write-Host "  - Data source registrations (like your Railway database info)" -ForegroundColor White
Write-Host "  - Query history" -ForegroundColor White
Write-Host "  - Schema mappings" -ForegroundColor White
Write-Host "  - Application metadata`n" -ForegroundColor White

Write-Host "Your Railway database is SEPARATE and stores YOUR actual data.`n" -ForegroundColor Cyan

# Prompt for MySQL password
$password = Read-Host "Enter MySQL root password" -AsSecureString
$passwordPlain = [Runtime.InteropServices.Marshal]::PtrToStringAuto(
    [Runtime.InteropServices.Marshal]::SecureStringToBSTR($password)
)

# Create database SQL
$createDbSql = "CREATE DATABASE IF NOT EXISTS \`$databaseName\`;"

Write-Host "`nCreating database..." -ForegroundColor Yellow

# Try to create database using mysql command
$mysqlPath = "mysql"
try {
    $env:MYSQL_PWD = $passwordPlain
    $result = echo $createDbSql | & $mysqlPath -u $username 2>&1
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✅ Database '$databaseName' created successfully!" -ForegroundColor Green
        Write-Host "`nNext steps:" -ForegroundColor Yellow
        Write-Host "  1. Run: npx prisma migrate dev --name init" -ForegroundColor White
        Write-Host "  2. This will create all tables in the database`n" -ForegroundColor White
    } else {
        Write-Host "❌ Error creating database. Please run manually:" -ForegroundColor Red
        Write-Host "  mysql -u $username -p" -ForegroundColor White
        Write-Host "  Then run: CREATE DATABASE IF NOT EXISTS \`$databaseName\`;" -ForegroundColor White
    }
} catch {
    Write-Host "❌ MySQL command not found. Please create database manually:" -ForegroundColor Red
    Write-Host "  mysql -u $username -p" -ForegroundColor White
    Write-Host "  Then run: CREATE DATABASE IF NOT EXISTS \`$databaseName\`;" -ForegroundColor White
}

# Clear password from environment
Remove-Item Env:\MYSQL_PWD -ErrorAction SilentlyContinue

