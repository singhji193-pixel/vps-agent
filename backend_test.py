#!/usr/bin/env python3
"""
Backend API Testing for VPS Agent Auto-Execution Feature
Tests both local backend and external VPS agent endpoints
"""

import requests
import json
import os
from datetime import datetime
import sys

# Get backend URL from environment
BACKEND_URL = "https://auto-exec-1.preview.emergentagent.com"
VPS_AGENT_URL = "https://vps.coengine.ai"

def test_local_backend():
    """Test the local backend endpoints"""
    print("=" * 60)
    print("TESTING LOCAL BACKEND ENDPOINTS")
    print("=" * 60)
    
    results = []
    
    # Test 1: Root endpoint
    try:
        print("\n1. Testing GET /api/")
        response = requests.get(f"{BACKEND_URL}/api/", timeout=10)
        print(f"Status Code: {response.status_code}")
        print(f"Response: {response.json()}")
        
        if response.status_code == 200:
            results.append("✅ GET /api/ - Working")
        else:
            results.append(f"❌ GET /api/ - Failed with status {response.status_code}")
            
    except Exception as e:
        print(f"Error: {e}")
        results.append(f"❌ GET /api/ - Error: {e}")
    
    # Test 2: Create status check
    try:
        print("\n2. Testing POST /api/status")
        test_data = {"client_name": "test_client_vps_agent"}
        response = requests.post(f"{BACKEND_URL}/api/status", 
                               json=test_data, 
                               timeout=10)
        print(f"Status Code: {response.status_code}")
        print(f"Response: {response.json()}")
        
        if response.status_code == 200:
            results.append("✅ POST /api/status - Working")
        else:
            results.append(f"❌ POST /api/status - Failed with status {response.status_code}")
            
    except Exception as e:
        print(f"Error: {e}")
        results.append(f"❌ POST /api/status - Error: {e}")
    
    # Test 3: Get status checks
    try:
        print("\n3. Testing GET /api/status")
        response = requests.get(f"{BACKEND_URL}/api/status", timeout=10)
        print(f"Status Code: {response.status_code}")
        print(f"Response: {response.json()}")
        
        if response.status_code == 200:
            results.append("✅ GET /api/status - Working")
        else:
            results.append(f"❌ GET /api/status - Failed with status {response.status_code}")
            
    except Exception as e:
        print(f"Error: {e}")
        results.append(f"❌ GET /api/status - Error: {e}")
    
    return results

def test_vps_agent_endpoints():
    """Test the VPS Agent endpoints mentioned in review request"""
    print("\n" + "=" * 60)
    print("TESTING VPS AGENT ENDPOINTS")
    print("=" * 60)
    
    results = []
    
    # Test 1: Send OTP
    try:
        print("\n1. Testing POST /api/auth/send-otp")
        test_data = {"email": "judgebanjot@gmail.com"}
        response = requests.post(f"{VPS_AGENT_URL}/api/auth/send-otp", 
                               json=test_data, 
                               timeout=10)
        print(f"Status Code: {response.status_code}")
        print(f"Response: {response.text}")
        
        if response.status_code == 200:
            try:
                json_response = response.json()
                if json_response.get("success") == True:
                    results.append("✅ POST /api/auth/send-otp - Working")
                else:
                    results.append(f"❌ POST /api/auth/send-otp - Unexpected response: {json_response}")
            except:
                results.append(f"❌ POST /api/auth/send-otp - Invalid JSON response")
        else:
            results.append(f"❌ POST /api/auth/send-otp - Failed with status {response.status_code}")
            
    except Exception as e:
        print(f"Error: {e}")
        results.append(f"❌ POST /api/auth/send-otp - Error: {e}")
    
    # Test 2: Auth status
    try:
        print("\n2. Testing GET /api/auth/status")
        response = requests.get(f"{VPS_AGENT_URL}/api/auth/status", timeout=10)
        print(f"Status Code: {response.status_code}")
        print(f"Response: {response.text}")
        
        if response.status_code == 200:
            try:
                json_response = response.json()
                if "authenticated" in json_response:
                    results.append("✅ GET /api/auth/status - Working")
                else:
                    results.append(f"❌ GET /api/auth/status - Missing 'authenticated' field")
            except:
                results.append(f"❌ GET /api/auth/status - Invalid JSON response")
        else:
            results.append(f"❌ GET /api/auth/status - Failed with status {response.status_code}")
            
    except Exception as e:
        print(f"Error: {e}")
        results.append(f"❌ GET /api/auth/status - Error: {e}")
    
    # Test 3: VPS servers (may require auth)
    try:
        print("\n3. Testing GET /api/vps-servers")
        response = requests.get(f"{VPS_AGENT_URL}/api/vps-servers", timeout=10)
        print(f"Status Code: {response.status_code}")
        print(f"Response: {response.text}")
        
        if response.status_code == 200:
            results.append("✅ GET /api/vps-servers - Working")
        elif response.status_code == 401:
            results.append("⚠️ GET /api/vps-servers - Requires authentication (expected)")
        else:
            results.append(f"❌ GET /api/vps-servers - Failed with status {response.status_code}")
            
    except Exception as e:
        print(f"Error: {e}")
        results.append(f"❌ GET /api/vps-servers - Error: {e}")
    
    # Test 4: Chat endpoint structure (basic connectivity test)
    try:
        print("\n4. Testing POST /api/chat (structure test)")
        test_data = {"message": "test"}
        response = requests.post(f"{VPS_AGENT_URL}/api/chat", 
                               json=test_data, 
                               timeout=10,
                               stream=False)  # Don't stream for basic test
        print(f"Status Code: {response.status_code}")
        print(f"Response Headers: {dict(response.headers)}")
        
        if response.status_code == 200:
            if 'text/event-stream' in response.headers.get('content-type', ''):
                results.append("✅ POST /api/chat - SSE endpoint accessible")
            else:
                results.append("⚠️ POST /api/chat - Accessible but not SSE format")
        elif response.status_code == 401:
            results.append("⚠️ POST /api/chat - Requires authentication (expected)")
        else:
            results.append(f"❌ POST /api/chat - Failed with status {response.status_code}")
            
    except Exception as e:
        print(f"Error: {e}")
        results.append(f"❌ POST /api/chat - Error: {e}")
    
    return results

def main():
    """Run all tests and provide summary"""
    print("VPS AGENT AUTO-EXECUTION BACKEND TESTING")
    print("Testing Date:", datetime.now().strftime("%Y-%m-%d %H:%M:%S"))
    
    # Test local backend
    local_results = test_local_backend()
    
    # Test VPS agent endpoints
    vps_results = test_vps_agent_endpoints()
    
    # Print summary
    print("\n" + "=" * 60)
    print("TEST SUMMARY")
    print("=" * 60)
    
    print("\nLocal Backend Results:")
    for result in local_results:
        print(f"  {result}")
    
    print("\nVPS Agent Results:")
    for result in vps_results:
        print(f"  {result}")
    
    # Count failures
    all_results = local_results + vps_results
    failed_tests = [r for r in all_results if r.startswith("❌")]
    
    print(f"\nTotal Tests: {len(all_results)}")
    print(f"Failed Tests: {len(failed_tests)}")
    
    if failed_tests:
        print("\nFAILED TESTS:")
        for failure in failed_tests:
            print(f"  {failure}")
        return 1
    else:
        print("\n✅ All tests passed!")
        return 0

if __name__ == "__main__":
    sys.exit(main())