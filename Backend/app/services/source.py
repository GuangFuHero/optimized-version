"""Where a station or a task came from, as the identity that made it says (ADR-438)."""

from app.models.auth import User
from app.services.auth_account import DEFAULT_PLATFORM_ROLE

USER = "user"
OFFICIAL = "official"


def source_for(actor: User) -> str:
    """`official` for what a back-office identity makes, `user` for what the site's identity makes.

    The back office is every identity but the platform `user` grant, the site's, where every login
    lands (ADR-290, ADR-329), so this asks what the request acts as, never what the form sent: a
    caller can pick only an identity it holds, so a citizen marking a request as the back office's is
    refused rather than made official. Carol, 2026-10-28: whatever is made in the back office counts
    as official, a team member's included.
    """
    identity = getattr(actor, "active_identity", None)
    on_the_site = identity is None or (identity.is_platform and identity.role_name == DEFAULT_PLATFORM_ROLE)
    return USER if on_the_site else OFFICIAL
