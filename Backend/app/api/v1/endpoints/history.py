"""Change-timeline REST endpoints (feature 016, ADR-138).

REST rather than a GraphQL field on the ticket/station type. Nested, `tickets(limit: 50) {
history }` would also be a legal query — fifty aggregations in one request — and batching an
aggregation through a DataLoader is considerably more work than the nesting is worth. A
top-level read cannot be fanned out that way by construction.

Read-only: nothing in this module or the service behind it writes.
"""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.endpoints.auth.deps import get_rate_limiter
from app.core import security
from app.models.auth import User
from app.schemas.history import HistoryMeta, HistoryResponse, PublicHistoryResponse
from app.services import history, history_public

router = APIRouter()

# The public timeline needs no sign-in and replays the ticket's whole audit trail, so it is metered
# per caller. Far above what one person opening tickets reaches.
PUBLIC_TIMELINE_PER_MINUTE = 60


async def _timeline(
    db: AsyncSession, *, actor: User, entity: str, uuid: UUID, limit: int, offset: int
) -> HistoryResponse:
    """Shared body — the two endpoints differ only in which entity they name."""
    try:
        result = await history.load_timeline(
            db, actor=actor, entity=entity, uuid=str(uuid), limit=limit, offset=offset
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc

    return HistoryResponse(
        data=result.events,
        meta=HistoryMeta(
            total=result.total, truncated=result.truncated, limit=limit, offset=offset
        ),
    )


@router.get(
    "/tickets/{uuid}",
    response_model=HistoryResponse,
    summary="求助單的異動時間軸",
    responses={
        403: {"description": "Permission Denied（未持有 ticket.view_history，或 own 不符）"},
        404: {"description": "Not Found（不存在，或 zone 不符 — ADR-023）"},
    },
)
async def ticket_history(
    uuid: UUID,
    limit: int = Query(50, ge=1, le=history.MAX_PAGE),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(security.get_db),
    current_user: User = Depends(security.get_current_user),
):
    """Who created, edited and staffed this help request, newest first.

    Covers the ticket itself, its address, its tasks, their dynamic fields and their
    assignments — including assignments that were later cancelled, which no longer exist in
    `task_assignments` at all (ADR-132).
    """
    return await _timeline(
        db, actor=current_user, entity=history.TICKET, uuid=uuid, limit=limit, offset=offset
    )


@router.get(
    "/tickets/{uuid}/public",
    response_model=PublicHistoryResponse,
    summary="求助單的公開時間軸",
    responses={
        404: {"description": "Not Found（不存在或已刪除）"},
        429: {"description": "rate_limited"},
    },
    dependencies=[Depends(get_rate_limiter(PUBLIC_TIMELINE_PER_MINUTE, 60))],
)
async def ticket_public_history(
    uuid: UUID,
    limit: int = Query(50, ge=1, le=history.MAX_PAGE),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(security.get_db),
):
    """What happened to this help request, newest first, without anyone's name (ADR-421).

    No sign-in: the board is public (ADR-027), and what this tells is the same to everyone. Who
    claimed a need is a count, who acted is a role, and contact details are left out.
    """
    try:
        result = await history_public.load_public_timeline(db, uuid=str(uuid), limit=limit, offset=offset)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc

    return PublicHistoryResponse(
        data=result.events,
        meta=HistoryMeta(total=result.total, truncated=result.truncated, limit=limit, offset=offset),
    )


@router.get(
    "/stations/{uuid}",
    response_model=HistoryResponse,
    summary="資源站點的異動時間軸",
    responses={
        403: {"description": "Permission Denied（未持有 station.view_history，或 own 不符）"},
        404: {"description": "Not Found（不存在，或 zone 不符 — ADR-023）"},
    },
)
async def station_history(
    uuid: UUID,
    limit: int = Query(50, ge=1, le=history.MAX_PAGE),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(security.get_db),
    current_user: User = Depends(security.get_current_user),
):
    """Who created and edited this station, and how its stock levels moved, newest first."""
    return await _timeline(
        db, actor=current_user, entity=history.STATION, uuid=uuid, limit=limit, offset=offset
    )
