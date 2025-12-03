"""
Test Testing Database Queries
=============================

Tests the analytics engine with the testingdata database to verify:
- Query generation works correctly
- Generated SQL queries are valid
- Queries execute successfully
- Results are returned properly

Usage:
    python scripts/test_testingdata_db.py
"""

import requests
import json
import time
import sys
from typing import Dict, Any, Optional

# Configuration
BASE_URL = "http://localhost:3000"
API_BASE = f"{BASE_URL}/api/analytics"
CONNECTION_STRING = "mysql://root:neha%402004@localhost:3306/testingdata"

def print_section(title):
    """Print a formatted section header"""
    print("\n" + "=" * 70)
    print(f"  {title}")
    print("=" * 70)

def get_schema(connection_string: str) -> Optional[Dict]:
    """Get schema metadata for the database"""
    print_section("Step 1: Getting Schema Metadata")
    
    try:
        payload = {
            "source_type": "SQL_DB",
            "connection_string": connection_string
        }
        
        print(f"Requesting schema from: {API_BASE}/schema")
        start_time = time.time()
        response = requests.post(f"{API_BASE}/schema", json=payload, timeout=60)
        elapsed = time.time() - start_time
        
        if response.status_code == 200:
            data = response.json()
            tables = data.get('tables', [])
            total_columns = sum(len(t.get('columns', [])) for t in tables)
            
            print(f"✅ Schema retrieved in {elapsed:.2f}s")
            print(f"   Tables: {len(tables)}")
            print(f"   Total Columns: {total_columns}")
            
            if tables:
                print(f"\n   Sample tables:")
                for table in tables[:5]:
                    cols = table.get('columns', [])
                    print(f"   - {table.get('name')}: {len(cols)} columns")
                    if cols:
                        sample_cols = ', '.join([c['name'] for c in cols[:5]])
                        print(f"     Columns: {sample_cols}...")
            
            return data
        else:
            print(f"❌ Schema retrieval failed: {response.status_code}")
            print(f"   Error: {response.text[:500]}")
            return None
    except Exception as e:
        print(f"❌ Schema error: {str(e)}")
        import traceback
        traceback.print_exc()
        return None

def test_query_generation(question: str, metadata: Dict, connection_string: str) -> Optional[Dict]:
    """Test query generation for a question"""
    print(f"\n📊 Testing Query Generation")
    print(f"   Question: '{question}'")
    
    # Determine timeout based on database size
    tables_count = len(metadata.get('tables', []))
    if tables_count > 100:
        timeout = 600  # 10 minutes for very large databases
        print(f"   ⚠️  Large database ({tables_count} tables) - allowing up to {timeout//60} minutes")
    elif tables_count > 50:
        timeout = 300  # 5 minutes
    else:
        timeout = 120  # 2 minutes
    
    try:
        payload = {
            "mode": "ADHOC_QUERY",
            "metadata": metadata,
            "user_question": question,
            "connection_string": connection_string
        }
        
        start_time = time.time()
        response = requests.post(f"{API_BASE}", json=payload, timeout=timeout)
        elapsed = time.time() - start_time
        
        if response.status_code == 200:
            data = response.json()
            query = data.get('query_content', '')
            query_type = data.get('query_type', '')
            visualization = data.get('visualization_type', '')
            insight = data.get('insight_summary', '')
            
            print(f"   ✅ Generated in {elapsed:.2f}s")
            print(f"   Query Type: {query_type}")
            print(f"   Visualization: {visualization}")
            print(f"   Query: {query[:150]}..." if len(query) > 150 else f"   Query: {query}")
            if insight:
                print(f"   Insight: {insight[:100]}...")
            
            return {
                "success": True,
                "time": elapsed,
                "query": query,
                "query_type": query_type,
                "data": data
            }
        else:
            print(f"   ❌ Failed: {response.status_code}")
            print(f"   Error: {response.text[:300]}")
            return {"success": False, "time": elapsed, "error": response.text}
    except Exception as e:
        print(f"   ❌ Error: {str(e)}")
        import traceback
        traceback.print_exc()
        return {"success": False, "time": 0, "error": str(e)}

def test_query_execution(query: str, connection_string: str) -> Optional[Dict]:
    """Test query execution"""
    print(f"\n⚡ Testing Query Execution")
    print(f"   Query: {query[:100]}...")
    
    try:
        payload = {
            "query_type": "SQL_QUERY",
            "query_content": query,
            "source_type": "SQL_DB",
            "connection_string": connection_string
        }
        
        start_time = time.time()
        response = requests.post(f"{API_BASE}/execute", json=payload, timeout=60)
        elapsed = time.time() - start_time
        
        if response.status_code == 200:
            data = response.json()
            results = data.get('results', [])
            row_count = data.get('row_count', len(results))
            
            print(f"   ✅ Executed in {elapsed:.2f}s")
            print(f"   Rows returned: {row_count}")
            
            if results:
                print(f"   Sample result (first row):")
                first_row = results[0]
                sample_keys = list(first_row.keys())[:5]
                sample_data = {k: first_row[k] for k in sample_keys}
                print(f"   {json.dumps(sample_data, indent=4, default=str)[:200]}...")
            
            return {
                "success": True,
                "time": elapsed,
                "rows": row_count,
                "results": results
            }
        else:
            print(f"   ❌ Execution failed: {response.status_code}")
            print(f"   Error: {response.text[:300]}")
            return {"success": False, "time": elapsed, "error": response.text}
    except Exception as e:
        print(f"   ❌ Error: {str(e)}")
        import traceback
        traceback.print_exc()
        return {"success": False, "time": 0, "error": str(e)}

