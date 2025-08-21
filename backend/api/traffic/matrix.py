from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
import os, httpx

router = APIRouter()

class Pt(BaseModel):
    lat: float
    lng: float

class MatrixIn(BaseModel):
    coords: list[Pt]

@router.post("/matrix")
async def matrix(inb: MatrixIn):
    token = os.getenv("MAPBOX_SERVER_TOKEN")
    if not token: raise HTTPException(500, "MAPBOX_SERVER_TOKEN eksik")
    if not inb.coords or len(inb.coords) < 2:
        raise HTTPException(400, "En az 2 koordinat gerekli")

    coords_str = ";".join([f"{p.lng},{p.lat}" for p in inb.coords])
    url = f"https://api.mapbox.com/directions-matrix/v1/mapbox/driving-traffic/{coords_str}"
    params = {"annotations":"duration,distance","access_token": token}

    async with httpx.AsyncClient(timeout=30) as hc:
        r = await hc.get(url, params=params)
        if r.status_code != 200:
            raise HTTPException(502, f"Mapbox Matrix hata: {r.status_code} {r.text[:200]}")
        j = r.json()
        durations = j.get("durations")
        distances = j.get("distances")
        if durations is None:
            raise HTTPException(502, "Matrix durations yok")
        return {"durations": durations, "distances": distances}
