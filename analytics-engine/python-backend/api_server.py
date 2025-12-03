"""
Python API Server for Schema Introspection
Uses Flask to expose SQLAlchemy schema introspection as REST API
"""

from flask import Flask, request, jsonify
from flask_cors import CORS
from schema_introspection import introspect_sql_schema, _normalize_connection_string
from query_executor import execute_sql_query
from system_catalog import (
    get_system_catalog_metadata,
    get_tables_metadata,
    get_table_statistics,
    validate_table_exists
)
import os
import sys

# Check LangSmith configuration
langsmith_enabled = os.getenv("LANGCHAIN_TRACING_V2", "false") == "true"
if langsmith_enabled:
    print("[PYTHON API] LangSmith tracing enabled - all LLM calls will be traced")
    print(f"[PYTHON API] Project: {os.getenv('LANGCHAIN_PROJECT', 'analytics-engine')}")
else:
    print("[PYTHON API] LangSmith tracing disabled - set LANGCHAIN_TRACING_V2=true and LANGCHAIN_API_KEY to enable")

# Try to import agent service (optional - will fail gracefully if dependencies not installed)
try:
    from agent_service import get_agent_service
    AGENT_AVAILABLE = True
except ImportError:
    AGENT_AVAILABLE = False
    print("[PYTHON API] Agent service not available. Install LangChain dependencies: pip install langchain langchain-openai langchain-community")

app = Flask(__name__)
CORS(app)  # Enable CORS for Next.js frontend

@app.route('/health', methods=['GET'])
def health():
    """Health check endpoint"""
    return jsonify({"status": "ok", "service": "schema-introspection"})


@app.route('/introspect', methods=['POST', 'GET'])
def introspect():
    """
    Introspect SQL database schema
    
    GET: /introspect?connection_string=mysql://...
    POST: { "connection_string": "mysql://...", "schema_name": "optional" }
    """
    try:
        # Support both GET and POST
        if request.method == 'GET':
            connection_string = request.args.get('connection_string')
            schema_name = request.args.get('schema_name')
        else:
            data = request.get_json()
            connection_string = data.get('connection_string')
            schema_name = data.get('schema_name')
        
        if not connection_string:
            return jsonify({
                "error": "connection_string is required"
            }), 400
        
        # Introspect schema using SQLAlchemy
        # Connection string will be converted to use pymysql if needed
        print(f"[PYTHON API] Introspecting schema for: {connection_string[:50]}...")
        metadata = introspect_sql_schema(connection_string, schema_name)
        
        print(f"[PYTHON API] Found {len(metadata.get('tables', []))} tables")
        return jsonify(metadata)
        
    except Exception as e:
        print(f"[PYTHON API] Error: {str(e)}", file=sys.stderr)
        return jsonify({
            "error": "Schema introspection failed",
            "details": str(e)
        }), 500


@app.route('/execute', methods=['POST'])
def execute():
    """
    Execute SQL query on database
    
    POST: { "connection_string": "mysql://...", "query": "SELECT ..." }
    """
    try:
        data = request.get_json()
        connection_string = data.get('connection_string')
        query = data.get('query')
        
        if not connection_string:
            return jsonify({
                "error": "connection_string is required"
            }), 400
        
        if not query:
            return jsonify({
                "error": "query is required"
            }), 400
        
        # Normalize connection string to handle special characters in password
        normalized_connection_string = _normalize_connection_string(connection_string)
        
        print(f"[PYTHON API] Executing query on: {normalized_connection_string[:50]}...")
        print(f"[PYTHON API] Query: {query[:100]}...")
        
        # Execute query using SQLAlchemy
        results = execute_sql_query(normalized_connection_string, query)
        
        print(f"[PYTHON API] Query executed successfully: {len(results)} rows returned")
        return jsonify({
            "success": True,
            "results": results,
            "row_count": len(results)
        })
        
    except Exception as e:
        print(f"[PYTHON API] Error: {str(e)}", file=sys.stderr)
        return jsonify({
            "error": "Query execution failed",
            "details": str(e)
        }), 500


