"""User profile endpoints for reading and updating the current user's account."""

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import security
from app.models.auth import User
from app.repositories.active_identity_repository import active_identity_repository
from app.repositories.auth_repository import user_repository
from app.schemas.auth import IdentityOption, UserResponse, UserUpdate

router = APIRouter()

@router.get("/me", response_model=UserResponse)
async def read_user_me(
    current_user: User = Depends(security.get_current_user),
    db: AsyncSession = Depends(security.get_db),
):
    """獲取當前登入使用者的個人資料，含可切換的身分清單與當前身分。

    The frontend needs `identities` to render the switcher and `active_identity` to show
    which one is in effect (ADR-068/069).
    """
    identities = await active_identity_repository.list_for_user(db, str(current_user.uuid))
    active = getattr(current_user, "active_identity", None)
    return UserResponse(
        uuid=current_user.uuid,
        name=current_user.name,
        credibility_score=current_user.credibility_score,
        created_at=current_user.created_at,
        identities=[_as_option(i) for i in identities],
        active_identity=_as_option(active) if active else None,
    )


def _as_option(identity) -> IdentityOption:
    """Map an ActiveIdentity onto its API shape."""
    return IdentityOption(
        role_uuid=identity.role_uuid, role=identity.role_name,
        team_uuid=identity.team_uuid, team=identity.team_name,
    )


@router.patch("/me", response_model=UserResponse)
async def update_user_me(
    user_in: UserUpdate,
    db: AsyncSession = Depends(security.get_db),
    current_user: User = Depends(security.get_current_user)
):
    """更新當前登入使用者的個人資料。"""
    update_data = user_in.model_dump(exclude_unset=True)
    updated_user = await user_repository.update(db, db_obj=current_user, obj_in=update_data)
    identities = await active_identity_repository.list_for_user(db, str(updated_user.uuid))
    active = getattr(current_user, "active_identity", None)
    return UserResponse(
        uuid=updated_user.uuid,
        name=updated_user.name,
        credibility_score=updated_user.credibility_score,
        created_at=updated_user.created_at,
        identities=[_as_option(i) for i in identities],
        active_identity=_as_option(active) if active else None,
    )
