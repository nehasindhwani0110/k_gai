"""
Quick Database Test
===================

Quick test to verify database connection and basic query execution.

Usage:
    python scripts/quick_test_db.py
"""

import requests
import json
import sys

BASE_URL = "http://localhost:3000"
API_BASE = f"{BASE_URL}/api/analytics"
CONNECTION_STRING = "mysql://root:neha%402004@localhost:3306/testingdata"

# Note: In Next.js App Router, route.ts files create endpoints at the directory path
# So /api/analytics/route.ts creates endpoint at /api/analytics (not /api/analytics/route)

def test_connection():
    """Test if server is running"""
    try:
        response = requests.get(BASE_URL, timeout=5)
        print("✅ Server is running")
        return True
    except:
        print("❌ Server is not running. Please start the Next.js server first.")
        print("   Run: npm run dev")
        return False

def test_schema():
    """Test schema retrieval"""
    print("\n📋 Testing schema retrieval...")
    try:
        payload = {
            "source_type": "SQL_DB",
            "connection_string": CONNECTION_STRING
        }
        response = requests.post(f"{API_BASE}/schema", json=payload, timeout=30)
        
        if response.status_code == 200:
            data = response.json()
            tables = data.get('tables', [])
            print(f"✅ Schema retrieved: {len(tables)} tables found")
            if tables:
                print(f"   Sample tables: {', '.join([t['name'] for t in tables[:5]])}")
            return data
        else:
            print(f"❌ Schema retrieval failed: {response.status_code}")
            print(f"   {response.text[:200]}")
            return None
    except Exception as e:
        print(f"❌ Error: {e}")
        return None

def test_query_generation(metadata):
    """Test query generation"""
    print("\n🔍 Testing query generation...")
    tables_count = len(metadata.get('tables', []))
    if tables_count > 100:
        print(f"   ⚠️  Large database detected ({tables_count} tables)")
        print("   First query may take 3-10 minutes while embeddings are generated...")
        print("   This is normal - embeddings are cached for future queries.")
        timeout = 600  # 10 minutes for very large databases
    elif tables_count > 50:
        print(f"   Note: Medium database ({tables_count} tables)")
        print("   First query may take 2-5 minutes...")
        timeout = 300  # 5 minutes
    else:
        timeout = 120  # 2 minutes for smaller databases
    
    try:
        payload = {
            "mode": "ADHOC_QUERY",
            "metadata": metadata,
            "user_question": "Show me top 5 records",
            "connection_string": CONNECTION_STRING
        }
        print(f"   Waiting up to {timeout//60} minutes for query generation...")
        response = requests.post(f"{API_BASE}", json=payload, timeout=timeout)
        
        if response.status_code == 200:
            data = response.json()
            query = data.get('query_content', '')
            print(f"✅ Query generated successfully")
            print(f"   Generated SQL: {query[:150]}...")
            return query
        else:
            print(f"❌ Query generation failed: {response.status_code}")
            print(f"   {response.text[:200]}")
            return None
    except Exception as e:
        print(f"❌ Error: {e}")
        return None

def test_query_execution(query):
    """Test query execution"""
    print("\n⚡ Testing query execution...")
    try:
        payload = {
            "query_type": "SQL_QUERY",
            "query_content": query,
            "source_type": "SQL_DB",
            "connection_string": CONNECTION_STRING
        }
        response = requests.post(f"{API_BASE}/execute", json=payload, timeout=30)
        
        if response.status_code == 200:
            data = response.json()
            rows = data.get('row_count', 0)
            print(f"✅ Query executed successfully")
            print(f"   Rows returned: {rows}")
            if rows > 0:
                results = data.get('results', [])
                if results:
                    print(f"   Sample columns: {', '.join(list(results[0].keys())[:5])}")
            return True
        else:
            print(f"❌ Query execution failed: {response.status_code}")
            print(f"   {response.text[:200]}")
            return False
    except Exception as e:
        print(f"❌ Error: {e}")
        import traceback
        traceback.print_exc()
        return False

def main():
    print("=" * 70)
    print("  QUICK DATABASE TEST")
    print("=" * 70)
    
    # Test 1: Server connection
    if not test_connection():
        sys.exit(1)
    
    # Test 2: Schema retrieval
    metadata = test_schema()
    if not metadata:
        print("\n❌ Cannot proceed without schema")
        sys.exit(1)
    
    # Test 3: Query generation
    query = test_query_generation(metadata)
    if not query:
        print("\n❌ Query generation failed")
        sys.exit(1)
    
    # Test 4: Query execution
    success = test_query_execution(query)
    if not success:
        print("\n❌ Query execution failed")
        sys.exit(1)
    
    print("\n" + "=" * 70)
    print("✅ ALL TESTS PASSED!")
    print("=" * 70)
    print("\nThe database is working correctly!")
    print("You can now run the full test suite:")
    print("  python scripts/test_testingdata_db.py")

if __name__ == "__main__":
    main()

