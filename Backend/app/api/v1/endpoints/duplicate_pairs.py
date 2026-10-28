"""Back-office AI 重複審核: list the duplicate pair cards, read, decide, revoke or resolve one.

Spec 025 §2 (ADR-338) for the queue and verdicts; Spec 028 for the whole tickets on the detail and
the resolve. Mounted under /admin like role-requests. Endpoints stay thin (ADR-014): the capability
checks (`ai_duplicate.view` / `review` / `revoke`) and every rule live in the services
(`dedup_review`, `dedup_resolve`).
"""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import security
from app.models.auth import User
from app.schemas.duplicate_pair import (
    DedupEventResponse,
    DuplicatePairDecision,
    DuplicatePairDetail,
    DuplicatePairPage,
    DuplicatePairResponse,
    EntityKind,
    EntitySummaryResponse,
    PairSort,
    PairStatus,
    ResolveRequest,
    SourceLayer,
    TicketForReviewResponse,
    TicketsForReviewResponse,
)
from app.services import dedup_resolve, dedup_review
from app.services.dedup_review import DuplicatePairConflictError, DuplicatePairNotFoundError, PairItem

router = APIRouter()


def _response(item: PairItem) -> dict:
    """A card's fields plus its two sides, ready for either response model."""
    pair = item.pair
    return {
        "uuid": pair.uuid,
        "entity_kind": pair.entity_kind,
        "status": pair.status,
        "similarity": float(pair.similarity) if pair.similarity is not None else None,
        "evidence": pair.evidence,
        "method": pair.method,
        "engine_version": pair.engine_version,
        "source_layer": pair.source_layer,
        "duplicate_group_uuid": pair.duplicate_group_uuid,
        "hint_outcome": pair.hint_outcome,
        "created_at": pair.created_at,
        "reviewed_by": pair.reviewed_by,
        "reviewed_at": pair.reviewed_at,
        "low": EntitySummaryResponse.model_validate(item.low),
        "high": EntitySummaryResponse.model_validate(item.high),
    }


def _detail(detail) -> DuplicatePairDetail:
    """A card with its events and whole tickets, as the detail and a resolve answer it."""
    return DuplicatePairDetail(
        **_response(detail.item),
        events=[DedupEventResponse.model_validate(event) for event in detail.events],
        tickets=_tickets(detail.tickets),
    )


def _tickets(tickets) -> TicketsForReviewResponse | None:
    """Both sides' whole tickets (Spec 028 §2), or None for a station card."""
    if tickets is None:
        return None
    low, high = (TicketForReviewResponse.model_validate(t) if t is not None else None for t in tickets)
    return TicketsForReviewResponse(low=low, high=high)


def _refusal(err: ValueError) -> HTTPException:
    """404 for a missing card, 409 for one not in the state the action needs, else 422."""
    if isinstance(err, DuplicatePairNotFoundError):
        return HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(err))
    if isinstance(err, DuplicatePairConflictError):
        return HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(err))
    return HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail=str(err))


@router.get("/duplicate-pairs", response_model=DuplicatePairPage)
async def list_duplicate_pairs(
    status_filter: list[PairStatus] | None = Query(None, alias="status"),
    entity_kind: list[EntityKind] | None = Query(None),
    source_layer: list[SourceLayer] | None = Query(None),
    sort: PairSort = dedup_review.DEFAULT_SORT,
    skip: int = Query(0, ge=0),
    limit: int = Query(dedup_review.DEFAULT_LIMIT, ge=1, le=dedup_review.MAX_LIMIT),
    db: AsyncSession = Depends(security.get_db),
    current_user: User = Depends(security.get_current_user),
):
    """Pending cards by default (ADR-339), newest first, each with both sides (ADR-340)."""
    try:
        page = await dedup_review.list_pairs(
            db,
            actor=current_user,
            statuses=status_filter,
            entity_kinds=entity_kind,
            source_layers=source_layer,
            sort=sort,
            skip=skip,
            limit=limit,
        )
    except ValueError as err:
        raise _refusal(err) from err
    return DuplicatePairPage(
        items=[DuplicatePairResponse(**_response(i)) for i in page.items], total=page.total
    )


@router.get("/duplicate-pairs/{pair_uuid}", response_model=DuplicatePairDetail)
async def get_duplicate_pair(
    pair_uuid: UUID,
    db: AsyncSession = Depends(security.get_db),
    current_user: User = Depends(security.get_current_user),
):
    """One card, its sides, its events (oldest first) and its two whole tickets."""
    try:
        detail = await dedup_review.get_pair(db, actor=current_user, pair_uuid=pair_uuid)
    except ValueError as err:
        raise _refusal(err) from err
    return _detail(detail)


@router.post("/duplicate-pairs/{pair_uuid}/confirm", response_model=DuplicatePairResponse)
async def confirm_duplicate_pair(
    pair_uuid: UUID,
    body: DuplicatePairDecision | None = None,
    db: AsyncSession = Depends(security.get_db),
    current_user: User = Depends(security.get_current_user),
):
    """Mark a pending card a duplicate (ADR-341: only the card changes)."""
    try:
        item = await dedup_review.confirm(
            db, actor=current_user, pair_uuid=pair_uuid, note=body.note if body else None
        )
    except ValueError as err:
        raise _refusal(err) from err
    return DuplicatePairResponse(**_response(item))


@router.post("/duplicate-pairs/{pair_uuid}/reject", response_model=DuplicatePairResponse)
async def reject_duplicate_pair(
    pair_uuid: UUID,
    body: DuplicatePairDecision | None = None,
    db: AsyncSession = Depends(security.get_db),
    current_user: User = Depends(security.get_current_user),
):
    """Mark a pending card not a duplicate (ADR-341: only the card changes)."""
    try:
        item = await dedup_review.reject(
            db, actor=current_user, pair_uuid=pair_uuid, note=body.note if body else None
        )
    except ValueError as err:
        raise _refusal(err) from err
    return DuplicatePairResponse(**_response(item))


@router.post("/duplicate-pairs/{pair_uuid}/revoke", response_model=DuplicatePairResponse)
async def revoke_duplicate_pair_verdict(
    pair_uuid: UUID,
    db: AsyncSession = Depends(security.get_db),
    current_user: User = Depends(security.get_current_user),
):
    """Undo a card's verdict, back to the queue; someone else's needs ai_duplicate.revoke (ADR-342)."""
    try:
        item = await dedup_review.revoke(db, actor=current_user, pair_uuid=pair_uuid)
    except ValueError as err:
        raise _refusal(err) from err
    return DuplicatePairResponse(**_response(item))


@router.post("/duplicate-pairs/{pair_uuid}/resolve", response_model=DuplicatePairDetail)
async def resolve_duplicate_pair(
    pair_uuid: UUID,
    body: ResolveRequest,
    db: AsyncSession = Depends(security.get_db),
    current_user: User = Depends(security.get_current_user),
):
    """Keep `primary`, fold the other ticket into it and cancel it, in one go (Spec 028, ADR-365).

    409 when the card is already resolved or decided, a ticket is gone, or either ticket changed
    since the reviewer read it (send back the detail's `version`s); 422 when the request cannot be
    carried out as sent.
    """
    try:
        result = await dedup_resolve.resolve(db, actor=current_user, pair_uuid=pair_uuid, request=body)
    except ValueError as err:
        raise _refusal(err) from err
    return _detail(result.detail)
