# backend/api/ai/routes.py
"""
Turkish Airlines MCP Integration - AI Routes
"""
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
from typing import Optional, Dict, Any, List
import os
import json
import re
import datetime
import pytz
from dotenv import load_dotenv
from openai import OpenAI
from loguru import logger

# Import our Turkish Airlines MCP client
from mcp_client import (
    get_mcp_client,
    ensure_mcp_connection,
    call_mcp_tool,
    get_mcp_tools,
    mcp_health_check
)

load_dotenv()

router = APIRouter(prefix="/ai", tags=["ai"])

# Initialize OpenAI client
try:
    client = OpenAI()  # Uses OPENAI_API_KEY from environment
except Exception as e:
    logger.error(f"Failed to initialize OpenAI client: {e}")
    client = None

# Configuration
OPENAI_TOOLS_ENABLED = os.getenv("OPENAI_TOOLS_ENABLED", "1").strip().lower() in {"1", "true", "on", "yes"}
OPENAI_MODEL = os.getenv("OPENAI_MODEL", "gpt-4o-mini")

# Enhanced system prompt for Turkish Airlines AI assistant
SYSTEM_PROMPT = """Sen Rota planlamaya yardımcı olan bir asistansın.

🎯 Görevlerin:
1. Turkish Airlines uçuşları, rezervasyonlar ve Miles&Smiles programı ile ilgili yardım
2. Gerçek zamanlı uçuş durumu sorguları
3. Şehir rehberleri ve seyahat önerileri
4. Güncel promosyon ve kampanya bilgileri
5. Bagaj hakları ve check-in işlemleri

📋 Kurallar:
- THY spesifik sorular (uçuş, PNR, mil, rezervasyon) için MCP araçlarını kullan
- Genel seyahat sorularına kendi bilginle yanıt ver
- MCP araçları başarısız olursa bunu belirt ve genel bilgi ver  
- Yanıtları Türkçe ve düzenli format kullan (numaralı listeler, başlıklar)
- Tarih/saat için Europe/Istanbul saat dilimi kullan
- Uydurma yapma, bilmediğin için "Bu bilgi elimde yok" de

🔧 Mevcut MCP Araçları:
- ping: Bağlantı testi
- search_flights: Uçuş arama (origin, destination, departureDate, passengerCount)
- get_flight_status_by_number: Uçuş numarası ile durum (flightNumber, flightDate)  
- get_flight_status_by_route: Rota ile durum (origin, destination, flightDate)
- get_booking_details: Rezervasyon detayları (bookingReference, surname)
- get_booking_baggage_allowance: Bagaj hakları
- get_current_user_details: Kullanıcı profili
- get_expiring_miles: Süresi dolan miller
- list_user_flights: Kullanıcının uçuşları  
- get_city_guide: Şehir rehberi (cityCode)
- get_airline_promotions: Promosyonlar (countryCode)

💡 Örnekler:
- "TK123 28.08.2024 durumu?" → get_flight_status_by_number
- "İstanbul Ankara bugün" → get_flight_status_by_route
- "PNR: ABC123 soyad: Yılmaz" → get_booking_details
- "İstanbul Ankara bilet yarın" → search_flights"""

class AskRequest(BaseModel):
    message: str
    use_mcp: Optional[bool] = True
    temperature: Optional[float] = 0.2

class AskResponse(BaseModel):
    reply: str
    used_mcp: bool
    tools_called: Optional[List[str]] = None
    fallback: Optional[bool] = False
    error: Optional[str] = None

def _sanitize_text(text: str) -> str:
    """Clean up text for better readability."""
    if not text:
        return ""
    
    # Remove code blocks and markdown
    text = re.sub(r'```.*?```', '', text, flags=re.DOTALL)
    text = re.sub(r'(\*\*|\*|__|_)', '', text)
    
    # Convert links to readable format
    text = re.sub(r'\[([^\]]+)\]\((https?://[^)]+)\)', r'\1 - \2', text)
    
    # Clean up formatting
    text = re.sub(r'(?m)^\s*[-*•–]+\s+', '', text)
    text = re.sub(r'^\s{0,3}#{1,6}\s*', '', text, flags=re.MULTILINE)
    text = re.sub(r'[ \t]+', ' ', text)
    text = re.sub(r'\n{3,}', '\n\n', text)
    
    return text.strip()

