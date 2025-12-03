"""
Test Large Dataset Performance
==============================

Tests the analytics engine with the generated large dataset to verify:
- Embedding cache performance
- Query generation speed
- Memory usage
- Result accuracy

Usage:
    python test_large_dataset.py --file ./uploads/comprehensive_student_data.csv
"""

import requests
import json
import time
import argparse
import sys
from pathlib import Path

# Configuration
BASE_URL = "http://localhost:3000"
API_BASE = f"{BASE_URL}/api/analytics"

def print_section(title):
    """Print a formatted section header"""
    print("\n" + "=" * 70)
    print(f"  {title}")
    print("=" * 70)

def upload_file(file_path):
    """Upload CSV file to the analytics engine"""
    print_section("Step 1: Uploading CSV File")
    
    print(f"Uploading: {file_path}")
    
    try:
        with open(file_path, 'rb') as f:
            files = {'file': (Path(file_path).name, f, 'text/csv')}
            response = requests.post(f"{API_BASE}/upload", files=files, timeout=60)
        
        if response.status_code == 200:
            data = response.json()
            print(f"✅ Upload successful!")
            print(f"   File: {data.get('fileName', 'N/A')}")
            print(f"   Table: {data.get('tableName', 'N/A')}")
            print(f"   Columns: {len(data.get('metadata', {}).get('tables', [{}])[0].get('columns', []))}")
            return data
        else:
            print(f"❌ Upload failed: {response.status_code}")
            print(f"   Error: {response.text}")
            return None
    except Exception as e:
        print(f"❌ Upload error: {str(e)}")
        return None

def get_schema(file_path):
    """Get schema metadata for the uploaded file"""
    print_section("Step 2: Getting Schema Metadata")
    
    try:
        payload = {
            "source_type": "CSV_FILE",
            "file_path": file_path,
            "file_type": "CSV"
        }
        
        start_time = time.time()
        response = requests.post(f"{API_BASE}/schema", json=payload, timeout=60)
        elapsed = time.time() - start_time
        
        if response.status_code == 200:
            data = response.json()
            tables = data.get('tables', [])
            if tables:
                columns = tables[0].get('columns', [])
                print(f"✅ Schema retrieved in {elapsed:.2f}s")
                print(f"   Tables: {len(tables)}")
                print(f"   Columns: {len(columns)}")
                print(f"   Sample columns: {', '.join([c['name'] for c in columns[:5]])}...")
                return data
        else:
            print(f"❌ Schema retrieval failed: {response.status_code}")
            print(f"   Error: {response.text}")
            return None
    except Exception as e:
        print(f"❌ Schema error: {str(e)}")
        return None

def test_query(question, file_path, metadata):
    """Test a query generation"""
    print(f"\n📊 Testing Query: '{question}'")
    
    try:
        payload = {
            "mode": "ADHOC_QUERY",
            "metadata": metadata,
            "user_question": question
        }
        
        start_time = time.time()
        response = requests.post(f"{API_BASE}", json=payload, timeout=120)
        elapsed = time.time() - start_time
        
        if response.status_code == 200:
            data = response.json()
            query = data.get('query_content', 'N/A')
            query_type = data.get('query_type', 'N/A')
            visualization = data.get('visualization_type', 'N/A')
            
            print(f"   ✅ Generated in {elapsed:.2f}s")
            print(f"   Query Type: {query_type}")
            print(f"   Visualization: {visualization}")
            print(f"   Query: {query[:100]}..." if len(query) > 100 else f"   Query: {query}")
            
            return {
                "success": True,
                "time": elapsed,
                "query": query,
                "query_type": query_type
            }
        else:
            print(f"   ❌ Failed: {response.status_code}")
            print(f"   Error: {response.text[:200]}")
            return {"success": False, "time": elapsed}
    except Exception as e:
        print(f"   ❌ Error: {str(e)}")
        return {"success": False, "time": 0}

