from fastapi import APIRouter, Request
from pydantic import BaseModel
import time
import json
import os
import httpx
import base64
import hashlib
from typing import Optional, Dict, Any
from pathlib import Path
from uuid import uuid4
from starlette.responses import FileResponse, Response
from math import radians, sin, cos, asin, sqrt
from time import time as _now


router = APIRouter()

# ---- provider split: image via Gemini, text via OpenAI ----
IMAGE_PROVIDER = "gemini"
TEXT_PROVIDER = "openai"

# Persist generated images under the project root to avoid cwd/reload mismatches
BASE_DIR = Path(__file__).resolve().parents[3]  # …/YolYap-Proje
IMAGES_DIR = BASE_DIR / "gen" / "image" / "gen_images"
IMAGES_DIR.mkdir(parents=True, exist_ok=True)

_MAP = {"kids": "culture", "landscape": "nature"}

_LABELS = {
    "history": "tarih ve antik dokular",
    "food": "yemek ve lezzet durakları",
    "nature": "doğa ve açık hava",
    "culture": "sanat ve kültür",
    "shopping": "alışveriş ve pazarlar",
    "adventure": "macera ve adrenalin",
    "seaside": "sahil ve deniz",
    "entertainment": "eğlence ve gece hayatı",
}
_ALLOWED = set(_LABELS.keys())


# Avatar icon hints for persona-to-prompt enrichment
ICON_HINTS = {
    "food": "fork and spoon",
    "nature": "leaf or small mountain",
    "history": "ionic column or laurel wreath",
    "culture": "theater mask",
    "shopping": "small tote bag",
    "adventure": "tiny compass",
    "seaside": "small wave icon",
    "entertainment": "music note"
}

# Avatar color palette hints for each persona
PALETTE_HINTS = {
    "food": "warm reds and saffron yellow with soft cream accents",
    "nature": "fresh greens and deep forest teal with light sky mint",
    "history": "antique parchment beige and sandstone with muted bronze",
    "culture": "rich royal purple with soft gold accents",
    "shopping": "vibrant coral and sunflower yellow with light beige",
    "adventure": "bold orange and midnight blue with steel gray",
    "seaside": "ocean teal and seafoam with sand beige",
    "entertainment": "electric magenta and indigo with charcoal"
}

# Avatar shape hints for each persona
SHAPE_HINTS = {
    "food": "rounded utensil silhouettes (simple fork & spoon)",
    "nature": "single leaf or small mountain silhouette with smooth curves",
    "history": "minimal ionic column silhouette with straight flutes",
    "culture": "simple theater mask silhouette with minimal cutouts",
    "shopping": "small tote bag silhouette with soft corners",
    "adventure": "tiny compass rose silhouette, bold cardinal points",
    "seaside": "single wave crest silhouette, smooth arc",
    "entertainment": "single music note silhouette, bold stem"
}


def _avatar_style_prompt(selections: list[str]) -> str:
    primary = selections[0] if selections else None
    # icon accessories (all selections)
    hints = [ICON_HINTS[s] for s in selections if s in ICON_HINTS]
    if not hints:
        hints = ["simple compass"]

    # palette & shape (use primary selection if available)
    palette = PALETTE_HINTS.get(primary or "", "soft pastel neutrals with a single accent color")
    shape = SHAPE_HINTS.get(primary or "", "clean circular icon silhouette with bold center element")

    # Stable avatar style baseline (English for T2I models)
    base = (
        "FLAT VECTOR HUMAN AVATAR, circular badge, front-facing bust (head & shoulders), female-presenting, "
        "friendly cute style (rounded shapes), simple clean facial features (two eyes, small mouth), "
        "single unified warm skin tone (no split shading, no dual colors), "
        "pastel or soft neutral background, minimal details, subtle soft shadow. "
        "Focus strongly on the persona’s theme and symbolic accessories. "
        "NO text, NO watermark, NO background scene, NO luggage, NO columns, NO photorealism, NO 3D"
    )

    return (
        f"Color palette: {palette}. Shape language: {shape}. "
        f"Add a very small lapel pin referencing: {', '.join(hints)} (secondary, not on the head, never the main subject). "
        f"{base}"
    )


# --- image persistence helpers ---

def _save_bytes_as_image(data: bytes, ext: str = "png") -> str:
    ext = (ext or "png").lower().strip(".")
    name = uuid4().hex + f".{ext}"
    path = IMAGES_DIR / name
    with open(path, "wb") as f:
        f.write(data)
        try:
            f.flush()
            os.fsync(f.fileno())
        except Exception:
            pass
    if not path.exists() or path.stat().st_size == 0:
        raise RuntimeError(f"image write failed: {path}")
    print(f"[gen-image] saved -> {path.resolve()}")
    return f"/gen/image/{name}"

def _save_bytes_as_png(data: bytes) -> str:
    return _save_bytes_as_image(data, "png")

