"""Who a verified Google identity signs in as, creating the account on a first sign-in.

Shared by `/auth/sso/google`, which receives an `id_token` the frontend obtained, and by the backend's own
OAuth callback, which obtains it itself (ADR-331). The refusals are this module's own exceptions; each
caller answers them its own way, as a JSON error or as a redirect back to the sign-in page.
"""

from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.normalize import normalize_email
from app.models.auth import User
from app.repositories.auth_repository import contact_repository, identity_repository, user_repository
from app.services.auth_account import create_account
from app.sso.google import GoogleIdentity


class SsoSignInRefused(Exception):
    """The provider vouched for someone, but not for anyone this API will sign in."""


class EmailUnverified(SsoSignInRefused):
    """A first sign-in whose email the provider has not verified, or that is not an email at all."""


class EmailTaken(SsoSignInRefused):
    """A first sign-in whose email already belongs to another account, which must link the provider."""


async def sign_in_with_google(db: AsyncSession, gid: GoogleIdentity) -> User:
    """The account this Google identity signs in as; on its first sign-in, a new one with its email."""
    identity = await identity_repository.get_by_provider_subject(db, provider="google", subject=gid.sub)
    if identity is not None:
        return await user_repository.get_by_uuid(db, identity.user_uuid)
    if not gid.email_verified:
        raise EmailUnverified("Google email not verified")
    try:
        email = normalize_email(gid.email)
    except ValueError as err:
        raise EmailUnverified("Google email not verified") from err
    if await contact_repository.is_value_taken(db, type_="email", value=email):
        raise EmailTaken("Email already in use; log in and link Google in settings")
    try:
        return await create_account(
            db,
            name=gid.name or email.split("@")[0],
            provider="google",
            provider_subject=gid.sub,
            contact_type="email",
            value=email,
        )
    except IntegrityError as err:  # concurrent first-login race
        await db.rollback()
        identity = await identity_repository.get_by_provider_subject(db, provider="google", subject=gid.sub)
        if identity is None:
            raise EmailTaken("Email already in use; log in and link Google in settings") from err
        return await user_repository.get_by_uuid(db, identity.user_uuid)