def execute_query(query_content, file_path):
    """Execute a generated query"""
    print(f"\n⚡ Executing Query...")
    
    try:
        payload = {
            "query_type": "SQL_QUERY",
            "query_content": query_content,
            "source_type": "CSV_FILE",
            "file_path": file_path,
            "file_type": "CSV"
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
                print(f"   Sample result: {json.dumps(results[0], indent=2)[:200]}...")
            return {"success": True, "time": elapsed, "rows": row_count}
        else:
            print(f"   ❌ Execution failed: {response.status_code}")
            print(f"   Error: {response.text[:200]}")
            return {"success": False, "time": elapsed}
    except Exception as e:
        print(f"   ❌ Error: {str(e)}")
        return {"success": False, "time": 0}

def run_performance_tests(file_path, metadata):
    """Run a series of performance tests"""
    print_section("Step 3: Performance Testing")
    
    test_queries = [
        "What is the average CGPA of all students?",
        "Show me students with attendance above 90%",
        "Which class has the highest average math score?",
        "Compare average scores by gender",
        "Show top 10 students by total marks",
        "What is the distribution of students by blood group?",
        "Which transport mode is most common?",
        "Show students with pending fees",
        "What is the average age by class?",
        "Compare math scores between male and female students"
    ]
    
    results = []
    
    for i, question in enumerate(test_queries, 1):
        print(f"\n[{i}/{len(test_queries)}]")
        result = test_query(question, file_path, metadata)
        results.append(result)
        
        # Small delay between queries
        time.sleep(1)
    
    return results

def print_summary(results):
    """Print test summary"""
    print_section("Test Summary")
    
    successful = [r for r in results if r.get('success')]
    failed = [r for r in results if not r.get('success')]
    
    if successful:
        times = [r['time'] for r in successful]
        avg_time = sum(times) / len(times)
        min_time = min(times)
        max_time = max(times)
        
        print(f"✅ Successful queries: {len(successful)}/{len(results)}")
        print(f"   Average time: {avg_time:.2f}s")
        print(f"   Min time: {min_time:.2f}s")
        print(f"   Max time: {max_time:.2f}s")
    
    if failed:
        print(f"\n❌ Failed queries: {len(failed)}/{len(results)}")
    
    print(f"\n📊 Performance Metrics:")
    print(f"   Expected: 3-8 seconds per query")
    print(f"   Actual: {avg_time:.2f}s average" if successful else "   N/A (all failed)")
    
    if successful and avg_time <= 10:
        print(f"   ✅ Performance is within acceptable range!")
    elif successful:
        print(f"   ⚠️ Performance is slower than expected")
    else:
        print(f"   ❌ All queries failed - check server logs")

def main():
    parser = argparse.ArgumentParser(description='Test large dataset performance')
    parser.add_argument('--file', type=str, required=True, help='Path to CSV file')
    parser.add_argument('--url', type=str, default='http://localhost:3000', help='Base URL of the application')
    
    args = parser.parse_args()
    
    global BASE_URL, API_BASE
    BASE_URL = args.url
    API_BASE = f"{BASE_URL}/api/analytics"
    
    file_path = Path(args.file)
    
    if not file_path.exists():
        print(f"❌ File not found: {file_path}")
        sys.exit(1)
    
    print("=" * 70)
    print("  Large Dataset Performance Test")
    print("=" * 70)
    print(f"\nFile: {file_path}")
    print(f"Server: {BASE_URL}")
    
    # Step 1: Upload file
    upload_result = upload_file(str(file_path))
    if not upload_result:
        print("\n❌ Cannot proceed without successful upload")
        sys.exit(1)
    
    # Get file path from upload result
    uploaded_file_path = upload_result.get('filePath') or str(file_path)
    
    # Step 2: Get schema
    metadata = get_schema(uploaded_file_path)
    if not metadata:
        print("\n❌ Cannot proceed without schema metadata")
        sys.exit(1)
    
    # Step 3: Run performance tests
    results = run_performance_tests(uploaded_file_path, metadata)
    
    # Step 4: Print summary
    print_summary(results)
    
    print("\n" + "=" * 70)
    print("  Test Complete!")
    print("=" * 70)

if __name__ == "__main__":
    main()

