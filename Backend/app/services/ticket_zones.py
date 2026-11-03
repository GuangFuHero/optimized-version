"""組織分配: which team's 責任區 a ticket lies in, as `responsibleTeams` reads it (ADR-422).

Tickets carry no team of their own; a ticket is a team's when its point lies in a live zone of that
live team. The board (`tickets` and its siblings in GraphQL) and the ticket export (#285) both filter
by it, from here, so the two cannot disagree about which tickets a team has.
"""

from uuid import UUID

from sqlalchemy import and_, false, func, select
from sqlalchemy.orm import aliased

from app.models.geo import BaseGeometry
from app.models.request import Tickets
from app.models.team import Team, TeamZone, TeamZoneAssign

TEAM_AND_UNASSIGNED = "responsibleTeamUuid and unassignedOnly cannot be combined"


def tickets_in_zones():
    """The points lying in a live 責任區 of a live team, as `responsibleTeams` reads them, by uuid.

    Run zone first, so each zone finds its points in the spatial index: correlated on the ticket
    instead (EXISTS per row), every ticket was tested against every zone, which took seconds at
    20,000 tickets. Narrow it by `TeamZoneAssign.team_uuid`. The zone is aliased flat: zones and
    tickets share base_geometries. The uuid is base_geometries' key, so `NOT IN` never meets a NULL.
    """
    zone = aliased(TeamZone, flat=True)
    point = aliased(BaseGeometry)
    return (
        select(point.uuid)
        .select_from(TeamZoneAssign)
        .join(Team, Team.uuid == TeamZoneAssign.team_uuid)
        .join(zone, zone.uuid == TeamZoneAssign.zone_uuid)
        .join(point, func.ST_Contains(zone.geometry, point.geometry))
        .where(zone.delete_at.is_(None), Team.delete_at.is_(None))
    )


def responsible_team_conditions(*, responsible_team_uuid: UUID | None, unassigned_only: bool) -> list:
    """The 組織分配 filter as conditions on Tickets: one team's tickets, or those in nobody's zone.

    Read from the exact point, so the caller adds the detail guard (`detail_guarded`). A team with
    未指派 is refused (ValueError) rather than read some way.
    """
    if responsible_team_uuid is not None and unassigned_only:
        raise ValueError(TEAM_AND_UNASSIGNED)
    if responsible_team_uuid is not None:
        return [Tickets.uuid.in_(tickets_in_zones().where(TeamZoneAssign.team_uuid == responsible_team_uuid))]
    if unassigned_only:
        return [Tickets.uuid.not_in(tickets_in_zones())]
    return []


def detail_guarded(conditions: list, detail_filters: list) -> list:
    """`conditions` read from a ticket's detail, matching only rows the caller sees in detail (ADR-281).

    `detail_filters` is `scope_filter` of the caller's ticket.view_detail: [] for every row, [false()]
    for none. On a row shown as a cell they would tell what the cell withholds.
    """
    if not conditions:
        return []
    guard = [func.coalesce(and_(*detail_filters), false())] if detail_filters else []
    return guard + conditions
