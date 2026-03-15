from datetime import timedelta
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core import security
from app.core.config import settings
from app.api.v1.endpoints import rbac_test
from app.repositories.auth_repository import user_repository, group_repository
from app.schemas.auth import UserCreate, Token, UserResponse, UserLogin
from app.models.auth import User

router = APIRouter()

@router.post("/register", response_model=UserResponse)
async def register(
    user_in: UserCreate,
    db: AsyncSession = Depends(security.get_db)
):
    """
    使用者註冊。
    註冊後會自動指派為 'Login User' 角色。
    """
    # 1. 檢查名稱是否已被使用
    existing_user = await user_repository.get_by_name(db, name=user_in.name)
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="該用戶名稱已被註冊"
        )
    
    # 1. 建立新使用者
    user_data = {
        "name": user_in.name,
        "password": security.get_password_hash(user_in.password),
        "credibility_score": 50.0
    }
    new_user = await user_repository.create(db, obj_in=user_data)

    # 2. 自動指派 'Login User' 角色 (使用封裝好的 Repository 方法)
    login_group = await group_repository.get_by_name(db, name="Login User")
    if login_group:
        await user_repository.add_to_group(db, user_uuid=new_user.uuid, group_uuid=login_group.uuid)

    # 3. 刷新物件以確保欄位已加載，避免序列化錯誤
    await db.refresh(new_user)

    return new_user



@router.post("/login", response_model=Token)
async def login(
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: AsyncSession = Depends(security.get_db)
):
    """
    使用者登入，回傳 JWT Token。
    注意：OAuth2 要求 username 欄位，我們對應到 User.name。
    """
    # 使用 Repository 查找使用者
    user = await user_repository.get_by_name(db, name=form_data.username)
    
    if not user or not security.verify_password(form_data.password, user.password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="帳號或密碼錯誤",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    # 簽發 Token (使用 UUID 字串)
    access_token_expires = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = security.create_access_token(
        data={"sub": str(user.uuid)}, expires_delta=access_token_expires
    )
    
    return {"access_token": access_token, "token_type": "bearer"}
