"""The browser's sign-in cookies: their names, their attributes, and reading them back (ADR-326).

Three cookies, all named with `AUTH_COOKIE_PREFIX` so production, staging and a developer's machine
never read or clear one another's:

- `{p}_at` holds the access token, `{p}_rt` the refresh token. Both go to every path (`Path=/`)
  and live as long as the session can (`REFRESH_TOKEN_EXPIRE_DAYS`), renewed on every refresh. The
  access JWT inside still expires after 15 minutes; keeping the cookie longer is what lets an
  expired token reach the backend and be answered `access_token_expired`, instead of the browser
  dropping it and the user silently turning into a guest.
- `{p}_oauth` holds the state of a sign-in in progress with Google or LINE, for ten minutes, and
  only travels to the OAuth endpoints.

Every one is `HttpOnly` (page scripts cannot read a token), `SameSite=Lax` (another site's form
cannot send it) and `Secure` unless `AUTH_COOKIE_SECURE` says otherwise. Clearing writes the same
name, path and domain with `Max-Age=0`; a browser keeps a cookie it is told to clear under any other
combination.

Names and attributes are read from the settings when called, not when this module is imported.
"""

from starlette.requests import Request
from starlette.responses import Response

from app.core.config import settings

OAUTH_COOKIE_PATH = "/api/v1/auth/oauth"
# An OAuth round trip is a few clicks at the provider; a sign-in left longer than this starts over.
OAUTH_COOKIE_MAX_AGE = 600


def access_cookie_name() -> str:
    """`{p}_at`: the access token."""
    return f"{settings.AUTH_COOKIE_PREFIX}_at"


def refresh_cookie_name() -> str:
    """`{p}_rt`: the refresh token."""
    return f"{settings.AUTH_COOKIE_PREFIX}_rt"


def oauth_cookie_name() -> str:
    """`{p}_oauth`: the state of an OAuth sign-in in progress."""
    return f"{settings.AUTH_COOKIE_PREFIX}_oauth"


def _attributes(path: str) -> dict:
    """The attributes every sign-in cookie is both set and cleared with.

    One place for both, because a clear sent under any other path or domain leaves the cookie where
    it was.
    """
    return {
        "path": path,
        "domain": settings.AUTH_COOKIE_DOMAIN or None,
        "secure": settings.AUTH_COOKIE_SECURE,
        "httponly": True,
        "samesite": "lax",
    }


def _set(response: Response, name: str, value: str, *, path: str, max_age: int) -> None:
    response.set_cookie(name, value, max_age=max_age, **_attributes(path))


def _clear(response: Response, name: str, *, path: str) -> None:
    response.delete_cookie(name, **_attributes(path))


def _session_max_age() -> int:
    return settings.REFRESH_TOKEN_EXPIRE_DAYS * 86400


def set_session_cookies(response: Response, access_token: str, refresh_token: str) -> None:
    """Sign the browser in: both tokens, for as long as the session can last."""
    set_access_cookie(response, access_token)
    _set(response, refresh_cookie_name(), refresh_token, path="/", max_age=_session_max_age())


def set_access_cookie(response: Response, access_token: str) -> None:
    """Replace only the access token, as switching identity does; the refresh token is unchanged."""
    _set(response, access_cookie_name(), access_token, path="/", max_age=_session_max_age())


def clear_session_cookies(response: Response) -> None:
    """Sign the browser out: remove both tokens."""
    _clear(response, access_cookie_name(), path="/")
    _clear(response, refresh_cookie_name(), path="/")


def set_oauth_cookie(response: Response, state: str) -> None:
    """Bind an OAuth sign-in to this browser by its state, for the length of the round trip."""
    _set(response, oauth_cookie_name(), state, path=OAUTH_COOKIE_PATH, max_age=OAUTH_COOKIE_MAX_AGE)


def clear_oauth_cookie(response: Response) -> None:
    """Forget the OAuth sign-in once its callback has been answered, either way."""
    _clear(response, oauth_cookie_name(), path=OAUTH_COOKIE_PATH)


def _read(request: Request, name: str) -> str | None:
    return request.cookies.get(name) or None


def read_access_cookie(request: Request) -> str | None:
    """The access token the browser sent, or None. Another environment's cookie is never read."""
    return _read(request, access_cookie_name())


def read_refresh_cookie(request: Request) -> str | None:
    """The refresh token the browser sent, or None."""
    return _read(request, refresh_cookie_name())


def read_oauth_cookie(request: Request) -> str | None:
    """The OAuth state the browser sent, or None."""
    return _read(request, oauth_cookie_name())
