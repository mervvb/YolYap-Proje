from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter(tags=["auth"])

# Basit mock – DB yok, sadece demoda iş görsün diye
class LoginIn(BaseModel):
    email: str
    password: str

@router.post("/login")
def login(inp: LoginIn):
    # normalde burada kullanıcı kontrolü + JWT üretimi olur
    return {
        "access_token": "demo-token",
        "user": {"email": inp.email, "role": "user", "plan": "free"}
    }