"""
Turkish Airlines MCP Client with manual session ID approach
"""

import asyncio
import aiohttp
import json
import os
import ssl
from typing import Dict, List, Any, Optional
from loguru import logger
import time
from dataclasses import dataclass
import certifi
import uuid
from datetime import datetime, timedelta


@dataclass
class MCPTool:
    """MCP Tool definition"""
    name: str
    description: str
    input_schema: Dict[str, Any]


class TurkishAirlinesMCPClient:
    """
    Turkish Airlines MCP Client with manual session management
    """
    
    def __init__(
        self,
        server_url: str = "https://mcp.turkishtechlab.com/mcp",
        auth_token: str = None,
        session_id: str = None,
        verify_ssl: bool = None
    ):
        self.server_url = server_url.rstrip('/')
        self.auth_token = auth_token or os.getenv("TURKISH_AIRLINES_MCP_TOKEN")
        
        # Session ID - allow manual override
        self.session_id = session_id or os.getenv("MCP_SESSION_ID") or self._generate_session_id()
        
        # SSL configuration
        if verify_ssl is None:
            verify_ssl_env = os.getenv("MCP_VERIFY_SSL", "false").lower()
            self.verify_ssl = verify_ssl_env in ("true", "1", "yes", "on")
        else:
            self.verify_ssl = verify_ssl
        
        self.tools_cache = []
        self.last_tools_fetch = 0
        self.session = None
        self._connected = False
        
        if not self.auth_token:
            logger.warning("Turkish Airlines MCP token not provided")
        
        logger.info(f"Using session ID: {self.session_id}")
    
    def _generate_session_id(self) -> str:
        """Generate a session ID if not provided"""
        return str(uuid.uuid4()).replace('-', '')
    
    def _create_ssl_context(self) -> Optional[ssl.SSLContext]:
        """Create SSL context with appropriate settings"""
        if not self.verify_ssl:
            ssl_context = ssl.create_default_context()
            ssl_context.check_hostname = False
            ssl_context.verify_mode = ssl.CERT_NONE
            logger.warning("⚠️ SSL certificate verification is disabled for MCP connection")
            return ssl_context
        else:
            try:
                ssl_context = ssl.create_default_context(cafile=certifi.where())
                return ssl_context
            except Exception as e:
                logger.warning(f"Failed to create SSL context with certifi: {e}")
                return None
    
    async def __aenter__(self):
        await self.connect()
        return self
    
    async def __aexit__(self, exc_type, exc_val, exc_tb):
        await self.disconnect()
    
    async def connect(self) -> bool:
        """Connect to MCP server - first get valid session, then use it"""
        if self._connected:
            return True
        
        if not self.auth_token:
            logger.error("Cannot connect: No Turkish Airlines MCP token provided")
            return False
        
        try:
            if not self.session:
                # Create SSL context
                ssl_context = self._create_ssl_context()
                
                connector = aiohttp.TCPConnector(
                    ssl=ssl_context,
                    limit=100,
                    limit_per_host=30,
                    ttl_dns_cache=300,
                    use_dns_cache=True,
                )
                
                # Initial headers WITHOUT session ID for getting session
                initial_headers = {
                    'User-Agent': 'TurkishAirlines-MCP-Client/1.0',
                    'Accept': 'application/json, text/event-stream',
                    'Authorization': f'Bearer {self.auth_token}',
                    'Content-Type': 'application/json'
                }
                
                self.session = aiohttp.ClientSession(
                    connector=connector,
                    timeout=aiohttp.ClientTimeout(total=30, connect=10),
                    headers=initial_headers
                )
            
            logger.info("Getting session from Turkish Airlines MCP server...")
            
            # Step 1: Get session ID from server using initialize
            init_payload = {
                "jsonrpc": "2.0",
                "id": 1,
                "method": "initialize",
                "params": {
                    "protocolVersion": "2024-11-05",
                    "capabilities": {
                        "tools": {},
                        "logging": {}
                    },
                    "clientInfo": {
                        "name": "turkish-airlines-client",
                        "version": "1.0.0"
                    }
                }
            }
            
            try:
                async with self.session.post(
                    self.server_url,
                    json=init_payload
                ) as response:
                    logger.debug(f"Initialize response status: {response.status}")
                    logger.debug(f"Initialize response headers: {dict(response.headers)}")
                    
                    if response.status == 200:
                        # Check for session ID in headers
                        server_session_id = response.headers.get('mcp-session-id')
                        if server_session_id:
                            self.session_id = server_session_id
                            logger.success(f"✅ Got session from server: {self.session_id}")
                            
                            # Update session headers with the real session ID
                            self.session.headers.update({
                                'mcp-session-id': self.session_id
                            })
                            
                            self._connected = True
                            await self.load_tools()
                            return True
                        
                        # If no session ID in headers, try to parse response
                        content_type = response.headers.get('content-type', '').lower()
                        
                        if 'text/event-stream' in content_type:
                            # Handle SSE response for session
                            async for line in response.content:
                                line = line.decode('utf-8').strip()
                                if line.startswith('data: '):
                                    try:
                                        data = json.loads(line[6:])
                                        if "result" in data:
                                            # Check if result has session info
                                            result = data["result"]
                                            # Session ID should be in headers, but check result too
                                            self.session_id = server_session_id or result.get("sessionId", self.session_id)
                                            self._connected = True
                                            logger.success(f"✅ Connected via SSE - Session: {self.session_id}")
                                            
                                            # Update headers
                                            self.session.headers.update({
                                                'mcp-session-id': self.session_id
                                            })
                                            
                                            await self.load_tools()
                                            return True
                                        break
                                    except json.JSONDecodeError:
                                        continue
                        else:
                            # Handle JSON response
                            data = await response.json()
                            if "result" in data:
                                self.session_id = server_session_id or data["result"].get("sessionId", self.session_id)
                                self._connected = True
                                logger.success(f"✅ Connected via JSON - Session: {self.session_id}")
                                
                                # Update headers
                                self.session.headers.update({
                                    'mcp-session-id': self.session_id
                                })
                                
                                await self.load_tools()
                                return True
                    
                    elif response.status == 401:
                        logger.error("❌ Authentication failed - check your Turkish Airlines MCP token")
                        return False
                    else:
                        error_text = await response.text()
                        logger.error(f"❌ Initialize failed {response.status}: {error_text}")
                        return False
                        
            except Exception as e:
                logger.error(f"❌ Initialize request failed: {e}")
                return False
        
        except Exception as e:
            logger.error(f"MCP connection error: {e}")
            return False
    
    async def disconnect(self):
        """Disconnect from MCP server"""
        if self.session:
            await self.session.close()
            self.session = None
        self._connected = False
        logger.info("Disconnected from MCP server")
    
    async def load_tools(self) -> List[MCPTool]:
        """Load available tools from MCP server"""
        if not self._connected:
            await self.connect()
        
        # Cache tools for 5 minutes
        now = time.time()
        if self.tools_cache and (now - self.last_tools_fetch) < 300:
            return self.tools_cache
        
        try:
            tools_payload = {
                "jsonrpc": "2.0",
                "id": 2,
                "method": "tools/list",
                "params": {}
            }
            
            async with self.session.post(
                self.server_url,
                json=tools_payload
            ) as response:
                logger.debug(f"Tools request status: {response.status}")
                
                if response.status == 200:
                    content_type = response.headers.get('content-type', '').lower()
                    
                    if 'text/event-stream' in content_type:
                        # Handle SSE response
                        tools_data = []
                        async for line in response.content:
                            line = line.decode('utf-8').strip()
                            if line.startswith('data: '):
                                try:
                                    data = json.loads(line[6:])
                                    if "result" in data and "tools" in data["result"]:
                                        tools_data = data["result"]["tools"]
                                        break
                                except json.JSONDecodeError:
                                    continue
                    else:
                        # Handle JSON response
                        data = await response.json()
                        logger.debug(f"Tools response: {data}")
                        
                        if "result" in data:
                            tools_data = data["result"].get("tools", [])
                        else:
                            logger.warning("No result in tools response")
                            return []
                    
                    if tools_data:
                        self.tools_cache = [
                            MCPTool(
                                name=tool["name"],
                                description=tool.get("description", ""),
                                input_schema=tool.get("inputSchema", {})
                            )
                            for tool in tools_data
                        ]
                        
                        self.last_tools_fetch = now
                        logger.success(f"✅ Loaded {len(self.tools_cache)} MCP tools")
                        
                        # Log first few tools for debugging
                        for i, tool in enumerate(self.tools_cache[:5]):
                            logger.debug(f"   {i+1}. {tool.name}: {tool.description}")
                        
                        return self.tools_cache
                    else:
                        logger.warning("No tools found in response")
                else:
                    error_text = await response.text()
                    logger.warning(f"Tools request failed {response.status}: {error_text}")
        
        except Exception as e:
            logger.error(f"Error loading tools: {e}")
        
        return []
    
    def get_tool_schema(self, tool_name: str) -> Dict[str, Any]:
        """Get the input schema for a specific tool"""
        tool = next((t for t in self.tools_cache if t.name == tool_name), None)
        return tool.input_schema if tool else {}
    
    async def print_tool_schema(self, tool_name: str):
        """Debug helper to print tool schema"""
        schema = self.get_tool_schema(tool_name)
        logger.info(f"Schema for {tool_name}: {json.dumps(schema, indent=2)}")
    
    def validate_tool_params(self, tool_name: str, arguments: Dict[str, Any]) -> Dict[str, Any]:
        """Validate and potentially fix tool parameters based on common patterns"""
        schema = self.get_tool_schema(tool_name)
        
        # Airport code to country mapping for common airports
        airport_country_map = {
            'IST': 'TR', 'SAW': 'TR', 'ADB': 'TR', 'AYT': 'TR', 'ESB': 'TR',
            'JFK': 'US', 'LAX': 'US', 'ORD': 'US', 'DFW': 'US', 'ATL': 'US',
            'LHR': 'GB', 'LGW': 'GB', 'STN': 'GB', 'MAN': 'GB',
            'CDG': 'FR', 'ORY': 'FR', 'NCE': 'FR',
            'FRA': 'DE', 'MUC': 'DE', 'DUS': 'DE',
            'FCO': 'IT', 'MXP': 'IT', 'VCE': 'IT',
            'AMS': 'NL', 'MAD': 'ES', 'BCN': 'ES', 'ZUR': 'CH'
        }
        
        # Apply transformations for specific tools
        if tool_name == 'search_flights' and arguments:
            # Transform to expected format based on error messages
            new_args = {}
            
            # Handle trip type
            new_args['tripType'] = arguments.get('tripType', 'one_way')
            
            # Handle origin destinations with all required fields
            if 'origin' in arguments and 'destination' in arguments:
                origin_code = arguments['origin']
                destination_code = arguments['destination']
                departure_date = arguments.get('departureDate', (datetime.now() + timedelta(days=1)).strftime('%Y-%m-%d'))
                
                # Convert date to required DD-MM-YYYY HH:mm format using Turkey timezone
                try:
                    import pytz
                    turkey_tz = pytz.timezone('Europe/Istanbul')
                    
                    if departure_date in ['bugün', 'today']:
                        date_obj = datetime.now(turkey_tz)
                    elif departure_date in ['yarın', 'tomorrow']:
                        date_obj = datetime.now(turkey_tz) + timedelta(days=1)
                    else:
                        date_obj = datetime.strptime(departure_date, '%Y-%m-%d')
                        # If no timezone info, assume Turkey time
                        if date_obj.tzinfo is None:
                            date_obj = turkey_tz.localize(date_obj)
                    
                    # Format as DD-MM-YYYY HH:mm
                    formatted_date = date_obj.strftime('%d-%m-%Y') + ' 10:00'
                    departure_datetime = {
                        "departureDate": formatted_date,
                        "departureTime": "10:00"  # Keep separate time field as well
                    }
                except Exception as e:
                    logger.warning(f"Date parsing error: {e}, using default")
                    import pytz
                    turkey_tz = pytz.timezone('Europe/Istanbul')
                    future_date = datetime.now(turkey_tz) + timedelta(days=1)
                    formatted_date = future_date.strftime('%d-%m-%Y') + ' 10:00'
                    departure_datetime = {
                        "departureDate": formatted_date,
                        "departureTime": "10:00"
                    }
                
                new_args['originDestinations'] = [{
                    'originAirportCode': origin_code,
                    'originCountryCode': airport_country_map.get(origin_code, 'TR'),
                    'destinationAirportCode': destination_code,
                    'destinationCountryCode': airport_country_map.get(destination_code, 'TR'),
                    'departureDateTime': departure_datetime
                }]
            elif 'originDestinations' in arguments:
                new_args['originDestinations'] = arguments['originDestinations']
            
            # Handle passengers with correct format
            if 'passengerCount' in arguments:
                new_args['passengers'] = [{
                    'passengerType': 'ADT',  # Adult passenger type
                    'quantity': arguments['passengerCount']
                }]
            elif 'passengers' in arguments:
                # Validate passenger format
                passengers = arguments['passengers']
                if isinstance(passengers, list) and len(passengers) > 0:
                    # Fix passenger format if needed
                    fixed_passengers = []
                    for passenger in passengers:
                        if isinstance(passenger, dict):
                            if 'type' in passenger and 'count' in passenger:
                                # Convert old format to new format
                                passenger_type_map = {
                                    'adult': 'ADT',
                                    'child': 'CHD', 
                                    'infant': 'INF',
                                    'youth': 'YAD',
                                    'senior': 'SRC',
                                    'student': 'STD'
                                }
                                fixed_passengers.append({
                                    'passengerType': passenger_type_map.get(passenger['type'], 'ADT'),
                                    'quantity': passenger['count']
                                })
                            else:
                                # Assume it's already in correct format
                                fixed_passengers.append(passenger)
                    new_args['passengers'] = fixed_passengers
                else:
                    new_args['passengers'] = [{'passengerType': 'ADT', 'quantity': 1}]
            else:
                new_args['passengers'] = [{'passengerType': 'ADT', 'quantity': 1}]
            
            # Copy other parameters
            for key, value in arguments.items():
                if key not in ['origin', 'destination', 'departureDate', 'passengerCount', 'tripType', 'originDestinations', 'passengers']:
                    new_args[key] = value
                    
            return new_args
        
        elif tool_name == 'get_flight_status_by_number' and arguments:
            new_args = {}
            
            # Map flightNumber to flightNumberFull
            if 'flightNumber' in arguments:
                new_args['flightNumberFull'] = arguments['flightNumber']
            elif 'flightNumberFull' in arguments:
                new_args['flightNumberFull'] = arguments['flightNumberFull']
            
            # Ensure future date
            if 'flightDate' in arguments:
                date_str = arguments['flightDate']
                try:
                    date_obj = datetime.strptime(date_str, '%Y-%m-%d')
                    if date_obj.date() < datetime.now().date():
                        new_args['flightDate'] = (datetime.now() + timedelta(days=1)).strftime('%Y-%m-%d')
                        logger.warning(f"Updated past date to future: {new_args['flightDate']}")
                    else:
                        new_args['flightDate'] = date_str
                except:
                    new_args['flightDate'] = (datetime.now() + timedelta(days=1)).strftime('%Y-%m-%d')
            else:
                new_args['flightDate'] = (datetime.now() + timedelta(days=1)).strftime('%Y-%m-%d')
            
            # Copy other parameters
            for key, value in arguments.items():
                if key not in ['flightNumber', 'flightDate']:
                    new_args[key] = value
                    
            return new_args
        
        elif tool_name == 'get_flight_status_by_route' and arguments:
            new_args = {}
            
            # Map origin/destination to fromAirport/toAirport
            if 'origin' in arguments:
                new_args['fromAirport'] = arguments['origin']
            elif 'fromAirport' in arguments:
                new_args['fromAirport'] = arguments['fromAirport']
                
            if 'destination' in arguments:
                new_args['toAirport'] = arguments['destination']
            elif 'toAirport' in arguments:
                new_args['toAirport'] = arguments['toAirport']
            
            # Ensure future date
            if 'flightDate' in arguments:
                date_str = arguments['flightDate']
                try:
                    date_obj = datetime.strptime(date_str, '%Y-%m-%d')
                    if date_obj.date() < datetime.now().date():
                        new_args['flightDate'] = (datetime.now() + timedelta(days=1)).strftime('%Y-%m-%d')
                        logger.warning(f"Updated past date to future: {new_args['flightDate']}")
                    else:
                        new_args['flightDate'] = date_str
                except:
                    new_args['flightDate'] = (datetime.now() + timedelta(days=1)).strftime('%Y-%m-%d')
            else:
                new_args['flightDate'] = (datetime.now() + timedelta(days=1)).strftime('%Y-%m-%d')
            
            # Copy other parameters
            for key, value in arguments.items():
                if key not in ['origin', 'destination', 'flightDate']:
                    new_args[key] = value
                    
            return new_args
        
        # Return original arguments if no transformation needed
        return arguments
    
    async def call_tool(self, tool_name: str, arguments: Dict[str, Any] = None) -> Dict[str, Any]:
        """Execute an MCP tool"""
        if not self._connected:
            await self.connect()
        
        if not self._connected:
            raise Exception("Not connected to MCP server")
        
        arguments = arguments or {}
        
        # Validate and fix parameters
        validated_args = self.validate_tool_params(tool_name, arguments)
        
        logger.info(f"🔧 Calling MCP tool: {tool_name}")
        logger.debug(f"Original arguments: {arguments}")
        logger.debug(f"Validated arguments: {validated_args}")
        
        try:
            tool_payload = {
                "jsonrpc": "2.0",
                "id": int(time.time()),
                "method": "tools/call",
                "params": {
                    "name": tool_name,
                    "arguments": validated_args
                }
            }
            
            async with self.session.post(
                self.server_url,
                json=tool_payload
            ) as response:
                logger.debug(f"Tool call status: {response.status}")
                
                if response.status == 200:
                    content_type = response.headers.get('content-type', '').lower()
                    
                    if 'text/event-stream' in content_type:
                        # Handle SSE response
                        async for line in response.content:
                            line = line.decode('utf-8').strip()
                            if line.startswith('data: '):
                                try:
                                    data = json.loads(line[6:])
                                    if "result" in data:
                                        result = data["result"]
                                        logger.success(f"✅ Tool {tool_name} executed successfully")
                                        return result
                                    elif "error" in data:
                                        error_msg = data["error"].get("message", "Unknown error")
                                        logger.error(f"❌ MCP tool error: {error_msg}")
                                        raise Exception(f"MCP tool error: {error_msg}")
                                    break
                                except json.JSONDecodeError:
                                    continue
                    else:
                        # Handle JSON response
                        data = await response.json()
                        logger.debug(f"Tool response: {data}")
                        
                        if "result" in data:
                            result = data["result"]
                            logger.success(f"✅ Tool {tool_name} executed successfully")
                            return result
                        elif "error" in data:
                            error_msg = data["error"].get("message", "Unknown error")
                            logger.error(f"❌ MCP tool error: {error_msg}")
                            raise Exception(f"MCP tool error: {error_msg}")
                else:
                    error_text = await response.text()
                    logger.error(f"❌ Tool execution failed {response.status}: {error_text}")
                    raise Exception(f"Tool execution failed: {response.status}")
        
        except Exception as e:
            logger.error(f"❌ Error calling tool {tool_name}: {e}")
            raise Exception(f"Tool {tool_name} failed: {str(e)}")
    
    def get_openai_tools(self) -> List[Dict[str, Any]]:
        """Convert MCP tools to OpenAI tools format"""
        return [
            {
                "type": "function",
                "function": {
                    "name": tool.name,
                    "description": tool.description,
                    "parameters": tool.input_schema
                }
            }
            for tool in self.tools_cache
        ]
    
    async def health_check(self) -> Dict[str, Any]:
        """Check MCP server health"""
        try:
            if not self._connected:
                await self.connect()
            
            if not self._connected:
                return {
                    "status": "error",
                    "connected": False,
                    "error": "Not connected to MCP server"
                }
            
            # Try to ping the server if ping tool is available
            start_time = time.time()
            ping_available = any(tool.name == "ping" for tool in self.tools_cache)
            
            if ping_available:
                try:
                    result = await self.call_tool("ping", {})
                    response_time = int((time.time() - start_time) * 1000)
                    
                    return {
                        "status": "healthy",
                        "connected": True,
                        "tools_count": len(self.tools_cache),
                        "response_time_ms": response_time,
                        "session_id": self.session_id,
                        "ssl_verified": self.verify_ssl,
                        "ping_result": result
                    }
                except Exception as e:
                    return {
                        "status": "connected",
                        "connected": True,
                        "tools_count": len(self.tools_cache),
                        "session_id": self.session_id,
                        "ssl_verified": self.verify_ssl,
                        "ping_error": str(e)
                    }
            else:
                return {
                    "status": "connected",
                    "connected": True,
                    "tools_count": len(self.tools_cache),
                    "session_id": self.session_id,
                    "ssl_verified": self.verify_ssl,
                    "note": "Ping tool not available"
                }
        
        except Exception as e:
            return {
                "status": "error",
                "connected": False,
                "error": str(e),
                "tools_count": len(self.tools_cache),
                "ssl_verified": self.verify_ssl
            }


