from fastapi import APIRouter
from app.api.v1.endpoints import rbac_test, auth, users

api_router = APIRouter()

# 註冊認證相關路由 (Register/Login)
api_router.include_router(auth.router, prefix="/auth", tags=["認證系統"])

# 註冊使用者個人功能路由 (Profile)
api_router.include_router(users.router, prefix="/users", tags=["使用者管理"])

# 註冊 RBAC 測試路由
api_router.include_router(rbac_test.router, prefix="/rbac-test", tags=["RBAC 測試"])

# 未來其他功能路由註冊處
# api_router.include_router(stations.router, prefix="/stations", tags=["stations"])
# api_router.include_router(requests.router, prefix="/requests", tags=["requests"])
