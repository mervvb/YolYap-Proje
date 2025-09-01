# main.py
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from dotenv import load_dotenv
import os
from loguru import logger
import sys
from contextlib import asynccontextmanager

# Import existing routers
from api.ai.routes import router as ai_router
from api.traffic.matrix import router as matrix_router
from api.traffic.route import router as route_router
from api.plan.routes import router as plan_router
from auth.routes import router as auth_router
from api.persona.routes import router as persona_router
from api.gen.routes import router as gen_router

# Import MCP client (YENİ)
from mcp_client import get_mcp_client, ensure_mcp_connection, mcp_health_check

load_dotenv()

@asynccontextmanager
async def lifespan(app: FastAPI):
    """FastAPI başlangıç ve kapanış olaylarını yönetir"""
    # Startup
    logger.info("🚀 Yol/Route Backend + THY MCP + LLM API starting up...")
    
    # Check critical environment variables
    critical_vars = {
        "FRONTEND_ORIGIN": "Frontend origin URL",
    }
    
    optional_vars = {
        "TURKISH_AIRLINES_MCP_TOKEN": "Turkish Airlines MCP integration",  # Updated
        "OPENAI_API_KEY": "LLM AI capabilities",
        "MAPBOX_SERVER_TOKEN": "Mapbox traffic data"
    }
    
    # Check critical variables
    missing_critical = []
    for var, description in critical_vars.items():
        if not os.getenv(var):
            missing_critical.append(f"{var} ({description})")
    
    if missing_critical:
        logger.warning("⚠️ Missing critical environment variables:")
        for var in missing_critical:
            logger.warning(f"   - {var}")
    
    # Initialize Turkish Airlines MCP connection
    try:
        logger.info("🛩️ Initializing Turkish Airlines MCP connection...")
        mcp_client = await get_mcp_client()
        
        if mcp_client._connected:
            await mcp_client.load_tools()
            logger.success(f"✅ Turkish Airlines MCP ready - {len(mcp_client.tools_cache)} tools available")
            optional_vars["TURKISH_AIRLINES_MCP_TOKEN"] = "Turkish Airlines MCP integration (CONNECTED)"
        else:
            logger.warning("⚠️ Turkish Airlines MCP connection failed - check token")
            optional_vars["TURKISH_AIRLINES_MCP_TOKEN"] = "Turkish Airlines MCP integration (FAILED)"
            
    except Exception as e:
        logger.error(f"❌ Turkish Airlines MCP initialization failed: {e}")
        optional_vars["TURKISH_AIRLINES_MCP_TOKEN"] = f"Turkish Airlines MCP integration (ERROR: {str(e)[:50]}...)"
    
    # Check optional variables and log their status
    logger.info("📋 Features Status:")
    for var_key, description in optional_vars.items():
        if "CONNECTED" in description:
            logger.success(f"   {description}")
        elif "FAILED" in description or "ERROR" in description:
            logger.warning(f"   {description}")
        else:
            status = "✅ Enabled" if os.getenv(var_key.split('(')[0].strip()) else "❌ Disabled"
            logger.info(f"   {description}: {status}")
    
    # Log CORS configuration
    frontend_origin_env = os.getenv("FRONTEND_ORIGIN", "http://localhost:3000")
    allowed = {
        frontend_origin_env, 
        "http://127.0.0.1:3000",
        "http://localhost:3000",
        "http://localhost:8080",
        "http://127.0.0.1:8080"
    }
    logger.info(f"🌐 CORS allowed origins: {list(allowed)}")
    
    # Log available endpoints
    logger.info("🛣️ Available endpoint groups:")
    logger.info("   /auth/* - Authentication")
    logger.info("   /ai/* - LLM AI Assistant + Turkish Airlines MCP")  # Updated
    logger.info("   /thy/mcp/* - Turkish Airlines MCP (Direct)")
    logger.info("   /traffic/* - Traffic & Routing")
    logger.info("   /plan/* - Trip Planning")
    logger.info("   /persona/* - User Personas")
    logger.info("   /gen/* - Content Generation")
    
    port = os.getenv("PORT", "8080")
    logger.success(f"✅ Server ready on port {port}")
    
    yield
    
    # Shutdown
    logger.info("🛑 Yol/Route Backend + THY MCP + LLM API shutting down...")
    try:
        mcp_client = await get_mcp_client()
        await mcp_client.disconnect()
        logger.info("✅ Turkish Airlines MCP disconnected cleanly")
    except Exception as e:
        logger.warning(f"MCP disconnect error: {e}")

# Initialize FastAPI app with lifespan
app = FastAPI(
    title="Yol/Route Backend + Turkish Airlines MCP + LLM",
    version="1.0.0",
    description="Comprehensive backend with traffic, planning, Turkish Airlines MCP integration, and LLM capabilities",
    lifespan=lifespan
)

# CORS configuration
frontend_origin_env = os.getenv("FRONTEND_ORIGIN", "http://localhost:3000")
allowed = {
    frontend_origin_env, 
    "http://127.0.0.1:3000",
    "http://localhost:3000",
    "http://localhost:8080",
    "http://127.0.0.1:8080"
}

