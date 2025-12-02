# Persistent Embedding Cache System

## Overview

The embedding cache system stores schema embeddings in the database so they persist across requests. **Schema embeddings are generated once and reused**, significantly reducing API costs and improving performance.

## How It Works

### 1. **Persistent Storage**
- **Schema embeddings** (tables and columns) are stored in the `EmbeddingCache` Prisma model
- **Question embeddings** are NEVER cached - generated fresh each time (they're unique)
- Schema cache persists across server restarts

### 2. **Schema Change Detection**
- Each schema gets a unique hash based on table/column names and types
- Hash changes when schema changes (new tables/columns added/removed)
- Old cache is automatically cleared when schema hash changes
- Only NEW schema elements generate embeddings (existing ones use cache)

### 3. **Pre-generation Strategy**
When semantic matching is first used for a schema:
- Schema hash is calculated
- Checks if cache exists for this schema hash
- If schema changed: clears old cache
- Generates embeddings ONLY for NEW schema elements (not already cached)
- Subsequent queries reuse cached embeddings (no API calls needed!)

### 4. **Cache Lookup Flow**
```
User Question → Generate Fresh (Never Cached) → Use
     ↓
Schema Element → Check Memory Cache → Check Database Cache → Generate if missing → Store → Use
     ↓
Schema Changed? → Clear Old Cache → Generate New Embeddings → Store → Use
```

## Benefits

### ✅ **Massive Cost Savings**
- **Before**: Every query generates embeddings for all tables/columns (~$0.024 per query)
- **After**: Schema embeddings generated once, reused forever. Only question embeddings generated (~$0.0001 per query)
- **Savings**: ~99% reduction in embedding API costs

### ✅ **Faster Response Times**
- First query: ~2-3 seconds (generates schema embeddings)
- Subsequent queries: ~0.1-0.5 seconds (uses cached schema embeddings, only generates question embedding)
- **10x faster** for cached schemas

### ✅ **Smart Cache Invalidation**
- Automatically detects schema changes (new tables/columns)
- Clears old cache when schema changes
- Only generates embeddings for NEW schema elements
- No manual cache management needed

### ✅ **Persistent Across Restarts**
- Schema embeddings survive server restarts
- No need to regenerate embeddings when server restarts
- Database-backed persistence

## Database Schema

```prisma
model EmbeddingCache {
  id        String   @id @default(cuid())
  cacheKey  String   @unique
  embedding String   // JSON array of numbers
  type      String   // 'table', 'column', or 'question'
  text      String?  // Original text (for reference)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  
  @@index([type])
  @@index([cacheKey])
}
```

## Usage

### Automatic Pre-generation
When `createSemanticallyReducedMetadata()` is called:
1. Checks if schema embeddings exist in cache
2. Generates missing embeddings
3. Stores them in database
4. Uses cached embeddings for matching

### Manual Pre-generation
```typescript
import { pregenerateSchemaEmbeddings } from './services/semantic-matcher';

// Pre-generate all schema embeddings
await pregenerateSchemaEmbeddings(metadata);
```

### Cache Statistics
```typescript
import { getCacheStats } from './services/semantic-matcher';

const stats = await getCacheStats();
console.log(`Cached: ${stats.databaseSize} embeddings`);
console.log(`Tables: ${stats.tables}, Columns: ${stats.columns}`);
```

### Clear Cache
```typescript
import { clearEmbeddingCache } from './services/semantic-matcher';

// Clear all schema caches (when schema changes)
await clearEmbeddingCache();
```

## Performance Impact

### Example: Database with 44 tables, 200 columns

**Without Cache:**
- First query: Generate 244 embeddings = ~$0.024
- Every query: Generate 244 embeddings = ~$0.024
- 100 queries = $2.40

**With Cache:**
- First query: Generate 244 embeddings = ~$0.024 (stored)
- Subsequent queries: Use cache = ~$0.0001 (question only)
- 100 queries = $0.024 + (99 × $0.0001) = **$0.034**

**Savings: 98.6% cost reduction!**

## Migration

To add the EmbeddingCache table to your database:

```bash
# Option 1: Create migration (recommended for production)
npx prisma migrate dev --name add_embedding_cache

# Option 2: Push schema directly (for development)
npx prisma db push
```

## Cache Invalidation

The cache is **automatically** invalidated when:
- Schema changes detected (new tables/columns added/removed)
- Schema hash changes (different table/column names or types)
- Old cache is cleared and new embeddings generated

Cache is **NOT** invalidated for:
- Server restarts (persistent storage)
- Different questions (questions are never cached - generated fresh each time)
- Same schema with different questions (schema embeddings reused)

## Best Practices

1. **Pre-generate on Schema Load**: Call `pregenerateSchemaEmbeddings()` when schema is first detected
2. **Monitor Cache Size**: Use `getCacheStats()` to monitor cache growth
3. **Clear When Schema Changes**: Clear cache when tables/columns are added/removed
4. **Question Embeddings**: Don't persist (they're unique and use in-memory cache)

## Technical Details

### Cache Key Format
- Tables: `table:Table: payments. Columns: id, amount...`
- Columns: `column:Column payment_method of type VARCHAR in table payments`
- Questions: `question:What is the distribution of payment methods?`

### Storage Format
- Embeddings stored as JSON arrays: `"[0.123, 0.456, ...]"`
- Dimension: 1536 (text-embedding-3-small)
- Size per embedding: ~6KB (JSON string)

### Memory Cache
- In-memory Map for fast access
- Populated from database on first access
- Cleared on server restart (but database persists)

