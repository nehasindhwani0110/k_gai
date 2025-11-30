"""
Query Execution Service
Executes SQL queries on databases and CSV files
"""

from sqlalchemy import create_engine, text
from typing import List, Dict, Any
import pandas as pd
from csv_processor import execute_csv_query


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
        raise ValueError("Query failed security validation")
    
    engine = create_engine(connection_string)
    
    try:
        with engine.connect() as conn:
            result = conn.execute(text(query))
            rows = result.fetchall()
            
            # Convert to list of dictionaries
            columns = result.keys()
            return [dict(zip(columns, row)) for row in rows]
    finally:
        engine.dispose()


def validate_sql_query(query: str) -> bool:
    """
    Validates SQL query for security.
    
    Args:
        query: SQL query string
        
    Returns:
        True if query is safe, False otherwise
    """
    upper_query = query.upper().strip()
    
    # Check for dangerous operations
    dangerous_keywords = [
        'INSERT', 'UPDATE', 'DELETE', 'DROP', 'CREATE',
        'ALTER', 'TRUNCATE', 'EXEC', 'EXECUTE', 'CALL'
    ]
    
    for keyword in dangerous_keywords:
        if keyword in upper_query:
            return False
    
    # Must start with SELECT
    if not upper_query.startswith('SELECT'):
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

