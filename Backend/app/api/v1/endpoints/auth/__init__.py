"""Authentication endpoints package: assembles the sub-routers into one auth router."""

from fastapi import APIRouter

from . import browser_session, contacts, oauth, password, register, session, sso

router = APIRouter()
for _m in (register, session, browser_session, oauth, sso, password, contacts):
    router.include_router(_m.router)
