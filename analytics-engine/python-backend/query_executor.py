"""
Query Execution Service
Executes SQL queries on databases and CSV files
"""

from sqlalchemy import create_engine, text
from typing import List, Dict, Any
import pandas as pd
from datetime import datetime, date, time as dt_time, timedelta
from decimal import Decimal
from csv_processor import execute_csv_query
from schema_introspection import _normalize_connection_string
import hashlib
import time

# Global engine cache - reuse engines across requests
_engine_cache: Dict[str, tuple] = {}  # key: (engine, created_at)
_engine_cache_ttl = 3600  # Keep engines for 1 hour


def _get_cache_key(connection_string: str) -> str:
    """Generate consistent cache key from connection string"""
    normalized = _normalize_connection_string(connection_string)
    return hashlib.md5(normalized.encode()).hexdigest()


def _get_cached_engine(connection_string: str):
    """Get cached engine or create new one"""
    cache_key = _get_cache_key(connection_string)
    current_time = time.time()
    
    # Check if we have a cached engine that's still valid
    if cache_key in _engine_cache:
        engine, created_at = _engine_cache[cache_key]
        if current_time - created_at < _engine_cache_ttl:
            print(f"[QUERY-EXECUTOR] ✅ Using cached engine (age: {int(current_time - created_at)}s)")
            return engine
        else:
            # Engine expired, dispose it
            print(f"[QUERY-EXECUTOR] ⏰ Engine cache expired, disposing old engine")
            try:
                engine.dispose()
            except:
                pass
            del _engine_cache[cache_key]
    
    # Create new engine
    print(f"[QUERY-EXECUTOR] 🔄 Creating new engine (not cached)")
    normalized_connection_string = _normalize_connection_string(connection_string)
    engine = _create_engine_with_pooling(normalized_connection_string)
    _engine_cache[cache_key] = (engine, current_time)
    return engine


def _create_engine_with_pooling(connection_string: str):
    """
    Creates a SQLAlchemy engine with connection pooling and timeout settings.
    This prevents connection exhaustion and handles transient failures.
    
    Args:
        connection_string: Normalized database connection string
        
    Returns:
        SQLAlchemy Engine instance with pooling configured
    """
    return create_engine(
        connection_string,
        pool_size=5,  # Number of connections to maintain
        max_overflow=10,  # Additional connections beyond pool_size
        pool_timeout=30,  # Seconds to wait for connection from pool
        pool_recycle=3600,  # Recycle connections after 1 hour
        pool_pre_ping=True,  # Verify connections before using (detects stale connections)
        connect_args={
            'connect_timeout': 10,  # Connection timeout in seconds
            'read_timeout': 30,  # Read timeout in seconds
            'write_timeout': 30,  # Write timeout in seconds
        } if 'mysql' in connection_string else {}
    )


def serialize_value(value: Any) -> Any:
    """
    Convert Python objects to JSON-serializable types.
    
    Handles:
    - datetime, date, time -> ISO format strings
    - timedelta -> total seconds (float)
    - Decimal -> float
    - bytes -> base64 encoded string
    - Other types -> as-is
    """
    if value is None:
        return None
    elif isinstance(value, datetime):
        return value.isoformat()
    elif isinstance(value, date):
        return value.isoformat()
    elif isinstance(value, dt_time):
        return value.isoformat()
    elif isinstance(value, timedelta):
        return value.total_seconds()
    elif isinstance(value, Decimal):
        return float(value)
    elif isinstance(value, bytes):
        import base64
        return base64.b64encode(value).decode('utf-8')
    elif isinstance(value, (dict, list)):
        # Recursively serialize nested structures
        if isinstance(value, dict):
            return {k: serialize_value(v) for k, v in value.items()}
        else:
            return [serialize_value(item) for item in value]
    else:
        return value


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
    
    # Use cached engine or create new one (reuses connections)
    engine = _get_cached_engine(connection_string)
    
    try:
        with engine.connect() as conn:
            result = conn.execute(text(query))
            rows = result.fetchall()
            
            # Convert to list of dictionaries and serialize values
            columns = result.keys()
            serialized_rows = []
            for row in rows:
                row_dict = dict(zip(columns, row))
                # Serialize all values to ensure JSON compatibility
                serialized_dict = {k: serialize_value(v) for k, v in row_dict.items()}
                serialized_rows.append(serialized_dict)
            return serialized_rows
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
    # NOTE: Don't dispose engine here - it's cached and reused!


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

