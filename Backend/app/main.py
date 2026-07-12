"""FastAPI application entry point — wires up middleware, routers, and startup lifecycle."""

import logging
import os
import sys
from contextlib import asynccontextmanager

import redis.asyncio as aioredis
from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pyrate_limiter import Duration, Limiter, Rate
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.api import api_router
from app.core import security
from app.core.config import settings
from app.core.context import AuditContextMiddleware
from app.core.redis import get_redis
from app.graphql.router import graphql_router

# Route the app's loggers (e.g. the app.email / app.sms console senders) to stdout at INFO so dev
# verification codes are visible in `docker compose logs backend`. uvicorn configures only its own
# loggers, leaving app.* at the root WARNING default — which silently drops the console-sender output.
_app_logger = logging.getLogger("app")
if not _app_logger.handlers:
    _handler = logging.StreamHandler(sys.stdout)
    _handler.setFormatter(logging.Formatter("%(levelname)s:     %(name)s: %(message)s"))
    _app_logger.addHandler(_handler)
    _app_logger.setLevel(logging.INFO)
    # Keep propagate=True so pytest's caplog (root-level capture) still sees app.* records;
    # uvicorn adds no root handler, so this does not double-log in production.


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Manage application startup and shutdown lifecycle."""
    # --- startup (previously @app.on_event("startup")) ---
    env = os.getenv("ENV", "development")
    rate_val = 100 if env != "testing" else 999999
    app.state.limiter = Limiter(Rate(rate_val, Duration.MINUTE))
    app.state.redis = aioredis.from_url(settings.REDIS_URL, decode_responses=False)
    yield
    # --- shutdown (previously @app.on_event("shutdown")) ---
    if hasattr(app.state, "redis"):
        await app.state.redis.aclose()


app = FastAPI(
    title="救災平台 API",
    description="災難救援與資源調度平台後端服務",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_middleware(AuditContextMiddleware)

app.include_router(api_router, prefix="/api/v1")
app.include_router(graphql_router, prefix="/graphql", tags=["圖資"])


@app.get("/")
async def root():
    """Return a welcome message confirming the API is online."""
    return {"message": "Welcome to Disaster Relief Platform API", "status": "online"}


@app.get("/health")
async def health_check():
    """Return a simple health check response."""
    return {"status": "ok"}


@app.get("/readyz")
async def readiness_check(
        db: AsyncSession = Depends(security.get_db),
        redis=Depends(get_redis),
):
    """Readiness probe: 200 only when DB and Redis are reachable. Used as the deploy gate."""
    try:
        await db.execute(text("SELECT 1"))
        await redis.ping()
    except Exception as err:
        raise HTTPException(status_code=503, detail="not ready") from err
    return {"status": "ready"}
