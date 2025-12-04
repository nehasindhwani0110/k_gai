"""
SQL Schema Introspection Service
Uses SQLAlchemy to introspect database schemas
"""

from sqlalchemy import create_engine, inspect, MetaData, Table
from sqlalchemy.engine import Engine
from typing import Dict, List, Optional
import json
import hashlib
import time
from urllib.parse import urlparse, urlunparse, quote_plus

# Global engine cache - reuse engines across requests
_engine_cache: Dict[str, tuple] = {}  # key: (engine, created_at)
_engine_cache_ttl = 3600  # Keep engines for 1 hour


def _get_cache_key(connection_string: str, schema_name: Optional[str] = None) -> str:
    """Generate consistent cache key from connection string"""
    normalized = _normalize_connection_string(connection_string)
    key_parts = [normalized]
    if schema_name:
        key_parts.append(f"schema:{schema_name}")
    key_string = "|".join(key_parts)
    return hashlib.md5(key_string.encode()).hexdigest()


def _get_cached_engine(connection_string: str):
    """Get cached engine or create new one"""
    cache_key = _get_cache_key(connection_string)
    current_time = time.time()
    
    # Check if we have a cached engine that's still valid
    if cache_key in _engine_cache:
        engine, created_at = _engine_cache[cache_key]
        if current_time - created_at < _engine_cache_ttl:
            print(f"[SCHEMA] ✅ Using cached engine (age: {int(current_time - created_at)}s)")
            return engine
        else:
            # Engine expired, dispose it
            print(f"[SCHEMA] ⏰ Engine cache expired, disposing old engine")
            try:
                engine.dispose()
            except:
                pass
            del _engine_cache[cache_key]
    
    # Create new engine
    print(f"[SCHEMA] 🔄 Creating new engine (not cached)")
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


def _normalize_connection_string(connection_string: str) -> str:
    """
    Normalizes a database connection string by properly encoding special characters
    in the password component.
    
    Args:
        connection_string: Raw connection string (e.g., mysql://user:pass@host/db)
        
    Returns:
        Normalized connection string with properly encoded password
    """
    try:
        # Parse the connection string
        parsed = urlparse(connection_string)
        
        # Extract components
        scheme = parsed.scheme
        username = parsed.username
        password = parsed.password
        hostname = parsed.hostname
        port = parsed.port
        path = parsed.path
        query = parsed.query
        
        # Check if hostname contains @, which indicates password parsing failed
        # This happens when password contains @ character
        if hostname and '@' in hostname:
            # Password contains @, so urlparse split incorrectly
            # Need to manually parse: user:password@host:port
            # Example: root:neha@2004@localhost:3306 -> hostname would be "2004@localhost"
            netloc_parts = parsed.netloc.split('@')
            if len(netloc_parts) >= 2:
                # Take everything before last @ as auth, last part as host:port
                auth_part = '@'.join(netloc_parts[:-1])
                host_part = netloc_parts[-1]
                
                if ':' in auth_part:
                    username, password = auth_part.split(':', 1)
                else:
                    username = auth_part
                    password = None
                
                # Parse host and port from host_part
                if ':' in host_part:
                    hostname, port_str = host_part.rsplit(':', 1)
                    try:
                        port = int(port_str)
                    except ValueError:
                        hostname = host_part
                        port = None
                else:
                    hostname = host_part
                    port = None
        
        # URL-encode the password if it exists and contains special characters
        if password:
            # Check if password needs encoding (contains @, :, /, etc.)
            if any(char in password for char in ['@', ':', '/', '?', '#', '[', ']']):
                password = quote_plus(password)
        
        # Reconstruct the connection string
        if username and password:
            netloc = f"{username}:{password}@{hostname}"
        elif username:
            netloc = f"{username}@{hostname}"
        else:
            netloc = hostname
        
        if port:
            netloc = f"{netloc}:{port}"
        
        normalized = urlunparse((scheme, netloc, path, '', query, ''))
        
        # Convert mysql:// to mysql+pymysql:// to use pymysql driver
        if normalized.startswith('mysql://'):
            normalized = normalized.replace('mysql://', 'mysql+pymysql://', 1)
            print(f"[SCHEMA] Using pymysql driver for MySQL connection")
        
        return normalized
        
    except Exception as e:
        # If parsing fails, try simple replacement approach
        print(f"[SCHEMA] Warning: Could not parse connection string properly: {e}")
        if connection_string.startswith('mysql://'):
            connection_string = connection_string.replace('mysql://', 'mysql+pymysql://', 1)
        return connection_string


def introspect_sql_schema(
    connection_string: str,
    schema_name: Optional[str] = None
) -> Dict:
    """
    Introspects a SQL database schema and returns metadata in the required format.
    
    Args:
        connection_string: Database connection string
        schema_name: Optional schema name to introspect
        
    Returns:
        Dictionary with source_type and tables metadata
    """
    # Use cached engine or create new one (reuses connections)
    engine = _get_cached_engine(connection_string)
    inspector = inspect(engine)
    
    tables_metadata = []
    
    # Get all table names
    table_names = inspector.get_table_names(schema=schema_name)
    
    for table_name in table_names:
        columns_metadata = []
        
        # Get columns for this table
        columns = inspector.get_columns(table_name, schema=schema_name)
        
        for column in columns:
            columns_metadata.append({
                "name": column["name"],
                "description": f"Column {column['name']} of type {column['type']}",
                "type": str(column["type"])
            })
        
        # Get table comment if available
        table_comment = None
        try:
            table_info = inspector.get_table_comment(table_name, schema=schema_name)
            table_comment = table_info.get("text") if table_info else None
        except:
            pass
        
        tables_metadata.append({
            "name": table_name,
            "description": table_comment or f"Table {table_name}",
            "columns": columns_metadata
        })
    
    return {
        "source_type": "SQL_DB",
        "tables": tables_metadata
    }


def format_canonical_schema(tables: List[Dict]) -> Dict:
    """
    Formats canonical schema metadata.
    
    Args:
        tables: List of table metadata dictionaries
        
    Returns:
        Formatted metadata dictionary
    """
    return {
        "source_type": "CANONICAL_DB",
        "tables": tables
    }


if __name__ == "__main__":
    # Example usage
    connection_string = "postgresql://user:password@localhost/dbname"
    metadata = introspect_sql_schema(connection_string)
    print(json.dumps(metadata, indent=2))

