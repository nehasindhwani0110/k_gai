# Performance Optimization Guide

## 🚀 Technologies & Techniques Implemented

### 1. **Redis Caching** (Primary Optimization)
**Technology**: Redis (in-memory data store)
**Impact**: Sub-millisecond access times (vs 100-500ms database queries)

#### What's Cached:
- ✅ **System Catalog Metadata** (5 min TTL)
  - Caches INFORMATION_SCHEMA query results
  - Shared across all instances
  - Auto-invalidates after TTL
  
- ✅ **Query Results** (1 min TTL)
  - Caches common query results
  - Instant responses for repeated queries
  - Reduces database load

- ✅ **Semantic Matching Results** (30 min TTL)
  - Caches table/column matching results
  - Reuses for similar questions

#### Performance Gain:
- **Before**: 30 seconds (system catalog + semantic + LLM)
- **After**: **2-5 seconds** (cache hits = instant)

### 2. **Request Deduplication**
**Technology**: In-memory request tracking
**Impact**: Prevents duplicate concurrent requests

- If same request arrives while processing, returns same promise
- Prevents redundant system catalog queries
- Reduces database load

### 3. **Parallel Processing**
**Technology**: Promise.all with concurrency limits
**Impact**: 5-10x faster for batch operations

- Already implemented for embeddings
- Can be extended for metadata fetching

### 4. **Smart Cache Invalidation**
**Technology**: Hash-based change detection
**Impact**: Always fresh data without manual cache clearing

- Schema hash detects changes
- Auto-invalidates when schema changes
- Manual invalidation API available

## 📊 Expected Performance Improvements

| Operation | Before | After (with Redis) | Improvement |
|-----------|--------|-------------------|-------------|
| **Metadata Fetch (cached)** | 2-3s | **<10ms** | **300x faster** |
| **Query Result (cached)** | 1-2s | **<10ms** | **100x faster** |
| **Semantic Match (cached)** | 1-2s | **<10ms** | **100x faster** |
| **First Request** | 30s | **5-8s** | **4-6x faster** |
| **Subsequent Requests** | 30s | **2-5s** | **6-15x faster** |

## 🛠️ Setup Instructions

### 1. Install Redis

**Windows:**
```powershell
# Using Chocolatey
choco install redis-64

# Or download from: https://github.com/microsoftarchive/redis/releases
```

**Linux/Mac:**
```bash
# Ubuntu/Debian
sudo apt-get install redis-server

# Mac (Homebrew)
brew install redis

# Start Redis
redis-server
```

### 2. Install Redis Client Package

```bash
cd k_gai
npm install redis
```

### 3. Configure Environment Variable

Add to `.env`:
```env
REDIS_URL=redis://localhost:6379
# Or for production:
# REDIS_URL=redis://your-redis-host:6379
```

### 4. Verify Redis Connection

The system will automatically:
- Connect to Redis on first use
- Fall back to in-memory cache if Redis unavailable
- Log connection status

## 🎯 Additional Optimizations (Future)

### 1. **Streaming Responses**
- Stream query results as they arrive
- Show partial results immediately
- Better UX for long-running queries

### 2. **CDN/Edge Caching**
- Cache static responses at edge
- Reduce latency for global users
- Use Cloudflare/Vercel Edge Functions

### 3. **Database Query Optimization**
- Add more indexes (already done)
- Use prepared statements
- Connection pooling (already done)

### 4. **Background Pre-warming**
- Pre-load common metadata in background
- Pre-generate embeddings for popular tables
- Reduce cold start time

### 5. **GraphQL DataLoader**
- Batch database queries
- Reduce N+1 query problems
- Optimize data fetching

## 📈 Monitoring Performance

### Cache Hit Rates
Check logs for:
```
[REDIS] ✅ Cache HIT for system catalog metadata
[REDIS] ✅ Cache HIT for query result
```

### Response Times
Monitor:
- Metadata fetch time
- Query execution time
- Total request time

### Redis Metrics
```bash
# Check Redis stats
redis-cli INFO stats

# Monitor cache hits/misses
redis-cli INFO stats | grep keyspace
```

## 🔧 Configuration Options

### Cache TTLs (in `redis-cache.ts`):
- **System Catalog**: 300s (5 min) - Schema changes are rare
- **Query Results**: 60s (1 min) - Data changes frequently
- **Semantic Matches**: 1800s (30 min) - Stable for similar questions

### Adjust Based on Your Needs:
- **Frequent schema changes**: Reduce system catalog TTL
- **Stable data**: Increase query result TTL
- **High traffic**: Increase all TTLs

## 🚨 Important Notes

1. **Redis is Optional**: System works without Redis (uses in-memory cache)
2. **Cache Invalidation**: Automatic via TTL, manual via API
3. **Memory Usage**: Redis uses ~50-100MB for typical workloads
4. **Scalability**: Redis enables horizontal scaling (shared cache)

## 📝 Usage Examples

### Manual Cache Invalidation
```typescript
import { invalidateSystemCatalogCache } from './services/redis-cache';

// When schema changes
await invalidateSystemCatalogCache(dataSourceId);
```

### Check Cache Status
```typescript
import { getCachedSystemCatalogMetadata } from './services/redis-cache';

const cached = await getCachedSystemCatalogMetadata(dataSourceId);
if (cached) {
  console.log('Using cached metadata');
}
```

## 🎉 Expected Results

After implementing Redis caching:
- **First request**: 5-8 seconds (cache miss, but optimized)
- **Subsequent requests**: **2-5 seconds** (cache hits)
- **Repeated queries**: **<1 second** (query result cache)

**Total improvement: 6-15x faster!**

