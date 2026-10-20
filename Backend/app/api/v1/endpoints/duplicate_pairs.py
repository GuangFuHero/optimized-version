"""Back-office AI 重複審核: list the duplicate pair cards and read one (Spec 025 §2, ADR-338).

Mounted under /admin like role-requests. Endpoints stay thin (ADR-014): the capability check
(`ai_duplicate.view`) and every rule live in `app/services/dedup_review.py`.
"""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import security
from app.models.auth import User
from app.schemas.duplicate_pair import (
    DedupEventResponse,
    DuplicatePairDetail,
    DuplicatePairPage,
    DuplicatePairResponse,
    EntityKind,
    EntitySummaryResponse,
    PairSort,
    PairStatus,
    SourceLayer,
)
from app.services import dedup_review
from app.services.dedup_review import DuplicatePairNotFoundError, PairItem

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


def _refusal(err: ValueError) -> HTTPException:
    """404 for a missing card, else 422 (a value the service refuses)."""
    if isinstance(err, DuplicatePairNotFoundError):
        return HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(err))
    return HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(err))


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
    """One card, its sides and its events, oldest first."""
    try:
        detail = await dedup_review.get_pair(db, actor=current_user, pair_uuid=pair_uuid)
    except ValueError as err:
        raise _refusal(err) from err
    return DuplicatePairDetail(
        **_response(detail.item),
        events=[DedupEventResponse.model_validate(event) for event in detail.events],
    )
