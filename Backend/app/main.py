"""FastAPI application entry point — wires up middleware, routers, and startup lifecycle."""

import logging
import sys
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.api import api_router
from app.core import auth_cookies, security
from app.core.api_errors import ApiError, ErrorCode
from app.core.config import settings
from app.core.context import AuditContextMiddleware
from app.core.redis import create_redis_client, get_redis
from app.core.request_auth import authenticated_by_cookie
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
    app.state.redis = create_redis_client(settings.REDIS_URL)
    yield
    # --- shutdown (previously @app.on_event("shutdown")) ---
    if hasattr(app.state, "redis"):
        await app.state.redis.aclose()


# The interactive docs and the schema they read are served only in development. Tooling that needs
# the schema elsewhere can still call app.openapi() in-process.
_dev = settings.ENV == "development"
app = FastAPI(
    title="救災平台 API",
    description="災難救援與資源調度平台後端服務",
    version="0.1.0",
    lifespan=lifespan,
    docs_url="/docs" if _dev else None,
    redoc_url="/redoc" if _dev else None,
    openapi_url="/openapi.json" if _dev else None,
)

app.add_middleware(AuditContextMiddleware)


@app.middleware("http")
async def security_headers(request: Request, call_next):
    """Stop browsers sniffing a response's type or embedding it in a page from another site.

    An unhandled exception's 500 goes without them, because Starlette sends it from outside every
    added middleware.
    """
    response = await call_next(request)
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("Cross-Origin-Resource-Policy", "same-site")
    return response


# Added last so it is outermost and answers preflights before any other middleware runs. Browsers never
# call this API across origins: they reach it through the frontend's own server on the same origin,
# carrying the sign-in cookies, and the backend itself is not exposed. So any origin may call it without
# credentials, and what stops another site's page from making a browser send the cookies is the Origin
# check on cookie-authenticated writes (ADR-327), not CORS — which decides who may read a response, not
# whether a request is sent.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


# The 401 codes that mean the user is signed out, as opposed to needing a refresh (ADR-328). The last
# two only come from a refresh that failed, which leaves nothing to try next (ADR-325).
_SIGNED_OUT = frozenset({
    ErrorCode.SESSION_EXPIRED, ErrorCode.CREDENTIALS_INVALID,
    ErrorCode.REFRESH_TOKEN_INVALID, ErrorCode.IDENTITY_REVOKED,
})


@app.exception_handler(ApiError)
async def api_error_handler(request: Request, exc: ApiError) -> JSONResponse:
    """Emit `code` alongside `detail` so clients branch on the code instead of the English text.

    A cookie-authenticated request whose session is gone also gets its sign-in cookies cleared, or
    the browser would keep sending a token that can never work again (ADR-328). Done here rather
    than at each raise site, because REST endpoints and the GraphQL context both end up here, and
    rather than in a middleware, which would have to parse the body to find the code. A token that
    only needs refreshing keeps its cookies: the refresh needs them.
    """
    response = JSONResponse(
        status_code=exc.status_code,
        content={"detail": exc.detail, "code": exc.code},
        headers=exc.headers,
    )
    if exc.code in _SIGNED_OUT and authenticated_by_cookie(request):
        auth_cookies.clear_session_cookies(response)
    return response


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
