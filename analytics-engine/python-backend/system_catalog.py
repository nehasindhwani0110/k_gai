"""
System Catalog Service
Queries INFORMATION_SCHEMA directly for efficient metadata retrieval
Works efficiently with 200+ tables
"""

from sqlalchemy import create_engine, text, inspect
from typing import Dict, List, Optional
from schema_introspection import _normalize_connection_string


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
            
            tables_metadata.append({
                "name": table_name,
                "description": table_comment,
                "columns": columns_metadata,
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
            
            tables_metadata.append({
                "name": table_name,
                "description": table_comment,
                "columns": columns_metadata,
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
    include_system_tables: bool = False
) -> Dict:
    """
    Get metadata from database system catalog (INFORMATION_SCHEMA)
    More efficient than full introspection for large databases
    """
    normalized_connection_string = _normalize_connection_string(connection_string)
    db_type = detect_database_type(connection_string)
    
    engine = create_engine(normalized_connection_string)
    
    if db_type == 'mysql':
        return query_system_catalog_mysql(engine, database_name, include_system_tables)
    elif db_type == 'postgresql':
        return query_system_catalog_postgresql(engine, schema_name, include_system_tables)
    else:
        # Fallback to SQLAlchemy introspection
        from schema_introspection import introspect_sql_schema
        return introspect_sql_schema(connection_string, schema_name)


def get_tables_metadata(
    connection_string: str,
    table_names: List[str],
    database_name: Optional[str] = None,
    schema_name: Optional[str] = None
) -> List[Dict]:
    """Get metadata for specific tables only"""
    normalized_connection_string = _normalize_connection_string(connection_string)
    db_type = detect_database_type(connection_string)
    
    engine = create_engine(normalized_connection_string)
    inspector = inspect(engine)
    
    tables_metadata = []
    
    for table_name in table_names:
        try:
            columns_metadata = []
            columns = inspector.get_columns(table_name, schema=schema_name)
            
            for column in columns:
                columns_metadata.append({
                    "name": column["name"],
                    "type": str(column["type"]),
                    "description": f"Column {column['name']} of type {column['type']}",
                })
            
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
    normalized_connection_string = _normalize_connection_string(connection_string)
    db_type = detect_database_type(connection_string)
    
    engine = create_engine(normalized_connection_string)
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
    normalized_connection_string = _normalize_connection_string(connection_string)
    db_type = detect_database_type(connection_string)
    
    engine = create_engine(normalized_connection_string)
    inspector = inspect(engine)
    
    try:
        tables = inspector.get_table_names(schema=schema_name)
        return table_name in tables
    except:
        return False

