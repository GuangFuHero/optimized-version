"""RBAC test endpoints for verifying role-based access control permissions."""

from fastapi import APIRouter, Depends

from app.core import security
from app.models.auth import User

router = APIRouter()

@router.get("/public")
async def public_api():
    """公開 API：不需要任何權限。"""
    return {"status": "success", "message": "這是公開資料，任何人都能存取。"}


@router.get("/map-view", dependencies=[security.has_permission("map", "read")])
async def map_view_api(current_user: User = Depends(security.get_current_user)):
    """地圖檢視 API：需要 'map' 資源的 'read' 權限。"""
    return {"status": "success", "message": f"驗證成功！使用者 {current_user.name} ({current_user.uuid}) 具有檢視地圖的權限。"}  # noqa: E501


@router.get("/map-create", dependencies=[security.has_permission("map", "create")])
async def map_create_api(current_user: User = Depends(security.get_current_user)):
    """建立標記 API：需要 'map' 資源的 'create' 權限。"""
    return {"status": "success", "message": f"驗證成功！使用者 {current_user.name} ({current_user.uuid}) 具有新增地圖標記的權限。"}  # noqa: E501


@router.get("/admin-only", dependencies=[security.has_permission("admin", "read")])
async def admin_only_api(current_user: User = Depends(security.get_current_user)):
    """管理員專用 API：需要 'admin' 資源的 'read' 權限。"""
    return {"status": "success", "message": f"驗證成功！使用者 {current_user.name} ({current_user.uuid}) 具有管理員權限。"}  # noqa: E501
