"""
System Catalog Service
Queries INFORMATION_SCHEMA directly for efficient metadata retrieval
Works efficiently with 200+ tables

CONNECTION & CACHING:
- Engines are cached globally and reused across requests (1 hour TTL)
- Schema metadata is cached to avoid repeated introspection (5 minutes TTL)
- This prevents "disconnection" issues and improves performance
- Use force_refresh=True to bypass cache when schema changes

CRITICAL: COMPLETE METADATA
- This service ALWAYS returns ALL columns for each table (no limits)
- Column limiting happens in TypeScript services for LLM context management
- For query validation, always fetch FULL metadata using get_tables_metadata()
- This ensures queries can use any column, not just the first N columns
"""

from sqlalchemy import create_engine, text, inspect
from typing import Dict, List, Optional
from schema_introspection import _normalize_connection_string
import hashlib
import time

# Global engine cache - reuse engines across requests
_engine_cache: Dict[str, tuple] = {}  # key: (engine, created_at)
_engine_cache_ttl = 3600  # Keep engines for 1 hour

# Global schema metadata cache - avoid re-introspecting on every request
_schema_cache: Dict[str, tuple] = {}  # key: (metadata, created_at)
_schema_cache_ttl = 300  # Cache schema for 5 minutes


def _get_cache_key(connection_string: str, database_name: Optional[str] = None, schema_name: Optional[str] = None) -> str:
    """Generate consistent cache key from connection string and schema"""
    normalized = _normalize_connection_string(connection_string)
    key_parts = [normalized]
    if database_name:
        key_parts.append(f"db:{database_name}")
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
            print(f"[SYSTEM-CATALOG] ✅ Using cached engine (age: {int(current_time - created_at)}s)")
            return engine
        else:
            # Engine expired, dispose it
            print(f"[SYSTEM-CATALOG] ⏰ Engine cache expired, disposing old engine")
            try:
                engine.dispose()
            except:
                pass
            del _engine_cache[cache_key]
    
    # Create new engine
    print(f"[SYSTEM-CATALOG] 🔄 Creating new engine (not cached)")
    normalized_connection_string = _normalize_connection_string(connection_string)
    engine = _create_engine_with_pooling(normalized_connection_string)
    _engine_cache[cache_key] = (engine, current_time)
    return engine


def _get_cached_schema_metadata(connection_string: str, database_name: Optional[str] = None, schema_name: Optional[str] = None):
    """Get cached schema metadata or return None"""
    cache_key = _get_cache_key(connection_string, database_name, schema_name)
    current_time = time.time()
    
    if cache_key in _schema_cache:
        metadata, created_at = _schema_cache[cache_key]
        if current_time - created_at < _schema_cache_ttl:
            print(f"[SYSTEM-CATALOG] ✅ Using cached schema metadata (age: {int(current_time - created_at)}s, {len(metadata.get('tables', []))} tables)")
            return metadata
        else:
            # Schema expired
            print(f"[SYSTEM-CATALOG] ⏰ Schema cache expired")
            del _schema_cache[cache_key]
    
    return None


def _cache_schema_metadata(connection_string: str, metadata: Dict, database_name: Optional[str] = None, schema_name: Optional[str] = None):
    """Cache schema metadata"""
    cache_key = _get_cache_key(connection_string, database_name, schema_name)
    _schema_cache[cache_key] = (metadata, time.time())
    print(f"[SYSTEM-CATALOG] 💾 Cached schema metadata ({len(metadata.get('tables', []))} tables)")


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


def detect_database_type(connection_string: str) -> str:
    """Detect database type from connection string"""
    conn_str = connection_string.lower()
    if 'mysql' in conn_str or 'mariadb' in conn_str:
        return 'mysql'
    elif 'postgresql' in conn_str or 'postgres' in conn_str:
        return 'postgresql'
    elif 'sqlserver' in conn_str or 'mssql' in conn_str:
        return 'sqlserver'
    return 'unknown'


