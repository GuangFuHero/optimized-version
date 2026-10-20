"""GraphQL request context factory and RBAC permission helper (two-checkpoint model, ADR-022)."""

from fastapi import HTTPException, status
from starlette.requests import Request

from app.core.permissions import PUBLIC_PERMS, Perm
from app.core.rbac_scopes import Scope
from app.core.request_auth import accept_access_token
from app.core.security import REALM_HEADER, get_current_user, get_db
from app.graphql.loaders import build_loaders
from app.models.auth import User
from app.services.authz import require_scope


async def get_context(request: Request):
    """Create per-request GraphQL context with DB session and optional user.

    Reuses security.get_db for session lifecycle and security.get_current_user
    for JWT authentication.

    Errors:
        - Invalid/expired token: raises ApiError(401) from get_current_user, whose `code` says
          whether refreshing will help (ADR-328). It is raised here, in a dependency, so it
          answers as an HTTP 401 like REST — not as a GraphQL error inside a 200.
        - No token: user is None — a Guest (ADR-025): only PUBLIC_PERMS are reachable,
          everything else 403s in check_permission below. Guest is a program-level view,
          never a DB row.
        - Token from the access cookie on a POST, without an allowed Origin: ApiError(403) from
          `accept_access_token` (ADR-327). That covers every mutation and every query sent as a
          POST. A query sent as a GET only reads, and passes without an Origin like any other
          GET; mutations over GET are refused by Strawberry itself.
    """
    db_gen = get_db()
    db = await anext(db_gen)
    try:
        # graphql-core resolves sibling root fields concurrently, and they all share this
        # one AsyncSession. The session must have already acquired its connection before
        # any resolver runs, or two sibling resolvers race to provision it and SQLAlchemy
        # raises "This session is provisioning a new connection; concurrent operations are
        # not permitted" on the second one. Below, the auth lookup incidentally warms the
        # connection for authenticated callers (it issues a query), but anonymous callers
        # skip that path entirely — so without this explicit warm-up, any anonymous query
        # selecting 2+ root fields fails. Do this unconditionally so both paths are
        # equally warmed and this doesn't silently regress if the auth lookup ever changes.
        await db.connection()
        # The same rule as every REST endpoint: Bearer first, else the access cookie (ADR-327).
        token = accept_access_token(request)
        user = None
        if token:
            # redis comes from app.state because this path bypasses FastAPI's dependency
            # injection — get_current_user needs it to check the token's session (ADR-102).
            # For the same reason the realm header, site's or back office's, is handed over here
            # (ADR-289, ADR-329).
            user = await get_current_user(
                db=db,
                token=token,
                redis=request.app.state.redis,
                realm=request.headers.get(REALM_HEADER),
            )
        yield {
            "db": db,
            "user": user,
            "loaders": build_loaders(db),
            "_rbac_cache": {},
            # ticket uuid -> Task[bool]; see app/graphql/tickets/types.py:ticket_detail_visible.
            "_ticket_detail_visible": {},
            # Same, for ticket.view_history; see ticket_history_visible beside it.
            "_ticket_history_visible": {},
            # Same, for ticket.audit; see ticket_audit_visible.
            "_ticket_audit_visible": {},
        }
    finally:
        await db_gen.aclose()


async def check_permission(info, perm: Perm, resource=None) -> Scope:
    """Two-checkpoint RBAC check (ADR-022).

    GraphQL-specific Guest handling layered on top of `app.services.authz.require_scope`
    (the entrypoint-agnostic version every use-case calls directly).

    All this adds is the Guest case: an anonymous caller has no `User` row, so it cannot be
    passed to `require_scope` at all. A PUBLIC_PERM is `Scope.ALL` for it; anything else is
    a flat 403, because there is nothing to run checkpoint 2 against (ADR-023).

    Authenticated callers go straight to `require_scope`, which owns the public-capability
    rule for every entrypoint (ADR-273) — duplicating it here is what made GraphQL and the
    service layer disagree. See `require_scope`'s docstring for the 403-vs-404 rationale.

    Returns the resolved Scope so read-path callers can also use it for list-level
    filtering without a second lookup.
    """
    user = info.context["user"]
    db = info.context["db"]

    if user is None:
        if perm in PUBLIC_PERMS:
            return Scope.ALL
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Permission Denied.")

    return await require_scope(user, perm, db, resource=resource, cache=info.context["_rbac_cache"])


def require_authenticated(info) -> User:
    """Raise 401 if the caller is anonymous; otherwise return the authenticated User.

    Every write mutation needs an actual actor to hand its use-case (ADR-022's `execute(cmd,
    actor=..., db=...)` contract assumes `actor` is real, never Guest) — this is the
    GraphQL-side equivalent of a REST endpoint's `Depends(get_current_user)`, built with the
    same detail and header as security.get_current_user's own failure. It carries no `code`,
    and the client never sees it as an HTTP 401: raised inside a resolver, it reaches the
    client as a GraphQL error inside a 200 ("401: …"). That is right for a guest, who holds
    no token a refresh could fix (ADR-328).
    """
    user = info.context["user"]
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return user