async def _ensure_local_image(url_or_data: str) -> str:
    """Accept a data URI or http(s) URL, store as PNG under IMAGES_DIR, return backend URL path."""
    if not url_or_data:
        raise RuntimeError("empty image data")
    if url_or_data.startswith("data:image"):
        try:
            head, b64 = url_or_data.split(",", 1)
            # mime like data:image/png;base64,...
            mime = head[len("data:"):].split(";")[0].lower()
            # robust decode with padding and urlsafe fallback
            try:
                raw = base64.b64decode(b64 + "=" * ((4 - len(b64) % 4) % 4))
            except Exception:
                raw = base64.urlsafe_b64decode(b64 + "=" * ((4 - len(b64) % 4) % 4))
            ext = "png"
            if "jpeg" in mime or "jpg" in mime:
                ext = "jpg"
            elif "webp" in mime:
                ext = "webp"
            elif "png" in mime:
                ext = "png"
            return _save_bytes_as_image(raw, ext)
        except Exception as e:
            raise RuntimeError(f"data uri decode failed: {e}")
    if url_or_data.startswith("http://") or url_or_data.startswith("https://"):
        async with httpx.AsyncClient(timeout=60) as hc:
            r = await hc.get(url_or_data)
            r.raise_for_status()
            return _save_bytes_as_png(r.content)
    raise RuntimeError("unsupported image source")

# --- inline (non-persistent) image proxy ---
# Keeps images in memory for a short time and serves them via a stable URL, without writing to disk.
_INLINE_CACHE: dict[str, dict] = {}
_INLINE_TTL_SEC = 10 * 60   # 10 minutes
_INLINE_MAX_ITEMS = 200

def _parse_data_uri(data_uri: str) -> tuple[str, bytes]:
    if not data_uri.startswith("data:image"):
        raise RuntimeError("expected data:image/* URI")
    try:
        head, b64 = data_uri.split(",", 1)
        mime = head[len("data:"):].split(";")[0] or "image/png"
        raw = base64.b64decode(b64)
        return mime, raw
    except Exception as e:
        raise RuntimeError(f"invalid data uri: {e}")

def _inline_put(raw: bytes, mime: str) -> str:
    # evict expired
    now = _now()
    if len(_INLINE_CACHE) >= _INLINE_MAX_ITEMS:
        # drop oldest
        to_drop = sorted(_INLINE_CACHE.items(), key=lambda kv: kv[1].get("ts", 0))[:50]
        for k, _ in to_drop:
            _INLINE_CACHE.pop(k, None)
    # drop stale
    stale = [k for k,v in list(_INLINE_CACHE.items()) if now - v.get("ts", 0) > _INLINE_TTL_SEC]
    for k in stale:
        _INLINE_CACHE.pop(k, None)
    # use sha256 of bytes as stable id, so we can serve from disk if cache is lost
    img_id = hashlib.sha256(raw).hexdigest()
    _INLINE_CACHE[img_id] = {"bytes": raw, "mime": mime or "image/png", "ts": now}
    # optional backup to disk to survive reload/worker switch
    if os.getenv("INLINE_BACKUP_TO_DISK", "true").strip().lower() in ("1","true","yes","on"):
        try:
            path = IMAGES_DIR / f"{img_id}.png"
            if not path.exists():
                with open(path, "wb") as f:
                    f.write(raw)
        except Exception as e:
            print(f"[inline] disk backup failed: {e}")
    print(f"[inline] put id={img_id} bytes={len(raw)} path={(IMAGES_DIR / (img_id + '.png')).resolve()}")
    return img_id

def _inline_url_for(img_id: str, req: Request) -> str:
    base = os.getenv("PUBLIC_BACKEND_URL", "").strip() or str(req.base_url).rstrip("/")
    return f"{base}/gen/image/inline/{img_id}"

@router.get("/gen/image/inline/{img_id}")
async def get_inline_image(img_id: str):
    item = _INLINE_CACHE.get(img_id)
    if item:
        return Response(
            content=item["bytes"],
            media_type=item["mime"],
            headers={
                "Access-Control-Allow-Origin": "*",
                "Cache-Control": "public, max-age=300"
            }
        )
    # fallback: try disk (survives reload/process switch)
    path = IMAGES_DIR / f"{img_id}.png"
    if path.exists():
        return FileResponse(path, media_type="image/png", headers={
            "Access-Control-Allow-Origin": "*",
            "Cache-Control": "public, max-age=3600"
        })
    print(f"[inline] miss id={img_id} tried={(IMAGES_DIR / (img_id + '.png')).resolve()}")
    return Response(status_code=404, content="Not Found (inline cache)")
# --------- OpenAI entegrasyonu (caption + tek cümle + görsel) ---------



@router.get("/gen/image/{name}")
async def get_generated_image(name: str):
    path = IMAGES_DIR / name
    if path.exists():
        return FileResponse(path, media_type="image/png", headers={
            "Access-Control-Allow-Origin": "*",
            "Cache-Control": "public, max-age=3600"
        })
    detail = (
        "Not Found\n"
        f"name: {name}\n"
        f"tried: {path.resolve()}\n"
    )
    print(f"[persist] miss name={name} tried={path.resolve()}")
    return Response(status_code=404, content=detail)