# Global MCP client instance
_mcp_client: Optional[TurkishAirlinesMCPClient] = None


async def get_mcp_client() -> TurkishAirlinesMCPClient:
    """Get or create global MCP client instance"""
    global _mcp_client
    
    if _mcp_client is None:
        _mcp_client = TurkishAirlinesMCPClient()
        await _mcp_client.connect()
    
    return _mcp_client


async def ensure_mcp_connection() -> TurkishAirlinesMCPClient:
    """Ensure MCP client is connected"""
    client = await get_mcp_client()
    
    if not client._connected:
        await client.connect()
    
    return client


# Convenience functions
async def call_mcp_tool(tool_name: str, arguments: Dict[str, Any] = None) -> Dict[str, Any]:
    """Execute an MCP tool (convenience function)"""
    client = await ensure_mcp_connection()
    return await client.call_tool(tool_name, arguments)


async def get_mcp_tools() -> List[Dict[str, Any]]:
    """Get MCP tools in OpenAI format (convenience function)"""
    client = await ensure_mcp_connection()
    await client.load_tools()
    return client.get_openai_tools()


async def mcp_health_check() -> Dict[str, Any]:
    """MCP health check (convenience function)"""
    client = await get_mcp_client()
    return await client.health_check()


# Test function
if __name__ == "__main__":
    async def test_mcp():
        """Test MCP client functionality with corrected parameters"""
        print("🔧 Testing Turkish Airlines MCP with corrected parameters...")
        
        async with TurkishAirlinesMCPClient(verify_ssl=False) as client:
            print("Testing MCP connection...")
            health = await client.health_check()
            print(f"Health: {health}")
            
            if client._connected:
                print(f"\nFound {len(client.tools_cache)} tools:")
                for i, tool in enumerate(client.tools_cache[:10]):
                    print(f"  {i+1}. {tool.name}: {tool.description}")
                
                # Test ping tool
                print(f"\nTesting ping tool...")
                try:
                    result = await client.call_tool("ping", {})
                    print(f"Ping result: {result}")
                except Exception as e:
                    print(f"Ping test failed: {e}")
                
                # Test flight search with corrected parameters
                print(f"\nTesting flight search with corrected parameters...")
                try:
                    search_params = {
                        "origin": "IST",
                        "destination": "ESB",
                        "departureDate": (datetime.now() + timedelta(days=7)).strftime('%Y-%m-%d'),
                        "passengerCount": 1
                    }
                    result = await client.call_tool("search_flights", search_params)
                    print(f"Flight search successful: {type(result)}")
                except Exception as e:
                    print(f"Flight search test failed: {e}")
                
                # Test flight status with corrected parameters
                print(f"\nTesting flight status with corrected parameters...")
                try:
                    status_params = {
                        "flightNumber": "TK1",
                        "flightDate": (datetime.now() + timedelta(days=1)).strftime('%Y-%m-%d')
                    }
                    result = await client.call_tool("get_flight_status_by_number", status_params)
                    print(f"Flight status successful: {type(result)}")
                except Exception as e:
                    print(f"Flight status test failed: {e}")
                
                # Print some tool schemas for debugging
                print(f"\nTool schemas:")
                await client.print_tool_schema("search_flights")
                await client.print_tool_schema("get_flight_status_by_number")
    
    # Run test
    asyncio.run(test_mcp())
