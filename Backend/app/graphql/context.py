"""GraphQL request context factory and RBAC permission helper (two-checkpoint model, ADR-022)."""

from fastapi import HTTPException, status
from starlette.requests import Request

from app.core.permissions import PUBLIC_PERMS, Perm
from app.core.rbac_scopes import Scope
from app.core.security import get_current_user, get_db
from app.graphql.loaders import build_loaders
from app.models.auth import User
from app.services.authz import require_scope


async def get_context(request: Request):
    """Create per-request GraphQL context with DB session and optional user.

    Reuses security.get_db for session lifecycle and security.get_current_user
    for JWT authentication.

    Errors:
        - Invalid/expired token: raises HTTPException(401) from get_current_user
          with detail "無法驗證憑證"
        - No token: user is None — a Guest (ADR-025): only PUBLIC_PERMS are reachable,
          everything else 403s in check_permission below. Guest is a program-level view,
          never a DB row.
    """
    db_gen = get_db()
    db = await anext(db_gen)
    try:
        auth = request.headers.get("Authorization", "")
        token = auth[7:] if auth.startswith("Bearer ") else ""
        user = None
        if token:
            user = await get_current_user(db=db, token=token)
        yield {"db": db, "user": user, "loaders": build_loaders(db), "_rbac_cache": {}}
    finally:
        await db_gen.aclose()


async def check_permission(info, perm: Perm, resource=None) -> Scope:
    """Two-checkpoint RBAC check (ADR-022).

    GraphQL-specific Guest handling layered on top of `app.services.authz.require_scope`
    (the entrypoint-agnostic version every use-case calls directly).

    An anonymous (Guest) caller only ever holds PUBLIC_PERMS, granted at `Scope.ALL`
    (ADR-025) — there's no `User` row to run checkpoint 2 against, but ALL never needs one
    anyway. Anything else for an anonymous caller is 403 (ADR-023).

    An authenticated caller goes through the full two-checkpoint model; see
    `require_scope`'s docstring for the 403-vs-404 rationale.

    Returns the resolved Scope so read-path callers can also use it for list-level
    filtering without a second lookup.
    """
    user = info.context["user"]
    db = info.context["db"]

    if user is None:
        if perm not in PUBLIC_PERMS:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Permission Denied.")
        return Scope.ALL

    return await require_scope(user, perm, db, resource=resource, cache=info.context["_rbac_cache"])


def require_authenticated(info) -> User:
    """Raise 401 if the caller is anonymous; otherwise return the authenticated User.

    Every write mutation needs an actual actor to hand its use-case (ADR-022's `execute(cmd,
    actor=..., db=...)` contract assumes `actor` is real, never Guest) — this is the
    GraphQL-side equivalent of a REST endpoint's `Depends(get_current_user)`. Same 401
    shape as security.get_current_user's own failure (same status/detail/header), since
    this is really the same check, just reached via "no context user" instead of "bad token".
    """
    user = info.context["user"]
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return user
