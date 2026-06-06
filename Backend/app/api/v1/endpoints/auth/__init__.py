"""Authentication endpoints package: assembles the sub-routers into one auth router."""

from fastapi import APIRouter

from . import contacts, password, register, session, sso

router = APIRouter()
for _m in (register, session, sso, password, contacts):
    router.include_router(_m.router)
