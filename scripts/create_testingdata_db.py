"""
Create Testing Database with 100 Tables
========================================

Creates a MySQL database named 'testingdata' with 100 tables,
each containing 30+ columns with diverse data types and sample data.

This script is designed to test the analytics engine with large schemas.

Usage:
    python create_testingdata_db.py
    
    Or with custom connection:
    python create_testingdata_db.py --host localhost --port 3306 --user root --password "neha@2004"
"""

import mysql.connector
from mysql.connector import Error
import random
import string
from datetime import datetime, timedelta
import argparse
import sys
import re

# Default configuration
DEFAULT_HOST = 'localhost'
DEFAULT_PORT = 3306
DEFAULT_USER = 'root'
DEFAULT_PASSWORD = 'neha@2004'
DEFAULT_DATABASE = 'testingdata'

# Table configurations
NUM_TABLES = 100
MIN_COLUMNS_PER_TABLE = 30
MAX_COLUMNS_PER_TABLE = 45
ROWS_PER_TABLE = 1000  # Sample data rows per table

def generate_random_string(length=10):
    """Generate a random string"""
    return ''.join(random.choices(string.ascii_lowercase + string.digits, k=length))

def generate_random_date(start_date=None, end_date=None):
    """Generate a random date"""
    if start_date is None:
        start_date = datetime(2020, 1, 1)
    if end_date is None:
        end_date = datetime.now()
    
    time_between_dates = end_date - start_date
    days_between_dates = time_between_dates.days
    random_number_of_days = random.randrange(days_between_dates)
    return start_date + timedelta(days=random_number_of_days)

def get_table_names():
    """Generate realistic table names for testing"""
    prefixes = [
        'student', 'employee', 'customer', 'product', 'order', 'transaction',
        'invoice', 'payment', 'attendance', 'exam', 'course', 'department',
        'project', 'task', 'meeting', 'event', 'booking', 'reservation',
        'inventory', 'supplier', 'vendor', 'contract', 'agreement', 'document',
        'report', 'analysis', 'metric', 'performance', 'evaluation', 'review',
        'application', 'request', 'approval', 'notification', 'message', 'communication',
        'financial', 'budget', 'expense', 'revenue', 'profit', 'loss',
        'asset', 'liability', 'investment', 'portfolio', 'stock', 'share',
        'user', 'account', 'profile', 'preference', 'setting', 'configuration',
        'log', 'audit', 'history', 'record', 'entry', 'data',
        'category', 'tag', 'label', 'classification', 'group', 'team',
        'location', 'address', 'region', 'country', 'city', 'zone',
        'schedule', 'calendar', 'timeline', 'milestone', 'deadline', 'reminder',
        'survey', 'questionnaire', 'response', 'feedback', 'rating', 'comment',
        'media', 'file', 'image', 'video', 'audio', 'attachment',
        'subscription', 'membership', 'license', 'permission', 'access', 'privilege'
    ]
    
    suffixes = [
        '_info', '_details', '_data', '_records', '_master', '_main',
        '_archive', '_history', '_log', '_backup', '_temp', '_staging',
        '_production', '_development', '_test', '_demo', '_sample', '_template'
    ]
    
    table_names = []
    used_names = set()
    
    for i in range(NUM_TABLES):
        while True:
            prefix = random.choice(prefixes)
            suffix = random.choice(suffixes) if random.random() > 0.5 else ''
            table_name = f"{prefix}{suffix}_{i+1:03d}"
            
            if table_name not in used_names:
                used_names.add(table_name)
                table_names.append(table_name)
                break
    
    return table_names

