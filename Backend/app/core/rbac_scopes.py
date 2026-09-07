"""Scope engine (ADR-020/021/049): fixed data-boundary scopes in place of a general ABAC engine.

ADR-049 (乙, pure-geography model): a geo resource's jurisdiction is decided by *where it is*
(does its point fall inside a WorkZone polygon assigned to my team?), never by a stored
owner-org. So there is no `resource.team_uuid` and no `gov`/`ngo` scope. The surviving scopes:

- `own`  — I created it (`created_by`).
- `zone` — its location is inside a WorkZone assigned to my team (`ST_Contains`).
- `all`  — everything.
- `team` — kept ONLY for team-member management (a team admin manages their own team); it
  matches on a `team_uuid` attribute that only the Team-management adaptor supplies, never a
  geo resource (which no longer has that column).

`widest()` implements ADR-018's union merge; `in_scope()` is checkpoint 2 (post-load single
object); `scope_filter()` is the same policy reshaped into a SQL WHERE clause for lists.
"""

from enum import StrEnum

from sqlalchemy import exists, false, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.auth import User
from app.models.team import TeamZoneAssign, WorkZone


class Scope(StrEnum):
    """Data-boundary scope. Ordering (narrowest → widest) is defined by WIDTH below."""

    NONE = "none"
    OWN = "own"
    TEAM = "team"
    ZONE = "zone"
    ALL = "all"


# ADR-021/049 "widest wins": all > zone > team > own > none.
WIDTH: dict[Scope, int] = {
    Scope.NONE: 0,
    Scope.OWN: 1,
    Scope.TEAM: 2,
    Scope.ZONE: 3,
    Scope.ALL: 4,
}


def widest(scopes) -> Scope:
    """Return the widest scope in `scopes` (ADR-018 union merge). Empty → Scope.NONE."""
    result = Scope.NONE
    for s in scopes:
        if WIDTH[s] > WIDTH[result]:
            result = s
    return result


def active_team(actor) -> str | None:
    """The team of the actor's active identity, or None (platform identity / no identity).

    Replaces every former read of `users.team_uuid`, which no longer exists: which team an
    actor speaks for is now a property of the identity they are currently acting as, not of
    their account (ADR-072/074). `getattr` rather than attribute access because a `User`
    loaded outside a request has no identity attached, and that must resolve to None (all
    team and zone scopes false) rather than raise.
    """
    identity = getattr(actor, "active_identity", None)
    return identity.team_uuid if identity else None


async def in_scope(scope: Scope, *, actor: User, resource, db: AsyncSession) -> bool:
    """Checkpoint 2: does `resource` fall within `scope` for `actor`?

    Reads `resource.created_by` / `.team_uuid` / `.geometry` via getattr(..., None) rather
    than direct attribute access: not every scope-checkable resource has all attributes
    (e.g. TicketTask has no geometry) — a missing attribute should cleanly fail that one
    scope, not raise. Callers whose "ownership" concept isn't `created_by` (e.g.
    TaskAssignment, keyed on `actor_uuid`) pass a small adaptor exposing `.created_by`
    instead of the raw model (see app/services/ticket.py `_as_scope_target`).

    `team` survives only for team-member management: geo resources no longer carry a
    `team_uuid` column, so getattr returns None and the TEAM branch cleanly fails for them.
    """
    if scope == Scope.ALL:
        return True

    created_by = getattr(resource, "created_by", None)

    if scope == Scope.OWN:
        return created_by is not None and str(created_by) == str(actor.uuid)

    if scope == Scope.TEAM:
        team_uuid = getattr(resource, "team_uuid", None)
        mine = active_team(actor)
        return team_uuid is not None and mine is not None and str(team_uuid) == str(mine)

    if scope == Scope.ZONE:
        geometry = getattr(resource, "geometry", None)
        mine = active_team(actor)
        if geometry is None or mine is None:
            return False
        count = await db.scalar(
            select(func.count())
            .select_from(WorkZone)
            .join(TeamZoneAssign, TeamZoneAssign.zone_uuid == WorkZone.uuid)
            .where(
                TeamZoneAssign.team_uuid == mine,
                WorkZone.delete_at.is_(None),
                func.ST_Contains(WorkZone.geometry, geometry),
            )
        )
        return bool(count and count > 0)

    return False


def scope_filter(scope: Scope, *, actor: User, model) -> list:
    """List-query counterpart to in_scope() (ADR-028).

    Returns a WHERE-clause list implementing `scope`, instead of a single-object boolean.
    Empty list = no filter (ALL). Never awaits the DB itself — ZONE builds an EXISTS
    subquery left for the caller's query to execute in one round trip.
    """
    if scope == Scope.ALL:
        return []

    if scope == Scope.OWN:
        # Fall back to false() when the model has no created_by column (ADR-053), rather
        # than raising AttributeError — e.g. Team, which carries no ownership column.
        if not actor.uuid or not hasattr(model, "created_by"):
            return [false()]
        return [model.created_by == str(actor.uuid)]

    if scope == Scope.TEAM:
        # A model may declare its own team-scope boundary column (ADR-053); default is
        # team_uuid. Team declares "uuid" because a team IS its own boundary.
        mine = active_team(actor)
        if not mine:
            return [false()]
        attr = getattr(model, "__team_scope_attr__", "team_uuid")
        if not hasattr(model, attr):
            return [false()]
        return [getattr(model, attr) == mine]

    if scope == Scope.ZONE:
        # Fall back to false() when the model has no geometry column (ADR-053), rather than
        # raising AttributeError — e.g. Team, which is non-geographic.
        mine = active_team(actor)
        if not mine or not hasattr(model, "geometry"):
            return [false()]
        my_zones = (
            select(WorkZone.uuid)
            .join(TeamZoneAssign, TeamZoneAssign.zone_uuid == WorkZone.uuid)
            .where(TeamZoneAssign.team_uuid == mine, WorkZone.delete_at.is_(None))
        )
        return [
            exists(
                select(1)
                .select_from(WorkZone)
                .where(WorkZone.uuid.in_(my_zones), func.ST_Contains(WorkZone.geometry, model.geometry))
            )
        ]

    # Scope.NONE — defensive only; checkpoint 1 should already have 403'd before this.
    return [false()]
