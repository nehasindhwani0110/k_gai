"""
Query Execution Service
Executes SQL queries on databases and CSV files
"""

from sqlalchemy import create_engine, text
from typing import List, Dict, Any
import pandas as pd
from csv_processor import execute_csv_query
from schema_introspection import _normalize_connection_string


def execute_sql_query(connection_string: str, query: str) -> List[Dict]:
    """
    Executes a SQL query on a database.
    
    Args:
        connection_string: Database connection string
        query: SQL query to execute
        
    Returns:
        List of result dictionaries
    """
    # Validate query (basic security check)
    if not validate_sql_query(query):
        raise ValueError("Query failed security validation. Only SELECT queries are allowed, and dangerous operations (INSERT, UPDATE, DELETE, DROP, etc.) are blocked.")
    
    # Normalize connection string to handle special characters in password
    normalized_connection_string = _normalize_connection_string(connection_string)
    
    engine = create_engine(normalized_connection_string)
    
    try:
        with engine.connect() as conn:
            result = conn.execute(text(query))
            rows = result.fetchall()
            
            # Convert to list of dictionaries
            columns = result.keys()
            return [dict(zip(columns, row)) for row in rows]
    except Exception as e:
        # Capture detailed error information
        error_message = str(e)
        error_type = type(e).__name__
        
        # Provide more helpful error messages for common SQL errors
        if 'Unknown column' in error_message or 'doesn\'t exist' in error_message or 'Unknown column' in error_message:
            raise ValueError(f"Column error: {error_message}. Please check column names in the query.")
        elif 'Table' in error_message and 'doesn\'t exist' in error_message:
            raise ValueError(f"Table error: {error_message}. Please check table name in the query.")
        elif 'syntax' in error_message.lower():
            raise ValueError(f"SQL syntax error: {error_message}")
        else:
            raise ValueError(f"Query execution failed ({error_type}): {error_message}")
    finally:
        engine.dispose()


def validate_sql_query(query: str) -> bool:
    """
    Validates SQL query for security.
    Only allows SELECT queries, blocks dangerous operations.
    
    Args:
        query: SQL query string
        
    Returns:
        True if query is safe, False otherwise
    """
    import re
    
    if not query or not isinstance(query, str):
        return False
    
    # Remove leading/trailing whitespace
    cleaned_query = query.strip()
    upper_query = cleaned_query.upper()
    
    # Must start with SELECT
    if not upper_query.startswith('SELECT'):
        return False
    
    # Check for dangerous operations using word boundaries
    # This prevents false positives like DATE() matching DELETE
    dangerous_keywords = [
        'INSERT', 'UPDATE', 'DELETE', 'DROP', 'CREATE',
        'ALTER', 'TRUNCATE', 'EXEC', 'EXECUTE', 'CALL'
    ]
    
    for keyword in dangerous_keywords:
        # Use word boundary regex to match whole words only
        # \b matches word boundaries, ensuring we don't match partial words
        pattern = r'\b' + re.escape(keyword) + r'\b'
        if re.search(pattern, upper_query, re.IGNORECASE):
            return False
    
    return True


def execute_query_logic(
    source_type: str,
    file_path: str,
    query_logic: str
) -> List[Dict]:
    """
    Executes query logic on file-based data source.
    
    Args:
        source_type: Type of source (CSV_FILE, etc.)
        file_path: Path to the file
        query_logic: Query logic to execute
        
    Returns:
        List of result dictionaries
    """
    if source_type == 'CSV_FILE':
        return execute_csv_query(file_path, query_logic)
    else:
        raise ValueError(f"Unsupported source type: {source_type}")


if __name__ == "__main__":
    # Example usage
    connection_string = "postgresql://user:password@localhost/dbname"
    query = "SELECT * FROM students LIMIT 10"
    results = execute_sql_query(connection_string, query)
    print(results)

