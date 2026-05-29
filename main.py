"""
main.py — Entry point
Chạy: uvicorn main:app --reload
"""
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.sessions import SessionMiddleware

from api.auth_router import router as auth_router
from api.bin_router import router as bin_router
from api.draft_router import router as draft_router
from api.prompt_router import router as prompt_router
from database.connection import create_tables
from utils.config import get_settings

_settings = get_settings()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)-8s | %(name)s | %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup + shutdown logic."""
    # ── Startup ───────────────────────────────────────────────────
    create_tables()
    logger.info("✓ DB ready | http://localhost:8000/docs")

    yield

    # ── Shutdown ──────────────────────────────────────────────────
    logger.info("App shutting down")


app = FastAPI(
    title="Prompt Builder",
    description="Sinh Master Prompt thuyết trình từ option của người dùng",
    version="2.0.0",
    lifespan=lifespan,
)

# CORS — chỉ allow origin trong config
app.add_middleware(
    CORSMiddleware,
    allow_origins=_settings.get_allowed_origins(),
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization"],
)

# SessionMiddleware bắt buộc cho Authlib (lưu state OAuth tạm thời)
app.add_middleware(
    SessionMiddleware,
    secret_key=_settings.JWT_SECRET_KEY,
)

app.include_router(prompt_router, prefix="/api")
app.include_router(auth_router, prefix="/api")
app.include_router(bin_router, prefix="/api")
app.include_router(draft_router, prefix="/api")


@app.get("/", tags=["Health Check"])
def root():
    return {
        "app": "Prompt Builder",
        "docs": "http://localhost:8000/docs",
        "endpoints": {
            "generate": "POST /api/generate",
            "status": "GET  /api/jobs/{job_id}",
            "register": "POST /api/auth/register",
            "login": "POST /api/auth/login",
            "me": "GET  /api/auth/me",
    "description": "POST /api/description/generate",
        },
    }
