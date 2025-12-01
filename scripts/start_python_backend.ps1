# ============================================
# PowerShell Script to Start Python API Server
# For Schema Introspection using SQLAlchemy
# ============================================

Write-Host "============================================" -ForegroundColor Cyan
Write-Host "Starting Python API Server" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

# Navigate to Python backend directory
$pythonBackendDir = Join-Path $PSScriptRoot "..\analytics-engine\python-backend"
Set-Location $pythonBackendDir

# Check if Python is installed
Write-Host "Checking Python installation..." -ForegroundColor Yellow
try {
    $pythonVersion = python --version
    Write-Host "Python found: $pythonVersion" -ForegroundColor Green
} catch {
    Write-Host "ERROR: Python is not installed or not in PATH" -ForegroundColor Red
    Write-Host "Please install Python from: https://www.python.org/downloads/" -ForegroundColor Yellow
    exit 1
}

# Check if virtual environment exists
$venvPath = Join-Path $pythonBackendDir "venv"
if (-not (Test-Path $venvPath)) {
    Write-Host "Creating virtual environment..." -ForegroundColor Yellow
    python -m venv venv
}

# Activate virtual environment
Write-Host "Activating virtual environment..." -ForegroundColor Yellow
& "$venvPath\Scripts\Activate.ps1"

# Install/upgrade dependencies
Write-Host "Installing Python dependencies..." -ForegroundColor Yellow
pip install -r requirements.txt --quiet

# Start Flask server
Write-Host ""
Write-Host "Starting Flask API server on port 8000..." -ForegroundColor Green
Write-Host "API Endpoints:" -ForegroundColor Cyan
Write-Host "  - Health: http://localhost:8000/health" -ForegroundColor Gray
Write-Host "  - Introspect: http://localhost:8000/introspect" -ForegroundColor Gray
Write-Host ""
Write-Host "Press Ctrl+C to stop the server" -ForegroundColor Yellow
Write-Host ""

python api_server.py

