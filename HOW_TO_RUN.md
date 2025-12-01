# How to Run AgentGraph Integration

## 🚀 Quick Start (3 Steps)

### Step 1: Install Dependencies

**TypeScript/Node.js:**
```bash
cd k_gai
npm install
```

**Python (for Python agent):**
```bash
cd k_gai/analytics-engine/python-backend
pip install -r requirements.txt
```

Or use npm script:
```bash
npm run python:install
```

### Step 2: Set Environment Variables

Create/update `.env.local`:
```env
OPENAI_API_KEY=sk-your-api-key-here
OPENAI_MODEL=gpt-4-turbo-preview

# Optional: Enable agents globally
USE_AGENT_BASED_QUERIES=true
USE_LANGGRAPH_AGENT=true

# Optional: Python backend URL (if different)
PYTHON_BACKEND_URL=http://localhost:8000
```

### Step 3: Start Services

**Terminal 1 - Next.js Frontend:**
```bash
cd k_gai
npm run dev
```
✅ Server runs on: http://localhost:3000

**Terminal 2 - Python Backend (Optional, for Python agent):**
```bash
npm run python:backend
```
Or manually:
```bash
cd analytics-engine/python-backend
python api_server.py
```
✅ Server runs on: http://localhost:8000

---

## 🧪 Testing Methods

### Method 1: Browser UI (Easiest)

1. Open: `http://localhost:3000/analytics`
2. Click "Adhoc Query" tab
3. Type your question: "What is the average CGPA?"
4. Click "Ask"
5. Check browser console (F12) for agent logs

**To use LangGraph agent:**
- Add `?use_langgraph=true` to URL, OR
- Set `USE_LANGGRAPH_AGENT=true` in `.env.local`

### Method 2: API via curl

**Direct LLM (no agent):**
```bash
curl -X POST http://localhost:3000/api/analytics \
  -H "Content-Type: application/json" \
  -d '{
    "mode": "ADHOC_QUERY",
    "user_question": "What is the average CGPA?",
    "metadata": {
      "source_type": "CSV_FILE",
      "tables": [{
        "name": "students",
        "columns": [
          {"name": "cgpa", "type": "DECIMAL"}
        ]
      }]
    }
  }'
```

**LangGraph Agent:**
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

**Python Agent (SQL databases):**
```bash
curl -X POST http://localhost:3000/api/analytics \
  -H "Content-Type: application/json" \
  -d '{
    "mode": "ADHOC_QUERY",
    "user_question": "What is the average CGPA by academic stream?",
    "use_agent": true,
    "connection_string": "mysql://user:pass@localhost:3306/db",
    "metadata": {
      "source_type": "SQL_DB",
      "tables": [{
        "name": "students",
        "columns": [
          {"name": "cgpa", "type": "DECIMAL"},
          {"name": "academic_stream", "type": "VARCHAR"}
        ]
      }]
    }
  }'
```

### Method 3: Test Python Backend Directly

```bash
# Test agent endpoint
curl -X POST http://localhost:8000/agent/query \
  -H "Content-Type: application/json" \
  -d '{
    "question": "What is the average CGPA?",
    "connection_string": "mysql://user:pass@localhost:3306/db"
  }'

# Test schema exploration
curl -X POST http://localhost:8000/agent/explore-schema \
  -H "Content-Type: application/json" \
  -d '{
    "question": "Show students by academic stream",
    "connection_string": "mysql://user:pass@localhost:3306/db"
  }'
```

---

## ✅ Expected Results

### Successful Response:
```json
{
  "query_type": "SQL_QUERY",
  "query_content": "SELECT AVG(cgpa) as avg_cgpa FROM students",
  "visualization_type": "auto",
  "insight_summary": "This query calculates the average CGPA across all students..."
}
```

### Console Output (LangGraph):
```
[AGENT] Analyzing question complexity
[AGENT] Exploring schema
[AGENT] Generating SQL query
[AGENT] Validating query
[LLM-SERVICE] Using LangGraph agent for query generation
```

### Console Output (Python Agent):
```
[API] Using Python agent for query generation
[PYTHON-AGENT] Using Python agent for query generation
[PYTHON API] Agent query generation for: What is the average CGPA...
[PYTHON API] Agent query generated successfully
```

---

## 🔧 Troubleshooting

### Issue: "LangChain dependencies not found"
**Solution:**
```bash
npm install @langchain/openai langchain langchain-community
```

### Issue: "Python backend error" or "Connection refused"
**Solution:**
1. Make sure Python backend is running:
   ```bash
   npm run python:backend
   ```
2. Check Python dependencies:
   ```bash
   pip install langchain langchain-openai langchain-community
   ```

### Issue: "OPENAI_API_KEY is not set"
**Solution:**
1. Add to `.env.local`:
   ```env
   OPENAI_API_KEY=sk-your-key-here
   ```
2. Restart Next.js server

### Issue: "Port 3000 already in use"
**Solution:**
```bash
# Use different port
PORT=3001 npm run dev
```

### Issue: Agent not being used
**Check:**
1. Is `use_agent: true` or `use_langgraph: true` in request?
2. Is `USE_AGENT_BASED_QUERIES=true` in `.env.local`?
3. For SQL databases, is `connection_string` provided?

---

## 📊 Performance

Expected response times:
- **Direct LLM**: 2-5 seconds
- **LangGraph Agent**: 5-10 seconds (multi-step)
- **Python Agent**: 3-8 seconds (includes backend call)

---

## 🎯 Quick Test Checklist

- [ ] Dependencies installed (`npm install`, `pip install -r requirements.txt`)
- [ ] `.env.local` configured with `OPENAI_API_KEY`
- [ ] Next.js server running (`npm run dev`)
- [ ] Python backend running (optional, `npm run python:backend`)
- [ ] Test query works via browser or API
- [ ] Check console logs for agent activity

---

**Ready?** Start with: `npm run dev` and visit `http://localhost:3000/analytics`

