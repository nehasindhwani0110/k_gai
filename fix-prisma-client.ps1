# PowerShell script to fix Prisma Client generation file lock issue

Write-Host "Fixing Prisma Client generation issue..." -ForegroundColor Yellow
Write-Host ""

# Check if Next.js dev server is running
Write-Host "Checking for running processes..." -ForegroundColor Cyan
$nextProcesses = Get-Process -Name "node" -ErrorAction SilentlyContinue | Where-Object { $_.Path -like "*k_gai*" }

if ($nextProcesses) {
    Write-Host "⚠️  Found Node.js processes that might be locking Prisma files:" -ForegroundColor Yellow
    $nextProcesses | ForEach-Object {
        Write-Host "  PID: $($_.Id) - $($_.Path)" -ForegroundColor Gray
    }
    Write-Host ""
    Write-Host "Please stop the Next.js dev server (Ctrl+C) and try again." -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Or run this command to kill all Node processes:" -ForegroundColor Cyan
    Write-Host "  Stop-Process -Name node -Force" -ForegroundColor White
    Write-Host ""
} else {
    Write-Host "✅ No Node.js processes found" -ForegroundColor Green
}

Write-Host "Attempting to fix Prisma Client..." -ForegroundColor Cyan
Write-Host ""

# Try to delete the locked file
$prismaClientPath = "node_modules\.prisma\client\query_engine-windows.dll.node"
if (Test-Path $prismaClientPath) {
    try {
        Remove-Item -Path $prismaClientPath -Force -ErrorAction Stop
        Write-Host "✅ Removed locked Prisma Client file" -ForegroundColor Green
    } catch {
        Write-Host "❌ Could not remove file: $_" -ForegroundColor Red
        Write-Host ""
        Write-Host "Solution: Close all applications using Prisma and try again:" -ForegroundColor Yellow
        Write-Host "  1. Stop Next.js dev server (if running)" -ForegroundColor White
        Write-Host "  2. Close VS Code/IDE" -ForegroundColor White
        Write-Host "  3. Run: npx prisma generate" -ForegroundColor White
        exit 1
    }
}

Write-Host ""
Write-Host "Now run: npx prisma generate" -ForegroundColor Green

