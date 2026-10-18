"""The sign-in cookies the backend sets for the browser (ADR-326).

One sign-in has to reach both the site and the back office, which sit on sibling hosts, while
production, staging and a developer's machine must never read each other's cookies. Everything
below is a consequence of those two needs: a per-environment prefix on every name, a parent
domain, and attributes that keep the tokens away from page scripts and from other sites.
"""

import pytest
from starlette.requests import Request
from starlette.responses import Response

from app.core import auth_cookies
from app.core.config import Settings, settings
from tests.cookies import cookies_set_by

# Staging's attributes, which every one of its sign-in cookies is both set and cleared with.
STAGING = {"domain": ".wan-guard.com", "secure": True, "httponly": True, "samesite": "lax"}
# A session lifetime other than the default, so the tests show Max-Age follows the setting.
SESSION_DAYS = 7


@pytest.fixture
def staging(monkeypatch):
    """Staging's settings: its own prefix, the parent domain of both of its hosts, HTTPS."""
    monkeypatch.setattr(settings, "AUTH_COOKIE_PREFIX", "wgstg")
    monkeypatch.setattr(settings, "AUTH_COOKIE_DOMAIN", ".wan-guard.com")
    monkeypatch.setattr(settings, "AUTH_COOKIE_SECURE", True)
    monkeypatch.setattr(settings, "REFRESH_TOKEN_EXPIRE_DAYS", SESSION_DAYS)


def test_signing_in_sets_both_tokens_for_every_host_of_the_environment(staging):
    """Both cookies reach every path of both hosts, live as long as the session, and stay out of JS."""
    response = Response()

    auth_cookies.set_session_cookies(response, "access.jwt", "refresh-raw")

    cookies = cookies_set_by(response)
    expected = {"path": "/", "max-age": str(SESSION_DAYS * 86400), **STAGING}
    assert cookies["wgstg_at"] == {"value": "access.jwt", **expected}
    assert cookies["wgstg_rt"] == {"value": "refresh-raw", **expected}
    assert set(cookies) == {"wgstg_at", "wgstg_rt"}


def test_a_developer_machine_keeps_the_cookies_on_one_host_over_plain_http(monkeypatch):
    """No domain sends no Domain attribute (localhost keeps them), and `Secure` can be switched off."""
    monkeypatch.setattr(settings, "AUTH_COOKIE_PREFIX", "wgdev")
    monkeypatch.setattr(settings, "AUTH_COOKIE_DOMAIN", "")
    monkeypatch.setattr(settings, "AUTH_COOKIE_SECURE", False)
    response = Response()

    auth_cookies.set_session_cookies(response, "access.jwt", "refresh-raw")

    cookies = cookies_set_by(response)
    assert set(cookies) == {"wgdev_at", "wgdev_rt"}
    for cookie in cookies.values():
        assert "domain" not in cookie
        assert "secure" not in cookie
        assert cookie["httponly"] is True


def test_switching_identity_replaces_only_the_access_token(staging):
    """A switch signs a new access token; the refresh token it does not rotate stays as it was."""
    response = Response()

    auth_cookies.set_access_cookie(response, "switched.jwt")

    cookies = cookies_set_by(response)
    assert cookies == {
        "wgstg_at": {"value": "switched.jwt", "path": "/", "max-age": str(SESSION_DAYS * 86400), **STAGING}
    }


def test_signing_out_clears_both_tokens_where_they_were_set(staging):
    """A browser only drops a cookie told to go under the same name, path and domain it was set with."""
    response = Response()

    auth_cookies.clear_session_cookies(response)

    cookies = cookies_set_by(response)
    assert set(cookies) == {"wgstg_at", "wgstg_rt"}
    for cookie in cookies.values():
        assert cookie["value"] == ""
        assert (cookie["path"], cookie["max-age"]) == ("/", "0")
        assert {key: cookie[key] for key in STAGING} == STAGING


def test_an_oauth_sign_in_is_bound_to_the_browser_only_for_the_round_trip(staging):
    """The state cookie goes nowhere but the OAuth endpoints, and lasts ten minutes."""
    started, finished = Response(), Response()

    auth_cookies.set_oauth_cookie(started, "the-state")
    auth_cookies.clear_oauth_cookie(finished)

    set_line = cookies_set_by(started)["wgstg_oauth"]
    clear_line = cookies_set_by(finished)["wgstg_oauth"]
    assert set_line == {"value": "the-state", "path": "/api/v1/auth/oauth", "max-age": "600", **STAGING}
    assert (clear_line["path"], clear_line["max-age"]) == ("/api/v1/auth/oauth", "0")
    assert {key: clear_line[key] for key in STAGING} == STAGING


def test_only_this_environments_cookies_are_read(staging):
    """Production's cookies reach staging's hosts too, both being on `.wan-guard.com`; they are ignored."""
    request = Request(
        {
            "type": "http",
            "headers": [(b"cookie", b"wg_at=production; wg_rt=production; wgstg_at=staging; wgstg_oauth=s")],
        }
    )

    assert auth_cookies.read_access_cookie(request) == "staging"
    assert auth_cookies.read_refresh_cookie(request) is None
    assert auth_cookies.read_oauth_cookie(request) == "s"


def test_an_empty_cookie_reads_as_none(staging):
    """A cleared cookie a browser still sends with no value is no token at all."""
    request = Request({"type": "http", "headers": [(b"cookie", b"wgstg_at=")]})

    assert auth_cookies.read_access_cookie(request) is None


@pytest.mark.parametrize(
    ("configured", "expected"),
    [
        (
            "https://staging.wan-guard.com,https://admin-staging.wan-guard.com",
            {"https://staging.wan-guard.com", "https://admin-staging.wan-guard.com"},
        ),
        (
            " https://Admin.Wan-Guard.com/ , ,https://wan-guard.com ",
            {"https://admin.wan-guard.com", "https://wan-guard.com"},
        ),
        # A stray slash must not leave an empty origin for a request without one to match.
        ("https://a.example,/,https://b.example", {"https://a.example", "https://b.example"}),
        ("", set()),
    ],
)
def test_the_origin_allowlist_is_read_the_way_browsers_send_origin(configured, expected):
    """Comma-separated, as an env file holds it; case and a trailing slash do not matter."""
    assert Settings(AUTH_ALLOWED_ORIGINS=configured).allowed_origins == expected