def _extract_flight_intent(user_message: str) -> tuple[Optional[str], Dict[str, Any]]:
    """
    Extract Turkish Airlines specific intents from user message.
    Returns (tool_name, arguments) or (None, {}) if no clear intent found.
    """
    text = user_message.strip().lower()
    
    # Flight number pattern (TK123, PC4567, etc.)
    flight_pattern = r'\b(TK|PC|AJ)\s?(\d{1,4}[A-Z]?)\b'
    date_pattern = r'(\d{4}-\d{2}-\d{2}|\d{1,2}[./-]\d{1,2}[./-]\d{4}|bugün|today|yarın|tomorrow)'
    airport_pattern = r'\b([A-Z]{3})\b'
    pnr_pattern = r'\b([A-Z0-9]{6})\b'
    
    flight_match = re.search(flight_pattern, user_message, re.I)
    date_match = re.search(date_pattern, user_message, re.I)
    airports = re.findall(airport_pattern, user_message.upper())
    pnr_match = re.search(pnr_pattern, user_message)
    
    def parse_date(date_str):
        """Convert various date formats to YYYY-MM-DD using Turkey timezone"""
        import pytz
        
        # Get Turkey timezone
        turkey_tz = pytz.timezone('Europe/Istanbul')
        turkey_now = datetime.datetime.now(turkey_tz)
        turkey_today = turkey_now.date()
        
        if not date_str:
            return turkey_today.strftime('%Y-%m-%d')
            
        date_str = date_str.lower()
        if date_str in ['bugün', 'today']:
            return turkey_today.strftime('%Y-%m-%d')
        elif date_str in ['yarın', 'tomorrow']:
            tomorrow = turkey_today + datetime.timedelta(days=1)
            return tomorrow.strftime('%Y-%m-%d')
        
        # Try to parse date
        try:
            if re.match(r'\d{4}-\d{2}-\d{2}', date_str):
                return date_str
            
            parts = re.split(r'[./-]', date_str)
            if len(parts) == 3:
                if len(parts[2]) == 4:  # DD-MM-YYYY
                    day, month, year = parts
                else:  # YYYY-MM-DD
                    year, month, day = parts
                return f"{year}-{month.zfill(2)}-{day.zfill(2)}"
        except:
            pass
        
        return turkey_today.strftime('%Y-%m-%d')
    
    # 1. Flight status by number
    if flight_match and ('durum' in text or 'status' in text):
        airline_code = flight_match.group(1).upper()
        flight_num = flight_match.group(2)
        flight_number = f"{airline_code}{flight_num}"
        flight_date = parse_date(date_match.group(1) if date_match else None)
        
        return "get_flight_status_by_number", {
            "flightNumber": flight_number,
            "flightDate": flight_date
        }
    
    # 2. Flight status by route
    if len(airports) >= 2 and ('durum' in text or 'status' in text):
        flight_date = parse_date(date_match.group(1) if date_match else None)
        
        return "get_flight_status_by_route", {
            "origin": airports[0],
            "destination": airports[1],
            "flightDate": flight_date
        }
    
    # 3. Booking details (PNR)
    if pnr_match and ('rezervasyon' in text or 'pnr' in text or 'booking' in text):
        # Look for surname
        surname_pattern = r'(soyad[ıi]?\s*[:=]?\s*|surname\s*[:=]?\s*)([A-Za-zÇĞİÖŞÜçğıöşü\s\'-]{2,})'
        surname_match = re.search(surname_pattern, user_message, re.I)
        
        params = {"bookingReference": pnr_match.group(1).upper()}
        if surname_match:
            params["surname"] = surname_match.group(2).strip()
        
        return "get_booking_details", params
    
    # 4. Flight search
    if ('uçuş' in text or 'ucus' in text or 'bilet' in text or 'flight' in text) and len(airports) >= 2:
        departure_date = parse_date(date_match.group(1) if date_match else None)
        
        # Extract passenger count
        passenger_count = 1
        passenger_match = re.search(r'(\d+)\s*(kişi|kisi|passenger|adult)', text)
        if passenger_match:
            passenger_count = int(passenger_match.group(1))
        
        return "search_flights", {
            "origin": airports[0],
            "destination": airports[1],  
            "departureDate": departure_date,
            "passengerCount": passenger_count
        }
    
    # 5. Miles expiring
    if ('mil' in text and ('bitiyor' in text or 'son' in text)) or 'expiring miles' in text:
        return "get_expiring_miles", {}
    
    # 6. User flights
    if 'uçuşlarım' in text or 'ucuslarim' in text or 'my flights' in text:
        return "list_user_flights", {}
    
    # 7. City guide
    if ('rehber' in text or 'guide' in text or 'gez' in text) and airports:
        return "get_city_guide", {"cityCode": airports[0]}
    
    # 8. Promotions
    if 'promosyon' in text or 'kampanya' in text or 'promotion' in text:
        params = {"countryCode": "TR"}
        if airports:
            params["departureAirport"] = airports[0]
            if len(airports) > 1:
                params["arrivalAirport"] = airports[1]
        return "get_airline_promotions", params
    
    # 9. Baggage allowance
    if 'bagaj' in text or 'bavul' in text or 'baggage' in text:
        if pnr_match:
            return "get_booking_baggage_allowance", {"bookingReference": pnr_match.group(1).upper()}
        return "get_booking_baggage_allowance", {}
    
    # 10. User details
    if 'profil' in text or 'hesap' in text or 'profile' in text or 'miles' in text:
        return "get_current_user_details", {}
    
    # 11. Test/ping
    if 'test' in text or 'ping' in text or 'bağlantı' in text:
        return "ping", {}
    
    return None, {}

