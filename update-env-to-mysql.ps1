# PowerShell script to update .env file for MySQL migration

Write-Host "Updating .env file for MySQL migration..." -ForegroundColor Green

$envFile = ".env"

if (-not (Test-Path $envFile)) {
    Write-Host "Error: .env file not found!" -ForegroundColor Red
    exit 1
}

# Read the current .env file
$content = Get-Content $envFile -Raw

# Replace SQLite DATABASE_URL with MySQL
$oldDatabaseUrl = 'DATABASE_URL="file:./dev.db"'
$newDatabaseUrl = 'DATABASE_URL="mysql://root:neha%402004@localhost:3306/ai-analytics"'

if ($content -match [regex]::Escape($oldDatabaseUrl)) {
    $content = $content -replace [regex]::Escape($oldDatabaseUrl), $newDatabaseUrl
    Set-Content -Path $envFile -Value $content -NoNewline
    Write-Host "✅ Updated DATABASE_URL to MySQL" -ForegroundColor Green
    Write-Host "   Database: ai-analytics" -ForegroundColor Cyan
    Write-Host "   User: root" -ForegroundColor Cyan
    Write-Host "   Password: neha@2004" -ForegroundColor Cyan
} elseif ($content -match 'DATABASE_URL=') {
    # If DATABASE_URL exists but with different format, replace it
    $content = $content -replace 'DATABASE_URL=.*', $newDatabaseUrl
    Set-Content -Path $envFile -Value $content -NoNewline
    Write-Host "✅ Updated existing DATABASE_URL to MySQL" -ForegroundColor Green
} else {
    # If DATABASE_URL doesn't exist, add it
    $content += "`n$newDatabaseUrl`n"
    Set-Content -Path $envFile -Value $content -NoNewline
    Write-Host "✅ Added DATABASE_URL for MySQL" -ForegroundColor Green
}

Write-Host "`nNext steps:" -ForegroundColor Yellow
Write-Host "1. Make sure MySQL is running" -ForegroundColor White
Write-Host "2. Create database: CREATE DATABASE IF NOT EXISTS \`ai-analytics\`;" -ForegroundColor White
Write-Host "3. Run: npx prisma migrate dev --name migrate_to_mysql" -ForegroundColor White

