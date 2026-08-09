"""RBAC test endpoints for verifying role-based access control permissions."""

from fastapi import APIRouter, Depends

from app.core import security
from app.core.permissions import Perm
from app.models.auth import User

router = APIRouter()

@router.get("/public")
async def public_api():
    """公開 API：不需要任何權限。"""
    return {"status": "success", "message": "This is public data, accessible to anyone."}


@router.get("/map-view", dependencies=[security.has_permission(Perm.MAP_VIEW)])
async def map_view_api(current_user: User = Depends(security.get_current_user)):
    """地圖檢視 API：需要 'map.view' 權限。"""
    return {"status": "success", "message": f"Authorized. User {current_user.name} ({current_user.uuid}) has map view permission."}  # noqa: E501


@router.get("/map-create", dependencies=[security.has_permission(Perm.MAP_ADD)])
async def map_create_api(current_user: User = Depends(security.get_current_user)):
    """建立標記 API：需要 'map.add' 權限。"""
    return {"status": "success", "message": f"Authorized. User {current_user.name} ({current_user.uuid}) has map create permission."}  # noqa: E501


@router.get("/admin-only", dependencies=[security.has_permission(Perm.USER_VIEW)])
async def admin_only_api(current_user: User = Depends(security.get_current_user)):
    """管理員專用 API：需要 'user.view' 權限。"""
    return {"status": "success", "message": f"Authorized. User {current_user.name} ({current_user.uuid}) has admin permission."}  # noqa: E501
