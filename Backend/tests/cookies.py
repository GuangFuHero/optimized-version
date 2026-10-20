"""Read the cookies a response sets, and send cookies the way a browser would (ADR-326).

Tests go through these rather than through httpx's cookie jar. The test client talks to
`http://test`, and the sign-in cookies are `Secure` by default, so the jar would neither store
them nor send them back: a test relying on it would quietly run without any cookies at all.
"""


def _set_cookie_lines(response) -> list[str]:
    """Every `Set-Cookie` line, from an httpx response or a Starlette one."""
    headers = response.headers
    get_list = getattr(headers, "get_list", None) or headers.getlist
    return get_list("set-cookie")


def cookies_set_by(response) -> dict[str, dict]:
    """The cookies a response sets, by name: `{"value": …, "<attribute>": …}`.

    Attribute names are lower-cased (`path`, `domain`, `max-age`, `samesite`); flags with no value
    (`httponly`, `secure`) are `True`. A cookie set twice keeps its last line.
    """
    cookies = {}
    for line in _set_cookie_lines(response):
        pair, *attributes = (part.strip() for part in line.split(";"))
        name, _, value = pair.partition("=")
        cookie = {"value": value.strip('"')}
        for attribute in attributes:
            key, has_value, attribute_value = attribute.partition("=")
            cookie[key.strip().lower()] = attribute_value.strip() if has_value else True
        cookies[name] = cookie
    return cookies


def cookie_header(**cookies: str) -> dict[str, str]:
    """A `Cookie` request header carrying these cookies, as a browser would send them."""
    return {"Cookie": "; ".join(f"{name}={value}" for name, value in cookies.items())}