# --- utility: list latest generated images ---
def _list_latest_images(limit: int = 5) -> list[dict[str, str]]:
    files = sorted(IMAGES_DIR.glob("*.png"), key=lambda p: p.stat().st_mtime, reverse=True)
    out = []
    for p in files[: max(1, limit)]:
        st = p.stat()
        out.append({
            "name": p.name,
            "path": str(p.resolve()),
            "url": f"/gen/image/{p.name}",
            "mtime": str(st.st_mtime),
            "size": str(st.st_size),
        })
    return out

@router.get("/images/latest")
async def list_latest_images(limit: int = 5):
    try:
        return {"items": _list_latest_images(limit)}
    except Exception as e:
        return Response(status_code=500, content=f"error: {e}")


# --- Gemini health/config endpoint ---
@router.get("/health")
async def gen_health():
    prov_img = IMAGE_PROVIDER
    prov_txt = TEXT_PROVIDER
    model = os.getenv("IMAGEN_MODEL", "imagen-4.0-generate-001").strip()
    gk = os.getenv("GOOGLE_API_KEY", "")
    ok_g = bool(gk)
    # mask keys
    masked_g = (gk[:4] + "…" + gk[-4:]) if gk and len(gk) > 8 else ("" if not gk else "****")

    oak = os.getenv("OPENAI_API_KEY", "")
    ok_o = bool(oak)
    masked_o = (oak[:4] + "…" + oak[-4:]) if oak and len(oak) > 8 else ("" if not oak else "****")

    return {
        "providers": {
            "image": prov_img,
            "text": prov_txt
        },
        "models": {
            "imagen": model,
            "openai_text": os.getenv("OPENAI_TEXT_MODEL", "gpt-4o-mini")
        },
        "keys": {
            "google_api_key_present": ok_g,
            "google_api_key_masked": masked_g,
            "openai_api_key_present": ok_o,
            "openai_api_key_masked": masked_o
        },
        "notes": "Image generation uses Gemini; captions/recommendations use OpenAI."
    }

def normalize(keys: list[str]) -> list[str]:
    # Map aliases, filter unknowns, keep order but unique
    seen = set()
    out: list[str] = []
    for k in keys:
        v = _MAP.get(k, k)
        if v in _ALLOWED and v not in seen:
            out.append(v)
            seen.add(v)
    return out

def make_tagline(keys: list[str]) -> str:
    if not keys:
        return "Şehrin farklı yüzlerini keşfetmeyi seviyorsun."
    labels = [_LABELS[k] for k in keys if k in _LABELS]
    if len(labels) == 1:
        return f"Sen {labels[0]} temalı yerleri seviyorsun."
    if len(labels) == 2:
        return f"Sen {labels[0]} ve {labels[1]} temalı yerleri seviyorsun."
    # 3+ -> virgüller ve son iki arasında 've'
    head = ", ".join(labels[:-1])
    return f"Sen {head} ve {labels[-1]} temalı yerleri seviyorsun."

def make_prompt(keys: list[str], tagline: str) -> str:
    # 'karma' yaklaşımı: seçilen tüm personayı tek görselde harmanla
    # Bu prompt, simgesel/temsilî bir görsel için minimal, temiz stil ister.
    if not keys:
        style_hint = "minimal, temiz arka plan, merkez kompozisyon"
        return f"şehir keşif temalı, {style_hint}. ipucu: {tagline}. negative prompt: text, watermark, logo, nsfw, deformed"
    topics = ", ".join(keys)
    base = (
        f"{topics} temalarının birleştiği bir yolculuk amblemi; "
        f"modern, minimalist, yüksek kalite, beyaz/temiz arka plan, merkez kompozisyon"
    )
    return f"{base}. ipucu: {tagline}. negative prompt: text, watermark, logo, nsfw, deformed, low quality"

class SaveIn(BaseModel):
    selections: list[str]

def _get_identity(req: Request) -> str:
    # Dummy identity getter, replace with real auth
    return req.headers.get("X-User-Email", "anon@example.com")

def _load() -> dict:
    path = "persona_data.json"
    if not os.path.exists(path):
        return {}
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)

def _save(data: dict):
    path = "persona_data.json"
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

@router.post("/save")
def persona_save(body: SaveIn, req: Request):
    key = _get_identity(req)
    normalized = normalize(body.selections)
    tagline = make_tagline(normalized)
    prompt = make_prompt(normalized, tagline)

    data = _load()
    data[key] = {
        "selections": normalized,
        "updatedAt": time.time(),
        "mix": normalized,          # karma seçilen persona listesi
        "tagline": tagline,
        "prompt": prompt,
    }
    _save(data)

    return {
        "ok": True,
        "email": key,
        "selections": normalized,
        "mix": normalized,
        "tagline": tagline,
        "prompt": prompt,
    }

