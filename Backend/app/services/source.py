"""Where a station or a task came from, as the identity that made it says."""

from app.models.auth import User
from app.services.auth_account import DEFAULT_PLATFORM_ROLE

USER = "user"
OFFICIAL = "official"


def source_for(actor: User) -> str:
    """`official` for what a back-office identity makes, `user` for what the site's identity makes.

    The site's identity is the platform `user` grant; the rule reads the identity the request acts as,
    not what the form sent, because a caller can act only as an identity it holds.
    """
    identity = getattr(actor, "active_identity", None)
    on_the_site = identity is None or (identity.is_platform and identity.role_name == DEFAULT_PLATFORM_ROLE)
    return USER if on_the_site else OFFICIAL