@app.route('/agent/query', methods=['POST'])
def agent_query():
    """
    Generate SQL query using LangChain SQL Agent
    
    POST: {
        "question": "What is the average CGPA?",
        "connection_string": "mysql://...",
        "metadata": {...}  # Optional
    }
    """
    if not AGENT_AVAILABLE:
        return jsonify({
            "error": "Agent service not available. Install LangChain dependencies.",
            "details": "Run: pip install langchain langchain-openai langchain-community"
        }), 503
    
    try:
        data = request.get_json()
        question = data.get('question')
        connection_string = data.get('connection_string')
        metadata = data.get('metadata')
        
        if not question:
            return jsonify({
                "error": "question is required"
            }), 400
        
        if not connection_string:
            return jsonify({
                "error": "connection_string is required"
            }), 400
        
        print(f"[PYTHON API] Agent query generation for: {question[:50]}...")
        
        # Get agent service
        agent_service = get_agent_service()
        
        # Generate query
        result = agent_service.generate_query(
            user_question=question,
            connection_string=connection_string,
            metadata=metadata
        )
        
        if result.get("success"):
            print(f"[PYTHON API] Agent query generated successfully")
            return jsonify(result)
        else:
            return jsonify({
                "error": result.get("error", "Query generation failed")
            }), 500
        
    except Exception as e:
        print(f"[PYTHON API] Agent error: {str(e)}", file=sys.stderr)
        return jsonify({
            "error": "Agent query generation failed",
            "details": str(e)
        }), 500


@app.route('/agent/explore-schema', methods=['POST'])
def agent_explore_schema():
    """
    Explore database schema using agent to find relevant tables
    
    POST: {
        "question": "What is the average CGPA?",
        "connection_string": "mysql://..."
    }
    """
    if not AGENT_AVAILABLE:
        return jsonify({
            "error": "Agent service not available. Install LangChain dependencies.",
            "details": "Run: pip install langchain langchain-openai langchain-community"
        }), 503
    
    try:
        data = request.get_json()
        question = data.get('question')
        connection_string = data.get('connection_string')
        
        if not question:
            return jsonify({
                "error": "question is required"
            }), 400
        
        if not connection_string:
            return jsonify({
                "error": "connection_string is required"
            }), 400
        
        print(f"[PYTHON API] Agent schema exploration for: {question[:50]}...")
        
        # Get agent service
        agent_service = get_agent_service()
        
        # Explore schema
        result = agent_service.explore_schema(
            user_question=question,
            connection_string=connection_string
        )
        
        if result.get("success"):
            print(f"[PYTHON API] Agent schema exploration successful")
            return jsonify(result)
        else:
            return jsonify({
                "error": result.get("error", "Schema exploration failed")
            }), 500
        
    except Exception as e:
        print(f"[PYTHON API] Agent schema exploration error: {str(e)}", file=sys.stderr)
        return jsonify({
            "error": "Schema exploration failed",
            "details": str(e)
        }), 500


@app.route('/system-catalog', methods=['POST'])
def system_catalog():
    """
    Get metadata from database system catalog (INFORMATION_SCHEMA)
    More efficient than full introspection for large databases
    
    POST: {
        "connection_string": "mysql://...",
        "database_name": "optional",
        "schema_name": "optional",
        "include_system_tables": false,
        "database_type": "mysql|postgresql|sqlserver"
    }
    """
    try:
        data = request.get_json()
        connection_string = data.get('connection_string')
        database_name = data.get('database_name')
        schema_name = data.get('schema_name')
        include_system_tables = data.get('include_system_tables', False)
        
        if not connection_string:
            return jsonify({
                "error": "connection_string is required"
            }), 400
        
        print(f"[PYTHON API] Querying system catalog for: {connection_string[:50]}...")
        
        metadata = get_system_catalog_metadata(
            connection_string,
            database_name,
            schema_name,
            include_system_tables
        )
        
        print(f"[PYTHON API] System catalog query successful: Found {len(metadata.get('tables', []))} tables")
        return jsonify({
            "success": True,
            "metadata": metadata
        })
        
    except Exception as e:
        print(f"[PYTHON API] System catalog error: {str(e)}", file=sys.stderr)
        return jsonify({
            "error": "System catalog query failed",
            "details": str(e)
        }), 500


