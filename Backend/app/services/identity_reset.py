"""Moving a session off an identity that was taken away (Spec 029, ADR-402–404).

The request path (`security.get_current_user`) and the refresh (`auth_session.refresh_session`) both
end up here when the identity they act as no longer resolves — a suspended team, a removal, a role
changed, revoked or deleted. Instead of signing the user out (ADR-096 before Spec 029), the session
is moved to the account's default identity and the caller is told, once, which identity went. The
request itself is refused: nothing is done under an identity the user did not choose.
"""

import logging

from fastapi import status
from redis.exceptions import RedisError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.api_errors import ApiError, ErrorCode
from app.core.identity import decode_act
from app.models.rbac import Role
from app.models.team import Team
from app.repositories.active_identity_repository import active_identity_repository

logger = logging.getLogger(__name__)


async def revoked_names(db: AsyncSession, act: str | None) -> dict[str, str | None]:
    """The role and team names the revoked `act` named; None where that row is gone (ADR-404)."""
    parsed = decode_act(act)
    if parsed is None:
        return {"role": None, "team": None}
    role_uuid, team_uuid = parsed
    role = await db.scalar(select(Role.name).where(Role.uuid == role_uuid))
    team = await db.scalar(select(Team.name).where(Team.uuid == team_uuid)) if team_uuid else None
    return {"role": role, "team": team}


def identity_reset_error(revoked: dict[str, str | None] | None = None) -> ApiError:
    """The 401 `identity_reset`, naming `revoked` when given and nothing otherwise (ADR-404, ADR-415)."""
    return ApiError(
        status_code=status.HTTP_401_UNAUTHORIZED,
        code=ErrorCode.IDENTITY_RESET,
        detail="This identity is no longer yours",
        headers={"WWW-Authenticate": "Bearer"},
        extra={"revoked_identity": revoked or {"role": None, "team": None}},
    )


async def reset_to_default(db: AsyncSession, redis, *, user_uuid: str, sid: str, act: str | None) -> ApiError:
    """Point session `sid` at the account's default identity; return the `identity_reset` to raise.

    Or a 503 `session_store_unavailable` when Redis cannot be written, which signs nobody out.

    `act` must be one the caller did not choose freely: the signed token's, or the session's own
    (ADR-415). Its names go back to the client.

    Returned rather than raised so each caller's `raise` reads as the refusal it is. The session's
    identity is written before the answer goes out, so the refresh that follows lands on the default
    without naming it, and any other request holding the old token is merely stale (ADR-195).
    """
    # Imported here: session_repository imports app.core.security, which imports this module.
    from app.repositories.session_repository import SessionRepository

    default = await active_identity_repository.default_for_user(db, user_uuid)
    try:
        await SessionRepository(redis).set_identity(sid, default.to_claim() if default else None)
    except RedisError:
        # As wherever the session store fails (ADR-328 point 3): refused, nobody signed out. The
        # identity is still gone, so the next request after Redis is back resets it then.
        logger.exception("could not move session %s to the default identity: Redis is unreachable", sid)
        return ApiError(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            ErrorCode.SESSION_STORE_UNAVAILABLE,
            "Session store is unavailable",
        )
    return identity_reset_error(await revoked_names(db, act))
