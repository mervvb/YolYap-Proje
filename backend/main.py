from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
import os

from api.ai.routes import router as ai_router
from api.mcp.routes import router as mcp_router
from api.traffic.matrix import router as matrix_router
from api.traffic.route import router as route_router
from api.plan.routes import router as plan_router
from auth.routes import router as auth_router

load_dotenv()

app = FastAPI(title="Yol/Route Backend", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[os.getenv("FRONTEND_ORIGIN", "http://localhost:3000")],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/health")
def health():
    return {"ok": True}

# Rotalar
app.include_router(auth_router, prefix="/auth", tags=["auth"])
app.include_router(ai_router, prefix="/ai", tags=["ai"])
app.include_router(mcp_router, prefix="/mcp", tags=["mcp"])
app.include_router(matrix_router, prefix="/traffic", tags=["traffic"])
app.include_router(route_router, prefix="/traffic", tags=["traffic"])
app.include_router(plan_router, prefix="/plan", tags=["plan"])

# Çalıştırma:
# uvicorn main:app --reload --port 8080