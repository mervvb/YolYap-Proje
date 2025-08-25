#backend/auth/routes.py
from fastapi import APIRouter, HTTPException, status, Request, Response
from pydantic import BaseModel, EmailStr, Field
from pathlib import Path
from datetime import datetime
from typing import Dict, Any
import json, os, hashlib, base64, hmac

router = APIRouter(prefix="/auth", tags=["auth"])

DATA_DIR = Path(__file__).parent / "data"
DATA_DIR.mkdir(parents=True, exist_ok=True)
USERS_FILE = DATA_DIR / "users.json"

COOKIE_EMAIL = "user_email"
COOKIE_ID = "user_id"  # opsiyonel: ileride id tutarsak

# ---- PBKDF2 utils (stdlib) ----
_ITER = 390000  # modern bir varsayılan
_ALG = "sha256"
def _b64(x: bytes) -> str: return base64.b64encode(x).decode("utf-8")
def _ub64(s: str) -> bytes: return base64.b64decode(s.encode("utf-8"))

def hash_password(pw: str) -> str:
    salt = os.urandom(16)
    dk = hashlib.pbkdf2_hmac(_ALG, pw.encode("utf-8"), salt, _ITER)
    # format: pbkdf2$iter$alg$salt$hash
    return f"pbkdf2${_ITER}${_ALG}${_b64(salt)}${_b64(dk)}"

def verify_password(pw: str, stored: str) -> bool:
    try:
        scheme, iter_s, alg, salt_b64, hash_b64 = stored.split("$", 4)
        if scheme != "pbkdf2": return False
        it = int(iter_s)
        if alg != _ALG: return False
        salt = _ub64(salt_b64)
        expected = _ub64(hash_b64)
        test = hashlib.pbkdf2_hmac(alg, pw.encode("utf-8"), salt, it)
        return hmac.compare_digest(test, expected)
    except Exception:
        return False
# -------------------------------

def load_users() -> Dict[str, Any]:
    if not USERS_FILE.exists(): return {}
    try:
        return json.loads(USERS_FILE.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return {}

def save_users(data: Dict[str, Any]) -> None:
    USERS_FILE.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")

class RegisterIn(BaseModel):
    name: str = Field(min_length=2)
    email: EmailStr
    password: str = Field(min_length=6)

class LoginIn(BaseModel):
    email: EmailStr
    password: str

@router.post("/register")
def register(inp: RegisterIn):
    users = load_users()
    if inp.email in users:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Bu e-posta zaten kayıtlı.")
    rec = {
        "name": inp.name,
        "email": inp.email,
        "password_hash": hash_password(inp.password),
        "created_at": datetime.utcnow().isoformat() + "Z",
        "role": "user", "plan": "free",
    }
    users[inp.email] = rec
    save_users(users)
    return {"name": rec["name"], "email": rec["email"], "created_at": rec["created_at"]}

@router.post("/login")
def login(inp: LoginIn, response: Response):
    users = load_users()
    u = users.get(inp.email)
    if not u or not verify_password(inp.password, u.get("password_hash", "")):
        raise HTTPException(status_code=401, detail="E-posta veya şifre hatalı.")
    token = "demo-token"  # İstersen JWT ekleyebiliriz

    # Geliştirme ortamı için cookie ayarları
    # HttpOnly: True ise JS okuyamaz ama tarayıcı otomatik gönderir (daha güvenli).
    # Frontend fetch çağrılarında credentials: 'include' şart.
    response.set_cookie(
        key=COOKIE_EMAIL,
        value=u["email"],
        httponly=True,
        samesite="Lax",
        secure=False,  # prod'da True (HTTPS) yapılmalı
        path="/"
    )
    # Eğer ileride id eklenirse:
    if u.get("id"):
        response.set_cookie(
            key=COOKIE_ID,
            value=str(u["id"]),
            httponly=True,
            samesite="Lax",
            secure=False,
            path="/"
        )

    return {
        "access_token": token,
        "user": {"name": u["name"], "email": u["email"], "created_at": u["created_at"]},
    }


# Kullanıcı bilgilerini dönen endpoint
@router.get("/me")
def me(request: Request):
    users = load_users()

    # 1) Cookie öncelikli
    email = request.cookies.get(COOKIE_EMAIL)
    uid = request.cookies.get(COOKIE_ID)

    # 2) Header fallback
    if not email:
        email = request.headers.get("x-user-email")

    # 3) Query fallback
    if not email:
        email = request.query_params.get("email")

    if not email and not uid:
        raise HTTPException(status_code=401, detail="Giriş yapılmadı")

    key = email or uid
    if key not in users:
        raise HTTPException(status_code=401, detail="Kullanıcı bulunamadı")

    u = users[key]
    return {
        "name": u.get("name", ""),
        "email": u.get("email", email),
        "id": u.get("id", uid),
        "created_at": u.get("created_at"),
        "role": u.get("role", "user"),
        "plan": u.get("plan", "free"),
    }

@router.post("/logout")
def logout(response: Response):
    # Cookie'leri temizle
    response.delete_cookie(COOKIE_EMAIL, path="/")
    response.delete_cookie(COOKIE_ID, path="/")
    return {"ok": True}