def query_system_catalog_mysql(
    engine,
    database_name: Optional[str] = None,
    include_system_tables: bool = False
) -> Dict:
    """Query MySQL INFORMATION_SCHEMA"""
    tables_metadata = []
    
    with engine.connect() as conn:
        # Get database name from connection if not provided
        if not database_name:
            result = conn.execute(text("SELECT DATABASE()"))
            database_name = result.scalar()
        
        # Query INFORMATION_SCHEMA.TABLES
        tables_query = text("""
            SELECT 
                TABLE_NAME,
                TABLE_COMMENT,
                TABLE_ROWS,
                DATA_LENGTH + INDEX_LENGTH as TABLE_SIZE
            FROM INFORMATION_SCHEMA.TABLES
            WHERE TABLE_SCHEMA = :db_name
        """)
        
        if not include_system_tables:
            tables_query = text("""
                SELECT 
                    TABLE_NAME,
                    TABLE_COMMENT,
                    TABLE_ROWS,
                    DATA_LENGTH + INDEX_LENGTH as TABLE_SIZE
                FROM INFORMATION_SCHEMA.TABLES
                WHERE TABLE_SCHEMA = :db_name
                AND TABLE_TYPE = 'BASE TABLE'
            """)
        
        tables_result = conn.execute(tables_query, {"db_name": database_name})
        
        for table_row in tables_result:
            table_name = table_row[0]
            table_comment = table_row[1] or f"Table {table_name}"
            row_count = table_row[2] or 0
            table_size = table_row[3] or 0
            
            # Query columns for this table
            columns_query = text("""
                SELECT 
                    COLUMN_NAME,
                    DATA_TYPE,
                    IS_NULLABLE,
                    COLUMN_KEY,
                    COLUMN_DEFAULT,
                    COLUMN_COMMENT,
                    ORDINAL_POSITION
                FROM INFORMATION_SCHEMA.COLUMNS
                WHERE TABLE_SCHEMA = :db_name
                AND TABLE_NAME = :table_name
                ORDER BY ORDINAL_POSITION
            """)
            
            columns_result = conn.execute(
                columns_query,
                {"db_name": database_name, "table_name": table_name}
            )
            
            columns_metadata = []
            column_count = 0
            for col_row in columns_result:
                col_name, data_type, is_nullable, col_key, col_default, col_comment, ordinal = col_row
                
                columns_metadata.append({
                    "name": col_name,
                    "type": data_type,
                    "description": col_comment or f"Column {col_name} ({data_type})",
                    "isNullable": is_nullable == "YES",
                    "isPrimaryKey": col_key == "PRI",
                    "defaultValue": col_default,
                    "ordinalPosition": ordinal,
                })
                column_count += 1
            
            # Log column count for debugging (ensure ALL columns are fetched)
            if column_count > 0:
                print(f"[SYSTEM-CATALOG] Table {table_name}: {column_count} columns fetched (COMPLETE)")
            
            tables_metadata.append({
                "name": table_name,
                "description": table_comment,
                "columns": columns_metadata,  # ALL columns - no limits
                "rowCount": row_count,
                "sizeBytes": table_size,
            })
    
    return {
        "source_type": "SQL_DB",
        "tables": tables_metadata
    }