@router.get("/get")
def persona_get(req: Request):
    key = _get_identity(req)
    data = _load()
    return data.get(key, {"selections": [], "mix": [], "tagline": "", "prompt": ""})

# --------- OpenAI entegrasyonu (caption + tek cümle + görsel) ---------


class GenIn(BaseModel):
    # İstersen istemciden doğrudan seçimleri gönderebilirsin; gönderilmezse sunucudaki kayıttan okunur
    selections: Optional[list[str]] = None
    # İsteğe bağlı serbest metin ipucu (örn. şehir/kullanıcı adı vb.)
    hint: Optional[str] = None
    lat: Optional[float] = None
    lon: Optional[float] = None
    radius_km: float = 5.0
    limit: int = 2

# --------- LLM-backed recommendation input model ---------
from typing import Optional
class RecommendLLMIn(BaseModel):
    lat: float
    lon: float
    selections: Optional[list[str]] = None
    radius_km: float = 5.0
    limit: int = 2

def _env(name: str, default: Optional[str] = None) -> str:
    val = os.getenv(name, default or "")
    if not val:
        raise RuntimeError(f"Missing environment variable: {name}")
    return val

# --- persona → Mapbox query terms ---
_PERSONA_QUERIES = {
    "food": ["restaurant", "cafe", "bakery", "street food"],
    "culture": ["museum", "gallery", "theatre", "historic"],
    "history": ["historic", "monument", "heritage", "castle"],
    "nature": ["park", "garden", "nature", "trail"],
    "shopping": ["bazaar", "market", "shopping", "mall"],
    "adventure": ["climbing", "zipline", "adventure park"],
    "seaside": ["beach", "marina", "sea"],
    "entertainment": ["cinema", "club", "bar", "live music"],
}

_DEF_QUERIES = ["point of interest", "poi"]

class PlaceCandidate:
    def __init__(self, name: str, lat: float, lon: float, tags: Optional[list[str]] = None):
        self.name = name
        self.lat = lat
        self.lon = lon
        self.tags = tags

# --- geo helpers ---
_DEF_TAG_WEIGHT = 0.6
_DEF_DIST_WEIGHT = 0.4

def _haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    R = 6371.0
    dlat = radians(lat2 - lat1)
    dlon = radians(lon2 - lon1)
    a = sin(dlat/2)**2 + cos(radians(lat1)) * cos(radians(lat2)) * sin(dlon/2)**2
    c = 2 * asin(sqrt(a))
    return R * c


def _score_candidate(user_lat: float, user_lon: float, cand: PlaceCandidate, wanted: list[str]) -> dict:
    """Return distance (km) and simple tag match score in [0,1]."""
    dist_km = _haversine_km(user_lat, user_lon, cand.lat, cand.lon)
    tags = set(cand.tags or [])
    match = len(tags.intersection(set(wanted)))
    tag_score = 0.0 if not wanted else (match / max(1, len(wanted)))
    return {"dist_km": dist_km, "tag_score": tag_score}

def _mk_candidates_from_mapbox(features: list[dict], wanted: list[str]) -> list[PlaceCandidate]:
    seen = set()
    out: list[PlaceCandidate] = []
    for f in features:
        try:
            name = f.get("text") or f.get("place_name")
            coords = f.get("geometry", {}).get("coordinates") or []
            lon, lat = float(coords[0]), float(coords[1])
        except Exception:
            continue
        # Skip generic streets/roads/areas
        lower_name = (name or "").lower()
        drop_tokens = [
            "sokak", "sokağı", "sokaği", "cadde", "caddesi", "bulvar", "mahalle", "mahallesi",
            "street", "st.", "avenue", "road", "rd", "blvd", "ave"
        ]
        if any(tok in lower_name for tok in drop_tokens):
            continue
        key = (name, round(lat, 6), round(lon, 6))
        if key in seen:
            continue
        seen.add(key)
        # tag çıkarımı: Mapbox properties.category varsa bunu dağıt
        props = f.get("properties") or {}
        cats = props.get("category") or ""
        raw_tags = [c.strip().lower() for c in cats.split(",") if c.strip()]
        # wanted ile kaba eşleme
        tags = []
        for t in raw_tags:
            if any(w in t for w in wanted):
                tags.append(t)
        # Allowed venue keywords (name-based OR tag-based)
        allow_kw = [
            "müze", "museum", "saray", "palace", "antik", "ancient", "arkeoloji", "archaeolog",
            "ören", "ruin", "restaurant", "restoran", "mağaza", "store", "shop", "market", "bazaar", "çarşı", "mall"
        ]
        allow = any(kw in lower_name for kw in allow_kw) or bool(tags)
        if not allow:
            continue
        out.append(PlaceCandidate(name=name, lat=lat, lon=lon, tags=tags or None))
    return out



