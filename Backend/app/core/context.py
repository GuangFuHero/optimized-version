"""Thread-safe context variable stores for request auditing and context tracking."""

from contextvars import ContextVar

from fastapi import Request
from jose import JWTError, jwt
from starlette.middleware.base import BaseHTTPMiddleware

from app.core.config import settings

# Thread-safe/Async-safe context variables
request_user_uuid: ContextVar[str | None] = ContextVar("request_user_uuid", default=None)
request_client_ip: ContextVar[str | None] = ContextVar("request_client_ip", default=None)
# The identity snapshot the audit trigger writes to audit_logs.context (feature 010,
# ADR-076). Unlike the two above, this is NOT set by the middleware: it carries the role and
# team NAMES, which only a database lookup can supply, and the middleware has no session.
# `get_current_user` sets it once it has resolved the identity.
request_identity: ContextVar[str | None] = ContextVar("request_identity", default=None)


class AuditContextMiddleware(BaseHTTPMiddleware):
    """FastAPI middleware capturing request IP and authenticated user UUID to thread-local contexts."""

    async def dispatch(self, request: Request, call_next):
        """Intercept the HTTP request, populate context variables, and proceed."""
        # Extract IP address
        client_ip = request.client.host if request.client else None
        if "x-forwarded-for" in request.headers:
            client_ip = request.headers["x-forwarded-for"].split(",")[0].strip()

        # Extract authenticated user UUID from Authorization header
        user_uuid = None
        auth_header = request.headers.get("authorization")
        if auth_header and auth_header.lower().startswith("bearer "):
            token = auth_header[7:]
            try:
                payload = jwt.decode(token, settings.JWT_SIGNING_KEY, algorithms=[settings.ALGORITHM])
                if payload.get("type") == "access":
                    user_uuid = payload.get("sub")
            except JWTError:
                pass

        # Set context variables
        token_user = request_user_uuid.set(user_uuid)
        token_ip = request_client_ip.set(client_ip)

        try:
            return await call_next(request)
        finally:
            # Safely reset context variables
            request_user_uuid.reset(token_user)
            request_client_ip.reset(token_ip)
