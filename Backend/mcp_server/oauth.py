"""OAuth for MCP clients, with the backend as authorization server and backend sessions as tokens.

Signing in reuses the site's login through a consent page, and revoking the session by any existing path
ends the client's access.
"""

import html
import json
import secrets
import time
from collections.abc import Callable
from urllib.parse import quote, urlsplit

from fastapi import APIRouter, Depends, Form, Request
from fastapi.responses import HTMLResponse, RedirectResponse, Response
from fastmcp.server.auth.auth import AccessToken, ClientRegistrationOptions, OAuthProvider, RevocationOptions
from mcp.server.auth.provider import (
    AuthorizationCode,
    AuthorizationParams,
    RefreshToken,
    TokenError,
    construct_redirect_uri,
)
from mcp.shared.auth import OAuthClientInformationFull, OAuthToken
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import security
from app.core.api_errors import ApiError, ErrorCode
from app.core.config import settings
from app.core.redis import get_redis
from app.core.request_auth import accept_access_token
from app.db.session import SessionLocal
from app.models.auth import User
from app.repositories.auth_repository import user_repository
from app.repositories.session_repository import SessionRepository
from app.services import auth_session

_CLIENT = "mcp_client:"
_PENDING = "mcp_authorize:"
_CODE = "mcp_code:"
_PENDING_TTL = 600
_CODE_TTL = 300
CONSENT_PATH = "/api/v1/mcp/consent"


def _client_name(client: OAuthClientInformationFull) -> str:
    return client.client_name or client.client_id or "MCP client"


def _token(access_token: str, refresh_token: str) -> OAuthToken:
    return OAuthToken(
        access_token=access_token,
        token_type="Bearer",
        expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        refresh_token=refresh_token,
    )


