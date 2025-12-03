# Quick Setup: Redis for Performance Optimization

## 🚀 Why Redis?

**Current Performance**: 30 seconds per request
**With Redis**: **2-5 seconds** (6-15x faster!)

Redis caches:
- System catalog metadata (5 min TTL)
- Query results (1 min TTL)  
- Semantic matching results (30 min TTL)

## ⚡ Quick Installation

### Windows (PowerShell)
```powershell
# Option 1: Using Chocolatey
choco install redis-64

# Option 2: Download from GitHub
# https://github.com/microsoftarchive/redis/releases
# Download: Redis-x64-3.0.504.msi
# Install and start Redis service

# Redis runs as a Windows service automatically
# Verify Redis is running:
redis-cli ping
# Should return: PONG

# Note: If you see "bind: No such file or directory" when running redis-server,
# it means Redis is already running as a service - this is normal!

# To manage Redis service (requires Administrator privileges):
# Right-click PowerShell -> Run as Administrator, then:
# Start-Service Redis    # Start Redis service
# Stop-Service Redis     # Stop Redis service
# Get-Service Redis      # Check service status
```

### Linux/Mac
```bash
# Ubuntu/Debian
sudo apt-get update
sudo apt-get install redis-server
sudo systemctl start redis-server

# Mac (Homebrew)
brew install redis
brew services start redis

# Verify Redis is running
redis-cli ping
# Should return: PONG
```

## 📦 Install Redis Client

```bash
cd k_gai
npm install redis
```

## 🔧 Configure Environment

Add to `.env`:
```env
REDIS_URL=redis://localhost:6379
```

## ✅ Verify It Works

### Windows:
1. Verify Redis is running: `redis-cli ping` (should return `PONG`)
2. Start your app: `npm run dev`
3. Check logs for: `[REDIS] ✅ Connected to Redis`

**Note**: On Windows, Redis runs as a service automatically. You don't need to manually start it with `redis-server`. If you see a "bind" error when running `redis-server`, it means Redis is already running - this is normal!

### Linux/Mac:
1. Start Redis: `redis-server` (or `sudo systemctl start redis-server` on Linux)
2. Verify: `redis-cli ping` (should return `PONG`)
3. Start your app: `npm run dev`
4. Check logs for: `[REDIS] ✅ Connected to Redis`

## 🎯 Expected Results

| Scenario | Before | After |
|----------|--------|-------|
| First request | 30s | 5-8s |
| Cached metadata | 30s | **<1s** |
| Cached query | 30s | **<1s** |

## 🔄 Fallback Behavior

- If Redis unavailable → Uses in-memory cache
- System continues working (just slower)
- No breaking changes!

## 📊 Monitoring

Check cache hits in logs:
```
[REDIS] ✅ Cache HIT for system catalog metadata
[REDIS] ✅ Cache HIT for query result
```

## 🛠️ Production Setup

For production, use managed Redis:
- **AWS ElastiCache**
- **Redis Cloud** (free tier available)
- **Upstash Redis** (serverless, free tier)

Update `REDIS_URL` in production environment.

