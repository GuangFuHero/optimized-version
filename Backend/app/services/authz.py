"""Shared two-checkpoint authorization helper for the use-case layer (ADR-013/022).

GraphQL resolvers go through `app.graphql.context.check_permission`, which layers Guest
(anonymous) handling on top of this. Every use-case in `app/services/`, and any future
non-GraphQL entrypoint (REST, AI, batch), calls `require_scope` directly with an
already-authenticated actor — this is the "one flow shared by every entrypoint" ADR-013
asks for.
"""

from contextlib import asynccontextmanager

from fastapi import HTTPException, status
from sqlalchemy import inspect, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.permissions import PUBLIC_PERMS, Perm
from app.core.rbac_scopes import Scope, active_team, in_scope
from app.core.security import resolve_scope
from app.models.auth import User
from app.models.team import Team


async def require_scope(
    actor: User, perm: Perm, db: AsyncSession, *, resource=None, cache: dict | None = None
) -> Scope:
    """Checkpoint 1 (capability), then checkpoint 2 (object scope) when `resource` is given.

    A capability in `PUBLIC_PERMS` is `Scope.ALL` for every actor and never consults the
    grant matrix (ADR-025/259/273): the whole world already reads it without an account, so
    a grant could only ever make a logged-in caller see *less* than an anonymous one. This
    lives here, not in the GraphQL layer, so both entrypoints agree — `check_permission`
    only adds the Guest case on top, because an anonymous caller has no `User` row to pass.

    Passing `resource` with a public capability is a contradiction (nothing to narrow) and
    raises, rather than silently skipping checkpoint 2.

    Status-code rationale (ADR-023): a plain `own` mismatch is an ownership check, not a
    team-boundary one, so it 403s same as always. `team`/`gov`/`ngo`/`zone` mismatches 404
    instead — those partition data across organizational boundaries, and a 403 would
    confirm a cross-boundary resource exists at all.
    """
    if perm in PUBLIC_PERMS:
        if resource is not None:
            raise ValueError(
                f"{perm.value} is in PUBLIC_PERMS; object scoping it has no meaning"
            )
        return Scope.ALL

    scope = await resolve_scope(actor, perm, db, cache=cache)
    if scope == Scope.NONE:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Permission Denied.")

    needs_checkpoint_2 = resource is not None and scope != Scope.ALL
    if needs_checkpoint_2 and not await in_scope(scope, actor=actor, resource=resource, db=db):
        if scope == Scope.OWN:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Permission Denied.")
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not Found.")

    return scope


async def require_gov_team(db: AsyncSession, actor: User, *, detail: str) -> None:
    """Fence a GOV_TEAM_ONLY_PERMS capability to gov teams and platform identities (ADR-064).

    Checkpoint 1 has already confirmed the capability. The seed gives it to every team admin,
    gov and ngo alike, because they share one `admin` role; this is where the ngo half is
    turned away. A platform identity (super_admin, no team) passes, as the rule was never
    aimed at it.

    The gov team must also be active: a suspended or inactive one cannot be handed a zone or a
    station, so it does not get to hand them out either.
    """
    mine = active_team(actor)
    if mine is None:
        return
    team = await db.scalar(select(Team).where(Team.uuid == mine, Team.delete_at.is_(None)))
    if team is None or team.type != "gov" or team.status != "active":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=detail)


async def refresh_actor(db: AsyncSession, actor: User) -> None:
    """Reload `actor` if a commit or rollback expired it.

    Async SQLAlchemy cannot lazily reload an expired attribute, so an expired actor is a
    MissingGreenlet waiting for the next `require_scope`. Both callers are operations that
    authorize per row: `stable_actor` on the way in, and the rollback path of a bulk import.
    """
    if inspect(actor).expired:
        await db.refresh(actor)


@asynccontextmanager
async def stable_actor(db: AsyncSession, actor: User):
    """Keep `actor` usable for authorization across an operation that commits many times.

    `require_scope` reads the actor's own columns on every call. A commit expires every
    loaded object by default, so the next call would try to lazily reload the actor — which
    async SQLAlchemy cannot do, and raises MissingGreenlet instead. A single request/response
    never notices, because it authorizes once; an operation that authorizes per row does.

    Suspends expiry for the block (restored afterwards) and reloads an actor some earlier
    commit already expired. Callers must not re-read a row they wrote inside the block, which
    is the only thing the suspension would hide.
    """
    await refresh_actor(db, actor)
    sync_session = db.sync_session
    was_expiring = sync_session.expire_on_commit
    sync_session.expire_on_commit = False
    try:
        yield
    finally:
        sync_session.expire_on_commit = was_expiring
