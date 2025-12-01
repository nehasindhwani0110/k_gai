# AgentGraph Integration - Quick Start Guide

This guide will help you quickly integrate AgentGraph (LangChain SQL Agents) into your analytics engine for better SQL query generation and large database handling.

## ⚡ Quick Commands (Copy & Paste)

```bash
# 1. Install dependencies
npm install
cd analytics-engine/python-backend && pip install -r requirements.txt && cd ../..

# 2. Start Python backend (Terminal 1)
cd analytics-engine/python-backend
python api_server.py

# 3. Start Next.js server (Terminal 2 - new terminal)
npm run dev

# 4. Open browser
# Go to: http://localhost:3000/analytics
```

**That's it!** The agents are now running. See below for detailed testing instructions.

## 🚀 How to Run - Step by Step

### Step 1: Install Dependencies

**TypeScript/Node.js:**
```bash
npm install
```

**Python Backend:**
```bash
cd analytics-engine/python-backend
pip install -r requirements.txt
```

This installs:
- LangChain packages (for agents)
- All other dependencies

### Step 2: Set Environment Variables

Create/update `.env.local` in project root:

```env
# OpenAI API (REQUIRED)
OPENAI_API_KEY=sk-your-api-key-here
OPENAI_MODEL=gpt-4-turbo-preview

# Agent Configuration (OPTIONAL)
USE_AGENT_BASED_QUERIES=false  # Set to true to enable Python agent globally
USE_LANGGRAPH_AGENT=false      # Set to true to enable LangGraph agent globally

# Python Backend (OPTIONAL - defaults shown)
PYTHON_BACKEND_URL=http://localhost:8000

# Database (if using SQL databases)
DATABASE_URL=sqlite:./dev.db
```

### Step 3: Start Python Backend (Terminal 1)

```bash
cd analytics-engine/python-backend
python api_server.py
```

**Expected output:**
```
[PYTHON API] Starting server on port 8000...
[PYTHON API] Health check: http://localhost:8000/health
[PYTHON API] Introspect endpoint: http://localhost:8000/introspect
[PYTHON API] Execute endpoint: http://localhost:8000/execute
[PYTHON API] Agent query endpoint: http://localhost:8000/agent/query
[PYTHON API] Agent explore-schema endpoint: http://localhost:8000/agent/explore-schema
```

**Note:** If you see "Agent endpoints not available", install LangChain:
```bash
pip install langchain langchain-openai langchain-community
```

### Step 4: Start Next.js Server (Terminal 2)

```bash
npm run dev
```

**Expected output:**
```
▲ Next.js 14.0.0
- Local:        http://localhost:3000
- Ready in 2.3s
```

### Step 5: Test the Agents

#### Option A: Test via Browser (Easiest)

1. Open: `http://localhost:3000/analytics`
2. Go to "Adhoc Query" tab
3. Type a question: "What is the average CGPA?"
4. Click "Ask"
5. Check browser console (F12) for agent logs

#### Option B: Test via API (curl)

**Test Direct LLM (no agent):**
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
        "description": "Student data",
        "columns": [
          {"name": "cgpa", "description": "CGPA", "type": "DECIMAL"}
        ]
      }]
    }
  }'
```

**Test LangGraph Agent:**
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
        "description": "Student data",
        "columns": [
          {"name": "full_name", "description": "Name", "type": "TEXT"},
          {"name": "cgpa", "description": "CGPA", "type": "DECIMAL"}
        ]
      }]
    }
  }'
```

**Test Python Agent (requires SQL database):**
```bash
curl -X POST http://localhost:3000/api/analytics \
  -H "Content-Type: application/json" \
  -d '{
    "mode": "ADHOC_QUERY",
    "user_question": "What is the average CGPA by academic stream?",
    "use_agent": true,
    "connection_string": "mysql://user:password@localhost:3306/database",
    "metadata": {
      "source_type": "SQL_DB",
      "tables": [{
        "name": "students",
        "description": "Student data",
        "columns": [
          {"name": "cgpa", "description": "CGPA", "type": "DECIMAL"},
          {"name": "academic_stream", "description": "Stream", "type": "VARCHAR"}
        ]
      }]
    }
  }'
```

#### Option C: Test Python Agent Directly