def _format_mcp_result(result: Dict[str, Any], tool_name: str) -> str:
    """Format MCP tool results for better user experience."""
    if not isinstance(result, dict):
        return str(result)
    
    if "error" in result:
        return f"❌ **Hata**: {result['error']}"
    
    if "content" in result:
        content = result["content"]
        if isinstance(content, list) and len(content) > 0:
            if isinstance(content[0], dict) and "text" in content[0]:
                try:
                    # Try to parse JSON content
                    text_content = content[0]["text"]
                    parsed = json.loads(text_content)
                    
                    # Format based on tool type
                    if tool_name == "ping":
                        if parsed.get("answer") == "pong":
                            return "✅ **Bağlantı Başarılı**\n🔐 Kimlik doğrulandı\n📡 Turkish Airlines MCP sunucusu aktif"
                    
                    elif tool_name == "search_flights":
                        return _format_flight_results(parsed)
                    
                    elif tool_name in ["get_flight_status_by_number", "get_flight_status_by_route"]:
                        return _format_flight_status(parsed)
                    
                    elif tool_name == "get_city_guide":
                        return _format_city_guide(parsed)
                    
                    elif tool_name == "get_airline_promotions":
                        return _format_promotions(parsed)
                    
                    elif tool_name == "get_booking_details":
                        return _format_booking_details(parsed)
                    
                    # Default formatting for other tools
                    return _format_generic_result(parsed)
                    
                except json.JSONDecodeError:
                    return text_content
        
        return str(content)
    
    # Fallback formatting
    return _format_generic_result(result)