async def _gemini_image(prompt: str) -> str:
    api_key = _env("GOOGLE_API_KEY")
    model = os.getenv("IMAGEN_MODEL", "imagen-4.0-generate-001").strip()

    headers = {
        "x-goog-api-key": api_key,
        "Content-Type": "application/json"
    }

    async def _try_predict() -> Optional[str]:
        # Strategy A: official :predict with instances/parameters
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:predict"
        payload = {
            "instances": [ {"prompt": prompt} ],
            "parameters": {"sampleCount": 1}
        }
        async with httpx.AsyncClient(timeout=180) as hc:
            r = await hc.post(url, headers=headers, json=payload)
            print(f"[gemini] A predict model={model} status={r.status_code}")
            if r.status_code >= 400:
                # let caller decide fallback
                raise httpx.HTTPStatusError("predict failed", request=r.request, response=r)
            j = r.json()
            # common shapes
            b64 = None
            try:
                preds = j.get("predictions") or []
                if preds:
                    b64 = preds[0].get("bytesBase64Encoded") or preds[0].get("imageBytes")
            except Exception:
                pass
            if not b64:
                try:
                    imgs = j.get("images") or []
                    if imgs:
                        b64 = imgs[0].get("imageBytes")
                except Exception:
                    pass
            return b64

    async def _try_generate_image() -> Optional[str]:
        # Strategy B: legacy :generateImage with {prompt:{text}} shape
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateImage"
        payload = {
            "prompt": {"text": prompt},
            "sampleCount": 1,
            "imageFormat": "png"
        }
        async with httpx.AsyncClient(timeout=180) as hc:
            r = await hc.post(url, headers=headers, json=payload)
            print(f"[gemini] B generateImage model={model} status={r.status_code}")
            if r.status_code >= 400:
                raise httpx.HTTPStatusError("generateImage failed", request=r.request, response=r)
            j = r.json()
            b64 = None
            try:
                imgs = j.get("images") or []
                if imgs:
                    b64 = imgs[0].get("imageBytes")
            except Exception:
                pass
            if not b64:
                try:
                    gi = j.get("generatedImages") or []
                    if gi:
                        img = gi[0].get("image") or {}
                        b64 = img.get("imageBytes")
                except Exception:
                    pass
            return b64

    # Try A then B, collect last error for diagnostics
    last_err: Optional[str] = None
    for attempt, fn in (("A", _try_predict), ("B", _try_generate_image)):
        try:
            b64 = await fn()
            if b64:
                return f"data:image/png;base64,{b64}"
        except httpx.HTTPStatusError as e:
            body = e.response.text[:500] if e.response is not None else str(e)
            last_err = f"{attempt}:{e.response.status_code if e.response else 'NA'} {body}"
            print(f"[gemini][error] {last_err}")
        except Exception as e:
            last_err = f"{attempt}: {str(e)[:300]}"
            print(f"[gemini][error] {last_err}")

    raise RuntimeError(f"Gemini image failed (both strategies). last={last_err}")


# --- Provider switch for image generation ---
async def _generate_image_by_provider(prompt: str) -> str:
    """Provider switch for image generation. Currently pinned to Gemini (Imagen)."""
    return await _gemini_image(prompt)



async def _openai_caption_line(tagline: str, selections: list[str]) -> Dict[str, str]:
    """Ask OpenAI for caption/line/avatar_prompt and return as dict."""
    api_key = _env("OPENAI_API_KEY")
    persona_txt = ", ".join(selections) if selections else "genel gezgin"
    sys_prompt = (
        "You are an imaginative brand designer AI system. Create prompts for a PERSON avatar. "
        "Always respond strictly in JSON with keys caption, line, avatar_prompt. "
        "The avatar_prompt must describe a FLAT VECTOR CIRCULAR **HUMAN** AVATAR (front‑facing bust), **female‑presenting**, cute friendly style,"
        " consistent warm medium‑light skin tone, minimal facial features, pastel background. "
        "Explicitly exclude objects as the main subject (no luggage, no columns), no text, no watermark, no background scene, no photorealism."
    )
    user_prompt = (
        "Kullanıcı seyahat kişiselleştirme görevi.\n"
        f"Persona(lar): {persona_txt}.\n"
        f"Tagline: '{tagline}'.\n\n"
        "Üç alan üret ve JSON döndür:\n"
        "caption: 2-3 kelimelik kısa başlık (Türkçe, noktasız).\n"
        "line: 1 cümlelik sıcak, motive edici açıklama (Türkçe).\n"
        "avatar_prompt: İngilizce, düz/modern vektör dairesel avatarı tarif eden kısa prompt.\n"
        "Sadece JSON ver: {\"caption\":\"...\",\"line\":\"...\",\"avatar_prompt\":\"...\"}"
    )

    headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
    model_name = os.getenv("OPENAI_TEXT_MODEL", "gpt-4o-mini")
    url_chat = "https://api.openai.com/v1/chat/completions"

    async with httpx.AsyncClient(timeout=60) as hc:
        r = await hc.post(url_chat, headers=headers, json={
            "model": model_name,
            "response_format": {"type": "json_object"},
            "temperature": 0.7,
            "messages": [
                {"role": "system", "content": sys_prompt},
                {"role": "user", "content": user_prompt}
            ]
        })
        r.raise_for_status()
        j = r.json()
        text = (
            j.get("choices", [{}])[0]
             .get("message", {})
             .get("content", "")
        )

    try:
        parsed = json.loads(text)
        cap = str(parsed.get("caption", "")).strip()
        line = str(parsed.get("line", "")).strip()
        avp = str(parsed.get("avatar_prompt", "")).strip()
        if avp:
            avp += "; female-presenting human avatar; friendly cute style; consistent warm medium-light skin tone; front-facing bust; no objects as main subject; no text"
        if not cap:
            cap = tagline[:40]
        if not line:
            line = tagline
    except Exception:
        cap = tagline[:40]
        line = tagline
        avp = (
            f"flat vector circular HUMAN avatar, female-presenting; friendly cute style; front-facing bust; minimal facial features; "
            f"consistent warm medium-light skin tone; pastel background; no objects as main subject; no text; no watermark"
        )
    return {"caption": cap, "line": line, "avatar_prompt": avp}