def query_system_catalog_postgresql(
    engine,
    schema_name: Optional[str] = None,
    include_system_tables: bool = False
) -> Dict:
    """Query PostgreSQL information_schema"""
    tables_metadata = []
    schema_name = schema_name or "public"
    
    with engine.connect() as conn:
        # Query information_schema.tables
        tables_query = text("""
            SELECT 
                table_name,
                obj_description(c.oid, 'pg_class') as table_comment
            FROM information_schema.tables t
            JOIN pg_class c ON c.relname = t.table_name
            JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = :schema_name
            WHERE table_schema = :schema_name
        """)
        
        if not include_system_tables:
            tables_query = text("""
                SELECT 
                    table_name,
                    obj_description(c.oid, 'pg_class') as table_comment
                FROM information_schema.tables t
                JOIN pg_class c ON c.relname = t.table_name
                JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = :schema_name
                WHERE table_schema = :schema_name
                AND table_type = 'BASE TABLE'
            """)
        
        tables_result = conn.execute(tables_query, {"schema_name": schema_name})
        
        for table_row in tables_result:
            table_name = table_row[0]
            table_comment = table_row[1] or f"Table {table_name}"
            
            # Get row count
            count_query = text(f'SELECT COUNT(*) FROM "{schema_name}"."{table_name}"')
            try:
                row_count = conn.execute(count_query).scalar()
            except:
                row_count = 0
            
            # Query columns
            columns_query = text("""
                SELECT 
                    column_name,
                    data_type,
                    is_nullable,
                    column_default,
                    ordinal_position
                FROM information_schema.columns
                WHERE table_schema = :schema_name
                AND table_name = :table_name
                ORDER BY ordinal_position
            """)
            
            columns_result = conn.execute(
                columns_query,
                {"schema_name": schema_name, "table_name": table_name}
            )
            
            columns_metadata = []
            column_count = 0
            for col_row in columns_result:
                col_name, data_type, is_nullable, col_default, ordinal = col_row
                
                columns_metadata.append({
                    "name": col_name,
                    "type": data_type,
                    "description": f"Column {col_name} ({data_type})",
                    "isNullable": is_nullable == "YES",
                    "isPrimaryKey": False,  # Would need separate query for PKs
                    "defaultValue": col_default,
                    "ordinalPosition": ordinal,
                })
                column_count += 1
            
            # Log column count for debugging (ensure ALL columns are fetched)
            if column_count > 0:
                print(f"[SYSTEM-CATALOG] Table {table_name}: {column_count} columns fetched (COMPLETE)")
            
            tables_metadata.append({
                "name": table_name,
                "description": table_comment,
                "columns": columns_metadata,  # ALL columns - no limits
                "rowCount": row_count,
                "sizeBytes": 0,  # Would need pg_total_relation_size query
            })
    
    return {
        "source_type": "SQL_DB",
        "tables": tables_metadata
    }


def get_system_catalog_metadata(
    connection_string: str,
    database_name: Optional[str] = None,
    schema_name: Optional[str] = None,
    include_system_tables: bool = False,
    force_refresh: bool = False
) -> Dict:
    """
    Get metadata from database system catalog (INFORMATION_SCHEMA)
    More efficient than full introspection for large databases
    
    Args:
        connection_string: Database connection string
        database_name: Optional database name
        schema_name: Optional schema name
        include_system_tables: Whether to include system tables
        force_refresh: Force refresh even if cached (default: False)
    """
    # Check cache first (unless force_refresh is True)
    if not force_refresh:
        cached_metadata = _get_cached_schema_metadata(connection_string, database_name, schema_name)
        if cached_metadata:
            return cached_metadata
    
    db_type = detect_database_type(connection_string)
    
    # Use cached engine or create new one
    engine = _get_cached_engine(connection_string)
    
    if db_type == 'mysql':
        metadata = query_system_catalog_mysql(engine, database_name, include_system_tables)
    elif db_type == 'postgresql':
        metadata = query_system_catalog_postgresql(engine, schema_name, include_system_tables)
    else:
        # Fallback to SQLAlchemy introspection
        from schema_introspection import introspect_sql_schema
        metadata = introspect_sql_schema(connection_string, schema_name)
    
    # Cache the metadata
    _cache_schema_metadata(connection_string, metadata, database_name, schema_name)
    
    # Log total columns fetched to ensure completeness
    total_tables = len(metadata.get('tables', []))
    total_columns = sum(len(t.get('columns', [])) for t in metadata.get('tables', []))
    print(f"[SYSTEM-CATALOG] ✅ Complete metadata fetched: {total_tables} tables, {total_columns} total columns (ALL columns included)")
    
    return metadata


def get_tables_metadata(
    connection_string: str,
    table_names: List[str],
    database_name: Optional[str] = None,
    schema_name: Optional[str] = None
) -> List[Dict]:
    """Get metadata for specific tables only"""
    db_type = detect_database_type(connection_string)
    
    # Use cached engine or create new one
    engine = _get_cached_engine(connection_string)
    inspector = inspect(engine)
    
    tables_metadata = []
    
    for table_name in table_names:
        try:
            columns_metadata = []
            columns = inspector.get_columns(table_name, schema=schema_name)
            
            column_count = 0
            for column in columns:
                columns_metadata.append({
                    "name": column["name"],
                    "type": str(column["type"]),
                    "description": f"Column {column['name']} of type {column['type']}",
                })
                column_count += 1
            
            # Log column count for debugging (ensure ALL columns are fetched)
            if column_count > 0:
                print(f"[SYSTEM-CATALOG] Table {table_name}: {column_count} columns fetched (COMPLETE)")
            
            table_comment = None
            try:
                table_info = inspector.get_table_comment(table_name, schema=schema_name)
                table_comment = table_info.get("text") if table_info else None
            except:
                pass
            
            tables_metadata.append({
                "name": table_name,
                "description": table_comment or f"Table {table_name}",
                "columns": columns_metadata  # ALL columns - no limits
            })
        except Exception as e:
            print(f"[SYSTEM-CATALOG] Error getting metadata for {table_name}: {e}")
            continue
    
    return tables_metadata