def _format_flight_results(data: Dict[str, Any]) -> str:
    """Format flight search results in simple, readable format."""
    if not data or "originDestinationInformations" not in data:
        return "Uçuş bulunamadı"
    
    origin_dest_info = data["originDestinationInformations"][0]
    options = origin_dest_info.get("originDestinationOptions", [])
    
    if not options:
        return "Bu rotada uçuş bulunamadı"
    
    date = origin_dest_info.get('departureDateTime', '')[:10]
    
    result = f"Istanbul - Ankara ({date})\n\n"
    
    # Show top 5 flights with minimal info
    for i, option in enumerate(options[:5], 1):
        segment = option["flightSegments"][0]
        flight_code = segment["flightCode"]
        flight_num = f"{flight_code['airlineCode']}{flight_code['flightNumber']}"
        
        dep_time = segment["departureDateTime"][11:16]
        arr_time = segment["arrivalDateTime"][11:16]
        cheapest = option.get("cheapestPriceAmount", 0)
        
        result += f"{i}. {flight_num} | {dep_time}-{arr_time} | {cheapest:,.0f} TL\n"
    
    if len(options) > 5:
        result += f"\n+{len(options) - 5} uçuş daha var"
    
    return result

def _format_flight_status(data: Dict[str, Any]) -> str:
    """Format flight status results."""
    reply = "✈️ **Uçuş Durumu**\n\n"
    
    if "flightNumber" in data:
        reply += f"🔢 **Uçuş**: {data['flightNumber']}\n"
    
    if "status" in data:
        status_emoji = "🟢" if "on time" in str(data["status"]).lower() else "🟡"
        reply += f"{status_emoji} **Durum**: {data['status']}\n"
    
    if "departureTime" in data:
        reply += f"🛫 **Kalkış**: {data['departureTime']}\n"
    
    if "arrivalTime" in data:
        reply += f"🛬 **İniş**: {data['arrivalTime']}\n"
    
    if "gate" in data:
        reply += f"🚪 **Kapı**: {data['gate']}\n"
    
    return reply

def _format_city_guide(data: Dict[str, Any]) -> str:
    """Format city guide results."""
    reply = "🏙️ **Şehir Rehberi**\n\n"
    
    if "cityName" in data:
        reply += f"📍 **Şehir**: {data['cityName']}\n\n"
    
    if "attractions" in data:
        reply += "🎯 **Gezilecek Yerler**:\n"
        for attraction in data["attractions"][:5]:
            reply += f"• {attraction}\n"
        reply += "\n"
    
    if "restaurants" in data:
        reply += "🍽️ **Restoranlar**:\n"
        for restaurant in data["restaurants"][:3]:
            reply += f"• {restaurant}\n"
        reply += "\n"
    
    if "weather" in data:
        reply += f"🌤️ **Hava Durumu**: {data['weather']}\n"
    
    return reply

def _format_promotions(data: Dict[str, Any]) -> str:
    """Format promotions results."""
    reply = "🎉 **Kampanyalar ve Promosyonlar**\n\n"
    
    if "promotions" in data and data["promotions"]:
        for i, promo in enumerate(data["promotions"][:3], 1):
            reply += f"**{i}. {promo.get('title', 'Kampanya')}**\n"
            if "description" in promo:
                reply += f"   📝 {promo['description']}\n"
            if "discount" in promo:
                reply += f"   💸 İndirim: {promo['discount']}\n"
            if "validUntil" in promo:
                reply += f"   📅 Geçerlilik: {promo['validUntil']}\n"
            reply += "\n"
    else:
        reply += "Şu anda aktif promosyon bulunmuyor."
    
    return reply

def _format_booking_details(data: Dict[str, Any]) -> str:
    """Format booking details results."""
    reply = "🎫 **Rezervasyon Detayları**\n\n"
    
    if "pnr" in data:
        reply += f"🔖 **PNR**: {data['pnr']}\n"
    
    if "passengerName" in data:
        reply += f"👤 **Yolcu**: {data['passengerName']}\n"
    
    if "flights" in data:
        reply += f"✈️ **Uçuşlar**:\n"
        for flight in data["flights"]:
            reply += f"• {flight.get('flightNumber', 'N/A')}: "
            reply += f"{flight.get('route', 'N/A')} - "
            reply += f"{flight.get('date', 'N/A')}\n"
        reply += "\n"
    
    if "status" in data:
        status_emoji = "✅" if "confirmed" in str(data["status"]).lower() else "⏳"
        reply += f"{status_emoji} **Durum**: {data['status']}\n"
    
    return reply