async def _openai_personal_reco(tagline: str, selections: list[str], items: list[dict]) -> str:
    api_key = _env("OPENAI_API_KEY")
    headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
    model_name = os.getenv("OPENAI_TEXT_MODEL", "gpt-4o-mini")
    names = ", ".join(i.get("name", "?") for i in items[:5]) or "yakın yerler"
    sys_prompt = (
        "You are a friendly local guide. Return exactly three Turkish place suggestions as a numbered list. "
        "Format strictly as: 1. <place> 2. <place> 3. <place>. Do not write full sentences, do not add explanations."
    )
    user_prompt = (
        f"Persona: {', '.join(selections) or 'genel gezgin'}. Tagline: {tagline}. "
        f"Önerilecek yerler: {names}. 3 farklı öneri ver."
    )
    url_chat = "https://api.openai.com/v1/chat/completions"
    async with httpx.AsyncClient(timeout=45) as hc:
        r = await hc.post(url_chat, headers=headers, json={
            "model": model_name,
            "temperature": 0.7,
            "messages": [
                {"role": "system", "content": sys_prompt},
                {"role": "user", "content": user_prompt}
            ]
        })
        r.raise_for_status()
        j = r.json()
        content = (
            j.get("choices", [{}])[0]
             .get("message", {})
             .get("content", "")
        ).strip()
        # Ensure only 3 numbered lines, clean
        lines = [l.strip() for l in content.splitlines() if l.strip()]
        return "\n".join(lines[:3]) if lines else "1. Yer 1\n2. Yer 2\n3. Yer 3"
    """
    OpenAI'den:
      - 'caption' (en fazla 3-4 kelime, başlıkvari)
      - 'line' (tek cümlelik açıklama)
      - 'avatar_prompt' (düz, modern, vektör stilinde dairesel avatar için kısa İngilizce prompt)
    döndürür.
    """
    api_key = _env("OPENAI_API_KEY")
    persona_txt = ", ".join(selections) if selections else "genel gezgin"
    sys_prompt = (
        "You are an imaginative brand designer who creates symbolic travel avatars. "
        "Always return strict JSON with keys caption, line, avatar_prompt. "
        "avatar_prompt must be in concise English describing a FLAT VECTOR CIRCULAR AVATAR that represents the user's persona(s). "
        "Prefer iconic accessories over text, pastel background, minimal details, no photorealism, no watermark."
    )
    user_prompt = (
        "Kullanıcı seyahat kişiselleştirme görevi.\n"
        f"Persona(lar): {persona_txt}.\n"
        f"Tagline: '{tagline}'.\n\n"
        "Üç alan üret ve JSON döndür:\n"
        "caption: 2-3 kelimelik kısa başlık (Türkçe, noktasız).\n"
        "line: 1 cümlelik sıcak, motive edici açıklama (Türkçe).\n"
        "avatar_prompt: İngilizce, düz/modern vektör dairesel avatarı tarif eden kısa prompt.\n"
        "Sadece JSON ver: {\"caption\":\"...\",\"line\":\"...\",\"avatar_prompt\":\"...\"}"
    )

    headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
    model_name = os.getenv("OPENAI_TEXT_MODEL", "gpt-4o-mini")
    url_chat = "https://api.openai.com/v1/chat/completions"

    async with httpx.AsyncClient(timeout=60) as hc:
        r = await hc.post(url_chat, headers=headers, json={
            "model": model_name,
            "response_format": {"type": "json_object"},
            "temperature": 0.7,
            "messages": [
                {"role": "system", "content": sys_prompt},
                {"role": "user", "content": user_prompt}
            ]
        })
        r.raise_for_status()
        j = r.json()
        text = (
            j.get("choices", [{}])[0]
             .get("message", {})
             .get("content", "")
        )

    # Basit JSON ayıklama:
    try:
        parsed = json.loads(text)
        cap = str(parsed.get("caption", "")).strip()
        line = str(parsed.get("line", "")).strip()
        avp = str(parsed.get("avatar_prompt", "")).strip()
        if not cap:
            cap = tagline[:40]
        if not line:
            line = tagline
    except Exception:
        cap = tagline[:40]
        line = tagline
        avp = ""
    return {"caption": cap, "line": line, "avatar_prompt": avp}





