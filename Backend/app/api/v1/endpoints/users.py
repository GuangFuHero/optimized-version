from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import security
from app.repositories.auth_repository import user_repository
from app.schemas.auth import UserResponse, UserUpdate
from app.models.auth import User

router = APIRouter()

@router.get("/me", response_model=UserResponse)
async def read_user_me(
    current_user: User = Depends(security.get_current_user)
):
    """
    獲取當前登入使用者的個人資料。
    """
    return current_user


@router.patch("/me", response_model=UserResponse)
async def update_user_me(
    user_in: UserUpdate,
    db: AsyncSession = Depends(security.get_db),
    current_user: User = Depends(security.get_current_user)
):
    """
    更新當前登入使用者的個人資料。
    """
    update_data = user_in.model_dump(exclude_unset=True)
    
    # 如果有修改密碼，需要加密
    if "password" in update_data:
        update_data["password"] = security.get_password_hash(update_data["password"])
    
    # 使用 Repository 更新
    updated_user = await user_repository.update(db, db_obj=current_user, obj_in=update_data)
    return updated_user
