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
    print("TESTING VPS AGENT ENDPOINTS - COMPREHENSIVE")
    print("=" * 60)
    
    results = []
    
    # Test 1: Send OTP (Auth Flow)
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
    
    # Test 3: Conversations API - List conversations
    try:
        print("\n3. Testing GET /api/conversations")
        response = requests.get(f"{VPS_AGENT_URL}/api/conversations", timeout=10)
        print(f"Status Code: {response.status_code}")
        print(f"Response: {response.text}")
        
        if response.status_code == 200:
            results.append("✅ GET /api/conversations - Working")
        elif response.status_code == 401:
            results.append("⚠️ GET /api/conversations - Requires authentication (expected)")
        else:
            results.append(f"❌ GET /api/conversations - Failed with status {response.status_code}")
            
    except Exception as e:
        print(f"Error: {e}")
        results.append(f"❌ GET /api/conversations - Error: {e}")
    
    # Test 4: Conversations API - Create new conversation
    try:
        print("\n4. Testing POST /api/conversations")
        test_data = {"title": "Test Conversation"}
        response = requests.post(f"{VPS_AGENT_URL}/api/conversations", 
                               json=test_data, 
                               timeout=10)
        print(f"Status Code: {response.status_code}")
        print(f"Response: {response.text}")
        
        if response.status_code == 200 or response.status_code == 201:
            results.append("✅ POST /api/conversations - Working")
        elif response.status_code == 401:
            results.append("⚠️ POST /api/conversations - Requires authentication (expected)")
        else:
            results.append(f"❌ POST /api/conversations - Failed with status {response.status_code}")
            
    except Exception as e:
        print(f"Error: {e}")
        results.append(f"❌ POST /api/conversations - Error: {e}")
    
    # Test 5: Conversations API - Get active conversation
    try:
        print("\n5. Testing GET /api/conversations/active")
        response = requests.get(f"{VPS_AGENT_URL}/api/conversations/active", timeout=10)
        print(f"Status Code: {response.status_code}")
        print(f"Response: {response.text}")
        
        if response.status_code == 200:
            results.append("✅ GET /api/conversations/active - Working")
        elif response.status_code == 401:
            results.append("⚠️ GET /api/conversations/active - Requires authentication (expected)")
        elif response.status_code == 404:
            results.append("⚠️ GET /api/conversations/active - No active conversation (expected)")
        else:
            results.append(f"❌ GET /api/conversations/active - Failed with status {response.status_code}")
            
    except Exception as e:
        print(f"Error: {e}")
        results.append(f"❌ GET /api/conversations/active - Error: {e}")
    
    # Test 6: VPS servers (may require auth)
    try:
        print("\n6. Testing GET /api/vps-servers")
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
    
    # Test 7: VPS Server Discovery (test with dummy ID)
    try:
        print("\n7. Testing POST /api/vps-servers/test-id/discover")
        response = requests.post(f"{VPS_AGENT_URL}/api/vps-servers/test-id/discover", 
                               timeout=10)
        print(f"Status Code: {response.status_code}")
        print(f"Response: {response.text}")
        
        if response.status_code == 200:
            results.append("✅ POST /api/vps-servers/:id/discover - Working")
        elif response.status_code == 401:
            results.append("⚠️ POST /api/vps-servers/:id/discover - Requires authentication (expected)")
        elif response.status_code == 404:
            results.append("⚠️ POST /api/vps-servers/:id/discover - Server not found (expected for test ID)")
        else:
            results.append(f"❌ POST /api/vps-servers/:id/discover - Failed with status {response.status_code}")
            
    except Exception as e:
        print(f"Error: {e}")
        results.append(f"❌ POST /api/vps-servers/:id/discover - Error: {e}")
    
    # Test 8: Chat endpoint structure (basic connectivity test)
    try:
        print("\n8. Testing POST /api/chat (SSE streaming test)")
        test_data = {"message": "test infrastructure scan"}
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