def get_column_definitions(num_columns):
    """Generate column definitions with diverse data types"""
    # MySQL reserved keywords that should be avoided or prefixed
    mysql_reserved_keywords = {
        'key', 'group', 'order', 'type', 'status', 'comment', 'text', 'data', 'time', 'date',
        'number', 'level', 'mode', 'start', 'end', 'reference', 'password', 'properties',
        'attributes', 'depth', 'count', 'batch', 'created', 'message', 'complete', 'edition',
        'manager', 'ratio', 'postal', 'price', 'target', 'template', 'updated', 'middle',
        'rate', 'token', 'content', 'first', 'state', 'class', 'rank', 'weight', 'size',
        'length', 'width', 'height', 'model', 'version', 'city', 'zip', 'last', 'full',
        'alias', 'username', 'login', 'hash', 'secret', 'access', 'permission', 'begin',
        'finish', 'done', 'active', 'inactive', 'enabled', 'disabled', 'visible', 'hidden',
        'public', 'private', 'shared', 'owner', 'creator', 'author', 'editor', 'admin',
        'user', 'source', 'target', 'origin', 'destination', 'from', 'to', 'via', 'method',
        'way', 'format', 'style', 'theme', 'note', 'remark', 'memo', 'file', 'path', 'url',
        'link', 'ref', 'id_ref', 'metadata', 'info', 'details', 'specs', 'name', 'title',
        'description', 'code', 'value', 'amount', 'cost', 'total', 'sum', 'average', 'quantity',
        'score', 'rating', 'percentage', 'fee', 'charge', 'discount', 'modified', 'deleted',
        'archived', 'category', 'priority', 'color', 'brand', 'series', 'email', 'phone',
        'address', 'country', 'nick', 'key', 'number'
    }
    
    column_types = [
        ('INT', 'INTEGER'),
        ('BIGINT', 'BIGINT'),
        ('DECIMAL(10,2)', 'DECIMAL'),
        ('FLOAT', 'FLOAT'),
        ('DOUBLE', 'DOUBLE'),
        ('VARCHAR(255)', 'VARCHAR'),
        ('VARCHAR(100)', 'VARCHAR'),
        ('VARCHAR(500)', 'VARCHAR'),
        ('TEXT', 'TEXT'),
        ('DATE', 'DATE'),
        ('DATETIME', 'DATETIME'),
        ('TIMESTAMP', 'TIMESTAMP'),
        ('TIME', 'TIME'),
        ('YEAR', 'YEAR'),
        ('BOOLEAN', 'BOOLEAN'),
        ('TINYINT(1)', 'BOOLEAN'),
        ('CHAR(1)', 'CHAR'),
        ('CHAR(10)', 'CHAR'),
    ]
    
    # Safe column name prefixes (avoiding reserved keywords)
    column_name_prefixes = [
        'item_id', 'item_name', 'item_title', 'item_description', 'item_code', 'item_number', 'item_value', 'item_amount',
        'item_price', 'item_cost', 'item_total', 'item_sum', 'item_average', 'item_count', 'item_quantity', 'item_score',
        'item_rating', 'item_percentage', 'item_ratio', 'item_rate', 'item_fee', 'item_charge', 'item_discount',
        'item_date', 'item_time', 'item_created', 'item_updated', 'item_modified', 'item_deleted', 'item_archived',
        'item_status', 'item_state', 'item_type', 'item_category', 'item_class', 'item_group', 'item_level', 'item_rank',
        'item_priority', 'item_weight', 'item_size', 'item_length', 'item_width', 'item_height', 'item_depth',
        'item_color', 'item_brand', 'item_model', 'item_version', 'item_edition', 'item_series', 'item_batch',
        'item_email', 'item_phone', 'item_address', 'item_city', 'item_state_name', 'item_country', 'item_zip',
        'item_first_name', 'item_last_name', 'item_middle_name', 'item_full_name', 'item_nickname', 'item_alias',
        'item_username', 'item_login', 'item_password_hash', 'item_secret_key', 'item_access_token', 'item_permission',
        'item_start_date', 'item_end_date', 'item_begin_date', 'item_finish_date', 'item_complete_flag', 'item_done_flag',
        'item_active_flag', 'item_inactive_flag', 'item_enabled_flag', 'item_disabled_flag', 'item_visible_flag',
        'item_hidden_flag', 'item_public_flag', 'item_private_flag', 'item_shared_flag', 'item_owner', 'item_creator',
        'item_author', 'item_editor', 'item_manager', 'item_admin', 'item_user', 'item_source', 'item_target',
        'item_origin', 'item_destination', 'item_from_field', 'item_to_field', 'item_via_field', 'item_method',
        'item_way', 'item_mode', 'item_format', 'item_style', 'item_theme', 'item_template', 'item_note',
        'item_comment_text', 'item_remark', 'item_memo', 'item_message', 'item_text_content', 'item_content',
        'item_file', 'item_path', 'item_url', 'item_link', 'item_reference', 'item_ref', 'item_id_ref',
        'item_metadata', 'item_info', 'item_data', 'item_details', 'item_specs', 'item_attributes', 'item_properties'
    ]
    
    columns = []
    used_names = set()
    
    for i in range(num_columns):
        while True:
            # First column is always primary key with name 'id'
            if i == 0:
                col_name = 'id'
                col_type = 'INT'
                type_category = 'INTEGER'
            else:
                prefix = random.choice(column_name_prefixes)
                col_type, type_category = random.choice(column_types)
                
                # Generate column name
                if random.random() > 0.3:
                    col_name = f"{prefix}_{i+1}"
                else:
                    col_name = f"{prefix}"
            
            # Avoid duplicates
            if col_name in used_names:
                col_name = f"{col_name}_{i+1}"
            
            used_names.add(col_name)
            
            # Add primary key for first column
            is_primary = (i == 0)
            is_nullable = not is_primary and random.random() > 0.2
            
            col_def = {
                'name': col_name,
                'type': col_type,
                'category': type_category,
                'is_primary': is_primary,
                'is_nullable': is_nullable
            }
            
            columns.append(col_def)
            break
    
    return columns

