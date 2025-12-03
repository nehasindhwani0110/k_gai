# Test Redis Connection Script
Write-Host "Testing Redis Connection..." -ForegroundColor Cyan
Write-Host ""

# Test 1: Check Redis CLI
Write-Host "Test 1: Checking Redis CLI..." -ForegroundColor Yellow
try {
    $pingResult = redis-cli ping 2>&1
    if ($pingResult -eq "PONG") {
        Write-Host "Redis CLI: PONG received - Redis is running!" -ForegroundColor Green
    } else {
        Write-Host "Redis CLI: Unexpected response: $pingResult" -ForegroundColor Red
    }
} catch {
    Write-Host "Redis CLI: Not found or error" -ForegroundColor Red
    Write-Host "Install Redis: choco install redis-64" -ForegroundColor Yellow
}

Write-Host ""

# Test 2: Check Redis service
Write-Host "Test 2: Checking Redis Windows Service..." -ForegroundColor Yellow
try {
    $service = Get-Service Redis -ErrorAction SilentlyContinue
    if ($service) {
        if ($service.Status -eq "Running") {
            Write-Host "Redis Service: Running" -ForegroundColor Green
        } else {
            Write-Host "Redis Service: $($service.Status)" -ForegroundColor Yellow
        }
    } else {
        Write-Host "Redis Service: Not found" -ForegroundColor Yellow
    }
} catch {
    Write-Host "Could not check service status" -ForegroundColor Yellow
}

Write-Host ""

# Test 3: Check environment variable
Write-Host "Test 3: Checking REDIS_URL..." -ForegroundColor Yellow
$redisUrl = $env:REDIS_URL
if ($redisUrl) {
    Write-Host "REDIS_URL: $redisUrl" -ForegroundColor Green
} else {
    Write-Host "REDIS_URL: Not set (will use default)" -ForegroundColor Yellow
    Write-Host "Add to .env: REDIS_URL=redis://localhost:6379" -ForegroundColor Yellow
}

Write-Host ""

# Test 4: Check port
Write-Host "Test 4: Checking port 6379..." -ForegroundColor Yellow
try {
    $connection = Test-NetConnection -ComputerName localhost -Port 6379 -WarningAction SilentlyContinue -ErrorAction SilentlyContinue
    if ($connection.TcpTestSucceeded) {
        Write-Host "Port 6379: Listening" -ForegroundColor Green
    } else {
        Write-Host "Port 6379: Not accessible" -ForegroundColor Red
    }
} catch {
    Write-Host "Could not test port" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "Summary:" -ForegroundColor Cyan
Write-Host "1. Run: redis-cli ping (should return PONG)" -ForegroundColor White
Write-Host "2. Check: Get-Service Redis" -ForegroundColor White
Write-Host "3. Add REDIS_URL to .env file" -ForegroundColor White
Write-Host "4. Restart Next.js dev server" -ForegroundColor White
Write-Host ""
Write-Host "Test Redis status endpoint:" -ForegroundColor Cyan
Write-Host "Visit the API endpoint: /api/analytics/redis-status" -ForegroundColor White
Write-Host ""
