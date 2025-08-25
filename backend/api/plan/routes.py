from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Optional
import httpx, os
from math import radians, sin, cos, asin, sqrt

# ------------------------------------------------------------
#  YolYap — /plan endpoints (no persistence)
#  - Matrix (Mapbox driving-traffic)
#  - Seed order: greedy_from + two_opt on SYMMETRIC avg matrix
#  - Refinement: directed 2-opt* on the original (asymmetric) matrix
#  - Anchor handling: if provided and not exactly a POI, use nearest POI
#  - Geometry: prepend actual anchor point to the path if needed
# ------------------------------------------------------------

from features.route_suggest import greedy_from, two_opt, total_cost

router = APIRouter()

# -------------------- utils --------------------

def haversine(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Metre cinsinden iki nokta arası yaklaşık küresel mesafe."""
    R = 6371000.0
    dlat = radians(lat2 - lat1)
    dlon = radians(lon2 - lon1)
    a = sin(dlat/2) ** 2 + cos(radians(lat1)) * cos(radians(lat2)) * sin(dlon/2) ** 2
    return 2 * R * asin(sqrt(a))

# Directed (asymmetric) helpers

def dir_cost(order: List[int], D: List[List[float]]) -> float:
    if len(order) < 2:
        return 0.0
    s = 0.0
    for a, b in zip(order[:-1], order[1:]):
        s += float(D[a][b])
    return s

def make_symmetric(D: List[List[float]]) -> List[List[float]]:
    n = len(D)
    S = [[0.0] * n for _ in range(n)]
    for i in range(n):
        for j in range(n):
            if i == j:
                S[i][j] = 0.0
            else:
                S[i][j] = 0.5 * (float(D[i][j]) + float(D[j][i]))
    return S

def two_opt_star_directed(order: List[int], D: List[List[float]], max_passes: int = 3) -> List[int]:
    n = len(order)
    if n < 4:
        return order[:]
    best = order[:]
    best_cost = dir_cost(best, D)
    passes = 0
    improved = True
    while improved and passes < max_passes:
        improved = False
        passes += 1
        for i in range(1, n - 2):  # 1: keep start fixed
            for k in range(i + 1, n - 1):
                a, b = best[i - 1], best[i]
                c, d = best[k], best[k + 1]
                # old: a->b, c->d ; new after reverse b..c: a->c, b->d
                old_cost = D[a][b] + D[c][d]
                new_cost = D[a][c] + D[b][d]
                if old_cost - new_cost > 1e-6:
                    best = best[:i] + best[i : k + 1][::-1] + best[k + 1 :]
                    best_cost -= (old_cost - new_cost)
                    improved = True
    return best

# -------------------- models --------------------

class Pt(BaseModel):
    lat: float
    lng: float

class PlanIn(BaseModel):
    places: List[Pt]
    timeBudgetMin: Optional[int] = None
    anchor: Optional[Pt] = None
    userId: Optional[str] = None
    email: Optional[str] = None

# -------------------- core --------------------

async def _plan_impl(inb: PlanIn):
    if not inb.places or len(inb.places) < 2:
        raise HTTPException(400, "En az 2 yer seçin")

    # 1) Matrix (durations)
    async with httpx.AsyncClient(timeout=40) as hc:
        r = await hc.post(
            "http://localhost:" + os.getenv("PORT", "8080") + "/traffic/matrix",
            json={"coords": [p.model_dump() for p in inb.places]},
        )
        if r.status_code != 200:
            raise HTTPException(r.status_code, r.text)
        matrix = r.json()
    durations: List[List[float]] = matrix["durations"]

    n = len(durations)
    symD = make_symmetric(durations)

    # 2) Anchor başlangıcı: exact match ya da listedeki en yakın POI index’i
    start_indices = range(n)
    if inb.anchor:
        anchor_idx = None
        for i, p in enumerate(inb.places):
            if abs(p.lat - inb.anchor.lat) < 1e-8 and abs(p.lng - inb.anchor.lng) < 1e-8:
                anchor_idx = i
                break
        if anchor_idx is None:
            dmin, imin = float("inf"), 0
            for i, p in enumerate(inb.places):
                d = haversine(inb.anchor.lat, inb.anchor.lng, p.lat, p.lng)
                if d < dmin:
                    dmin, imin = d, i
            anchor_idx = imin
        start_indices = [anchor_idx]

    # 3) Seed sıra: symmetric greedy + 2-opt
    seed_cost = float("inf")
    seed_order: List[int] = []
    seed_start = 0
    for s in start_indices:
        g = greedy_from(s, symD)
        t = two_opt(g, symD)
        c = total_cost(t, symD)
        if c < seed_cost:
            seed_cost, seed_order, seed_start = c, t, s

    if not seed_order:
        raise HTTPException(404, "Rota optimize edilemedi")

    # 4) Directed refine: 2-opt* orijinal (asimetrik) matris
    best_order = two_opt_star_directed(seed_order, durations, max_passes=3)

    # 5) Directions geometri — anchor'ı gerekiyorsa başa ekle
    ordered_points = [inb.places[i].model_dump() for i in best_order]
    order_for_directions = ordered_points
    if inb.anchor:
        first = ordered_points[0]
        if abs(first["lat"] - inb.anchor.lat) > 1e-8 or abs(first["lng"] - inb.anchor.lng) > 1e-8:
            order_for_directions = [inb.anchor.model_dump()] + ordered_points

    async with httpx.AsyncClient(timeout=40) as hc:
        r = await hc.post(
            "http://localhost:" + os.getenv("PORT", "8080") + "/traffic/route",
            json={"order": order_for_directions},
        )
        if r.status_code != 200:
            raise HTTPException(r.status_code, r.text)
        route = r.json()

    time_budget_sec = inb.timeBudgetMin * 60 if inb.timeBudgetMin else None
    within = (route.get("duration") <= time_budget_sec) if time_budget_sec else True

    return {
        "order": best_order,
        "startIndexResolved": seed_start,
        "durationSec": route.get("duration"),
        "distanceMeters": route.get("distance"),
        "geometry": route.get("geometry"),
        "costFromMatrixSec": dir_cost(best_order, durations),
        "withinBudget": within,
        "placesOrdered": ordered_points,
    }

# Expose both /plan and /plan/ to avoid 404 from trailing slash
@router.post("")
async def plan_root(inb: PlanIn):
    return await _plan_impl(inb)

@router.post("/")
async def plan_slash(inb: PlanIn):
    return await _plan_impl(inb)
