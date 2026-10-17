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

from urllib.parse import urlsplit

from fastapi import Request, status
from fastapi.security.utils import get_authorization_scheme_param

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
        request.state.auth_via_cookie = True
        if request.method not in _READ_ONLY_METHODS:
            require_allowed_origin(request)
    return token


def authenticated_by_cookie(request: Request) -> bool:
    """Whether `accept_access_token` took this request's token from the cookie."""
    return getattr(request.state, "auth_via_cookie", False)
