"""Drive the backend's OAuth sign-in from a test, for any provider (ADR-331).

A test starts a sign-in, reads off the query the browser is sent to the provider with, has the (faked)
provider vouch for someone with the right nonce, and comes back to the callback, carrying the `{p}_oauth`
cookie the way a browser would (`tests/cookies.py`).
"""

from urllib.parse import parse_qsl, urlsplit

from app.core import auth_cookies
from app.core.config import settings
from tests.cookies import cookie_header, cookies_set_by

SITE = "https://site.test"
ADMIN = "https://admin.site.test"
FROM_OUR_PAGE = {"Referer": f"{SITE}/login"}
CODE = "the-one-time-code"


def configure_apps(monkeypatch) -> None:
    """The two apps on hosts of their own, both allowed to start a sign-in, whatever the environment says."""
    monkeypatch.setattr(settings, "SITE_APP_URL", SITE)
    monkeypatch.setattr(settings, "ADMIN_APP_URL", ADMIN)
    monkeypatch.setattr(settings, "OAUTH_REDIRECT_BASE_URL", SITE)
    monkeypatch.setattr(settings, "AUTH_ALLOWED_ORIGINS", f"{SITE},{ADMIN}")


def oauth_cookie_name() -> str:
    """`{p}_oauth`, as the settings name it now."""
    return auth_cookies.oauth_cookie_name()


async def start(
    client,
    provider: str,
    *,
    app: str | None = "site",
    return_to: str | None = "/tickets",
    headers: dict | None = None,
):
    """Start a sign-in with `provider`, as a click on one of our pages would; None leaves a parameter out.

    `headers` default to a `Referer` from the site's sign-in page.
    """
    params = {name: value for name, value in (("app", app), ("return_to", return_to)) if value is not None}
    sent = FROM_OUR_PAGE if headers is None else headers
    return await client.get(f"/api/v1/auth/oauth/{provider}/start", params=params, headers=sent)


def sent_to(response, authorize_url: str) -> dict[str, str]:
    """Assert the browser is sent to the provider's sign-in page, and return the query it is sent with."""
    assert response.status_code == 302, response.text
    location = urlsplit(response.headers["location"])
    assert f"{location.scheme}://{location.netloc}{location.path}" == authorize_url
    return dict(parse_qsl(location.query))


def oauth_cookie(response) -> str:
    """The state a start bound to the browser."""
    return cookies_set_by(response)[oauth_cookie_name()]["value"]


async def callback(client, provider: str, state: str | None, *, cookie: str | None, **params):
    """Come back from the provider with `state` and the one-time code; None leaves a parameter out."""
    query = {"code": CODE, "state": state, **params}
    headers = cookie_header(**{oauth_cookie_name(): cookie}) if cookie is not None else {}
    return await client.get(
        f"/api/v1/auth/oauth/{provider}/callback",
        params={name: value for name, value in query.items() if value is not None},
        headers=headers,
    )


def signed_in(response, location: str = f"{SITE}/tickets") -> None:
    """Assert a callback sends the browser on to `location` signed in: where `start` began, by default."""
    assert response.status_code == 302, response.text
    assert response.headers["location"] == location
    assert auth_cookies.access_cookie_name() in cookies_set_by(response)


def sent_back_with(response, error: str, app_url: str = SITE) -> None:
    """Assert a callback sends the browser to the app's sign-in page with `error`, its OAuth cookie gone."""
    assert response.status_code == 302, response.text
    assert response.headers["location"] == f"{app_url}/login?error={error}"
    cleared = cookies_set_by(response)[oauth_cookie_name()]
    assert (cleared["max-age"], cleared["path"]) == ("0", "/api/v1/auth/oauth")


def not_this_browsers(response) -> None:
    """Assert a callback this browser did not start goes to the site's sign-in page, its OAuth cookie kept.

    A link from another site can bring the cookie along; clearing it would end a sign-in in another tab.
    """
    assert response.status_code == 302, response.text
    assert response.headers["location"] == f"{SITE}/login?error=oauth_state_invalid"
    assert cookies_set_by(response) == {}


def start_refused(response, error: str, app_url: str = SITE) -> None:
    """Assert a start is refused to the app's sign-in page, leaving any sign-in in progress alone."""
    assert response.status_code == 302, response.text
    assert response.headers["location"] == f"{app_url}/login?error={error}"
    assert cookies_set_by(response) == {}