app.add_middleware(
    CORSMiddleware,
    allow_origins=list(allowed),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configure logging
logger.remove()  # Remove default handler
log_level = os.getenv("LOG_LEVEL", "INFO")

logger.add(
    sys.stdout,
    format="<green>{time:HH:mm:ss}</green> | <level>{level: <8}</level> | <cyan>{name}</cyan>:<cyan>{function}</cyan>:<cyan>{line}</cyan> - <level>{message}</level>",
    level=log_level,
    colorize=True
)

# Add file logging
os.makedirs("logs", exist_ok=True)
logger.add(
    "logs/app.log",
    format="{time:YYYY-MM-DD HH:mm:ss} | {level: <8} | {name}:{function}:{line} - {message}",
    level=log_level,
    rotation="1 day",
    retention="30 days"
)

# Exception handlers
@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    logger.error(f"HTTP {exc.status_code} error on {request.method} {request.url}: {exc.detail}")
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "error": {
                "code": exc.status_code,
                "message": exc.detail,
                "path": str(request.url.path),
                "method": request.method
            }
        }
    )

@app.exception_handler(Exception)
async def general_exception_handler(request: Request, exc: Exception):
    logger.error(f"Unhandled exception on {request.method} {request.url}: {str(exc)}", exc_info=True)
    return JSONResponse(
        status_code=500,
        content={
            "error": {
                "code": 500,
                "message": "Internal server error",
                "path": str(request.url.path),
                "method": request.method,
                "details": str(exc) if os.getenv("DEBUG", "False").lower() == "true" else None
            }
        }
    )

# Request logging middleware
@app.middleware("http")
async def log_requests(request: Request, call_next):
    logger.info(f"Request: {request.method} {request.url}")
    response = await call_next(request)
    logger.info(f"Response: {request.method} {request.url} - Status: {response.status_code}")
    return response

# Enhanced health check endpoint
@app.get("/health")
async def health():
    """Enhanced health check with all components including MCP status."""
    checks = {
        "ok": True,
        "service": "Yol/Route Backend + THY MCP + LLM",
        "version": "1.0.0",
        "components": {},
        "mcp_status": None
    }
    
    # Check environment variables for different components
    components = {
        "openai": os.getenv("OPENAI_API_KEY") is not None,
        "google_maps": os.getenv("MAPBOX_SERVER_TOKEN") is not None,
        "turkish_airlines_token": os.getenv("TURKISH_AIRLINES_MCP_TOKEN") is not None,
    }
    
    for component, available in components.items():
        checks["components"][component] = "✓" if available else "✗"
    
    # Test MCP connection
    try:
        mcp_health = await mcp_health_check()
        checks["mcp_status"] = mcp_health
        checks["components"]["turkish_airlines_mcp"] = "✓" if mcp_health.get("status") == "healthy" else "✗"
        
        if mcp_health.get("status") != "healthy":
            checks["ok"] = False
    except Exception as e:
        checks["mcp_status"] = {
            "status": "error",
            "error": str(e),
            "connected": False
        }
        checks["components"]["turkish_airlines_mcp"] = "✗"
    
    return checks

# MCP-specific health check endpoint (NEW)
@app.get("/mcp/health")
async def mcp_health():
    """Dedicated Turkish Airlines MCP health check."""
    try:
        return await mcp_health_check()
    except Exception as e:
        return {
            "status": "error",
            "error": str(e),
            "connected": False
        }

# API Info endpoint
@app.get("/")
def root():
    """Root endpoint with API information."""
    return {
        "message": "Yol/Route Backend + Turkish Airlines MCP + LLM API",
        "version": "1.0.0",
        "features": [
            "Traffic & Route Planning",
            "Turkish Airlines MCP Integration", 
            "LLM-powered AI Assistant with Flight Tools",  # Updated
            "User Authentication",
            "Persona Management",
            "Content Generation"
        ],
        "endpoints": {
            "health": "/health",
            "mcp_health": "/mcp/health",  # NEW
            "auth": "/auth/*",
            "ai_chat": "/ai/ask",
            "ai_tools": "/ai/tools",  # NEW
            "thy_mcp": "/thy/mcp/*",
            "traffic": "/traffic/*",
            "planning": "/plan/*",
            "personas": "/persona/*",
            "generation": "/gen/*",
            "docs": "/docs" if os.getenv("DEBUG", "False").lower() == "true" else "Disabled in production"
        },
        "sample_queries": [  # NEW
            "TK1 bugün uçuş durumu nedir?",
            "İstanbul Ankara uçuş ara",
            "Mil bakiyemi kontrol et",
            "İstanbul şehir rehberi"
        ]
    }

# Include all routers
app.include_router(auth_router)
app.include_router(ai_router)
app.include_router(matrix_router, prefix="/traffic", tags=["traffic"])
app.include_router(route_router, prefix="/traffic", tags=["traffic"])
app.include_router(plan_router, prefix="/plan", tags=["plan"])
app.include_router(persona_router, prefix="/persona", tags=["persona"])
app.include_router(gen_router, tags=["gen"])

# For uvicorn command line usage
if __name__ == "__main__":
    import uvicorn
    
    host = os.getenv("HOST", "0.0.0.0")
    port = int(os.getenv("PORT", 8080))
    debug = os.getenv("DEBUG", "False").lower() == "true"
    reload = os.getenv("RELOAD", "False").lower() == "true"
    
    logger.info(f"Starting server in {'DEBUG' if debug else 'PRODUCTION'} mode")
    logger.info("Use: uvicorn main:app --reload --port 8080")
    
    try:
        uvicorn.run(
            "main:app",
            host=host,
            port=port,
            reload=reload,
            log_level="info" if debug else "warning",
            access_log=debug
        )
    except Exception as e:
        logger.error(f"Failed to start server: {e}")
        sys.exit(1)

# Çalıştırma:
# uvicorn main:app --reload --port 8080
