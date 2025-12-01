# How to Check Which System is Running

## 🔍 Current Status

Based on your terminal output, you're using the **PREVIOUS direct LLM system**, not the new agents.

**Evidence:**
- ⚠️ Warning: `Module not found: Can't resolve 'langchain-community/utilities/sql_database'`
- ✅ Queries work: `POST /api/analytics 200` (falling back to direct LLM)
- ❌ No agent logs: Missing `[AGENT]` or `[API] Using LangGraph agent`

---

## ✅ How to Enable New Agent System

### Step 1: Install Missing Package

```bash
npm install langchain-community
```

### Step 2: Restart Next.js Server

```bash
# Stop current server (Ctrl+C)
npm run dev
```

### Step 3: Test with Agent

**Option A: Enable LangGraph Agent**
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

**Option B: Enable Python Agent (for SQL databases)**
```bash
curl -X POST http://localhost:3000/api/analytics \
  -H "Content-Type: application/json" \
  -d '{
    "mode": "ADHOC_QUERY",
    "user_question": "What is the average CGPA?",
    "use_agent": true,
    "connection_string": "mysql://user:pass@localhost:3306/db",
    "metadata": {
      "source_type": "SQL_DB",
      "tables": [...]
    }
  }'
```

---

## 🔍 How to Verify Which System is Running

### Check Terminal Logs:

**Previous System (Direct LLM):**
```
POST /api/analytics 200 in 9911ms
⚠ Module not found: Can't resolve 'langchain-community/utilities/sql_database'
```

**New System (LangGraph Agent):**
```
[API] Using LangGraph agent for query generation
[AGENT] Analyzing question complexity
[AGENT] Exploring schema
[AGENT] Generating SQL query
[AGENT] Validating query
POST /api/analytics 200 in 15000ms
```

**New System (Python Agent):**
```
[API] Using Python agent for query generation
[PYTHON-AGENT] Using Python agent for query generation
[PYTHON API] Agent query generation for: What is the average CGPA...
[PYTHON API] Agent query generated successfully
POST /api/analytics 200 in 8000ms
```

---

## 📊 Comparison

| System | Logs Show | Response Time | Status |
|--------|-----------|---------------|--------|
| **Previous (Direct LLM)** | No `[AGENT]` logs | ~2-5 seconds | ✅ Working (your current) |
| **LangGraph Agent** | `[AGENT] Analyzing...` | ~5-10 seconds | ⚠️ Not enabled |
| **Python Agent** | `[PYTHON API] Agent...` | ~3-8 seconds | ⚠️ Not enabled |

---

## 🚀 Quick Fix

```bash
# 1. Install missing package
npm install langchain-community

# 2. Restart server
# Stop current (Ctrl+C), then:
npm run dev

# 3. Test with agent flag
# Add "use_langgraph": true to your API request
```

---

## ✅ After Fix

You should see:
- ✅ No module warnings
- ✅ `[AGENT]` logs in console
- ✅ Better query accuracy (especially for complex queries)

**Your current system works fine** - it's just using the simpler direct LLM method. The agents add more intelligence but are optional.

