# How to Enable Agents - Current Status

## ✅ Current Status: **PREVIOUS SYSTEM** (Direct LLM)

**From your terminal logs:**
- ✅ No module errors (fixed!)
- ✅ Queries working: `POST /api/analytics 200`
- ❌ No agent logs: Missing `[AGENT]` or `[API] Using LangGraph agent`
- ⚠️ Agents available but **NOT ENABLED**

---

## 🚀 How to Enable Agents

### Option 1: Enable via Environment Variables (Easiest)

Add to `.env.local`:

```env
# Enable LangGraph agent globally
USE_LANGGRAPH_AGENT=true

# OR enable Python agent globally (for SQL databases)
USE_AGENT_BASED_QUERIES=true

# For frontend (optional)
NEXT_PUBLIC_USE_LANGGRAPH_AGENT=true
NEXT_PUBLIC_USE_AGENT_BASED_QUERIES=true
```

**Then restart Next.js server:**
```bash
# Stop server (Ctrl+C)
npm run dev
```

### Option 2: Enable Per Request (API)

Add flags to your API request:

```typescript
// For LangGraph agent
{
  mode: 'ADHOC_QUERY',
  user_question: '...',
  metadata: {...},
  use_langgraph: true  // ← Add this
}

// For Python agent (SQL databases)
{
  mode: 'ADHOC_QUERY',
  user_question: '...',
  metadata: {...},
  use_agent: true,  // ← Add this
  connection_string: 'mysql://...'  // Required for SQL_DB
}
```

### Option 3: Frontend Component (Updated)

I've updated `AdhocQuery.tsx` to automatically use agents if environment variables are set.

---

## 🔍 How to Verify Agents Are Working

### Check Terminal Logs:

**Previous System (Current):**
```
POST /api/analytics 200 in 8870ms
(No agent logs)
```

**New System (With Agents):**
```
[API] Using LangGraph agent for query generation
[AGENT] Analyzing question complexity
[AGENT] Exploring schema
[AGENT] Generating SQL query
[AGENT] Validating query
POST /api/analytics 200 in 15000ms
```

**OR:**
```
[API] Using Python agent for query generation
[PYTHON-AGENT] Using Python agent for query generation
[PYTHON API] Agent query generation for: ...
POST /api/analytics 200 in 8000ms
```

---

## 📊 Quick Test

### Test LangGraph Agent:

```bash
curl -X POST http://localhost:3000/api/analytics \
  -H "Content-Type: application/json" \
  -d '{
    "mode": "ADHOC_QUERY",
    "user_question": "Show top 10 students by CGPA",
    "use_langgraph": true,
    "metadata": {
      "source_type": "CSV_FILE",
      "tables": [{
        "name": "students",
        "columns": [
          {"name": "full_name", "type": "TEXT"},
          {"name": "cgpa", "type": "DECIMAL"}
        ]
      }]
    }
  }'
```

**Expected:** You should see `[AGENT]` logs in terminal.

---

## ✅ Summary

**Current:** Using **previous direct LLM** (working fine)  
**To Enable:** Add `USE_LANGGRAPH_AGENT=true` to `.env.local` and restart  
**Status:** ✅ Agents installed and ready, just need to be enabled

**The system works perfectly either way!** Agents add more intelligence but are optional.

