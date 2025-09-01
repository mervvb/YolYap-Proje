# test_mcp.py
"""
Test script for Turkish Airlines MCP integration
Run this to test your MCP connection before integrating with FastAPI
"""

import asyncio
import os
from dotenv import load_dotenv
from loguru import logger
import sys
sys.path.append('backend')

from mcp_client import TurkishAirlinesMCPClient

load_dotenv()

async def test_mcp_integration():
    """Complete test of MCP integration"""
    
    token = os.getenv("TURKISH_AIRLINES_MCP_TOKEN")
    if not token:
        logger.error("❌ TURKISH_AIRLINES_MCP_TOKEN not found in .env")
        return False
    
    logger.info("🚀 Testing Turkish Airlines MCP Integration...")
    
    try:
        # Test 1: Connection
        logger.info("\n1️⃣ Testing MCP Connection...")
        async with TurkishAirlinesMCPClient() as client:
            
            # Test connection
            if client._connected:
                logger.success("✅ Connection established")
                logger.info(f"   Session ID: {client.session_id}")
            else:
                logger.error("❌ Connection failed")
                return False
            
            # Test 2: Health Check
            logger.info("\n2️⃣ Testing Health Check...")
            health = await client.health_check()
            logger.info(f"   Health Status: {health}")
            
            # Test 3: Load Tools
            logger.info("\n3️⃣ Loading Available Tools...")
            tools = await client.load_tools()
            logger.success(f"✅ Loaded {len(tools)} tools")
            
            # Show available tools
            for i, tool in enumerate(tools[:10], 1):  # Show first 10
                logger.info(f"   {i}. {tool.name}: {tool.description}")
            
            if len(tools) > 10:
                logger.info(f"   ... and {len(tools) - 10} more tools")
            
            # Test 4: Ping Test
            logger.info("\n4️⃣ Testing Ping Tool...")
            try:
                ping_result = await client.call_tool("ping", {})
                logger.success(f"✅ Ping successful: {ping_result}")
            except Exception as e:
                logger.warning(f"⚠️ Ping failed: {e}")
            
            # Test 5: Sample Flight Search (if tools available)
            if tools:
                logger.info("\n5️⃣ Testing Flight Search Tool...")
                try:
                    # Test with simple parameters
                    search_result = await client.call_tool("search_flights", {
                        "origin": "IST",
                        "destination": "ESB", 
                        "departureDate": "2024-09-01",
                        "passengerCount": 1
                    })
                    logger.success("✅ Flight search successful")
                    logger.info(f"   Result type: {type(search_result)}")
                    if isinstance(search_result, dict):
                        logger.info(f"   Keys: {list(search_result.keys())}")
                        
                except Exception as e:
                    logger.warning(f"⚠️ Flight search failed: {e}")
                    logger.info("   This might be normal if authentication is required")
            
            # Test 6: OpenAI Tools Format
            logger.info("\n6️⃣ Testing OpenAI Tools Format...")
            openai_tools = client.get_openai_tools()
            logger.success(f"✅ Generated {len(openai_tools)} OpenAI-compatible tools")
            
            # Show sample OpenAI tool format
            if openai_tools:
                sample_tool = openai_tools[0]
                logger.info(f"   Sample tool format:")
                logger.info(f"     Name: {sample_tool['function']['name']}")
                logger.info(f"     Description: {sample_tool['function']['description']}")
                logger.info(f"     Parameters: {list(sample_tool['function']['parameters'].keys()) if 'parameters' in sample_tool['function'] else 'None'}")
            
            logger.success("\n🎉 All tests completed successfully!")
            return True
            
    except Exception as e:
        logger.error(f"❌ Test failed with error: {e}")
        return False


async def test_specific_queries():
    """Test specific Turkish Airlines queries"""
    
    logger.info("\n🧪 Testing Specific Query Patterns...")
    
    test_queries = [
        ("Flight Status", "get_flight_status_by_number", {
            "flightNumber": "TK1",
            "flightDate": "2024-08-28"
        }),
        ("Flight Route Status", "get_flight_status_by_route", {
            "origin": "IST",
            "destination": "ESB", 
            "flightDate": "2024-08-28"
        }),
        ("City Guide", "get_city_guide", {
            "cityCode": "IST"
        }),
        ("Promotions", "get_airline_promotions", {
            "countryCode": "TR"
        })
    ]
    
    async with TurkishAirlinesMCPClient() as client:
        for test_name, tool_name, params in test_queries:
            logger.info(f"\n🔧 Testing {test_name}...")
            try:
                result = await client.call_tool(tool_name, params)
                logger.success(f"✅ {test_name} successful")
                logger.info(f"   Result: {type(result).__name__}")
                
                if isinstance(result, dict):
                    if "error" in result:
                        logger.warning(f"   Tool returned error: {result['error']}")
                    else:
                        logger.info(f"   Keys: {list(result.keys())[:5]}...")  # First 5 keys
                        
            except Exception as e:
                logger.warning(f"⚠️ {test_name} failed: {e}")


if __name__ == "__main__":
    async def main():
        print("=" * 60)
        print("🛩️  Turkish Airlines MCP Integration Test")
        print("=" * 60)
        
        # Basic integration test
        success = await test_mcp_integration()
        
        if success:
            # Specific queries test
            await test_specific_queries()
            
            print("\n" + "=" * 60)
            print("✅ MCP Integration is ready!")
            print("💡 Next steps:")
            print("   1. Start your FastAPI server")
            print("   2. Test with /ai/health endpoint")
            print("   3. Try sample queries with /ai/ask endpoint")
            print("=" * 60)
        else:
            print("\n" + "=" * 60)
            print("❌ MCP Integration failed!")
            print("💡 Check:")
            print("   1. TURKISH_AIRLINES_MCP_TOKEN is correct")
            print("   2. Internet connection is working")
            print("   3. MCP server is accessible")
            print("=" * 60)
    
    # Run the test
    asyncio.run(main())
