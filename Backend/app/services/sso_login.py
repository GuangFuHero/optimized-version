"""Who a verified Google or LINE identity signs in as, creating the account on a first sign-in.

Called by the backend's OAuth callback once the provider's `id_token` has been verified (ADR-331). The
refusals are this module's own exceptions, which the callback answers with a redirect back to the sign-in
page.
"""

from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.normalize import normalize_email
from app.models.auth import User
from app.repositories.auth_repository import contact_repository, identity_repository, user_repository
from app.services.auth_account import create_account
from app.sso.google import GoogleIdentity
from app.sso.line import LineIdentity


class SsoSignInRefused(Exception):
    """The provider vouched for someone, but not for anyone this API will sign in."""


class EmailUnverified(SsoSignInRefused):
    """A first sign-in whose email the provider has not verified, or that is not an email at all."""


class EmailTaken(SsoSignInRefused):
    """A first sign-in whose email already belongs to another account, which must link the provider."""


class SignInRace(SsoSignInRefused):
    """A first sign-in that raced another and could not complete; trying again will do."""


async def _existing_account(db: AsyncSession, provider: str, subject: str) -> User | None:
    """The account this provider's identity already belongs to, or None on its first sign-in."""
    identity = await identity_repository.get_by_provider_subject(db, provider=provider, subject=subject)
    return await user_repository.get_by_uuid(db, identity.user_uuid) if identity is not None else None


async def sign_in_with_google(db: AsyncSession, gid: GoogleIdentity) -> User:
    """The account this Google identity signs in as; on its first sign-in, a new one with its email."""
    user = await _existing_account(db, "google", gid.sub)
    if user is not None:
        return user
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
        user = await _existing_account(db, "google", gid.sub)
        if user is None:
            raise EmailTaken("Email already in use; log in and link Google in settings") from err
        return user


async def sign_in_with_line(db: AsyncSession, lid: LineIdentity) -> User:
    """The account this LINE identity signs in as; on its first sign-in, a new one.

    LINE's email is optional, and so is an account's: a missing, malformed or taken email is simply not
    added as a contact, and never blocks the sign-in. A display name falls back to `LINE-<sub prefix>`.
    """
    user = await _existing_account(db, "line", lid.sub)
    if user is not None:
        return user
    contact_type = contact_value = None
    if lid.email:
        try:
            email = normalize_email(lid.email)
        except ValueError:
            email = None
        if email and not await contact_repository.is_value_taken(db, type_="email", value=email):
            contact_type, contact_value = "email", email
    try:
        return await create_account(
            db,
            name=lid.name or f"LINE-{lid.sub[:8]}",
            provider="line",
            provider_subject=lid.sub,
            contact_type=contact_type,
            value=contact_value,
        )
    except IntegrityError as err:  # concurrent first-login race
        await db.rollback()
        user = await _existing_account(db, "line", lid.sub)
        if user is None:
            raise SignInRace("LINE account conflict") from err
        return user
