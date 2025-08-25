from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, EmailStr, Field
from pathlib import Path
from datetime import datetime
from typing import Dict, Any
import json, os, hashlib, base64, hmac

router = APIRouter(prefix="/auth", tags=["auth"])

DATA_DIR = Path(__file__).parent / "data"
DATA_DIR.mkdir(parents=True, exist_ok=True)
USERS_FILE = DATA_DIR / "users.json"

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
def login(inp: LoginIn):
    users = load_users()
    u = users.get(inp.email)
    if not u or not verify_password(inp.password, u.get("password_hash", "")):
        raise HTTPException(status_code=401, detail="E-posta veya şifre hatalı.")
    token = "demo-token"  # İstersen JWT ekleyebiliriz
    return {
        "access_token": token,
        "user": {"name": u["name"], "email": u["email"], "created_at": u["created_at"]},
    }