def create_table_sql(table_name, columns):
    """Generate CREATE TABLE SQL statement"""
    col_definitions = []
    
    for col in columns:
        # Escape column name with backticks to handle reserved keywords
        col_name_escaped = f"`{col['name']}`"
        col_def = f"{col_name_escaped} {col['type']}"
        
        if col['is_primary']:
            col_def += " PRIMARY KEY AUTO_INCREMENT"
        elif not col['is_nullable']:
            col_def += " NOT NULL"
        
        col_definitions.append(col_def)
    
    # Add some indexes (avoid creating indexes on reserved keywords that might cause issues)
    indexes = []
    mysql_reserved_keywords = {
        'model', 'private', 'height', 'path', 'mode', 'source', 'shared', 'size',
        'disabled', 'memo', 'complete', 'style', 'description', 'url', 'archived',
        'via', 'creator', 'weight', 'price', 'editor', 'inactive', 'type', 'color',
        'file', 'secret', 'rate', 'city', 'status', 'author', 'finish', 'sum',
        'count', 'length', 'score', 'done', 'date', 'link', 'enabled', 'width',
        'title', 'deleted', 'percentage', 'method', 'created', 'discount', 'info',
        'rank', 'hidden', 'middle', 'email', 'category', 'reference'
    }
    
    indexed_count = 0
    for i, col in enumerate(columns[1:], 1):  # Skip primary key
        if indexed_count >= 5:  # Limit to 5 indexes
            break
        # Skip reserved keywords for indexes to avoid issues
        col_base_name = col['name'].split('_')[0] if '_' in col['name'] else col['name']
        if col['category'] in ['VARCHAR', 'INTEGER', 'DATE', 'DATETIME'] and col_base_name.lower() not in mysql_reserved_keywords:
            # Escape index name and column name
            index_name = f"idx_{col['name']}"[:64]  # MySQL index name limit
            indexes.append(f"INDEX `{index_name}` (`{col['name']}`)")
            indexed_count += 1
    
    index_sql = ""
    if indexes:
        index_sql = ",\n  " + ",\n  ".join(indexes)
    
    sql = f"""CREATE TABLE IF NOT EXISTS `{table_name}` (
  {',\n  '.join(col_definitions)}{index_sql}
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;"""
    
    return sql

