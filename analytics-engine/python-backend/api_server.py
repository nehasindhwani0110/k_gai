"""
Python API Server for Schema Introspection
Uses Flask to expose SQLAlchemy schema introspection as REST API
"""

from flask import Flask, request, jsonify
from flask_cors import CORS
from schema_introspection import introspect_sql_schema, _normalize_connection_string
from query_executor import execute_sql_query
import os
import sys

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


if __name__ == '__main__':
    port = int(os.environ.get('PORT', 8000))
    print(f"[PYTHON API] Starting server on port {port}...")
    print(f"[PYTHON API] Health check: http://localhost:{port}/health")
    print(f"[PYTHON API] Introspect endpoint: http://localhost:{port}/introspect")
    print(f"[PYTHON API] Execute endpoint: http://localhost:{port}/execute")
    app.run(host='0.0.0.0', port=port, debug=True)

