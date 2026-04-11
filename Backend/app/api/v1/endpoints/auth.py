import os
from datetime import timedelta
from fastapi import APIRouter, Depends, HTTPException, status, Request
from fastapi.security import OAuth2PasswordRequestForm
from fastapi_limiter.depends import RateLimiter
from pyrate_limiter import Duration, Rate, Limiter
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core import security
from app.core.config import settings
from app.api.v1.endpoints import rbac_test
from app.repositories.auth_repository import user_repository, group_repository
from app.schemas.auth import UserCreate, Token, UserResponse, UserLogin, UserSaltResponse
from app.models.auth import User

router = APIRouter()

from fastapi import Response # 補上 Response import

# 頻率限制包裝器：支援測試環境繞過
def get_rate_limiter(times: int, seconds: int):
    _limiter = Limiter(Rate(times, Duration.SECOND * seconds))
    
    async def dynamic_rate_limiter(request: Request, response: Response):
        # 只有在非測試環境下才執行限制
        if os.getenv("ENV") != "testing":
            limiter_dep = RateLimiter(_limiter)
            return await limiter_dep(request, response)
        return None

    return dynamic_rate_limiter


@router.get("/salt/{username}", 
            response_model=UserSaltResponse,
            dependencies=[Depends(get_rate_limiter(10, 60))])
async def get_user_salt(
        username: str,
        db: AsyncSession = Depends(security.get_db)
):
    """
    獲取使用者的前端 salt。
    """
    user = await user_repository.get_by_name(db, name=username)
    
    if user:
        salt_frontend = security.parse_salt_frontend(user.password)
        if salt_frontend:
            return {"salt_frontend": salt_frontend}

    # 產生假 Salt
    fake_salt = security.hashlib.sha256(
        (username + settings.SECRET_KEY).encode()
    ).hexdigest()[:32]

    return {"salt_frontend": fake_salt}


@router.post("/register", 
             response_model=UserResponse,
             dependencies=[Depends(get_rate_limiter(3, 60))])
async def register(
        user_in: UserCreate,
        db: AsyncSession = Depends(security.get_db)
):
    """
    使用者註冊。
    """
    # 1. 檢查名稱是否已被使用
    existing_user = await user_repository.get_by_name(db, name=user_in.name)
    if existing_user:
        # 回應 Reviewer：資源衝突使用 409 Conflict 較為精確
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="該用戶名稱已被註冊"
        )

    # 2. 建立新使用者
    user_data = {
        "name": user_in.name,
        # 同步命名變更：使用 user_in.password (原本為 hash_password)
        "password": security.get_password_hash(user_in.password, user_in.salt_frontend),
        "credibility_score": 50.0
    }
    new_user = await user_repository.create(db, obj_in=user_data)

    # 3. 自動指派 'Login User' 角色
    login_group = await group_repository.get_by_name(db, name="Login User")
    if login_group:
        await user_repository.add_to_group(db, user_uuid=new_user.uuid, group_uuid=login_group.uuid)

    await db.refresh(new_user)

    return new_user


@router.post("/login", 
             response_model=Token,
             dependencies=[Depends(get_rate_limiter(5, 60))])
async def login(
        form_data: OAuth2PasswordRequestForm = Depends(),
        db: AsyncSession = Depends(security.get_db)
):
    """
    使用者登入，回傳 JWT Token。
    [Rate Limit: 5 次/每分鐘]
    """
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
