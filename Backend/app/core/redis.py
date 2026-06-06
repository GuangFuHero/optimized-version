"""Redis dependency: exposes the shared application Redis client to endpoints."""

from fastapi import Request


def get_redis(request: Request):
    """Return the shared async Redis client created in the app lifespan."""
    return request.app.state.redis