```bash
# Test Python agent endpoint
curl -X POST http://localhost:8000/agent/query \
  -H "Content-Type: application/json" \
  -d '{
    "question": "What is the average CGPA?",
    "connection_string": "mysql://user:pass@localhost:3306/db"
  }'
```

## ✅ That's It! You're Running!

### What You Should See:

**In Browser Console (F12):**
```
[API] Using LangGraph agent for query generation
[AGENT] Analyzing question complexity
[AGENT] Exploring schema
[AGENT] Generating SQL query
[AGENT] Validating query
Query generated successfully!
```

**In Python Backend Terminal:**
```
[PYTHON API] Agent query generation for: What is the average CGPA...
[PYTHON API] Agent query generated successfully
```

**API Response:**
```json
{
  "query_type": "SQL_QUERY",
  "query_content": "SELECT AVG(cgpa) as avg_cgpa FROM students",
  "visualization_type": "auto",
  "insight_summary": "This query calculates the average CGPA..."
}
```

### The system will now:
1. ✅ Use LangChain SQL Agent for query generation (if enabled)
2. ✅ Dynamically explore database schemas
3. ✅ Generate more accurate queries
4. ✅ Handle large databases efficiently
5. ✅ Automatically fallback if agent fails

## 🔄 Fallback Behavior

If agent generation fails, the system automatically falls back to the original direct LLM method, so your system remains stable.

## 📊 When to Use Agents

**Use Agents For:**
- ✅ Large databases (many tables)
- ✅ Complex queries requiring schema exploration
- ✅ SQL databases (not CSV files)
- ✅ Queries that need refinement

**Use Direct LLM For:**
- ✅ CSV files (agents not needed)
- ✅ Simple queries
- ✅ When you have complete schema metadata
- ✅ Faster response times needed

## 🎯 Example Usage in Code

### Frontend Component (TypeScript/React)

```typescript
// In your component
const handleQuery = async (question: string) => {
  const response = await fetch('/api/analytics', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      mode: 'ADHOC_QUERY',
      user_question: question,
      metadata: dataSourceMetadata,
      
      // Choose one:
      use_langgraph: true,        // Use LangGraph agent
      // OR
      use_agent: true,            // Use Python agent (for SQL_DB)
      connection_string: connectionString, // Required for Python agent
    }),
  });
  
  const result = await response.json();
  console.log('Generated Query:', result.query_content);
  console.log('Insight:', result.insight_summary);
};
```

### Enable Agents Globally

Instead of passing `use_agent` or `use_langgraph` in each request, you can enable globally in `.env.local`:

```env
USE_AGENT_BASED_QUERIES=true   # Enable Python agent for all requests
USE_LANGGRAPH_AGENT=true       # Enable LangGraph agent for all requests
```

### API Response

Same format as before - no changes needed to your frontend!

```json
{
  "query_type": "SQL_QUERY",
  "query_content": "SELECT ...",
  "visualization_type": "auto",
  "insight_summary": "..."
}
```

## 🔍 Monitoring

Check Python backend logs to see agent activity:

```
[PYTHON API] Agent query generation for: What is the average CGPA...
[PYTHON API] Agent query generated successfully
```

## ⚠️ Troubleshooting

### Agent endpoints not available?

1. Check Python dependencies:
   ```bash
   pip list | grep langchain
   ```

2. Check Python backend logs for import errors

3. Verify Python backend is running:
   ```bash
   curl http://localhost:8000/health
   ```

### Agent generation fails?

- System automatically falls back to direct LLM
- Check Python backend logs for detailed errors
- Verify database connection string is correct
- Ensure OpenAI API key is set

## 📚 Next Steps

- Read `AGENTGRAPH_INTEGRATION.md` for detailed implementation
- Check [LangChain SQL Agent docs](https://js.langchain.com/docs/use_cases/sql/)
- Review [AgentGraph GitHub](https://github.com/Farzad-R/Advanced-QA-and-RAG-Series)

## 🎉 Benefits You'll See

1. **Better Query Accuracy**: Agents explore schemas dynamically
2. **Large DB Handling**: Only explores relevant tables
3. **Self-Correction**: Refines queries automatically
4. **Complex Queries**: Handles multi-step reasoning

---

**Questions?** Check the full integration guide: `AGENTGRAPH_INTEGRATION.md`