def extract_varchar_length(col_type):
    """Extract VARCHAR length from column type string"""
    match = re.search(r'VARCHAR\((\d+)\)', col_type)
    if match:
        return int(match.group(1))
    return None

def generate_insert_values(columns, num_rows):
    """Generate INSERT VALUES for a table"""
    values_list = []
    
    for row_num in range(num_rows):
        row_values = []
        
        for col in columns:
            if col['is_primary']:
                # Skip primary key (auto-increment)
                continue
            
            category = col['category']
            col_type = col['type']
            is_nullable = col['is_nullable']
            
            # Randomly set NULL for nullable columns
            if is_nullable and random.random() < 0.1:
                row_values.append('NULL')
                continue
            
            if category == 'INTEGER':
                value = random.randint(1, 1000000)
            elif category == 'BIGINT':
                value = random.randint(1, 1000000000)
            elif category == 'DECIMAL':
                value = round(random.uniform(0.01, 10000.99), 2)
            elif category == 'FLOAT' or category == 'DOUBLE':
                value = round(random.uniform(0.0, 1000.0), 4)
            elif category == 'VARCHAR':
                # Extract VARCHAR length and respect it
                varchar_length = extract_varchar_length(col_type)
                if varchar_length is None:
                    varchar_length = 255  # Default fallback
                
                # Generate string respecting the length limit
                max_str_length = min(varchar_length - 1, 250)  # Leave some margin
                
                if 'name' in col['name'] or 'title' in col['name']:
                    str_length = min(15, max_str_length)
                    value = f"'{generate_random_string(str_length)}'"
                elif 'email' in col['name']:
                    str_length = min(30, max_str_length)
                    value = f"'{generate_random_string(str_length - 10)}@example.com'"
                elif 'phone' in col['name']:
                    value = f"'{random.randint(1000000000, 9999999999)}'"
                elif 'address' in col['name'] or 'description' in col['name']:
                    str_length = min(50, max_str_length)
                    value = f"'{generate_random_string(str_length)}'"
                else:
                    str_length = min(20, max_str_length)
                    value = f"'{generate_random_string(str_length)}'"
            elif category == 'TEXT':
                # TEXT can be very long, but let's keep it reasonable
                if 'name' in col['name'] or 'title' in col['name']:
                    value = f"'{generate_random_string(50)}'"
                elif 'email' in col['name']:
                    value = f"'{generate_random_string(20)}@example.com'"
                elif 'address' in col['name'] or 'description' in col['name']:
                    value = f"'{generate_random_string(100)}'"
                else:
                    value = f"'{generate_random_string(50)}'"
            elif category == 'DATE':
                date_val = generate_random_date()
                value = f"'{date_val.strftime('%Y-%m-%d')}'"
            elif category == 'DATETIME' or category == 'TIMESTAMP':
                date_val = generate_random_date()
                value = f"'{date_val.strftime('%Y-%m-%d %H:%M:%S')}'"
            elif category == 'TIME':
                value = f"'{random.randint(0,23):02d}:{random.randint(0,59):02d}:{random.randint(0,59):02d}'"
            elif category == 'YEAR':
                value = random.randint(2020, 2024)
            elif category == 'BOOLEAN':
                value = random.choice([0, 1])
            elif category == 'CHAR':
                # Extract CHAR length
                char_match = re.search(r'CHAR\((\d+)\)', col_type)
                char_length = int(char_match.group(1)) if char_match else 1
                str_length = min(char_length, 10)
                value = f"'{generate_random_string(str_length)}'"
            else:
                value = f"'{generate_random_string(10)}'"
            
            row_values.append(str(value))
        
        values_list.append(f"({', '.join(row_values)})")
    
    return values_list

