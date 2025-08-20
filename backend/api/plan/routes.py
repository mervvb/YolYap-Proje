from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Optional
import httpx, os

from features.route_suggest import greedy_from, two_opt, total_cost

router = APIRouter()

class Pt(BaseModel):
    lat: float
    lng: float

class PlanIn(BaseModel):
    places: List[Pt]
    timeBudgetMin: Optional[int] = None
    anchor: Optional[Pt] = None  # kullanıcı başlangıcı

@router.post("/plan")
async def plan(inb: PlanIn):
    if not inb.places or len(inb.places) < 2:
        raise HTTPException(400, "En az 2 yer seçin")

    # 1) Matrix
    async with httpx.AsyncClient(timeout=40) as hc:
        r = await hc.post("http://localhost:" + os.getenv("PORT","8080") + "/traffic/matrix",
                          json={"coords":[p.model_dump() for p in inb.places]})
        if r.status_code != 200:
            raise HTTPException(r.status_code, r.text)
        matrix = r.json()
    durations: List[List[float]] = matrix["durations"]

    n = len(durations)
    best_cost = float("inf")
    best_order: List[int] = []
    best_start = 0

    # Eğer anchor varsa, ilk düğümü ona en yakın olan (tam eşleşme) indeks yapalım
    start_indices = range(n)
    if inb.anchor:
        # listede birebir eşleşen ilk indeks
        try:
            anchor_idx = next(i for i,p in enumerate(inb.places)
                              if abs(p.lat-inb.anchor.lat)<1e-8 and abs(p.lng-inb.anchor.lng)<1e-8)
            start_indices = [anchor_idx]
        except StopIteration:
            pass

    # 2) greedy + 2-opt en iyi başlangıcı ara (veya anchor sabit)
    for s in start_indices:
        g = greedy_from(s, durations)
        t = two_opt(g, durations)
        c = total_cost(t, durations)
        if c < best_cost:
            best_cost, best_order, best_start = c, t, s

    if not best_order:
        raise HTTPException(404, "Rota optimize edilemedi")

    # 3) Directions (geometri)
    ordered_points = [inb.places[i].model_dump() for i in best_order]
    async with httpx.AsyncClient(timeout=40) as hc:
        r = await hc.post("http://localhost:" + os.getenv("PORT","8080") + "/traffic/route",
                          json={"order": ordered_points})
        if r.status_code != 200:
            raise HTTPException(r.status_code, r.text)
        route = r.json()

    time_budget_sec = inb.timeBudgetMin*60 if inb.timeBudgetMin else None
    within = (route.get("duration") <= time_budget_sec) if time_budget_sec else True

    return {
        "order": best_order,
        "startIndexResolved": best_start,
        "durationSec": route.get("duration"),
        "distanceMeters": route.get("distance"),
        "geometry": route.get("geometry"),
        "costFromMatrixSec": best_cost,
        "withinBudget": within
    }