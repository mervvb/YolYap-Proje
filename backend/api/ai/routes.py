from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Any, Dict, Optional
import os
import re
from dotenv import load_dotenv
import httpx
from openai import OpenAI

load_dotenv() 

router = APIRouter()

# MCP proxy uçları (FastAPI backend içindeki /mcp endpoint'lerine yönlendir)
MCP_ROUTES: Dict[str, str] = {
    "search-flights": "/mcp/search-flights",
    "flight-status-number": "/mcp/flight-status/number",
    "flight-status-route": "/mcp/flight-status/route",
    "booking-deeplink": "/mcp/booking/deeplink",
    "booking-details": "/mcp/booking/details",
    "checkin-details": "/mcp/booking/checkin-details",
    "baggage-allowance": "/mcp/booking/baggage-allowance",
    "promotions": "/mcp/promotions",
    "city-guide": "/mcp/city-guide",
    "me": "/mcp/me",
    "member-flights": "/mcp/member/flights",
    "expiring-miles": "/mcp/member/expiring-miles",
    "logout": "/mcp/logout",
}

async def call_mcp(tool: str, params: Optional[Dict[str, Any]] = None):
    """
    Verilen araca göre bu backend'in /mcp/... uçlarına proxy yapar.
    BACKEND_BASE_URL .env'den okunur; yoksa 127.0.0.1:8080 kullanılır.
    GET/POST seçimi: params varsa POST, yoksa GET.
    """
    path = MCP_ROUTES.get(tool)
    if not path:
        return None
    base = os.getenv("BACKEND_BASE_URL", "http://127.0.0.1:8080")
    url = f"{base}{path}"
    async with httpx.AsyncClient(timeout=60) as hc:
        if params:
            r = await hc.post(url, json=params)
        else:
            r = await hc.get(url)
    if r.headers.get("content-type", "").startswith("application/json"):
        return r.json()
    return {"raw": r.text, "status": r.status_code}

class AskIn(BaseModel):
    message: str
    useMcp: bool | None = True
    tool: Optional[str] = None                 # Örn: "search-flights", "flight-status-number", "city-guide"
    params: Optional[Dict[str, Any]] = None    # Aracın beklediği JSON gövdesi

client = OpenAI()