def create_database(connection, database_name):
    """Create database if it doesn't exist"""
    try:
        cursor = connection.cursor()
        cursor.execute(f"CREATE DATABASE IF NOT EXISTS `{database_name}` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci")
        cursor.execute(f"USE `{database_name}`")
        print(f"✅ Database '{database_name}' created/selected")
        cursor.close()
        return True
    except Error as e:
        print(f"❌ Error creating database: {e}")
        return False

def create_tables(connection, table_names):
    """Create all tables"""
    cursor = connection.cursor()
    
    print(f"\n📊 Creating {NUM_TABLES} tables...")
    print("=" * 70)
    
    created_tables = []
    
    for i, table_name in enumerate(table_names, 1):
        try:
            # Generate random number of columns (30-45)
            num_columns = random.randint(MIN_COLUMNS_PER_TABLE, MAX_COLUMNS_PER_TABLE)
            columns = get_column_definitions(num_columns)
            
            # Create table
            create_sql = create_table_sql(table_name, columns)
            cursor.execute(create_sql)
            
            created_tables.append({
                'name': table_name,
                'columns': columns,
                'num_columns': num_columns
            })
            
            if i % 10 == 0:
                print(f"✅ Created {i}/{NUM_TABLES} tables...")
        
        except Error as e:
            print(f"❌ Error creating table {table_name}: {e}")
            continue
    
    connection.commit()
    cursor.close()
    
    print(f"\n✅ Successfully created {len(created_tables)} tables")
    return created_tables

def populate_tables(connection, tables, rows_per_table):
    """Populate tables with sample data"""
    cursor = connection.cursor()
    
    print(f"\n📝 Populating tables with sample data...")
    print("=" * 70)
    
    populated_count = 0
    
    for i, table_info in enumerate(tables, 1):
        table_name = table_info['name']
        columns = table_info['columns']
        
        try:
            # Get column names (excluding primary key)
            col_names = [col['name'] for col in columns if not col['is_primary']]
            
            if not col_names:
                continue
            
            # Generate insert values
            values_list = generate_insert_values(columns, rows_per_table)
            
            if not values_list:
                continue
            
            # Build INSERT statement
            col_names_str = ', '.join([f"`{name}`" for name in col_names])
            
            # Insert in batches of 100
            batch_size = 100
            for batch_start in range(0, len(values_list), batch_size):
                batch = values_list[batch_start:batch_start + batch_size]
                values_str = ', '.join(batch)
                
                insert_sql = f"INSERT INTO `{table_name}` ({col_names_str}) VALUES {values_str}"
                cursor.execute(insert_sql)
            
            connection.commit()
            populated_count += 1
            
            if i % 10 == 0:
                print(f"✅ Populated {i}/{len(tables)} tables...")
        
        except Error as e:
            print(f"❌ Error populating table {table_name}: {e}")
            connection.rollback()
            continue
    
    cursor.close()
    print(f"\n✅ Successfully populated {populated_count} tables with {ROWS_PER_TABLE} rows each")
    return populated_count

def print_summary(connection, database_name):
    """Print database summary"""
    cursor = connection.cursor()
    
    print("\n" + "=" * 70)
    print("📊 DATABASE SUMMARY")
    print("=" * 70)
    
    # Count tables
    cursor.execute(f"SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = '{database_name}'")
    table_count = cursor.fetchone()[0]
    
    # Count total columns
    cursor.execute(f"""
        SELECT COUNT(*) 
        FROM information_schema.columns 
        WHERE table_schema = '{database_name}'
    """)
    column_count = cursor.fetchone()[0]
    
    # Get table sizes
    cursor.execute(f"""
        SELECT 
            table_name,
            table_rows,
            ROUND(((data_length + index_length) / 1024 / 1024), 2) AS size_mb
        FROM information_schema.tables
        WHERE table_schema = '{database_name}'
        ORDER BY size_mb DESC
        LIMIT 10
    """)
    
    largest_tables = cursor.fetchall()
    
    print(f"\n✅ Database: {database_name}")
    print(f"✅ Total Tables: {table_count}")
    print(f"✅ Total Columns: {column_count}")
    print(f"✅ Average Columns per Table: {column_count // table_count if table_count > 0 else 0}")
    
    if largest_tables:
        print(f"\n📈 Top 10 Largest Tables:")
        for table_name, rows, size_mb in largest_tables:
            print(f"   - {table_name}: {rows:,} rows, {size_mb} MB")
    
    cursor.close()