def get_table_statistics(
    connection_string: str,
    table_names: Optional[List[str]] = None,
    database_name: Optional[str] = None,
    schema_name: Optional[str] = None
) -> Dict[str, Dict]:
    """Get table statistics (row counts, sizes)"""
    db_type = detect_database_type(connection_string)
    
    # Use cached engine or create new one
    engine = _get_cached_engine(connection_string)
    statistics = {}
    
    with engine.connect() as conn:
        if db_type == 'mysql':
            if not database_name:
                result = conn.execute(text("SELECT DATABASE()"))
                database_name = result.scalar()
            
            if table_names:
                placeholders = ','.join([f"'{t}'" for t in table_names])
                query = text(f"""
                    SELECT 
                        TABLE_NAME,
                        TABLE_ROWS,
                        DATA_LENGTH + INDEX_LENGTH as TABLE_SIZE
                    FROM INFORMATION_SCHEMA.TABLES
                    WHERE TABLE_SCHEMA = :db_name
                    AND TABLE_NAME IN ({placeholders})
                """)
            else:
                query = text("""
                    SELECT 
                        TABLE_NAME,
                        TABLE_ROWS,
                        DATA_LENGTH + INDEX_LENGTH as TABLE_SIZE
                    FROM INFORMATION_SCHEMA.TABLES
                    WHERE TABLE_SCHEMA = :db_name
                    AND TABLE_TYPE = 'BASE TABLE'
                """)
            
            result = conn.execute(query, {"db_name": database_name})
            
            for row in result:
                table_name, row_count, table_size = row
                statistics[table_name] = {
                    "row_count": row_count or 0,
                    "size_bytes": table_size or 0,
                }
        
        elif db_type == 'postgresql':
            schema_name = schema_name or "public"
            
            if table_names:
                placeholders = ','.join([f"'{t}'" for t in table_names])
                query = text(f"""
                    SELECT 
                        schemaname,
                        tablename,
                        n_live_tup as row_count,
                        pg_total_relation_size(schemaname||'.'||tablename) as size_bytes
                    FROM pg_stat_user_tables
                    WHERE schemaname = :schema_name
                    AND tablename IN ({placeholders})
                """)
            else:
                query = text("""
                    SELECT 
                        schemaname,
                        tablename,
                        n_live_tup as row_count,
                        pg_total_relation_size(schemaname||'.'||tablename) as size_bytes
                    FROM pg_stat_user_tables
                    WHERE schemaname = :schema_name
                """)
            
            result = conn.execute(query, {"schema_name": schema_name})
            
            for row in result:
                schema, table_name, row_count, table_size = row
                statistics[table_name] = {
                    "row_count": row_count or 0,
                    "size_bytes": table_size or 0,
                }
    
    return statistics


def validate_table_exists(
    connection_string: str,
    table_name: str,
    database_name: Optional[str] = None,
    schema_name: Optional[str] = None
) -> bool:
    """Check if table exists in database"""
    db_type = detect_database_type(connection_string)
    
    # Use cached engine or create new one
    engine = _get_cached_engine(connection_string)
    inspector = inspect(engine)
    
    try:
        tables = inspector.get_table_names(schema=schema_name)
        return table_name in tables
    except:
        return False


def clear_engine_cache():
    """Clear all cached engines (useful for testing or when connections change)"""
    global _engine_cache
    for cache_key, (engine, _) in list(_engine_cache.items()):
        try:
            engine.dispose()
        except:
            pass
    _engine_cache.clear()
    print("[SYSTEM-CATALOG] 🗑️ Engine cache cleared")


def clear_schema_cache():
    """Clear all cached schema metadata (useful when schema changes)"""
    global _schema_cache
    _schema_cache.clear()
    print("[SYSTEM-CATALOG] 🗑️ Schema cache cleared")

