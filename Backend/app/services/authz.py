"""Shared two-checkpoint authorization helper for the use-case layer (ADR-013/022).

GraphQL resolvers go through `app.graphql.context.check_permission`, which layers Guest
(anonymous) handling on top of this. Every use-case in `app/services/`, and any future
non-GraphQL entrypoint (REST, AI, batch), calls `require_scope` directly with an
already-authenticated actor — this is the "one flow shared by every entrypoint" ADR-013
asks for.
"""

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.permissions import Perm
from app.core.rbac_scopes import Scope, in_scope
from app.core.security import resolve_scope
from app.models.auth import User


async def require_scope(
    actor: User, perm: Perm, db: AsyncSession, *, resource=None, cache: dict | None = None
) -> Scope:
    """Checkpoint 1 (capability), then checkpoint 2 (object scope) when `resource` is given.

    Status-code rationale (ADR-023): a plain `own` mismatch is an ownership check, not a
    team-boundary one, so it 403s same as always. `team`/`gov`/`ngo`/`zone` mismatches 404
    instead — those partition data across organizational boundaries, and a 403 would
    confirm a cross-boundary resource exists at all.
    """
    scope = await resolve_scope(actor, perm, db, cache=cache)
    if scope == Scope.NONE:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Permission Denied.")

    needs_checkpoint_2 = resource is not None and scope != Scope.ALL
    if needs_checkpoint_2 and not await in_scope(scope, actor=actor, resource=resource, db=db):
        if scope == Scope.OWN:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Permission Denied.")
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not Found.")

    return scope