@router.post("/gen/generate")
async def persona_generate(body: GenIn, req: Request):
    image_url = ""
    error_msg = ""
    # 1) selections: body'den; yoksa kayıttan
    selections = body.selections
    if selections is None:
        # kayıt var mı bak
        who = _get_identity(req)
        store = _load()
        rec = store.get(who, {})
        selections = rec.get("selections", [])
    selections = normalize(selections or [])

    # 2) tagline + prompt (karma)
    tagline = make_tagline(selections)
    prompt = make_prompt(selections, tagline)
    if body.hint:
        prompt = f"{prompt}. bağlamsal ipucu: {body.hint}"

    # 3) openai'den caption + tek cümle + avatar_prompt
    text = await _openai_caption_line(tagline, selections)
    caption = text.get("caption") or "Kişisel seyahat amblemi"
    line = text.get("line") or tagline

    style_suffix = _avatar_style_prompt(selections)
    avatar_prompt = text.get("avatar_prompt") or f"travel persona icon for: {', '.join(selections) or 'general traveler'}"
    full_avatar_prompt = f"{avatar_prompt}. {style_suffix}"

    # 4) Görsel üretimi (Gemini) ve kalıcı dosyaya yazma
    image_url = ""
    error_msg = ""
    try:
        tmp_image = await _generate_image_by_provider(full_avatar_prompt)
        # data URI ise her zaman diske yaz ve /gen/image/<name> URL'si döndür
        if isinstance(tmp_image, str) and tmp_image.startswith("data:image"):
            image_url = await _ensure_local_image(tmp_image)
        else:
            image_url = str(tmp_image)
        # absolute URL yap
        base = os.getenv("PUBLIC_BACKEND_URL", "").rstrip("/")
        if base and isinstance(image_url, str) and image_url.startswith("/"):
            image_url = f"{base}{image_url}"
    except Exception as e:
        error_msg = f"image generate failed: {str(e)[:180]}"
        print(f"[gen-image][error] {error_msg}")

   

    # 5) İsteğe bağlı: konuma göre LLM önerileri
    blurb = None
    items = []
    if (body.lat is not None) and (body.lon is not None):
        try:
            reco = await _recommend_places_llm_core(body.lat, body.lon, selections, body.radius_km, body.limit)
            blurb = reco.get("blurb") or None
            items = reco.get("items") or []
        except Exception:
            blurb = None
            items = []

    # 6) Sonucu döndür
    return {
        "selections": selections,
        "tagline": tagline,
        "caption": caption,
        "line": line,
        "prompt_used": prompt,
        "image_url": image_url,
        "blurb": blurb,
        "items": items,
        "error": error_msg,
    }



# --------- LLM-backed recommendation core helper ---------

