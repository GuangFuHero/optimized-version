"""Which access token a request carries, and whether a cookie may carry it into a write (ADR-327).

A request authenticates with a Bearer token when it sends one — scripts, tests and the HTTP
collections do — and with the `{p}_at` cookie only when it does not. The two are never combined:
a Bearer token that fails is a failure, even with a valid cookie alongside.

A cookie is attached by the browser to any request for our hosts, including one a page on another
site starts. So a request that authenticates by cookie and writes — any method but GET, HEAD and
OPTIONS — must say it came from one of our own pages: its `Origin`, or failing that its `Referer`,
has to be in `AUTH_ALLOWED_ORIGINS`. CORS cannot do this; it decides who may read a response, not
whether a request is sent. `SameSite=Lax` stops other sites, but not other subdomains of ours.
GraphQL follows the same line: a query sent as a GET reads and is not checked, while every POST —
mutations, and queries sent that way — is.

`presented_access_token` only says which token arrived; the audit middleware uses it to attribute
writes. `accept_access_token` is what authenticates: REST (through `security.get_access_token`) and
the GraphQL context both go through it, so the rules cannot drift apart. It records a
cookie-authenticated request on `request.state`, where the error handler looks before clearing the
cookies of a session that is gone (ADR-328).
"""

import ipaddress
from urllib.parse import urlsplit

from fastapi import Request, status
from fastapi.security.utils import get_authorization_scheme_param
from jose import JWTError, jwt

from app.core import auth_cookies
from app.core.api_errors import ApiError, ErrorCode
from app.core.config import normalise_origin, settings

_READ_ONLY_METHODS = frozenset({"GET", "HEAD", "OPTIONS"})


def _origin_of(url: str) -> str | None:
    """`scheme://host[:port]` of a URL, the form a browser writes into `Origin`."""
    try:
        parts = urlsplit(url)
        port = parts.port
    except ValueError:
        return None
    if not parts.scheme or not parts.hostname:
        return None
    return f"{parts.scheme}://{parts.hostname}" + (f":{port}" if port else "")


def require_allowed_origin(request: Request) -> None:
    """Refuse a request that cannot show it came from one of our own pages (403 origin_not_allowed).

    `Origin` is what browsers send with a write; `Referer` stands in where it is missing, as on the
    GET that starts an OAuth sign-in. A request carrying neither is refused, as is `Origin: null`
    (a sandboxed frame, a `file:` page), because neither names a page of ours.
    """
    origin = request.headers.get("origin")
    if origin is None:
        referer = request.headers.get("referer")
        origin = _origin_of(referer) if referer else None
    if origin is None or normalise_origin(origin) not in settings.allowed_origins:
        raise ApiError(
            status.HTTP_403_FORBIDDEN,
            ErrorCode.ORIGIN_NOT_ALLOWED,
            detail="This request did not come from an allowed page",
        )


def presented_access_token(request: Request) -> tuple[str | None, bool]:
    """The access token a request carries and whether it came in the cookie. Checks nothing.

    A Bearer token wins; without one, the access cookie. (None, False) for a guest.
    """
    scheme, bearer = get_authorization_scheme_param(request.headers.get("Authorization"))
    if scheme.lower() == "bearer" and bearer:
        return bearer, False
    token = auth_cookies.read_access_cookie(request)
    return token, token is not None


def accept_access_token(request: Request) -> str | None:
    """The access token this request authenticates with, or None for a guest.

    The token from `presented_access_token`. One from the cookie also marks the request as
    cookie-authenticated (`request.state.auth_via_cookie`) and, if the request writes, must pass
    `require_allowed_origin` — so this can raise 403.
    """
    token, from_cookie = presented_access_token(request)
    if from_cookie:
        mark_authenticated_by_cookie(request)
        if request.method not in _READ_ONLY_METHODS:
            require_allowed_origin(request)
    if token and request.method not in _READ_ONLY_METHODS and _is_mcp_token(token):
        _require_mcp_write_allowed(request)
    return token


# What an MCP token may still send besides reads: ending its own session from anywhere, and the identity
# switch from the MCP's own calls. GraphQL is left to the schema, which refuses anything but a query.
_MCP_WRITES = frozenset({"/api/v1/auth/logout"})
_MCP_IN_PROCESS_WRITES = frozenset({"/api/v1/auth/switch-identity"})
GRAPHQL_PATH = "/graphql"
# The ASGI scope state key the MCP's in-process transport sets; a request from outside cannot carry it.
MCP_IN_PROCESS = "mcp_in_process"


def _is_mcp_token(token: str) -> bool:
    """Whether a token we signed was issued to an MCP client; expiry is left to the checks after this."""
    try:
        payload = jwt.decode(
            token, settings.JWT_SIGNING_KEY, algorithms=[settings.ALGORITHM], options={"verify_exp": False}
        )
    except JWTError:
        return False
    return payload.get("mcp") is True


def _require_mcp_write_allowed(request: Request) -> None:
    """Refuse a write sent with an MCP token (403 mcp_read_only), except the few listed above."""
    path = request.url.path.rstrip("/")
    if path == GRAPHQL_PATH:
        request.state.mcp_read_only = True
        return
    in_process = request.scope.get("state", {}).get(MCP_IN_PROCESS, False)
    if path in _MCP_WRITES or (in_process and path in _MCP_IN_PROCESS_WRITES):
        return
    raise ApiError(
        status.HTTP_403_FORBIDDEN,
        ErrorCode.MCP_READ_ONLY,
        detail="A token issued to an MCP client can only read",
    )


def mcp_read_only(request: Request) -> bool:
    """Whether this GraphQL request carries an MCP token, so it may run queries only."""
    return getattr(request.state, "mcp_read_only", False)


def mark_authenticated_by_cookie(request: Request) -> None:
    """Record that this request signs in with a cookie: the access cookie, or the refresh cookie.

    The error handler reads it to clear the cookies of a session that is gone (ADR-328).
    """
    request.state.auth_via_cookie = True


def authenticated_by_cookie(request: Request) -> bool:
    """Whether this request signed in with a cookie (`mark_authenticated_by_cookie`)."""
    return getattr(request.state, "auth_via_cookie", False)


# An IP is well under this; the cap only stops a hostile header from becoming a huge Redis key.
_MAX_CALLER_KEY_LEN = 64


def _is_trusted_proxy(address: str) -> bool:
    try:
        ip = ipaddress.ip_address(address.strip())
    except ValueError:
        return False
    return any(ip in network for network in settings.trusted_proxy_networks)


def resolve_client_ip(request: Request) -> str:
    """The caller's IP: the socket peer, or, when that peer is a trusted proxy, who it forwarded for.

    `X-Forwarded-For` is read right to left, skipping hops that are themselves trusted proxies, so a
    browser that sends its own header cannot choose the address it is keyed by.
    """
    peer = request.client.host if request.client else None
    forwarded = request.headers.get("X-Forwarded-For")
    if peer is None or not forwarded or not _is_trusted_proxy(peer):
        return (peer or "unknown")[:_MAX_CALLER_KEY_LEN]
    hops = [hop.strip() for hop in forwarded.split(",") if hop.strip()]
    for hop in reversed(hops):
        if not _is_trusted_proxy(hop):
            return hop[:_MAX_CALLER_KEY_LEN]
    return (hops[0] if hops else peer)[:_MAX_CALLER_KEY_LEN]
