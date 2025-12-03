# Testing Guide for Large Dataset

## 🎯 Overview

This guide helps you test the analytics engine with large datasets to verify all production scalability fixes are working correctly.

---

## 📋 Prerequisites

1. **Start the Next.js server**:
   ```powershell
   cd k_gai
   npm run dev
   ```

2. **Start the Python backend** (if using SQL databases):
   ```powershell
   npm run python:backend
   ```

3. **Install Python dependencies** (for test scripts):
   ```powershell
   pip install requests
   ```

---

## 🚀 Step 1: Generate Test Data

Generate a large dataset with many columns:

```powershell
# Generate 500 students with 66 columns
python scripts/generate_large_school_data.py --rows 500 --output ./uploads

# Generate 1000 students (larger test)
python scripts/generate_large_school_data.py --rows 1000 --output ./uploads

# Generate 2000 students (stress test)
python scripts/generate_large_school_data.py --rows 2000 --output ./uploads
```

**Generated File**: `uploads/comprehensive_student_data.csv`
- **Columns**: 66 dimensions
- **Rows**: Configurable (500-2000+)
- **Size**: ~0.27 MB per 500 rows

---

## 🧪 Step 2: Test Performance

### Option A: Manual Testing (Browser)

1. **Open the application**:
   ```
   http://localhost:3000
   ```

2. **Upload the CSV file**:
   - Click "Upload CSV File"
   - Select `uploads/comprehensive_student_data.csv`
   - Wait for upload to complete

3. **Test queries**:
   - Navigate to "Adhoc Query" tab
   - Try these queries:
     - "What is the average CGPA of all students?"
     - "Show me students with attendance above 90%"
     - "Which class has the highest average math score?"
     - "Compare average scores by gender"
     - "Show top 10 students by total marks"

4. **Monitor performance**:
   - Check browser console for timing logs
   - First query may take longer (embedding generation)
   - Subsequent queries should be faster (cache hit)

### Option B: Automated Testing (Python Script)

Run the automated test script:

```powershell
python scripts/test_large_dataset.py --file ./uploads/comprehensive_student_data.csv
```

This will:
- Upload the file
- Get schema metadata
- Run 10 test queries
- Measure performance metrics
- Print summary statistics

---

## 📊 Expected Performance Metrics

### ✅ Good Performance (After Fixes)

| Metric | Expected | Notes |
|--------|----------|-------|
| **First Query** | 5-15s | Includes embedding generation |
| **Subsequent Queries** | 3-8s | Uses cached embeddings |
| **Schema Loading** | 2-5s | Metadata retrieval |
| **Query Execution** | 1-3s | Actual SQL execution |
| **Memory Usage** | ~30 MB | Bounded by LRU cache |

### ⚠️ Performance Issues (Before Fixes)

| Metric | Before Fixes | Issue |
|--------|--------------|-------|
| **First Query** | 30-60s | Sequential embedding generation |
| **Subsequent Queries** | 15-30s | No caching optimization |
| **Memory Usage** | Unbounded | Grows indefinitely |

---

## 🔍 What to Monitor

### 1. **Embedding Cache Performance**

Check server logs for:
```
[EMBEDDING-CACHE] Processing batch X/Y...
[EMBEDDING-CACHE] Progress: X/Y generated...
[EMBEDDING-CACHE] ✅ Pre-generation complete: X new, Y cached
```

**Expected**: Batch processing with progress updates

### 2. **Memory Usage**

Monitor Node.js memory:
- Should stay around ~30-50 MB
- Should not grow unbounded
- LRU cache should evict old entries

### 3. **Query Generation Time**

Check logs for:
```
[LLM-SERVICE] 📊 Metadata size: X tokens
[LLM-SERVICE] ✅ Semantic analysis complete!
```

**Expected**: 3-8 seconds per query

### 4. **Rate Limiting**

Check for rate limit errors:
- Should not hit OpenAI API rate limits
- Concurrent requests should be limited to 10

---

## 🐛 Troubleshooting

### Issue: Slow Query Generation

**Symptoms**: Queries take >15 seconds

**Solutions**:
1. Check if embeddings are being cached (look for cache hit logs)
2. Verify semantic matching is working (should reduce metadata size)
3. Check OpenAI API response times

### Issue: Memory Usage Growing

**Symptoms**: Memory keeps increasing

**Solutions**:
1. Verify LRU cache is working (check cache stats)
2. Check for memory leaks in other parts of code
3. Restart server if memory gets too high

### Issue: Rate Limit Errors

**Symptoms**: OpenAI API errors about rate limits

**Solutions**:
1. Verify `p-limit` is installed and working
2. Check rate limit configuration (should be 10 concurrent)
3. Reduce batch size if needed

### Issue: Timeout Errors

**Symptoms**: Requests timing out

**Solutions**:
1. Check timeout settings (30 seconds default)
2. Verify Python backend is running (for SQL execution)
3. Check network connectivity

---

## 📈 Performance Benchmarks

### Small Dataset (100 rows, 20 columns)
- **Expected**: <2s per query
- **Memory**: ~10 MB

### Medium Dataset (500 rows, 50 columns)
- **Expected**: 3-8s per query
- **Memory**: ~30 MB

### Large Dataset (1000 rows, 66 columns)
- **Expected**: 5-10s per query
- **Memory**: ~40 MB

### Very Large Dataset (2000+ rows, 66 columns)
- **Expected**: 8-15s per query
- **Memory**: ~50 MB

---

## ✅ Success Criteria

Your fixes are working correctly if:

1. ✅ **Embedding generation** completes in batches (not sequential)
2. ✅ **Memory usage** stays bounded (~30-50 MB)
3. ✅ **Query generation** takes 3-8 seconds (after first query)
4. ✅ **No rate limit errors** from OpenAI API
5. ✅ **No timeout errors** for normal queries
6. ✅ **Results are accurate** (queries return correct data)
7. ✅ **Cache hit rate** improves after first query

---

## 🎉 Next Steps

After successful testing:

1. **Deploy to production** with confidence
2. **Monitor** performance metrics in production
3. **Scale up** gradually (start with smaller datasets)
4. **Optimize** further based on real-world usage patterns

---

## 📝 Test Report Template

After testing, document your results:

```
Test Date: [Date]
Dataset: comprehensive_student_data.csv
Rows: [Number]
Columns: [Number]

Results:
- Average Query Time: [X]s
- Memory Usage: [X] MB
- Cache Hit Rate: [X]%
- Success Rate: [X]%

Issues Found:
- [List any issues]

Performance Rating: [Good/Fair/Poor]
```

---

Happy Testing! 🚀