def test_infrastructure_knowledge():
    """Test infrastructure knowledge base functionality"""
    print("\n" + "=" * 60)
    print("TESTING INFRASTRUCTURE KNOWLEDGE")
    print("=" * 60)
    
    results = []
    
    # Test 1: Check if infrastructure config exists (this would be on the VPS server)
    try:
        print("\n1. Testing infrastructure config accessibility")
        # We can't directly access the VPS server filesystem, but we can test if the API
        # provides infrastructure information through other endpoints
        
        # Try to get server information that might include infrastructure data
        response = requests.get(f"{VPS_AGENT_URL}/api/vps-servers", timeout=10)
        print(f"Status Code: {response.status_code}")
        
        if response.status_code == 401:
            results.append("⚠️ Infrastructure config - Cannot verify without authentication")
        elif response.status_code == 200:
            try:
                json_response = response.json()
                if isinstance(json_response, list) or isinstance(json_response, dict):
                    results.append("✅ Infrastructure data - API provides server information")
                else:
                    results.append("❌ Infrastructure data - Unexpected response format")
            except:
                results.append("❌ Infrastructure data - Invalid JSON response")
        else:
            results.append(f"❌ Infrastructure config - API error {response.status_code}")
            
    except Exception as e:
        print(f"Error: {e}")
        results.append(f"❌ Infrastructure config - Error: {e}")
    
    # Test 2: Test auto-scan trigger (through discovery endpoint)
    try:
        print("\n2. Testing auto-scan trigger capability")
        # Test if the discovery endpoint structure is available
        response = requests.post(f"{VPS_AGENT_URL}/api/vps-servers/test/discover", timeout=10)
        print(f"Status Code: {response.status_code}")
        
        if response.status_code == 401:
            results.append("⚠️ Auto-scan trigger - Endpoint exists but requires authentication")
        elif response.status_code == 404:
            results.append("⚠️ Auto-scan trigger - Endpoint structure available (404 expected for test ID)")
        elif response.status_code == 200:
            results.append("✅ Auto-scan trigger - Working")
        else:
            results.append(f"❌ Auto-scan trigger - Unexpected status {response.status_code}")
            
    except Exception as e:
        print(f"Error: {e}")
        results.append(f"❌ Auto-scan trigger - Error: {e}")
    
    return results

def main():
    """Run all tests and provide summary"""
    print("VPS AGENT COMPREHENSIVE BACKEND TESTING")
    print("Testing Date:", datetime.now().strftime("%Y-%m-%d %H:%M:%S"))
    
    # Test local backend
    local_results = test_local_backend()
    
    # Test VPS agent endpoints
    vps_results = test_vps_agent_endpoints()
    
    # Test infrastructure knowledge
    infra_results = test_infrastructure_knowledge()
    
    # Print summary
    print("\n" + "=" * 60)
    print("COMPREHENSIVE TEST SUMMARY")
    print("=" * 60)
    
    print("\nLocal Backend Results:")
    for result in local_results:
        print(f"  {result}")
    
    print("\nVPS Agent API Results:")
    for result in vps_results:
        print(f"  {result}")
    
    print("\nInfrastructure Knowledge Results:")
    for result in infra_results:
        print(f"  {result}")
    
    # Count failures
    all_results = local_results + vps_results + infra_results
    failed_tests = [r for r in all_results if r.startswith("❌")]
    warning_tests = [r for r in all_results if r.startswith("⚠️")]
    success_tests = [r for r in all_results if r.startswith("✅")]
    
    print(f"\nTotal Tests: {len(all_results)}")
    print(f"Successful Tests: {len(success_tests)}")
    print(f"Warning Tests (Auth Required): {len(warning_tests)}")
    print(f"Failed Tests: {len(failed_tests)}")
    
    if failed_tests:
        print("\nCRITICAL FAILURES:")
        for failure in failed_tests:
            print(f"  {failure}")
    
    if warning_tests:
        print("\nWARNINGS (Expected - Auth Required):")
        for warning in warning_tests:
            print(f"  {warning}")
    
    # Return 1 only for actual failures, not auth warnings
    if failed_tests:
        return 1
    else:
        print("\n✅ All accessible tests passed! Auth-protected endpoints behaving as expected.")
        return 0

if __name__ == "__main__":
    sys.exit(main())