def run_test_suite(metadata: Dict, connection_string: str):
    """Run a comprehensive test suite"""
    print_section("Step 2: Running Test Queries")
    
    test_queries = [
        {
            "question": "Show me top 10 records from any table",
            "description": "Simple SELECT with LIMIT"
        },
        {
            "question": "What is the average value of numeric columns?",
            "description": "Aggregation query"
        },
        {
            "question": "Count records grouped by category",
            "description": "GROUP BY query"
        },
        {
            "question": "Show records ordered by date",
            "description": "ORDER BY query"
        },
        {
            "question": "Find records with specific text",
            "description": "WHERE clause with text search"
        },
        {
            "question": "Compare values across different groups",
            "description": "GROUP BY with aggregation"
        },
        {
            "question": "Show distribution of data over time",
            "description": "Time-based grouping"
        },
        {
            "question": "What are the top 5 items by value?",
            "description": "ORDER BY DESC with LIMIT"
        }
    ]
    
    results = []
    
    for i, test in enumerate(test_queries, 1):
        print(f"\n[{i}/{len(test_queries)}] {test['description']}")
        print("-" * 70)
        
        # Generate query
        gen_result = test_query_generation(test['question'], metadata, connection_string)
        
        if gen_result and gen_result.get('success'):
            query = gen_result.get('query', '')
            
            # Execute query
            exec_result = test_query_execution(query, connection_string)
            
            results.append({
                "test": test['description'],
                "question": test['question'],
                "generation": gen_result,
                "execution": exec_result,
                "overall_success": exec_result.get('success', False) if exec_result else False
            })
        else:
            results.append({
                "test": test['description'],
                "question": test['question'],
                "generation": gen_result,
                "execution": None,
                "overall_success": False
            })
        
        # Small delay between queries
        time.sleep(0.5)
    
    return results

def print_summary(results):
    """Print test summary"""
    print_section("Test Summary")
    
    successful = [r for r in results if r.get('overall_success')]
    failed = [r for r in results if not r.get('overall_success')]
    
    print(f"\n📊 Overall Results:")
    print(f"   ✅ Successful: {len(successful)}/{len(results)}")
    print(f"   ❌ Failed: {len(failed)}/{len(results)}")
    
    if successful:
        gen_times = [r['generation']['time'] for r in successful if r.get('generation')]
        exec_times = [r['execution']['time'] for r in successful if r.get('execution')]
        
        if gen_times:
            print(f"\n⏱️  Performance Metrics:")
            print(f"   Query Generation:")
            print(f"     Average: {sum(gen_times) / len(gen_times):.2f}s")
            print(f"     Min: {min(gen_times):.2f}s")
            print(f"     Max: {max(gen_times):.2f}s")
        
        if exec_times:
            print(f"   Query Execution:")
            print(f"     Average: {sum(exec_times) / len(exec_times):.2f}s")
            print(f"     Min: {min(exec_times):.2f}s")
            print(f"     Max: {max(exec_times):.2f}s")
    
    if successful:
        print(f"\n✅ Successful Tests:")
        for r in successful:
            print(f"   - {r['test']}")
            if r.get('execution'):
                print(f"     Rows returned: {r['execution'].get('rows', 0)}")
    
    if failed:
        print(f"\n❌ Failed Tests:")
        for r in failed:
            print(f"   - {r['test']}")
            if r.get('generation') and not r['generation'].get('success'):
                print(f"     Generation error: {r['generation'].get('error', 'Unknown')[:100]}")
            elif r.get('execution') and not r['execution'].get('success'):
                print(f"     Execution error: {r['execution'].get('error', 'Unknown')[:100]}")

def main():
    print("=" * 70)
    print("  TESTING DATABASE QUERY VERIFICATION")
    print("=" * 70)
    print(f"\nConfiguration:")
    print(f"  Server: {BASE_URL}")
    print(f"  Database: testingdata")
    print(f"  Connection: {CONNECTION_STRING[:50]}...")
    
    # Step 1: Get schema
    metadata = get_schema(CONNECTION_STRING)
    if not metadata:
        print("\n❌ Cannot proceed without schema metadata")
        sys.exit(1)
    
    # Step 2: Run test suite
    results = run_test_suite(metadata, CONNECTION_STRING)
    
    # Step 3: Print summary
    print_summary(results)
    
    print("\n" + "=" * 70)
    print("  TEST COMPLETE!")
    print("=" * 70)
    
    # Exit with error code if any tests failed
    failed_count = len([r for r in results if not r.get('overall_success')])
    if failed_count > 0:
        print(f"\n⚠️  {failed_count} test(s) failed")
        sys.exit(1)
    else:
        print("\n✅ All tests passed!")
        sys.exit(0)

if __name__ == "__main__":
    main()