def _format_generic_result(data: Dict[str, Any]) -> str:
    """Generic formatting for other results."""
    reply = "📋 **Sonuçlar**\n\n"
    
    for key, value in data.items():
        if key in ["raw_data", "debug", "metadata"]:  # Skip technical fields
            continue
            
        clean_key = key.replace("_", " ").title()
        
        if isinstance(value, (dict, list)):
            if len(str(value)) > 100:  # Too long, summarize
                reply += f"**{clean_key}**: [Detaylı veri mevcut]\n"
            else:
                reply += f"**{clean_key}**: {value}\n"
        else:
            reply += f"**{clean_key}**: {value}\n"
    
    return reply

@router.post("/ask", response_model=AskResponse)
async def ask(request: AskRequest, req: Request):
    """
    Main AI chat endpoint with Turkish Airlines MCP integration.
    """
    if not request.message or not request.message.strip():
        raise HTTPException(400, "Message cannot be empty")
    
    if not client:
        raise HTTPException(503, "OpenAI client not available - check OPENAI_API_KEY")
    
    logger.info(f"AI request: {request.message[:100]}...")
    
    # Step 1: Direct intent extraction for Turkish Airlines specific queries
    if request.use_mcp:
        tool_name, tool_args = _extract_flight_intent(request.message)
        if tool_name:
            try:
                logger.info(f"Direct intent: {tool_name} with args: {tool_args}")
                
                # Execute MCP tool directly
                result = await call_mcp_tool(tool_name, tool_args)
                
                # Format result for user
                reply = _format_mcp_result(result, tool_name)
                
                return AskResponse(
                    reply=_sanitize_text(reply),
                    used_mcp=True,
                    tools_called=[tool_name]
                )
                
            except Exception as e:
                logger.warning(f"Direct MCP tool execution failed: {e}")
                # Continue to OpenAI approach below
    
    # Step 2: Use OpenAI with function calling
    tools = []
    if OPENAI_TOOLS_ENABLED and request.use_mcp:
        try:
            # Get MCP tools in OpenAI format
            tools = await get_mcp_tools()
            logger.info(f"Loaded {len(tools)} MCP tools for OpenAI")
        except Exception as e:
            logger.warning(f"Failed to load MCP tools: {e}")
            tools = []
    
    messages = [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": request.message}
    ]
    
    try:
        # Initial OpenAI call
        call_kwargs = {
            "model": OPENAI_MODEL,
            "messages": messages,
            "temperature": request.temperature or 0.2,
        }
        
        if tools:
            call_kwargs["tools"] = tools
            call_kwargs["tool_choice"] = "auto"
        
        response = client.chat.completions.create(**call_kwargs)
        
    except Exception as e:
        logger.error(f"OpenAI API error: {e}")
        raise HTTPException(500, f"OpenAI error: {str(e)}")
    
    choice = response.choices[0]
    tool_calls = getattr(choice.message, "tool_calls", None)
    
    if tools and tool_calls:
        # Handle tool calls
        logger.info(f"OpenAI requested {len(tool_calls)} tool calls")
        
        # Add assistant message with tool calls
        messages.append({
            "role": "assistant",
            "content": choice.message.content or "",
            "tool_calls": [
                {
                    "id": tc.id,
                    "type": "function",
                    "function": {
                        "name": tc.function.name,
                        "arguments": tc.function.arguments or "{}"
                    }
                }
                for tc in tool_calls
            ]
        })
        
        tools_called = []
        any_successful = False
        
        # Execute each tool call
        for tc in tool_calls:
            tool_name = tc.function.name
            try:
                args = json.loads(tc.function.arguments or "{}")
            except json.JSONDecodeError:
                args = {}
            
            tools_called.append(tool_name)
            logger.info(f"Executing MCP tool: {tool_name}")
            
            try:
                # Call MCP tool
                result = await call_mcp_tool(tool_name, args)
                any_successful = True
                
                # Add tool result to messages
                messages.append({
                    "role": "tool",
                    "tool_call_id": tc.id,
                    "name": tool_name,
                    "content": json.dumps(result, ensure_ascii=False)[:8000]  # Limit size
                })
                
            except Exception as e:
                logger.error(f"MCP tool {tool_name} failed: {e}")
                messages.append({
                    "role": "tool",
                    "tool_call_id": tc.id,
                    "name": tool_name,
                    "content": json.dumps({"error": str(e)}, ensure_ascii=False)
                })
        
        # Get final response from OpenAI
        try:
            final_response = client.chat.completions.create(
                model=OPENAI_MODEL,
                messages=messages,
                temperature=request.temperature or 0.2
            )
            
            reply = final_response.choices[0].message.content or ""
            
            return AskResponse(
                reply=_sanitize_text(reply),
                used_mcp=any_successful,
                tools_called=tools_called,
                fallback=not any_successful
            )
            
        except Exception as e:
            logger.error(f"Final OpenAI call failed: {e}")
            # Return fallback response
            reply = "Turkish Airlines araçlarını kullanarak yanıt oluşturamadım, ancak size genel bilgilerle yardımcı olmaya çalışabilirim."
            
            return AskResponse(
                reply=reply,
                used_mcp=False,
                fallback=True,
                tools_called=tools_called,
                error=str(e)
            )
    
    else:
        # No tool calls, return direct response
        reply = choice.message.content or "Üzgünüm, yanıt oluşturamadım."
        
        return AskResponse(
            reply=_sanitize_text(reply),
            used_mcp=False
        )

