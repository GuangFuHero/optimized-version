"""Authentication endpoints: user registration, login, and salt retrieval."""

import os

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from fastapi.security import OAuth2PasswordRequestForm
from fastapi_limiter.depends import RateLimiter
from pyrate_limiter import Duration, Limiter, Rate
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import security
from app.core.config import settings
from app.core.redis import get_redis
from app.models.auth import User
from app.repositories.auth_repository import group_repository, user_repository
from app.repositories.session_repository import (
    InvalidRefreshToken,
    RefreshTokenReuse,
    SessionRepository,
)
from app.schemas.auth import (
    ChangePasswordRequest,
    RefreshRequest,
    TokenPair,
    UserCreate,
    UserResponse,
    UserSaltResponse,
)

router = APIRouter()


# 頻率限制包裝器：支援測試環境繞過
def get_rate_limiter(times: int, seconds: int):
    """Build a rate-limiter FastAPI dependency that is bypassed in testing."""
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
    """獲取使用者的前端 salt。"""
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
    """使用者註冊。"""
    # 1. 檢查名稱是否已被使用
    existing_user = await user_repository.get_by_name(db, name=user_in.name)
    if existing_user:
        # 回應 Reviewer：資源衝突使用 409 Conflict 較為精確
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Username already registered"
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
             response_model=TokenPair,
             dependencies=[Depends(get_rate_limiter(5, 60))])
async def login(
        request: Request,
        form_data: OAuth2PasswordRequestForm = Depends(),
        db: AsyncSession = Depends(security.get_db),
        redis=Depends(get_redis),
):
    """使用者登入，建立 session 並回傳 access + refresh token。"""
    user = await user_repository.get_by_name(db, name=form_data.username)
    if not user or not security.verify_password(form_data.password, user.password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    device = request.headers.get("user-agent", "unknown")
    sid, refresh_token = await SessionRepository(redis).create_session(str(user.uuid), device)
    access_token = security.create_access_token(data={"sub": str(user.uuid)}, sid=sid)
    return TokenPair(
        access_token=access_token, refresh_token=refresh_token,
        expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
    )


@router.post("/refresh",
             response_model=TokenPair,
             dependencies=[Depends(get_rate_limiter(10, 60))])
async def refresh(
        body: RefreshRequest,
        redis=Depends(get_redis),
):
    """以 refresh token 換發新的 access token，並 rotate refresh token。"""
    repo = SessionRepository(redis)
    try:
        sid, user_uuid, new_refresh = await repo.rotate(body.refresh_token)
    except (InvalidRefreshToken, RefreshTokenReuse) as err:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or revoked refresh token",
            headers={"WWW-Authenticate": "Bearer"},
        ) from err
    access_token = security.create_access_token(data={"sub": user_uuid}, sid=sid)
    return TokenPair(
        access_token=access_token, refresh_token=new_refresh,
        expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
    )


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(
        session=Depends(security.get_current_session),
        redis=Depends(get_redis),
):
    """登出：撤銷該使用者的所有 session（全域登出）。"""
    user_uuid, _sid = session
    await SessionRepository(redis).revoke_all_for_user(user_uuid)


@router.post("/change-password", status_code=status.HTTP_204_NO_CONTENT,
             dependencies=[Depends(get_rate_limiter(5, 60))])
async def change_password(
        body: ChangePasswordRequest,
        current_user: User = Depends(security.get_current_user),
        db: AsyncSession = Depends(security.get_db),
        redis=Depends(get_redis),
):
    """更改密碼：驗證舊密碼，寫入新密碼，並撤銷所有 session（強制重新登入）。"""
    if not security.verify_password(body.old_password, current_user.password):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Incorrect current password")
    new_hash = security.get_password_hash(body.new_password, body.salt_frontend)
    await user_repository.update(db, db_obj=current_user, obj_in={"password": new_hash})
    await SessionRepository(redis).revoke_all_for_user(str(current_user.uuid))