def main():
    parser = argparse.ArgumentParser(description='Create testing database with 100 tables')
    parser.add_argument('--host', type=str, default=DEFAULT_HOST, help='MySQL host')
    parser.add_argument('--port', type=int, default=DEFAULT_PORT, help='MySQL port')
    parser.add_argument('--user', type=str, default=DEFAULT_USER, help='MySQL username')
    parser.add_argument('--password', type=str, default=DEFAULT_PASSWORD, help='MySQL password')
    parser.add_argument('--database', type=str, default=DEFAULT_DATABASE, help='Database name')
    parser.add_argument('--skip-data', action='store_true', help='Skip populating tables with data')
    parser.add_argument('--rows-per-table', type=int, default=ROWS_PER_TABLE, help='Number of rows per table')
    
    args = parser.parse_args()
    
    print("=" * 70)
    print("  CREATE TESTING DATABASE")
    print("=" * 70)
    print(f"\nConfiguration:")
    print(f"  Host: {args.host}")
    print(f"  Port: {args.port}")
    print(f"  User: {args.user}")
    print(f"  Database: {args.database}")
    print(f"  Tables: {NUM_TABLES}")
    print(f"  Columns per table: {MIN_COLUMNS_PER_TABLE}-{MAX_COLUMNS_PER_TABLE}")
    print(f"  Rows per table: {args.rows_per_table}")
    print(f"  Populate data: {'No' if args.skip_data else 'Yes'}")
    
    connection = None
    
    try:
        # Connect to MySQL server (without database)
        print(f"\n🔌 Connecting to MySQL server...")
        connection = mysql.connector.connect(
            host=args.host,
            port=args.port,
            user=args.user,
            password=args.password
        )
        
        if connection.is_connected():
            print("✅ Connected to MySQL server")
        
        # Create database
        if not create_database(connection, args.database):
            sys.exit(1)
        
        # Reconnect to the specific database
        connection.close()
        connection = mysql.connector.connect(
            host=args.host,
            port=args.port,
            user=args.user,
            password=args.password,
            database=args.database
        )
        
        # Generate table names
        print(f"\n📋 Generating {NUM_TABLES} table names...")
        table_names = get_table_names()
        
        # Create tables
        tables = create_tables(connection, table_names)
        
        if not tables:
            print("❌ No tables were created")
            sys.exit(1)
        
        # Populate tables with data
        if not args.skip_data:
            populate_tables(connection, tables, args.rows_per_table)
        
        # Print summary
        print_summary(connection, args.database)
        
        print("\n" + "=" * 70)
        print("✅ DATABASE CREATION COMPLETE!")
        print("=" * 70)
        print(f"\nConnection String:")
        encoded_password = args.password.replace('@', '%40').replace('#', '%23').replace('%', '%25')
        print(f"mysql://{args.user}:{encoded_password}@{args.host}:{args.port}/{args.database}")
        print("\n")
    
    except Error as e:
        print(f"\n❌ MySQL Error: {e}")
        sys.exit(1)
    
    except KeyboardInterrupt:
        print("\n\n⚠️  Operation cancelled by user")
        sys.exit(1)
    
    except Exception as e:
        print(f"\n❌ Unexpected error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
    
    finally:
        if connection and connection.is_connected():
            connection.close()
            print("🔌 MySQL connection closed")

if __name__ == "__main__":
    main()

