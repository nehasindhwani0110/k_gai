# How to Verify Semantic Search is Working

## Quick Checklist

When you run a query, look for these log messages in your terminal/console:

### ✅ **Semantic Search is ACTIVE** - Look for these logs:

```
================================================================================
[SEMANTIC-MATCHER] 🚀 SEMANTIC ANALYSIS ACTIVATED
================================================================================
[SEMANTIC-MATCHER] 🎯 Starting semantic table matching
[SEMANTIC-MATCHER] Question: "your question here"
[SEMANTIC-MATCHER] Total tables available: X
[SEMANTIC-MATCHER] 📊 Step 1: Generating question embedding...
[SEMANTIC-MATCHER] 🔄 Generating embedding for question: "..."
[SEMANTIC-MATCHER] ✅ Embedding generated and cached (dimension: 1536)
[SEMANTIC-MATCHER] 📊 Step 2: Processing X tables in batches...
[SEMANTIC-MATCHER] ✅ Semantic matching complete!
[SEMANTIC-MATCHER] Top 5 matches:
[SEMANTIC-MATCHER]   1. table_name                    Score: 0.856 ████████████████
[SEMANTIC-MATCHER]   2. another_table                 Score: 0.742 ████████████
...
================================================================================
[SEMANTIC-MATCHER] ✅ SEMANTIC ANALYSIS COMPLETE
================================================================================
[SEMANTIC-MATCHER] 📈 Results Summary:
[SEMANTIC-MATCHER]   Original: 20 tables, 150 columns
[SEMANTIC-MATCHER]   Reduced:  5 tables, 45 columns
[SEMANTIC-MATCHER]   Reduction: 70.0% fewer columns
[SEMANTIC-MATCHER]   Cache: 25 embeddings cached
================================================================================
```

### ⚠️ **Semantic Search FAILED** - Look for these logs:

```
[LLM-SERVICE] ⚠️ Semantic matching failed, trying schema exploration: [error]
[LLM-SERVICE] 🔄 Falling back to schema exploration...
```

or

```
[SCHEMA-EXPLORER] ⚠️ Semantic matching failed, using LLM fallback: [error]
[SCHEMA-EXPLORER] 🔄 Falling back to LLM-based selection...
```

## What to Look For

### 1. **Embedding Generation**
- ✅ **Cache HIT**: `[SEMANTIC-MATCHER] ✅ Cache HIT for question: "..."`
- 🔄 **New Embedding**: `[SEMANTIC-MATCHER] 🔄 Generating embedding for question: "..."`
- ✅ **Success**: `[SEMANTIC-MATCHER] ✅ Embedding generated and cached (dimension: 1536)`

### 2. **Similarity Scores**
- Scores range from 0.0 to 1.0
- Higher scores = better semantic match
- Look for scores > 0.5 (moderate match) or > 0.7 (good match)
- Visual bars show score magnitude: `████████████` = high score

### 3. **Reduction Statistics**
- Shows how many tables/columns were filtered out
- Example: "Reduction: 70.0% fewer columns" means 70% were filtered out
- This proves semantic search is working and reducing context size

### 4. **Cache Statistics**
- Shows how many embeddings are cached
- Cache grows as you ask more questions
- Cache hits = faster responses and lower costs

## Example Output When Working

```
[LLM-SERVICE] 🎯 Attempting semantic analysis for question: "What is the distribution of payment methods?"

================================================================================
[SEMANTIC-MATCHER] 🚀 SEMANTIC ANALYSIS ACTIVATED
================================================================================
[SEMANTIC-MATCHER] 🎯 Starting semantic table matching
[SEMANTIC-MATCHER] Question: "What is the distribution of payment methods?"
[SEMANTIC-MATCHER] Total tables available: 15
[SEMANTIC-MATCHER] Looking for top 5 matches

[SEMANTIC-MATCHER] 📊 Step 1: Generating question embedding...
[SEMANTIC-MATCHER] 🔄 Generating embedding for question: "What is the distribution of payment methods?"
[SEMANTIC-MATCHER] ✅ Embedding generated and cached (dimension: 1536)
[SEMANTIC-MATCHER] 📊 Step 2: Processing 15 tables in batches...
[SEMANTIC-MATCHER]   Processing batch 1 (tables 1-10)...
[SEMANTIC-MATCHER] 🔄 Generating embedding for schema element: "Table: payments. Columns: id, amount, payment_method..."
[SEMANTIC-MATCHER] ✅ Embedding generated and cached (dimension: 1536)
...

[SEMANTIC-MATCHER] ✅ Semantic matching complete!
[SEMANTIC-MATCHER] Top 5 matches:
[SEMANTIC-MATCHER]   1. payments                        Score: 0.892 ████████████████████
[SEMANTIC-MATCHER]   2. transactions                     Score: 0.756 ███████████████
[SEMANTIC-MATCHER]   3. customer_payments                 Score: 0.634 ███████████
[SEMANTIC-MATCHER]   4. orders                            Score: 0.521 █████████
[SEMANTIC-MATCHER]   5. invoices                          Score: 0.445 ████████
[SEMANTIC-MATCHER] Cache stats: 16 embeddings cached

[SEMANTIC-MATCHER] 📊 Step 3: Finding relevant columns for each table...

[SEMANTIC-MATCHER]   Top 10 columns for table "payments":
[SEMANTIC-MATCHER]     1. payment_method                 Score: 0.923
[SEMANTIC-MATCHER]     2. payment_type                   Score: 0.856
[SEMANTIC-MATCHER]     3. method                         Score: 0.789
...

================================================================================
[SEMANTIC-MATCHER] ✅ SEMANTIC ANALYSIS COMPLETE
================================================================================
[SEMANTIC-MATCHER] 📈 Results Summary:
[SEMANTIC-MATCHER]   Original: 15 tables, 120 columns
[SEMANTIC-MATCHER]   Reduced:  5 tables, 35 columns
[SEMANTIC-MATCHER]   Reduction: 70.8% fewer columns
[SEMANTIC-MATCHER]   Cache: 16 embeddings cached
================================================================================

[LLM-SERVICE] ✅ Semantic analysis successful! Using 5 relevant tables
```

## Troubleshooting

### If you don't see semantic analysis logs:

1. **Check if you have many tables**: Semantic search only activates when you have > 10 tables
2. **Check for errors**: Look for error messages that might cause fallback
3. **Check CSV files**: Semantic search works best with SQL databases, but also works with CSV files

### If semantic search fails:

1. **Check OpenAI API key**: Ensure `OPENAI_API_KEY` is set
2. **Check API limits**: Ensure you haven't hit rate limits
3. **Check network**: Ensure you can reach OpenAI API
4. **Check logs**: Look for specific error messages

## Performance Indicators

### ✅ **Good Performance**:
- Cache hits increase over time
- Similarity scores are > 0.5
- Significant reduction in columns (50%+)
- Fast response times (< 2 seconds for semantic matching)

### ⚠️ **Issues**:
- Many cache misses (every query generates new embeddings)
- Low similarity scores (< 0.3)
- No reduction in columns
- Slow response times (> 5 seconds)

## Quick Test

Run this query to test semantic search:

```
"What is the distribution of payment methods?"
```

You should see:
1. Semantic analysis activation logs
2. Embedding generation
3. Similarity scores for tables
4. Column matching for selected tables
5. Reduction statistics

If you see all of these, **semantic search is working!** ✅

