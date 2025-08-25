# api/persona/routes.py
from fastapi import APIRouter, Request, HTTPException
from pydantic import BaseModel
import time, json
from pathlib import Path

router = APIRouter()
USERS = Path("users.json")
USERS.parent.mkdir(parents=True, exist_ok=True)

class SaveIn(BaseModel):
    selections: list[str]

def load_users():
    if USERS.exists():
        try:
            return json.loads(USERS.read_text(encoding="utf-8"))
        except Exception:
            # dosya bozuksa boş sözlük dön
            return {}
    return {}

def save_users(d):
    USERS.write_text(json.dumps(d, ensure_ascii=False, indent=2), encoding="utf-8")

def get_identity(req: Request):
    uid = req.cookies.get("user_id")
    email = req.cookies.get("user_email")
    if not uid and not email:
        # burada JWT doğrulayıp sub/email çıkarabilirsin
        raise HTTPException(401, "Auth yok")
    # email varsa onu ana kimlik olarak kullan; yoksa uid
    return email or uid

@router.post("/save")
async def persona_save(inb: SaveIn, req: Request):
    key = get_identity(req)
    users = load_users()
    user = users.get(key, {})
    user["persona"] = {"selections": inb.selections, "updatedAt": time.time()}
    users[key] = user
    save_users(users)
    return {"ok": True, "persona": user.get("persona", {}), "key": key}
# api/persona/routes.py
from fastapi import APIRouter, Request, HTTPException
from pydantic import BaseModel
from pathlib import Path
import json, time

router = APIRouter()

# Persona seçimlerini sadece burada tut: backend/api/persona/data/users_choice.json
DATA_DIR = Path(__file__).parent / "data"
DATA_DIR.mkdir(parents=True, exist_ok=True)
USERS_CHOICE = DATA_DIR / "users_choice.json"

class SaveIn(BaseModel):
    selections: list[str]

# --- basit dosya I/O yardımcıları ---

def load_choices() -> dict:
    if USERS_CHOICE.exists():
        try:
            return json.loads(USERS_CHOICE.read_text(encoding="utf-8"))
        except Exception:
            # dosya bozuksa boş sözlük dön
            return {}
    return {}


def save_choices(d: dict) -> None:
    USERS_CHOICE.write_text(
        json.dumps(d, ensure_ascii=False, indent=2), encoding="utf-8"
    )


def get_identity(req: Request) -> str:
    """Kimlik: auth cookie'lerinden user_email > user_id.
    Giriş yoksa 401 döner.
    """
    email = req.cookies.get("user_email")
    uid = req.cookies.get("user_id")
    key = email or uid
    if not key:
        # burada JWT doğrulama vb. ekleyebilirsin
        raise HTTPException(401, "Auth yok")
    return key


@router.post("/save")
async def persona_save(inb: SaveIn, req: Request):
    """Frontend'den gelen selections listesini `users_choice.json` içine kaydeder.
    Auth cookie gerekli.
    """
    key = get_identity(req)
    data = load_choices()
    data[key] = {
        "selections": inb.selections,
        "updatedAt": time.time(),
    }
    save_choices(data)
    return {"ok": True, "key": key, "persona": data[key]}


@router.get("/get")
async def persona_get(req: Request):
    """Aktif kullanıcının kayıtlı persona seçimlerini döner.
    Yoksa boş liste döner.
    """
    key = get_identity(req)
    data = load_choices()
    return {
        "ok": True,
        "key": key,
        "persona": data.get(key, {"selections": [], "updatedAt": None}),
    }