def detect_tool_and_missing_params(message: str, given: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Basit niyet tespiti:
    - 'uçak bileti', 'uçuş', 'bilet' gibi ifadeler -> search-flights
    Eksik parametreleri (origin, destination, date, pax) kontrol eder.
    """
    msg = (message or "").lower()
    out: Dict[str, Any] = {"tool": None, "missing": []}

    # Basit anahtar kelime kontrolü
    if any(k in msg for k in ["uçak bileti", "uçuş", "bilet", "flight", "uçak"]):
        out["tool"] = "search-flights"
        wanted = ["origin", "destination", "date", "pax"]
        given = given or {}
        out["missing"] = [w for w in wanted if given.get(w) in (None, "", 0)]
    return out

def sanitize_plaintext(text: str) -> str:
    s = text or ""
    # 1) Markdown emphasis (**bold**, *italic*, __, _) kaldır
    s = re.sub(r'(\*\*|\*|__|_)(.*?)\1', r'\2', s)
    # 2) Markdown linkleri: [metin](url) -> "metin - url"
    s = re.sub(r'\[([^\]]+)\]\((https?://[^)]+)\)', r'\1 - \2', s)
    # 3) Başlıklar ve code fence (#, ```), tek tırnak/geri-tırnak temizle
    s = re.sub(r'^\s{0,3}#{1,6}\s*', '', s, flags=re.MULTILINE)
    s = re.sub(r'```.*?```', '', s, flags=re.DOTALL)
    s = s.replace('`', '')
    # 4) Satır başındaki madde işaretleri (-, *, •, –) kaldır
    s = re.sub(r'(?m)^\s*[-*•–]+\s+', '', s)
    # 5) Emoji ve piktogramları kaba şekilde temizle
    s = re.sub(r'[\U0001F300-\U0001FAFF\U00002600-\U000027BF]', '', s)
    # 6) Fazla boşlukları sadeleştir
    s = re.sub(r'[ \t]+', ' ', s)
    s = re.sub(r'\n{3,}', '\n\n', s)
    return s.strip()

@router.post("/ask")
async def ask(inb: AskIn):
    if not inb.message:
        raise HTTPException(400, "message gerekli")

    # 0) Eğer tool verilmemişse basit bir niyet tespiti yap
    inferred = None
    if inb.useMcp and not inb.tool:
        inferred = detect_tool_and_missing_params(inb.message, inb.params)
        if inferred.get("tool"):
            inb.tool = inferred["tool"]
            # Eksik parametreler varsa, kullanıcıdan istenenleri düzenli biçimde iste
            missing = inferred.get("missing", [])
            if missing:
                prompt_lines = []
                prompt_lines.append("Uçuş araması için aşağıdaki bilgileri netleştirir misin?")
                num = 1
                if "origin" in missing:
                    prompt_lines.append(f"{num}. Kalkış (IATA kodu veya şehir): ör. IST veya İstanbul")
                    num += 1
                if "destination" in missing:
                    prompt_lines.append(f"{num}. Varış (IATA kodu veya şehir): ör. LHR veya Londra")
                    num += 1
                if "date" in missing:
                    prompt_lines.append(f"{num}. Tarih (YYYY-MM-DD): ör. 2025-09-10")
                    num += 1
                if "pax" in missing:
                    prompt_lines.append(f"{num}. Yolcu sayısı: ör. 1")
                    num += 1

                # Frontend için sinyal döndür (LLM'e gitmeden)
                return {
                    "reply": "\n".join(prompt_lines),
                    "usedMcp": False,
                    "tool": inb.tool,
                    "hasMcpContext": False,
                    "needParams": True,
                    "missing": missing
                }

    # 1) MCP bağlamı (opsiyonel, endpoint bazlı)
    mcp_context = None
    if inb.useMcp and inb.tool:
        try:
            mcp_context = await call_mcp(inb.tool, inb.params or {})
        except Exception:
            mcp_context = None  # erişilemezse MCP'siz devam

    # 2) OpenAI
    sys = (
        "Sen bir seyahat rehberi ve asistanısın. "
        "Kullanıcının ilgisini çekebilecek tarihi yerler, kültürel aktiviteler, yeme içme seçenekleri ve alışveriş noktaları hakkında yardımcı ol. "
        "Yanıtlarını Türkçe yaz. "
        "Cevaplarını mutlaka 1., 2., 3. gibi numaralı maddeler halinde ve her maddeyi alt alta yaz. "
        "Madde işareti ( -, *, • ) KULLANMA; yalnızca numaralı liste kullan. "
        "Markdown biçimlendirmesi (kalın/italik/başlık/kod) KULLANMA; düz metin yaz. "
        "Uzun paragraflardan kaçın, net ve kısa ol. "
        "Bilgi eksikse 'Bu bilgi elimde yok' de ve uydurma yapma. "
        "Tarih ve saat verirken Europe/Istanbul saat dilimine göre net format kullan. "
        "Varsa bağlantı veya deeplink en sonda düz metin olarak paylaş."
    )

    user_content = (
        f"MCP_CONTEXT_JSON:\n{str(mcp_context)[:6000]}\n\n---\nKullanıcı sorusu: {inb.message}"
        if mcp_context else
        f"Kullanıcı sorusu: {inb.message}\n(Not: MCP verisi yok)"
    )

    try:
        resp = client.chat.completions.create(
            model=os.getenv("OPENAI_MODEL","gpt-4o-mini"),
            messages=[
                {"role":"system", "content": sys},
                {"role":"user", "content": user_content}
            ],
            temperature=0.2
        )
        reply = resp.choices[0].message.content.strip() if resp.choices else "Bilgi bulunamadı."
        reply = sanitize_plaintext(reply)
        return {
            "reply": reply,
            "usedMcp": bool(mcp_context),
            "tool": inb.tool,
            "hasMcpContext": mcp_context is not None
        }
    except Exception as e:
        raise HTTPException(500, f"OpenAI error: {e}")


# Sağlık kontrolü endpoint'i
@router.get("/health")
async def ai_health():
    return {"ok": True, "ai": True}