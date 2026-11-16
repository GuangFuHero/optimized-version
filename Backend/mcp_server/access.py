"""Who may use the MCP, and how many backend calls a minute an account's tools may make (ADR-463)."""

from types import SimpleNamespace

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.permissions import Perm
from app.core.rbac_scopes import Scope
from app.core.security import resolve_scope
from app.repositories.active_identity_repository import active_identity_repository

NO_MCP_USE = "This account may not use MCP: none of its identities holds mcp.use. Ask an administrator."


async def _holds_on_any_identity(db: AsyncSession, user_uuid: str, perm: Perm) -> bool:
    for identity in await active_identity_repository.list_for_user(db, user_uuid):
        actor = SimpleNamespace(uuid=user_uuid, active_identity=identity)
        if await resolve_scope(actor, perm, db) != Scope.NONE:
            return True
    return False


async def may_use_mcp(db: AsyncSession, user_uuid: str) -> bool:
    """Whether any of the account's usable identities holds `mcp.use`, whichever one a session acts as."""
    return await _holds_on_any_identity(db, user_uuid, Perm.MCP_USE)


async def tool_calls_per_minute(db: AsyncSession, user_uuid: str) -> int | None:
    """Backend calls a minute the account may make, or None when an identity holds `mcp.unlimited_use`."""
    if await _holds_on_any_identity(db, user_uuid, Perm.MCP_UNLIMITED_USE):
        return None
    return settings.MCP_TOOL_CALLS_PER_MINUTE