@router.get("/health")
async def ai_health():
    """Health check for AI service and MCP connection."""
    checks = {
        "status": "healthy",
        "openai_client": client is not None,
        "tools_enabled": OPENAI_TOOLS_ENABLED,
        "model": OPENAI_MODEL,
        "timestamp": datetime.datetime.now().isoformat()
    }
    
    # Test OpenAI connectivity
    if client:
        try:
            test_response = client.chat.completions.create(
                model=OPENAI_MODEL,
                messages=[{"role": "user", "content": "test"}],
                max_tokens=5,
                temperature=0
            )
            checks["openai_status"] = "connected"
        except Exception as e:
            checks["openai_status"] = f"error: {str(e)}"
            checks["status"] = "degraded"
    else:
        checks["openai_status"] = "not_configured"
        checks["status"] = "degraded"
    
    # Test MCP connection
    try:
        mcp_health = await mcp_health_check()
        checks["mcp"] = mcp_health
        if mcp_health["status"] != "healthy":
            checks["status"] = "degraded"
    except Exception as e:
        checks["mcp"] = {
            "status": "error",
            "error": str(e)
        }
        checks["status"] = "degraded"
    
    return checks

@router.get("/tools")
async def list_available_tools():
    """List all available Turkish Airlines MCP tools."""
    try:
        # Ensure MCP connection
        mcp_client = await ensure_mcp_connection()
        await mcp_client.load_tools()
        
        tools_info = []
        for tool in mcp_client.tools_cache:
            tools_info.append({
                "name": tool.name,
                "description": tool.description,
                "input_schema": tool.input_schema
            })
        
        return {
            "count": len(tools_info),
            "tools": tools_info,
            "mcp_connected": mcp_client._connected,
            "session_id": mcp_client.session_id
        }
        
    except Exception as e:
        logger.error(f"Failed to list MCP tools: {e}")
        return {
            "count": 0,
            "tools": [],
            "error": str(e),
            "mcp_connected": False
        }

