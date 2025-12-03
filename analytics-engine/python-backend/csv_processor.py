"""
CSV File Processing Service
Uses Pandas and DuckDB for CSV processing and query execution
"""

import pandas as pd
import duckdb
from typing import Dict, List, Any, Optional
from datetime import datetime, date, time, timedelta
from decimal import Decimal
import json
import os


def serialize_value(value: Any) -> Any:
    """
    Convert Python objects to JSON-serializable types.
    
    Handles:
    - datetime, date, time -> ISO format strings
    - timedelta -> total seconds (float)
    - Decimal -> float
    - bytes -> base64 encoded string
    - pandas Timestamp -> ISO format string
    - Other types -> as-is
    """
    if value is None:
        return None
    elif pd.isna(value):
        return None
    elif isinstance(value, (pd.Timestamp, datetime)):
        return value.isoformat()
    elif isinstance(value, date):
        return value.isoformat()
    elif isinstance(value, time):
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


def process_csv_file(file_path: str, table_name: Optional[str] = None) -> Dict:
    """
    Processes a CSV file and creates virtual table metadata.
    
    Args:
        file_path: Path to the CSV file
        table_name: Optional custom table name
        
    Returns:
        Dictionary with source_type and tables metadata
    """
    if not os.path.exists(file_path):
        raise FileNotFoundError(f"CSV file not found: {file_path}")
    
    # Read CSV to infer schema
    df = pd.read_csv(file_path, nrows=0)  # Read only header
    
    columns_metadata = []
    for col_name in df.columns:
        # Read a sample row to infer type
        sample_df = pd.read_csv(file_path, nrows=1)
        sample_value = sample_df[col_name].iloc[0] if len(sample_df) > 0 else None
        
        col_type = infer_column_type(sample_value)
        
        columns_metadata.append({
            "name": col_name,
            "description": f"Column {col_name}",
            "type": col_type
        })
    
    table_name = table_name or os.path.splitext(os.path.basename(file_path))[0]
    
    return {
        "source_type": "CSV_FILE",
        "tables": [{
            "name": table_name,
            "description": f"CSV file: {os.path.basename(file_path)}",
            "columns": columns_metadata
        }]
    }


def infer_column_type(value: Any) -> str:
    """
    Infers column type from a sample value.
    
    Args:
        value: Sample value from the column
        
    Returns:
        Type string (INT, DECIMAL, DATE, TEXT)
    """
    if pd.isna(value):
        return "TEXT"
    
    # Check for date
    if isinstance(value, str):
        if pd.to_datetime(value, errors='coerce') is not pd.NaT:
            return "DATE"
    
    # Check for integer
    try:
        int_val = int(float(str(value)))
        if float(str(value)) == int_val:
            return "INT"
    except:
        pass
    
    # Check for decimal
    try:
        float(str(value))
        return "DECIMAL"
    except:
        pass
    
    return "TEXT"


def execute_csv_query(file_path: str, query_logic: str) -> List[Dict]:
    """
    Executes query logic on CSV file using DuckDB.
    
    Args:
        file_path: Path to the CSV file
        query_logic: SQL query or logical expression
        
    Returns:
        List of result dictionaries
    """
    # Create DuckDB connection
    conn = duckdb.connect()
    
    # Register CSV as a table
    table_name = os.path.splitext(os.path.basename(file_path))[0].replace('-', '_')
    conn.execute(f"CREATE TABLE {table_name} AS SELECT * FROM read_csv_auto('{file_path}')")
    
    # Execute query
    try:
        result = conn.execute(query_logic).fetchdf()
        conn.close()
        
        # Convert DataFrame to list of dictionaries and serialize values
        records = result.to_dict('records')
        # Serialize all values to ensure JSON compatibility
        serialized_records = []
        for record in records:
            serialized_dict = {k: serialize_value(v) for k, v in record.items()}
            serialized_records.append(serialized_dict)
        return serialized_records
    except Exception as e:
        conn.close()
        raise Exception(f"Query execution failed: {str(e)}")


if __name__ == "__main__":
    # Example usage
    file_path = "example.csv"
    metadata = process_csv_file(file_path)
    print(json.dumps(metadata, indent=2))

