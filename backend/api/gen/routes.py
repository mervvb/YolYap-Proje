from fastapi import APIRouter, Request
from pydantic import BaseModel
import time
import json
import os
import httpx
import base64
from typing import Optional, Dict, Any
from pathlib import Path
from uuid import uuid4
from starlette.responses import FileResponse, Response
from math import radians, sin, cos, asin, sqrt

router = APIRouter()

# Persist generated images under the project root to avoid cwd/reload mismatches
BASE_DIR = Path(__file__).resolve().parents[3]  # …/YolYap-Proje
IMAGES_DIR = BASE_DIR / "generated_images"
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
        "flat vector, circular avatar, centered, minimal details, pastel background, clean edges, high contrast subject, "
        "solid fills, no gradients, no shadows, no text, no watermark, no background scene, no photorealism"
    )

    return (
        f"Color palette: {palette}. Shape language: {shape}. "
        f"Iconic accessories: {', '.join(hints)}. {base}"
    )


# --- image persistence helpers ---

def _save_bytes_as_png(data: bytes) -> str:
    name = uuid4().hex + ".png"
    path = IMAGES_DIR / name
    with open(path, "wb") as f:
        f.write(data)
        try:
            f.flush()
            os.fsync(f.fileno())
        except Exception:
            pass
    print(f"[gen-image] saved -> {path.resolve()}")
    return f"/gen/image/{name}"

async def _ensure_local_image(url_or_data: str) -> str:
    """Accept a data URI or http(s) URL, store as PNG under IMAGES_DIR, return backend URL path."""
    if not url_or_data:
        raise RuntimeError("empty image data")
    if url_or_data.startswith("data:image"):
        try:
            b64 = url_or_data.split(",", 1)[1]
            raw = base64.b64decode(b64)
            return _save_bytes_as_png(raw)
        except Exception as e:
            raise RuntimeError(f"data uri decode failed: {e}")
    if url_or_data.startswith("http://") or url_or_data.startswith("https://"):
        async with httpx.AsyncClient(timeout=60) as hc:
            r = await hc.get(url_or_data)
            r.raise_for_status()
            return _save_bytes_as_png(r.content)
    raise RuntimeError("unsupported image source")
# --------- OpenAI entegrasyonu (caption + tek cümle + görsel) ---------



@router.get("/gen/image/{name}")
async def get_generated_image(name: str):
    path = IMAGES_DIR / name
    if path.exists():
        return FileResponse(path, media_type="image/png")
    detail = (
        "Not Found\n"
        f"name: {name}\n"
        f"tried: {path.resolve()}\n"
    )
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

@router.get("/gen/images/latest")
async def list_latest_images(limit: int = 5):
    try:
        return {"items": _list_latest_images(limit)}
    except Exception as e:
        return Response(status_code=500, content=f"error: {e}")

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



async def _openai_image(prompt: str) -> str:
    """Generate an image via OpenAI Images API and return a data URI (base64).
    Handles both b64_json and URL responses from the API.
    """
    api_key = _env("OPENAI_API_KEY")
    url = "https://api.openai.com/v1/images/generations"
    headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
    # Build payload with safe quality handling
    payload = {
        "model": os.getenv("OPENAI_IMAGE_MODEL", "gpt-image-1"),
        "prompt": prompt,
        "size": os.getenv("OPENAI_IMAGE_SIZE", "512x512"),
        # do NOT include response_format here
    }

    # Quality normalization: accept env but only pass if valid for current API
    quality_env = os.getenv("OPENAI_IMAGE_QUALITY", "high").strip().lower()
    # map legacy values to supported ones
    legacy_map = {"standard": "high", "hd": "high"}
    quality_norm = legacy_map.get(quality_env, quality_env)
    if quality_norm in {"low", "medium", "high", "auto"}:
        payload["quality"] = quality_norm
    async with httpx.AsyncClient(timeout=180) as hc:
        r = await hc.post(url, headers=headers, json=payload)
        try:
            r.raise_for_status()
        except httpx.HTTPStatusError as e:
            detail = e.response.text[:500]
            raise RuntimeError(f"OpenAI image failed: {e.response.status_code} {detail}")
        j = r.json()
        data = (j.get("data") or [{}])[0]

        # Prefer base64 if provided
        b64 = data.get("b64_json")
        if b64:
            return f"data:image/png;base64,{b64}"

        # Fallback: download from URL and convert to base64
        img_url = data.get("url")
        if img_url:
            rr = await hc.get(img_url)
            rr.raise_for_status()
            encoded = base64.b64encode(rr.content).decode("ascii")
            return f"data:image/png;base64,{encoded}"

        raise RuntimeError(f"OpenAI image: unexpected response {j}")

async def _generate_image_by_provider(prompt: str) -> str:
    # Only OpenAI is supported now
    return await _openai_image(prompt)

async def _openai_caption_line(tagline: str, selections: list[str]) -> Dict[str, str]:
    """Ask OpenAI for caption/line/avatar_prompt and return as dict."""
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


@router.post("/generate")
async def persona_generate(body: GenIn, req: Request):
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

    # 4) Replicate ile görsel
    # Default to inline data URI (no disk write) unless IMAGE_PERSIST is explicitly enabled
    persist = os.getenv("IMAGE_PERSIST", "false").strip().lower() in ("1", "true", "yes", "on")
    try:
        tmp_image = await _generate_image_by_provider(full_avatar_prompt)
        if persist:
            image_url = await _ensure_local_image(tmp_image)
        else:
            image_url = tmp_image
    except Exception as e:
        # Soft-fail: görsel olmadan metinleri döndür, HTTP 200 kalsın
        image_url = ""
        err = str(e)
        # kullanıcının göreceği kısa hata özeti (maks 160 karakter)
        line = f"{line} (Görsel üretimi başarısız: {err[:160]})"
        # Not: burada raise ETME; UI metinleri gösterebilsin
        pass

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
@router.post("/places/recommend_llm")
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