class BackendOAuthProvider(OAuthProvider):
    """Registered clients, pending sign-ins and codes live in Redis; tokens are backend session tokens."""

    def __init__(self, redis_of: Callable[[], object]):
        """`redis_of` returns the app's Redis client, which exists only once the app has started."""
        super().__init__(
            base_url=settings.MCP_BASE_URL,
            client_registration_options=ClientRegistrationOptions(enabled=True),
            revocation_options=RevocationOptions(enabled=True),
        )
        self._redis_of = redis_of

    @property
    def redis(self):
        """The app's Redis client."""
        return self._redis_of()

    async def get_client(self, client_id: str) -> OAuthClientInformationFull | None:
        """A registered client; each lookup keeps it registered for another session lifetime."""
        raw = await self.redis.get(_CLIENT + client_id)
        if raw is None:
            return None
        await self.redis.expire(_CLIENT + client_id, SessionRepository(self.redis).ttl)
        return OAuthClientInformationFull.model_validate_json(raw)

    async def register_client(self, client_info: OAuthClientInformationFull) -> None:
        """Store a dynamically registered client."""
        await self.redis.set(
            _CLIENT + client_info.client_id,
            client_info.model_dump_json(),
            ex=SessionRepository(self.redis).ttl,
        )

    async def authorize(self, client: OAuthClientInformationFull, params: AuthorizationParams) -> str:
        """Park the request and send the browser to the consent page on the site."""
        pending = secrets.token_urlsafe(32)
        record = {"client_id": client.client_id, "params": params.model_dump(mode="json")}
        await self.redis.set(_PENDING + pending, json.dumps(record), ex=_PENDING_TTL)
        return f"{settings.SITE_APP_URL.rstrip('/')}{CONSENT_PATH}?txn={pending}"

    async def load_authorization_code(
        self, client: OAuthClientInformationFull, authorization_code: str
    ) -> AuthorizationCode | None:
        """The code, if it is live and was issued to this client."""
        raw = await self.redis.get(_CODE + authorization_code)
        code = AuthorizationCode.model_validate_json(raw) if raw else None
        return code if code and code.client_id == client.client_id else None

    async def exchange_authorization_code(
        self, client: OAuthClientInformationFull, authorization_code: AuthorizationCode
    ) -> OAuthToken:
        """Spend the code once and open an MCP session for the account that allowed it."""
        if not await self.redis.delete(_CODE + authorization_code.code):
            raise TokenError("invalid_grant", "Authorization code was already used.")
        async with SessionLocal() as db:
            user = await user_repository.get_by_uuid(db, authorization_code.subject)
            if user is None:
                raise TokenError("invalid_grant", "The account no longer exists.")
            await auth_session.record_login(db, user)
            access_token, refresh_token, _ = await auth_session.open_default_session(
                db, self.redis, user, f"MCP: {_client_name(client)}", mcp_client=client.client_id
            )
        return _token(access_token, refresh_token)

    async def _mcp_session(self, sid: str | None, client_id: str | None = None) -> dict | None:
        session = await SessionRepository(self.redis).get_session(sid) if sid else None
        if not session or not session.get("mcp_client"):
            return None
        if client_id is not None and session["mcp_client"] != client_id:
            return None
        return session

    async def load_refresh_token(
        self, client: OAuthClientInformationFull, refresh_token: str
    ) -> RefreshToken | None:
        """A refresh token of a live MCP session that belongs to this client."""
        record = await SessionRepository(self.redis).get_refresh_for_token(refresh_token)
        if record is None or await self._mcp_session(record["sid"], client.client_id) is None:
            return None
        return RefreshToken(
            token=refresh_token, client_id=client.client_id, scopes=[], subject=record["user_uuid"]
        )

    async def exchange_refresh_token(
        self, client: OAuthClientInformationFull, refresh_token: RefreshToken, scopes: list[str]
    ) -> OAuthToken:
        """Rotate through the backend's own refresh, so its reuse detection and identity checks apply."""
        async with SessionLocal() as db:
            try:
                access_token, new_refresh, _ = await auth_session.refresh_session(
                    db, self.redis, refresh_token.token
                )
            except ApiError as err:
                raise TokenError("invalid_grant", err.detail) from err
        return _token(access_token, new_refresh)

    async def load_access_token(self, token: str) -> AccessToken | None:
        """A backend access token whose MCP session is still live.

        The session's identity is not compared with the token's: tools act as whatever identity the
        session holds now, so a token from before an identity switch grants nothing extra.
        """
        try:
            payload = security._decode_access_payload(token)
        except ApiError:
            return None
        session = await self._mcp_session(payload.get("sid"))
        if session is None or session["user_uuid"] != payload["sub"]:
            return None
        return AccessToken(
            token=token,
            client_id=session["mcp_client"],
            scopes=[],
            expires_at=int(payload["exp"]),
            subject=payload["sub"],
            claims={"sid": payload["sid"]},
        )

    async def revoke_token(self, token: AccessToken | RefreshToken) -> None:
        """End the session the token belongs to."""
        repo = SessionRepository(self.redis)
        if isinstance(token, AccessToken):
            sid = (token.claims or {}).get("sid")
        else:
            record = await repo.get_refresh_for_token(token.token)
            sid = record["sid"] if record else None
        if await self._mcp_session(sid) is not None:
            await repo.revoke_session(sid)


consent_router = APIRouter()

_PAGE = """<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>授權 MCP 用戶端</title>
<style>body{{font-family:system-ui,sans-serif;max-width:32rem;margin:3rem auto;padding:0 1rem;
line-height:1.6}}
button{{font-size:1rem;padding:.5rem 1.25rem;margin-right:.5rem}}</style></head><body>{body}</body></html>"""


def _page(body: str, status_code: int = 200) -> HTMLResponse:
    return HTMLResponse(
        _PAGE.format(body=body),
        status_code=status_code,
        headers={"X-Frame-Options": "DENY", "Content-Security-Policy": "frame-ancestors 'none'"},
    )