@app.route('/system-catalog/tables', methods=['POST'])
def system_catalog_tables():
    """
    Get metadata for specific tables only
    
    POST: {
        "connection_string": "mysql://...",
        "table_names": ["table1", "table2"],
        "database_name": "optional",
        "schema_name": "optional"
    }
    """
    try:
        data = request.get_json()
        connection_string = data.get('connection_string')
        table_names = data.get('table_names', [])
        database_name = data.get('database_name')
        schema_name = data.get('schema_name')
        
        if not connection_string:
            return jsonify({
                "error": "connection_string is required"
            }), 400
        
        if not table_names:
            return jsonify({
                "error": "table_names is required"
            }), 400
        
        print(f"[PYTHON API] Getting metadata for {len(table_names)} tables...")
        
        tables = get_tables_metadata(
            connection_string,
            table_names,
            database_name,
            schema_name
        )
        
        return jsonify({
            "success": True,
            "tables": tables
        })
        
    except Exception as e:
        print(f"[PYTHON API] System catalog tables error: {str(e)}", file=sys.stderr)
        return jsonify({
            "error": "System catalog tables query failed",
            "details": str(e)
        }), 500


@app.route('/system-catalog/statistics', methods=['POST', 'GET'])
def system_catalog_statistics():
    """
    Get table statistics (row counts, sizes)
    
    POST: {
        "connection_string": "mysql://...",
        "table_names": ["table1", "table2"],  # Optional, all tables if not provided
        "database_name": "optional",
        "schema_name": "optional"
    }
    
    GET: Returns method not allowed message (use POST)
    """
    if request.method == 'GET':
        return jsonify({
            "error": "Method not allowed",
            "message": "This endpoint requires POST method. Please use POST with JSON body containing 'connection_string' and optional 'table_names', 'database_name', 'schema_name'."
        }), 405
    
    try:
        data = request.get_json()
        connection_string = data.get('connection_string')
        table_names = data.get('table_names')
        database_name = data.get('database_name')
        schema_name = data.get('schema_name')
        
        if not connection_string:
            return jsonify({
                "error": "connection_string is required"
            }), 400
        
        print(f"[PYTHON API] Getting statistics for {'specific tables' if table_names else 'all tables'}...")
        
        statistics = get_table_statistics(
            connection_string,
            table_names,
            database_name,
            schema_name
        )
        
        return jsonify({
            "success": True,
            "statistics": statistics
        })
        
    except Exception as e:
        print(f"[PYTHON API] System catalog statistics error: {str(e)}", file=sys.stderr)
        return jsonify({
            "error": "System catalog statistics query failed",
            "details": str(e)
        }), 500


@app.route('/system-catalog/validate', methods=['POST'])
def system_catalog_validate():
    """
    Validate if table exists in database
    
    POST: {
        "connection_string": "mysql://...",
        "table_name": "table1",
        "database_name": "optional",
        "schema_name": "optional"
    }
    """
    try:
        data = request.get_json()
        connection_string = data.get('connection_string')
        table_name = data.get('table_name')
        database_name = data.get('database_name')
        schema_name = data.get('schema_name')
        
        if not connection_string:
            return jsonify({
                "error": "connection_string is required"
            }), 400
        
        if not table_name:
            return jsonify({
                "error": "table_name is required"
            }), 400
        
        exists = validate_table_exists(
            connection_string,
            table_name,
            database_name,
            schema_name
        )
        
        return jsonify({
            "success": True,
            "exists": exists,
            "table_name": table_name
        })
        
    except Exception as e:
        print(f"[PYTHON API] System catalog validate error: {str(e)}", file=sys.stderr)
        return jsonify({
            "error": "System catalog validation failed",
            "details": str(e)
        }), 500


if __name__ == '__main__':
    port = int(os.environ.get('PORT', 8000))
    print(f"[PYTHON API] Starting server on port {port}...")
    print(f"[PYTHON API] Health check: http://localhost:{port}/health")
    print(f"[PYTHON API] Introspect endpoint: http://localhost:{port}/introspect")
    print(f"[PYTHON API] Execute endpoint: http://localhost:{port}/execute")
    print(f"[PYTHON API] System catalog endpoint: http://localhost:{port}/system-catalog")
    print(f"[PYTHON API] System catalog tables endpoint: http://localhost:{port}/system-catalog/tables")
    print(f"[PYTHON API] System catalog statistics endpoint: http://localhost:{port}/system-catalog/statistics")
    if AGENT_AVAILABLE:
        print(f"[PYTHON API] Agent query endpoint: http://localhost:{port}/agent/query")
        print(f"[PYTHON API] Agent explore-schema endpoint: http://localhost:{port}/agent/explore-schema")
    else:
        print(f"[PYTHON API] Agent endpoints not available (install LangChain dependencies)")
    app.run(host='0.0.0.0', port=port, debug=True)

