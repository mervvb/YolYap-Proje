from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
import os, httpx

router = APIRouter()

class Pt(BaseModel):
    lat: float
    lng: float

class RouteIn(BaseModel):
    order: list[Pt]   # sıraya sokulmuş noktalar

@router.post("/route")
async def route(inb: RouteIn):
    token = os.getenv("MAPBOX_SERVER_TOKEN")
    if not token: raise HTTPException(500, "MAPBOX_SERVER_TOKEN eksik")
    if not inb.order or len(inb.order) < 2:
        raise HTTPException(400, "En az 2 nokta gerekli")

    path = ";".join([f"{p.lng},{p.lat}" for p in inb.order])
    url = f"https://api.mapbox.com/directions/v5/mapbox/driving-traffic/{path}"
    params = {
        "geometries": "geojson",
        "overview": "full",
        "steps": "false",
        "access_token": token
    }

    async with httpx.AsyncClient(timeout=30) as hc:
        r = await hc.get(url, params=params)
        if r.status_code != 200:
            raise HTTPException(502, f"Mapbox Directions hata: {r.status_code} {r.text[:200]}")
        j = r.json()
        route = (j.get("routes") or [None])[0]
        if not route:
            raise HTTPException(502, "Rota yok")
        return {
            "geometry": route.get("geometry"),
            "distance": route.get("distance"),
            "duration": route.get("duration"),
        }
