"""Keep the secrets in an OAuth URL out of uvicorn's access log (ADR-331).

uvicorn writes every request line in full, query string included. For the OAuth endpoints that query
carries the provider's one-time `code` and the `state` that binds it to a browser, which must not sit in a
log any more than a password would. The rest of a request line stays as it was.
"""

import logging

OAUTH_PATH_PREFIX = "/api/v1/auth/oauth/"
# The position of the path-with-query among uvicorn's access-log arguments:
# (client address, method, path with query, HTTP version, status).
_PATH_ARG = 2


class OAuthQueryRedactor(logging.Filter):
    """Replaces the query of an OAuth request with `?…` in an access-log record; never drops one."""

    def filter(self, record: logging.LogRecord) -> bool:
        """Rewrite the record's path argument in place when it is an OAuth URL with a query."""
        args = record.args
        if isinstance(args, tuple) and len(args) > _PATH_ARG:
            path = args[_PATH_ARG]
            if isinstance(path, str) and path.startswith(OAUTH_PATH_PREFIX) and "?" in path:
                redacted = path.split("?", 1)[0] + "?…"
                record.args = (*args[:_PATH_ARG], redacted, *args[_PATH_ARG + 1 :])
        return True
