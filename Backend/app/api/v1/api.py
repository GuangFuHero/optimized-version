"""API v1 router — aggregates all endpoint sub-routers under /api/v1."""

from fastapi import APIRouter

from app.api.v1.endpoints import (
    admin,
    analytics,
    auth,
    bulk,
    map,
    notifications,
    rbac_admin,
    rbac_test,
    users,
)
from app.core.config import settings

api_router = APIRouter()

# 註冊認證相關路由 (Register/Login)
api_router.include_router(auth.router, prefix="/auth", tags=["認證系統"])

# 註冊使用者個人功能路由 (Profile)
api_router.include_router(users.router, prefix="/users", tags=["使用者管理"])

# 註冊通知中心路由 (Notifications)
api_router.include_router(notifications.router, prefix="/notifications", tags=["通知中心"])

# 註冊管理員 API（user 列表 / 指派 role / team member 管理）
api_router.include_router(admin.router, prefix="/admin", tags=["管理員 API"])

# 註冊 RBAC 管理 API（capability catalog / matrix / user permissions，唯讀，feature 009 P1）
api_router.include_router(rbac_admin.router, prefix="/admin", tags=["RBAC 管理 API"])


def rbac_test_enabled(env: str) -> bool:
    """T118/ADR-033: rbac-test exposes raw permission probes — allowlist, not denylist.

    `staging` is a real, internet-reachable deploy target (see
    ../optimized-version-dockerized-deployment-setup/Backend/scripts/deploy-config.staging.env),
    so excluding only "production" would still leave it exposed there. Only known
    non-live environments get the router.
    """
    return env in ("development", "testing")


# 註冊 RBAC 測試路由（僅限 dev/test 環境，ADR-033）
if rbac_test_enabled(settings.ENV):
    api_router.include_router(rbac_test.router, prefix="/rbac-test", tags=["RBAC 測試"])

# 註冊批量匯入匯出路由（feature 015；檔案上傳/下載走 REST，不走 GraphQL）
api_router.include_router(bulk.router, prefix="/bulk", tags=["批量匯入匯出"])

# 註冊地圖圖磚路由
api_router.include_router(map.router, prefix="/map", tags=["地圖圖磚"])

# 註冊數據分析圖表路由 (Plotly 圖表 HTML)
api_router.include_router(analytics.router, prefix="/analytics", tags=["數據分析 API"])

# 未來其他功能路由註冊處
# api_router.include_router(stations.router, prefix="/stations", tags=["stations"])
# api_router.include_router(requests.router, prefix="/requests", tags=["requests"])
