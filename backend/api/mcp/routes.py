# backend/api/mcp/routes.py
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
import httpx, os

router = APIRouter()
BRIDGE = os.getenv("MCP_BRIDGE_URL", "http://127.0.0.1:9090")

# ---------- Helpers ----------
async def _bridge_post(path: str, payload: Dict[str, Any]) -> Any:
  url = f"{BRIDGE}{path}"
  async with httpx.AsyncClient(timeout=60) as hc:
    r = await hc.post(url, json=payload)
  if r.status_code != 200:
    raise HTTPException(r.status_code, r.text)
  # köprü JSON (MCP tool output) doğrudan döner
  return r.json()

# Tekil parametreli GET ile basit kontrol (örn. login URL)
@router.get("/login")
async def start_login():
  """
  Geliştirici / kullanıcı bir kez tarayıcıdan bu URL'e giderek
  Miles&Smiles oturumunu açar. Çerezler köprüde kalıcı tutulur.
  """
  return {"login_url": f"{BRIDGE}/thy/login"}

# ---------- Models ----------
class FlightSearchIn(BaseModel):
  origin: str = Field(..., example="IST")
  destination: str = Field(..., example="LHR")
  date: str = Field(..., example="2025-09-10")  # YYYY-MM-DD
  pax: Optional[int] = Field(1, ge=1, example=1)

class FlightStatusByNumberIn(BaseModel):
  flight_number: str = Field(..., example="TK1")
  date: str = Field(..., example="2025-09-10")

class FlightStatusByRouteIn(BaseModel):
  origin: str = Field(..., example="IST")
  destination: str = Field(..., example="FRA")
  date: str = Field(..., example="2025-09-10")

class BookingLinkIn(BaseModel):
  origin: str
  destination: str
  date: str
  pax: Optional[int] = 1
  cabin: Optional[str] = Field(None, description="ECONOMY/BUSINESS vb. (opsiyonel)")

class BookingDetailsIn(BaseModel):
  pnr: str = Field(..., example="ABC123")
  surname: str = Field(..., example="YILMAZ")

class CheckinDetailsIn(BaseModel):
  pnr: str
  surname: str

class BaggageAllowanceIn(BaseModel):
  pnr: str
  surname: str

class PromotionsIn(BaseModel):
  country: Optional[str] = Field(None, example="TR")
  origin: Optional[str] = Field(None, example="IST")
  destination: Optional[str] = Field(None, example="LHR")

class CityGuideIn(BaseModel):
  city: str = Field(..., example="PARIS")

# ---------- Proxied Endpoints to MCP Bridge ----------

@router.post("/search-flights")
async def search_flights(inp: FlightSearchIn):
  """
  THY MCP 'Search Flights' -> Bridge: /thy/search-flights
  """
  return await _bridge_post("/thy/search-flights", inp.model_dump())

@router.post("/flight-status/number")
async def flight_status_number(inp: FlightStatusByNumberIn):
  """
  THY MCP 'Get Flight Status by Number' -> Bridge: /thy/flight-status-number
  """
  return await _bridge_post("/thy/flight-status-number", inp.model_dump())

@router.post("/flight-status/route")
async def flight_status_route(inp: FlightStatusByRouteIn):
  """
  THY MCP 'Get Flight Status by Route' -> Bridge: /thy/flight-status-route
  """
  return await _bridge_post("/thy/flight-status-route", inp.model_dump())

@router.post("/booking/deeplink")
async def create_booking_link(inp: BookingLinkIn):
  """
  THY MCP 'Create Flight Booking Link' -> Bridge: /thy/booking-deeplink
  """
  return await _bridge_post("/thy/booking-deeplink", inp.model_dump())

@router.post("/booking/details")
async def booking_details(inp: BookingDetailsIn):
  """
  THY MCP 'Get Booking Details' -> Bridge: /thy/booking-details
  """
  return await _bridge_post("/thy/booking-details", inp.model_dump())

@router.post("/booking/checkin-details")
async def checkin_details(inp: CheckinDetailsIn):
  """
  THY MCP 'Get Check-in Booking Details' -> Bridge: /thy/checkin-details
  """
  return await _bridge_post("/thy/checkin-details", inp.model_dump())

@router.post("/booking/baggage-allowance")
async def booking_baggage_allowance(inp: BaggageAllowanceIn):
  """
  THY MCP 'Get Booking Baggage Allowance' -> Bridge: /thy/booking-baggage
  """
  return await _bridge_post("/thy/booking-baggage", inp.model_dump())

@router.post("/promotions")
async def airline_promotions(inp: PromotionsIn):
  """
  THY MCP 'Get Airline Promotions' -> Bridge: /thy/promotions
  """
  return await _bridge_post("/thy/promotions", inp.model_dump())

@router.post("/city-guide")
async def city_guide(inp: CityGuideIn):
  """
  THY MCP 'Get City Guide' -> Bridge: /thy/city-guide
  """
  return await _bridge_post("/thy/city-guide", inp.model_dump())

@router.get("/me")
async def me():
  """
  THY MCP 'Get Current User Details' -> Bridge: /thy/me
  """
  return await _bridge_post("/thy/me", {})

@router.get("/member/flights")
async def member_flights():
  """
  THY MCP 'Get Member Flights' -> Bridge: /thy/member-flights
  """
  return await _bridge_post("/thy/member-flights", {})

@router.get("/member/expiring-miles")
async def expiring_miles():
  """
  THY MCP 'Get Expiring Miles' -> Bridge: /thy/expiring-miles
  """
  return await _bridge_post("/thy/expiring-miles", {})

@router.post("/logout")
async def logout():
  """
  THY MCP 'Logout' -> Bridge: /thy/logout
  """
  return await _bridge_post("/thy/logout", {})