async def _pending(redis, txn: str) -> tuple[dict, OAuthClientInformationFull] | None:
    raw = await redis.get(_PENDING + txn)
    client_raw = await redis.get(_CLIENT + json.loads(raw)["client_id"]) if raw else None
    if client_raw is None:
        return None
    return json.loads(raw), OAuthClientInformationFull.model_validate_json(client_raw)


async def _signed_in_user(request: Request, db: AsyncSession, redis) -> User | None:
    """The browser's signed-in account, or None; an access token that only needs refreshing is raised.

    Raising it lets the site's proxy refresh the session and send the request again.
    """
    token = accept_access_token(request)
    if token is None:
        return None
    try:
        return await security.get_current_user(db, token, redis, None)
    except ApiError as err:
        if err.code in (ErrorCode.ACCESS_TOKEN_EXPIRED, ErrorCode.ACCESS_TOKEN_STALE):
            raise
        return None


def _expired() -> HTMLResponse:
    return _page("<p>這個授權要求已失效，請回到 MCP 用戶端重新連線。</p>", 400)


@consent_router.get("/consent", response_class=HTMLResponse)
async def consent_page(
    txn: str,
    request: Request,
    db: AsyncSession = Depends(security.get_db),
    redis=Depends(get_redis),
) -> Response:
    """Ask the signed-in person to allow the client; send a guest through the site's login first."""
    pending = await _pending(redis, txn)
    if pending is None:
        return _expired()
    user = await _signed_in_user(request, db, redis)
    if user is None:
        back = quote(f"{CONSENT_PATH}?txn={txn}", safe="")
        return RedirectResponse(f"{settings.SITE_APP_URL.rstrip('/')}/login?callbackUrl={back}", 302)
    record, client = pending
    redirect_host = urlsplit(record["params"]["redirect_uri"]).netloc or record["params"]["redirect_uri"]
    return _page(
        f"<h1>授權 MCP 用戶端</h1><p><strong>{html.escape(_client_name(client))}</strong>"
        f"（將返回 {html.escape(redirect_host)}）想以 <strong>{html.escape(user.name)}</strong> "
        "的身分讀取資料。它只能讀取，不能新增、修改或刪除任何資料；登出網站即會中斷它的連線。</p>"
        f'<form method="post"><input type="hidden" name="txn" value="{html.escape(txn)}">'
        '<button name="decision" value="allow">允許</button>'
        '<button name="decision" value="deny">拒絕</button></form>'
    )


@consent_router.post("/consent")
async def consent_decision(
    request: Request,
    txn: str = Form(...),
    decision: str = Form(...),
    db: AsyncSession = Depends(security.get_db),
    redis=Depends(get_redis),
) -> Response:
    """Answer the client: a code for the signed-in account if allowed, `access_denied` otherwise."""
    pending = await _pending(redis, txn)
    user = await _signed_in_user(request, db, redis)
    if pending is None or user is None or not await redis.delete(_PENDING + txn):
        return _expired()
    record, client = pending
    params = AuthorizationParams.model_validate(record["params"])
    if decision != "allow":
        target = construct_redirect_uri(str(params.redirect_uri), error="access_denied", state=params.state)
        return RedirectResponse(target, 303)
    code = AuthorizationCode(
        code=secrets.token_urlsafe(32),
        scopes=params.scopes or [],
        expires_at=time.time() + _CODE_TTL,
        client_id=client.client_id,
        code_challenge=params.code_challenge,
        redirect_uri=params.redirect_uri,
        redirect_uri_provided_explicitly=params.redirect_uri_provided_explicitly,
        resource=params.resource,
        subject=str(user.uuid),
    )
    await redis.set(_CODE + code.code, code.model_dump_json(), ex=_CODE_TTL)
    target = construct_redirect_uri(str(params.redirect_uri), code=code.code, state=params.state)
    return RedirectResponse(target, 303)
