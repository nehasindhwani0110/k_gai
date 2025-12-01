# PowerShell script to set up the database

Write-Host "Setting up database..." -ForegroundColor Green

# Check if .env.local exists
if (-not (Test-Path ".env.local")) {
    Write-Host "Creating .env.local file..." -ForegroundColor Yellow
    Copy-Item ".env.example" ".env.local" -ErrorAction SilentlyContinue
    Write-Host "Please edit .env.local and add your OPENAI_API_KEY" -ForegroundColor Yellow
}

# Set DATABASE_URL if not set
$envContent = Get-Content ".env.local" -ErrorAction SilentlyContinue
if ($null -eq $envContent -or $envContent -notmatch "DATABASE_URL") {
    Add-Content ".env.local" "`nDATABASE_URL=`"file:./dev.db`""
    Write-Host "Added DATABASE_URL to .env.local" -ForegroundColor Green
}

# Generate Prisma Client
Write-Host "Generating Prisma Client..." -ForegroundColor Green
npx prisma generate

# Run migrations
Write-Host "Running database migrations..." -ForegroundColor Green
npx prisma migrate dev --name init

Write-Host "`nDatabase setup complete!" -ForegroundColor Green
Write-Host "You can now start the development server with: npm run dev" -ForegroundColor Cyan