@router.post("/test-mcp")
async def test_mcp_connection():
    """Test MCP connection and basic functionality."""
    try:
        # Test connection
        mcp_client = await ensure_mcp_connection()
        
        # Test ping
        ping_result = await mcp_client.call_tool("ping", {})
        
        # Load tools
        await mcp_client.load_tools()
        
        return {
            "status": "success",
            "connected": mcp_client._connected,
            "session_id": mcp_client.session_id,
            "tools_count": len(mcp_client.tools_cache),
            "ping_result": ping_result,
            "sample_tools": [tool.name for tool in mcp_client.tools_cache[:5]]
        }
        
    except Exception as e:
        logger.error(f"MCP test failed: {e}")
        return {
            "status": "error",
            "error": str(e),
            "connected": False
        }

@router.post("/call-tool")
async def call_tool_directly(
    tool_name: str,
    arguments: Dict[str, Any] = None
):
    """
    Direct tool calling endpoint for testing.
    """
    if not tool_name:
        raise HTTPException(400, "Tool name is required")
    
    try:
        result = await call_mcp_tool(tool_name, arguments or {})
        
        return {
            "status": "success",
            "tool_name": tool_name,
            "arguments": arguments,
            "result": result
        }
        
    except Exception as e:
        logger.error(f"Direct tool call failed: {e}")
        raise HTTPException(500, f"Tool execution failed: {str(e)}")

@router.get("/examples")
async def get_example_queries():
    """Get example queries for testing different MCP tools."""
    examples = {
        "flight_status_by_number": [
            "TK1 bugün durum nedir?",
            "PC101 28.08.2024 uçuş durumu",
            "AJ123 yarın flight status"
        ],
        "flight_status_by_route": [
            "IST ESB bugün uçuş durumu",
            "İstanbul Ankara 30.08.2024 durum",
            "IST JFK today flight status"
        ],
        "booking_details": [
            "ABC123 PNR rezervasyon detayları soyad: Yılmaz",
            "Booking XYZ789 surname Smith",
            "PNR kontrolü: DEF456"
        ],
        "search_flights": [
            "İstanbul Ankara bilet yarın",
            "IST ESB 2 kişi 30.08.2024",
            "Flight search IST to JFK tomorrow"
        ],
        "expiring_miles": [
            "Millerin süresi bitiyor mu?",
            "Expiring miles check",
            "Süre dolan mil kontrol"
        ],
        "user_flights": [
            "Uçuşlarımı göster",
            "My flights list",
            "Aktif rezervasyonlarım"
        ],
        "city_guide": [
            "İstanbul şehir rehberi",
            "IST city guide",
            "Ankara gezilecek yerler"
        ],
        "promotions": [
            "Kampanyalar ve promosyonlar",
            "Turkish Airlines promotions TR",
            "İndirimli biletler"
        ],
        "baggage_allowance": [
            "Bagaj hakları ABC123",
            "Bavul ağırlığı limiti",
            "Baggage allowance international"
        ],
        "user_details": [
            "Profil bilgilerim",
            "Miles&Smiles hesap durumu",
            "Account details"
        ],
        "ping": [
            "Test bağlantı",
            "Ping test",
            "Sistem durumu kontrol"
        ]
    }
    
    return {
        "description": "Turkish Airlines MCP Tool Test Queries",
        "categories": examples,
        "total_examples": sum(len(queries) for queries in examples.values()),
        "usage": "Bu örnekleri /ai/ask endpoint'ine göndererek farklı MCP tool'larını test edebilirsiniz"
    }

# Startup event to initialize MCP connection
@router.on_event("startup")
async def startup_event():
    """Initialize MCP connection on startup."""
    try:
        logger.info("🚀 Initializing Turkish Airlines MCP connection...")
        mcp_client = await get_mcp_client()
        
        if mcp_client._connected:
            await mcp_client.load_tools()
            logger.success(f"✅ Turkish Airlines MCP ready - {len(mcp_client.tools_cache)} tools available")
        else:
            logger.warning("⚠️ MCP connection failed - check TURKISH_AIRLINES_MCP_TOKEN")
            
    except Exception as e:
        logger.error(f"❌ MCP initialization failed: {e}")
