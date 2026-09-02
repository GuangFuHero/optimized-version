"""User profile endpoints for reading and updating the current user's account."""

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import security
from app.models.auth import User
from app.repositories.active_identity_repository import active_identity_repository
from app.repositories.auth_repository import (
    contact_repository,
    identity_repository,
    user_repository,
)
from app.schemas.auth import IdentityOption, UserResponse, UserUpdate

router = APIRouter()


async def _profile(db: AsyncSession, user: User) -> UserResponse:
    """Build the profile response: RBAC identities, contacts, and login methods.

    Two unrelated things share this response and the names keep them apart —
    `identities` / `active_identity` are what the user can act AS (role plus optional team,
    feature 010), `login_methods` is how they sign IN (password/google/line, feature 012).

    Built field-by-field rather than from the ORM object: `User` happens to have
    relationships named `contacts` and `identities`, so letting Pydantic read them off the
    model triggers a lazy load outside the async context and fails with MissingGreenlet.

    Own-profile reads are NOT masked — masking exists to protect other people's PII. The
    frontend needs `identities` and `active_identity` to render the identity switcher
    (ADR-068/069), and `login_methods` to tell whether the account is SSO-only, which
    decides which step-up it must collect before replacing a contact (ADR-089).
    """
    identities = await active_identity_repository.list_for_user(db, str(user.uuid))
    active = getattr(user, "active_identity", None)
    return UserResponse(
        uuid=user.uuid,
        name=user.name,
        credibility_score=user.credibility_score,
        created_at=user.created_at,
        identities=[_as_option(i) for i in identities],
        active_identity=_as_option(active) if active else None,
        contacts=await contact_repository.list_by_user(db, str(user.uuid)),
        login_methods=await identity_repository.list_by_user(db, str(user.uuid)),
    )


def _as_option(identity) -> IdentityOption:
    """Map an ActiveIdentity onto its API shape."""
    return IdentityOption(
        role_uuid=identity.role_uuid, role=identity.role_name,
        team_uuid=identity.team_uuid, team=identity.team_name,
    )


@router.get("/me", response_model=UserResponse)
async def read_user_me(
    current_user: User = Depends(security.get_current_user),
    db: AsyncSession = Depends(security.get_db),
):
    """獲取當前登入使用者的個人資料，含可切換的身分清單、聯絡方式與登入方式。"""
    return await _profile(db, current_user)


@router.patch("/me", response_model=UserResponse)
async def update_user_me(
    user_in: UserUpdate,
    db: AsyncSession = Depends(security.get_db),
    current_user: User = Depends(security.get_current_user),
):
    """更新當前登入使用者的個人資料（僅 name；電話與信箱走 /auth/contacts 流程）。"""
    update_data = user_in.model_dump(exclude_unset=True)
    updated_user = await user_repository.update(db, db_obj=current_user, obj_in=update_data)
    return await _profile(db, updated_user)
