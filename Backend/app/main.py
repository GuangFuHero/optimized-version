"""FastAPI application entry point — wires up middleware, routers, and startup lifecycle."""

import os
from contextlib import asynccontextmanager

import redis.asyncio as aioredis
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pyrate_limiter import Duration, Limiter, Rate

from app.api.v1.api import api_router
from app.core.config import settings
from app.graphql.router import graphql_router


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
