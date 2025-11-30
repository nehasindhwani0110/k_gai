"""
SQL Schema Introspection Service
Uses SQLAlchemy to introspect database schemas
"""

from sqlalchemy import create_engine, inspect, MetaData, Table
from sqlalchemy.engine import Engine
from typing import Dict, List, Optional
import json


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
    engine = create_engine(connection_string)
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