async def _recommend_places_llm_core(lat: float, lon: float, selections: list[str], radius_km: float, limit: int) -> dict:
    wanted = normalize(selections or [])

    # 1) Build Mapbox queries from persona
    queries: list[str] = []
    for w in wanted:
        queries += _PERSONA_QUERIES.get(w, [])
    if not queries:
        queries = _DEF_QUERIES

    token = os.getenv("MAPBOX_SERVER_TOKEN", "").strip() or os.getenv("MAPBOX_TOKEN", "").strip()
    if not token:
        print("[places] MAPBOX token yok (MAPBOX_SERVER_TOKEN / MAPBOX_TOKEN)")
        return {"items": [], "wanted": wanted, "blurb": "", "note": "MAPBOX token yok"}

    base = "https://api.mapbox.com/geocoding/v5/mapbox.places/{}.json"
    nationwide = radius_km <= 0
    # Türkiye bounding box (minLon,minLat,maxLon,maxLat)
    tr_bbox = "26,36,45,42"
    if nationwide:
        params = {"types": "poi,address,place", "limit": 10, "language": "tr", "bbox": tr_bbox, "access_token": token}
    else:
        prox = f"{lon},{lat}"  # Mapbox proximity order: lon,lat
        params = {"proximity": prox, "types": "poi,address,place", "limit": 10, "language": "tr", "access_token": token}

    async def _fetch_features(qs: list[str]) -> list[dict]:
        all_feats: list[dict] = []
        async with httpx.AsyncClient(timeout=20) as hc:
            for q in qs[:8]:
                try:
                    url = base.format(q)
                    r = await hc.get(url, params=params)
                    r.raise_for_status()
                    j = r.json()
                    feats = j.get("features", [])
                    all_feats.extend(feats)
                except Exception as e:
                    print(f"[places] mapbox fetch fail for '{q}': {e}")
                    continue
        return all_feats

    # 2) İlk deneme: persona temelli sorgular
    all_features = await _fetch_features(queries)
    print(f"[places] features persona-qs={len(all_features)} wanted={wanted}")

    cands = _mk_candidates_from_mapbox(all_features, wanted)
    print(f"[places] candidates={len(cands)}")

    # 2a) Fallback: hiç aday yoksa daha genel sorgularla tekrar dene
    if not cands:
        fallback_qs = [
            "restaurant","cafe","bakery","street food","park","garden","beach",
            "museum","gallery","theatre","historic","market","bazaar","landmark",
        ]
        all_features = await _fetch_features(fallback_qs)
        print(f"[places] fallback features={len(all_features)}")
        cands = _mk_candidates_from_mapbox(all_features, wanted)
        print(f"[places] candidates(fallback)={len(cands)}")

    # 3) Skorla + mesafe filtresi
    scored = []
    for c in cands:
        s = _score_candidate(lat, lon, c, wanted)
        if nationwide:
            # Türkiye geneli: mesafe filtresi yok; mesafe etkisini zayıf tut
            dist_score = max(0.0, 1.0 - (s["dist_km"] / 500.0))  # 500km ölçeğinde normalize
            score = 0.8 * s["tag_score"] + 0.2 * dist_score
            scored.append({
                "name": c.name,
                "lat": c.lat,
                "lon": c.lon,
                "distance_km": round(s["dist_km"], 3),
                "score": round(score, 4),
                "tags": c.tags or [],
            })
        else:
            if s["dist_km"] <= radius_km:
                dist_score = max(0.0, 1.0 - (s["dist_km"] / max(0.001, radius_km)))
                score = _DEF_TAG_WEIGHT * s["tag_score"] + _DEF_DIST_WEIGHT * dist_score
                scored.append({
                    "name": c.name,
                    "lat": c.lat,
                    "lon": c.lon,
                    "distance_km": round(s["dist_km"], 3),
                    "score": round(score, 4),
                    "tags": c.tags or [],
                })

    print(f"[places] scored(within {radius_km}km)={len(scored)}")

    # 3a) Fallback: yarıçapı gevşet (en azından 10km) ve tekrar dene
    if not scored and cands:
        relaxed_radius = max(radius_km * 2, 10.0)
        print(f"[places] relaxing radius to {relaxed_radius}km")
        for c in cands:
            s = _score_candidate(lat, lon, c, wanted)
            if nationwide:
                dist_score = max(0.0, 1.0 - (s["dist_km"] / 500.0))
                score = 0.8 * s["tag_score"] + 0.2 * dist_score
                scored.append({
                    "name": c.name,
                    "lat": c.lat,
                    "lon": c.lon,
                    "distance_km": round(s["dist_km"], 3),
                    "score": round(score, 4),
                    "tags": c.tags or [],
                })
            else:
                if s["dist_km"] <= relaxed_radius:
                    dist_score = max(0.0, 1.0 - (s["dist_km"] / max(0.001, relaxed_radius)))
                    score = _DEF_TAG_WEIGHT * s["tag_score"] + _DEF_DIST_WEIGHT * dist_score
                    scored.append({
                        "name": c.name,
                        "lat": c.lat,
                        "lon": c.lon,
                        "distance_km": round(s["dist_km"], 3),
                        "score": round(score, 4),
                        "tags": c.tags or [],
                    })
        print(f"[places] scored(relaxed)={len(scored)}")

    if not scored:
        return {"items": [], "wanted": wanted, "blurb": ""}

    scored.sort(key=lambda x: x["score"], reverse=True)
    top = scored[: min(2, max(1, limit))]
    print(f"[places] mode={'TR' if nationwide else 'local'} results={len(top)} limit={limit}")

    tagline = make_tagline(wanted)
    try:
        blurb = await _openai_personal_reco(tagline, wanted, top)
    except Exception as e:
        print(f"[places] blurb fail: {e}")
        blurb = tagline or "Yakınında keşfedilecek yerler var."

    return {"items": top, "wanted": wanted, "blurb": blurb}

# --------- LLM-backed recommendation endpoint ---------

 # Not: radius_km <= 0 gönderirsen Türkiye geneli (nationwide) çalışır.
@router.post("/gen/places/recommend_llm")
async def places_recommend_llm(body: RecommendLLMIn, req: Request):
    try:
        print(f"[places] POST /places/recommend_llm lat={body.lat} lon={body.lon} sel={body.selections} r={body.radius_km} l={body.limit}")
        result = await _recommend_places_llm_core(body.lat, body.lon, body.selections or [], body.radius_km, body.limit)
        print(f"[places] result: items={len(result.get('items', []))} wanted={result.get('wanted')}")
        return {
            "items": result.get("items", []),
            "wanted": result.get("wanted", []),
            "radius_km": body.radius_km,
            "limit": min(2, body.limit),
            "blurb": result.get("blurb", ""),
        }
    except Exception as e:
        print(f"[places][error] {e}")
        return {
            "items": [],
            "wanted": body.selections or [],
            "radius_km": body.radius_km,
            "limit": min(2, body.limit),
            "blurb": "",
            "error": str(e)[:200]
        }
