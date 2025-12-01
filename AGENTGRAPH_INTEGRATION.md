# AgentGraph Integration Guide

## Overview

This guide explains how to integrate **AgentGraph** (LangGraph + LangChain SQL Agents) into your existing analytics engine to improve SQL query generation and handle large databases more effectively.

**Reference:**
- GitHub: [AgentGraph-Intelligent-Q&A-and-RAG-System](https://github.com/Farzad-R/Advanced-QA-and-RAG-Series/tree/main/AgentGraph-Intelligent-Q%26A-and-RAG-System)
- YouTube: [Video Tutorial](https://youtu.be/xsCedrNP9w8?si=GkM5JocxIoUtI3Ri)

---

## 🎯 Benefits of Integration

### Current System Limitations:
1. **Static Prompt-Based**: Uses a single large prompt template
2. **No Schema Exploration**: Relies on pre-provided metadata
3. **No Query Refinement**: Single-shot query generation
4. **Limited Error Recovery**: Fails if query is incorrect
5. **No Tool Selection**: Can't choose between different strategies

### AgentGraph Advantages:
1. **Dynamic Schema Exploration**: SQL agents can explore database schemas on-the-fly
2. **Multi-Step Reasoning**: Can break complex queries into steps
3. **Self-Correction**: Can refine queries based on errors
4. **Tool Selection**: Automatically chooses best approach
5. **Better Large DB Handling**: Efficiently handles databases with many tables
6. **Query Validation**: Tests queries before final execution

---

## 📦 Required Dependencies

Add these to your `package.json`:

```json
{
  "dependencies": {
    "@langchain/langgraph": "^0.0.20",
    "@langchain/core": "^0.1.0",
    "@langchain/openai": "^0.0.14",
    "langchain": "^0.1.0",
    "langchain-community": "^0.0.20",
    "@langchain/community": "^0.0.20"
  }
}
```

**Python Backend** (`analytics-engine/python-backend/requirements.txt`):
```
langchain>=0.1.0
langchain-openai>=0.0.5
langchain-community>=0.0.20
langgraph>=0.0.20
sqlalchemy>=2.0.0
```

---

## 🏗 Architecture Integration

### Current Flow:
```
User Question → LLM Service (Direct OpenAI) → SQL Query → Execute
```

### New Agent-Based Flow:
```
User Question → LangGraph Agent → Schema Exploration → Query Generation → 
Query Validation → Refinement (if needed) → Execute → Results
```

---

## 📁 File Structure

Create these new files:

```
k_gai/
├── analytics-engine/
│   ├── services/
│   │   ├── llm-service.ts (existing - keep for fallback)
│   │   ├── agent-service.ts (NEW - AgentGraph integration)
│   │   ├── sql-agent.ts (NEW - SQL agent wrapper)
│   │   └── agent-tools.ts (NEW - Tool definitions)
│   └── agents/
│       ├── query-agent.ts (NEW - LangGraph agent)
│       └── tools/
│           ├── schema-explorer.ts (NEW - Schema exploration tool)
│           ├── query-validator.ts (NEW - Query validation tool)
│           └── query-executor-tool.ts (NEW - Execution tool)
```

---

## 🔧 Implementation Steps

### Step 1: Install Dependencies

```bash
npm install @langchain/langgraph @langchain/core @langchain/openai langchain langchain-community
```

### Step 2: Create SQL Agent Service

**File:** `analytics-engine/services/sql-agent.ts`

This service wraps LangChain's SQL agent to provide dynamic schema exploration.

### Step 3: Create LangGraph Agent

**File:** `analytics-engine/agents/query-agent.ts`

This creates a LangGraph workflow that:
1. Analyzes user question
2. Explores schema if needed
3. Generates query
4. Validates query
5. Refines if needed
6. Returns final query

### Step 4: Update LLM Service

**File:** `analytics-engine/services/llm-service.ts`

Add a new function that uses the agent-based approach while keeping existing functions for backward compatibility.

### Step 5: Update API Route

**File:** `app/api/analytics/route.ts`

Add a flag to use agent-based generation: `use_agent: true`

---

## 💻 Code Implementation

### 1. SQL Agent Service

```typescript
// analytics-engine/services/sql-agent.ts
import { ChatOpenAI } from "@langchain/openai";
import { createSqlAgent } from "langchain/agents";
import { SqlToolkit } from "langchain/agents/toolkits/sql";
import { createSqlAgentExecutor } from "langchain/agents/toolkits/sql";
import { DataSource } from "typeorm";

export class SQLAgentService {
  private llm: ChatOpenAI;
  
  constructor() {
    this.llm = new ChatOpenAI({
      modelName: process.env.OPENAI_MODEL || "gpt-4-turbo-preview",
      temperature: 0,
      openAIApiKey: process.env.OPENAI_API_KEY,
    });
  }

  async generateQuery(
    userQuestion: string,
    connectionString: string,
    metadata?: DataSourceMetadata
  ): Promise<string> {
    // Create SQL toolkit with connection
    const toolkit = new SqlToolkit({
      db: await this.createDatabaseConnection(connectionString),
      llm: this.llm,
    });

    // Create SQL agent
    const executor = createSqlAgentExecutor({
      llm: this.llm,
      toolkit,
      verbose: true,
    });

    // Execute agent
    const result = await executor.invoke({
      input: userQuestion,
    });

    return result.output;
  }

  private async createDatabaseConnection(connectionString: string) {
    // Create database connection using SQLAlchemy (via Python backend)
    // or use a TypeScript SQL library
    // This is a placeholder - implement based on your DB type
  }
}
```

### 2. LangGraph Query Agent

```typescript
// analytics-engine/agents/query-agent.ts
import { StateGraph, END, START } from "@langchain/langgraph";
import { ChatOpenAI } from "@langchain/openai";
import { ToolNode } from "@langchain/langgraph/prebuilt";
import { DataSourceMetadata } from "../types";

interface AgentState {
  question: string;
  metadata: DataSourceMetadata;
  query?: string;
  validation_result?: any;
  error?: string;
  step: number;
}

export class QueryAgent {
  private graph: StateGraph<AgentState>;
  private llm: ChatOpenAI;

  constructor() {
    this.llm = new ChatOpenAI({
      modelName: process.env.OPENAI_MODEL || "gpt-4-turbo-preview",
      temperature: 0.2,
    });

    this.buildGraph();
  }

  private buildGraph() {
    this.graph = new StateGraph<AgentState>({
      channels: {
        question: { reducer: (x, y) => y ?? x },
        metadata: { reducer: (x, y) => y ?? x },
        query: { reducer: (x, y) => y ?? x },
        validation_result: { reducer: (x, y) => y ?? x },
        error: { reducer: (x, y) => y ?? x },
        step: { reducer: (x, y) => (y ?? x) + 1 },
      },
    });

    // Add nodes
    this.graph.addNode("analyze_question", this.analyzeQuestion.bind(this));
    this.graph.addNode("explore_schema", this.exploreSchema.bind(this));
    this.graph.addNode("generate_query", this.generateQuery.bind(this));
    this.graph.addNode("validate_query", this.validateQuery.bind(this));
    this.graph.addNode("refine_query", this.refineQuery.bind(this));

    // Add edges
    this.graph.addEdge(START, "analyze_question");
    this.graph.addEdge("analyze_question", "explore_schema");
    this.graph.addEdge("explore_schema", "generate_query");
    this.graph.addEdge("generate_query", "validate_query");
    this.graph.addConditionalEdges(
      "validate_query",
      this.shouldRefine.bind(this),
      {
        refine: "refine_query",
        done: END,
      }
    );
    this.graph.addEdge("refine_query", "generate_query");
  }

  private async analyzeQuestion(state: AgentState): Promise<Partial<AgentState>> {
    // Analyze question complexity
    return { step: state.step + 1 };
  }

  private async exploreSchema(state: AgentState): Promise<Partial<AgentState>> {
    // Explore schema if needed for large databases
    // Can query information_schema dynamically
    return { step: state.step + 1 };
  }

  private async generateQuery(state: AgentState): Promise<Partial<AgentState>> {
    // Generate SQL query using LLM
    const prompt = `Generate SQL query for: ${state.question}\n\nSchema: ${JSON.stringify(state.metadata)}`;
    const response = await this.llm.invoke(prompt);
    return { query: response.content as string, step: state.step + 1 };
  }

  private async validateQuery(state: AgentState): Promise<Partial<AgentState>> {
    // Validate query syntax and security
    // Return validation result
    return { validation_result: { valid: true }, step: state.step + 1 };
  }

  private shouldRefine(state: AgentState): string {
    if (state.validation_result?.valid) {
      return "done";
    }
    return state.step < 3 ? "refine" : "done"; // Max 3 refinements
  }

  private async refineQuery(state: AgentState): Promise<Partial<AgentState>> {
    // Refine query based on validation errors
    return { step: state.step + 1 };
  }

  async execute(question: string, metadata: DataSourceMetadata): Promise<string> {
    const initialState: AgentState = {
      question,
      metadata,
      step: 0,
    };

    const result = await this.graph.invoke(initialState);
    return result.query || "";
  }
}
```

### 3. Updated LLM Service with Agent Support

```typescript
// analytics-engine/services/llm-service.ts (additions)

import { QueryAgent } from '../agents/query-agent';
import { SQLAgentService } from './sql-agent';

const USE_AGENT = process.env.USE_AGENT_BASED_QUERIES === 'true';
const queryAgent = USE_AGENT ? new QueryAgent() : null;
const sqlAgentService = USE_AGENT ? new SQLAgentService() : null;

export async function generateAdhocQueryWithAgent(
  userQuestion: string,
  metadata: DataSourceMetadata,
  connectionString?: string
): Promise<AdhocQueryResponse> {
  if (!queryAgent) {
    // Fallback to original method
    return generateAdhocQuery(userQuestion, metadata);
  }

  try {
    // Use agent-based generation
    let query: string;
    
    if (metadata.source_type === 'SQL_DB' && connectionString && sqlAgentService) {
      // Use SQL agent for dynamic schema exploration
      query = await sqlAgentService.generateQuery(
        userQuestion,
        connectionString,
        metadata
      );
    } else {
      // Use LangGraph agent for file-based sources
      query = await queryAgent.execute(userQuestion, metadata);
    }

    // Generate insight summary
    const insightPrompt = `Explain what this query does: ${query}`;
    const insightResponse = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-4-turbo-preview',
      messages: [{ role: 'user', content: insightPrompt }],
      temperature: 0.3,
    });

    return {
      query_type: 'SQL_QUERY',
      query_content: query,
      visualization_type: 'auto',
      insight_summary: insightResponse.choices[0]?.message?.content || '',
    };
  } catch (error) {
    console.error('Agent-based query generation failed, falling back:', error);
    // Fallback to original method
    return generateAdhocQuery(userQuestion, metadata);
  }
}
```

### 4. Update API Route

```typescript
// app/api/analytics/route.ts (additions)

export async function POST(request: NextRequest) {
  try {
    const body: AnalyticsRequest = await request.json();
    const useAgent = body.use_agent ?? process.env.USE_AGENT_BASED_QUERIES === 'true';

    if (body.mode === 'ADHOC_QUERY') {
      if (useAgent) {
        // Use agent-based generation
        const result = await generateAdhocQueryWithAgent(
          body.user_question!,
          body.metadata,
          body.connection_string
        );
        return NextResponse.json(result);
      } else {
        // Use original method
        const result = await generateAdhocQuery(
          body.user_question!,
          body.metadata
        );
        return NextResponse.json(result);
      }
    }
    // ... rest of the code
  }
}
```

---

## 🚀 Migration Strategy

### Phase 1: Parallel Implementation (Recommended)
1. Keep existing `llm-service.ts` unchanged
2. Add new `agent-service.ts` alongside
3. Add feature flag: `USE_AGENT_BASED_QUERIES`
4. Test both approaches in parallel

### Phase 2: Gradual Rollout
1. Enable agent-based queries for SQL databases first
2. Monitor performance and accuracy
3. Gradually enable for CSV files
4. Compare results between approaches

### Phase 3: Full Migration
1. Once agent-based approach proves better, make it default
2. Keep original as fallback
3. Remove feature flag when stable

---

## ⚙️ Configuration

Add to `.env.local`:

```env
# Agent-based query generation
USE_AGENT_BASED_QUERIES=true

# LangSmith monitoring (optional)
LANGCHAIN_TRACING_V2=true
LANGCHAIN_API_KEY=your-langsmith-api-key
LANGCHAIN_PROJECT=analytics-engine

# Agent settings
AGENT_MAX_ITERATIONS=5
AGENT_TEMPERATURE=0.2
```

---

## 📊 Performance Considerations

### Large Database Handling:

1. **Schema Caching**: Cache schema introspection results
2. **Lazy Schema Loading**: Only explore relevant tables
3. **Query Optimization**: Agent can optimize queries before execution
4. **Connection Pooling**: Reuse database connections

### Example Schema Exploration Strategy:

```typescript
async function exploreRelevantTables(
  question: string,
  connectionString: string
): Promise<string[]> {
  // Use LLM to identify relevant tables from question
  const prompt = `Given this question: "${question}", 
    which database tables are likely needed? 
    Return table names as JSON array.`;
  
  const response = await llm.invoke(prompt);
  const tables = JSON.parse(response.content);
  
  // Only introspect these tables (not all tables)
  return tables;
}
```

---

## 🔍 Key Differences: Agent vs Direct LLM

| Feature | Direct LLM (Current) | Agent-Based (New) |
|---------|---------------------|-------------------|
| Schema Exploration | Static metadata | Dynamic exploration |
| Query Refinement | Single attempt | Multi-step refinement |
| Error Handling | Fails on error | Self-corrects |
| Large DBs | May struggle | Efficient exploration |
| Complex Queries | May miss details | Breaks into steps |
| Tool Selection | N/A | Automatic selection |

---

## 🧪 Testing

### Test Cases:

1. **Simple Query**: "What is the average CGPA?"
   - Both should work similarly

2. **Complex Query**: "Show me students with CGPA above 8, grouped by state, ordered by average CGPA"
   - Agent should handle better

3. **Schema Exploration**: "Find all tables related to student performance"
   - Agent can explore schema dynamically

4. **Error Recovery**: Generate invalid query, see if agent corrects it
   - Agent should refine query

---

## 📚 Additional Resources

- [LangGraph Documentation](https://langchain-ai.github.io/langgraph/)
- [LangChain SQL Agent](https://js.langchain.com/docs/use_cases/sql/)
- [AgentGraph GitHub](https://github.com/Farzad-R/Advanced-QA-and-RAG-Series/tree/main/AgentGraph-Intelligent-Q%26A-and-RAG-System)

---

## ⚠️ Important Notes

1. **Cost**: Agent-based approach may use more tokens (multiple LLM calls)
2. **Latency**: May be slower due to multi-step process
3. **Complexity**: More complex to debug and maintain
4. **Dependencies**: Additional dependencies to manage

**Recommendation**: Start with feature flag, test thoroughly, then gradually migrate.

---

## 🎯 Next Steps

1. Install dependencies
2. Create agent service files
3. Add feature flag
4. Test with simple queries
5. Compare results with current approach
6. Gradually enable for production

---

**Questions?** Refer to the AgentGraph repository or YouTube video for detailed implementation examples.

