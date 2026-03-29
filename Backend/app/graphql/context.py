from fastapi import HTTPException, status
from starlette.requests import Request
from app.core.security import get_current_user, get_db, PermissionChecker


async def get_context(request: Request):
    """Create per-request GraphQL context with DB session and optional user.

    Reuses security.get_db for session lifecycle and security.get_current_user
    for JWT authentication.

    Errors:
        - Invalid/expired token: raises HTTPException(401) from get_current_user
          with detail "無法驗證憑證"
        - No token: user is None (public queries still work)
    """
    db_gen = get_db()
    db = await anext(db_gen)
    try:
        auth = request.headers.get("Authorization", "")
        token = auth[7:] if auth.startswith("Bearer ") else ""
        user = None
        if token:
            user = await get_current_user(db=db, token=token)
        yield {"db": db, "user": user}
    finally:
        await db_gen.aclose()


async def check_permission(info, resource: str, action: str, owner_uuid: str = None) -> str:
    """Check RBAC permission and enforce ownership for 'own' scope.

    Reuses security.get_current_user and security.PermissionChecker.

    Args:
        info: Strawberry resolver info (contains context with db and user)
        resource: resource name (e.g. "map", "request")
        action: action name (e.g. "create", "edit", "delete")
        owner_uuid: if provided, enforces 'own' scope — raises 403 when
                    scope is 'own' and owner_uuid doesn't match current user

    Errors (all messages from security.py, not overwritten here):
        - No user (unauthenticated): HTTPException(401) from get_current_user
          with detail "無法驗證憑證"
        - No matching policy: HTTPException(403) from PermissionChecker
          with detail "Resource access restricted."
        - Scope is 'none': HTTPException(403) from PermissionChecker
          with detail "Permission Denied."
        - Scope is 'own' but owner_uuid doesn't match: HTTPException(403)
          with detail "Permission Denied."

    Scope values follow FR-081:
        - all: user can access any resource of this type
        - own: user can only access resources they created
        - none: no access (raises 403)
    """
    if not info.context["user"]:
        await get_current_user(db=info.context["db"], token="")
    scope = await PermissionChecker(resource, action)(
        current_user=info.context["user"], db=info.context["db"]
    )
    if owner_uuid and scope == "own" and owner_uuid != str(info.context["user"].uuid):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Permission Denied.")
    return scope
