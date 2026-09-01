"""Link / unlink SSO login methods (feature 017, ADR-217~219).

A linked provider is the strongest credential this system issues: no password change, no
session revocation and no contact swap can take it away, and it is the only one with no
expiry at all. Until ADR-217 it was also the only one a bare session could attach.

So it goes through the same gate a first password does — `require_channel_proof` — and the
same notification discipline every other change to authentication material has (ADR-085/215).
The gate lives in `auth_contact` rather than being re-implemented here: one answer to "prove
you hold this account", not one per endpoint.
"""

import logging

from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.messaging.email import build_login_method_changed_email
from app.messaging.sms import build_login_method_changed_sms
from app.models.auth import User
from app.repositories.auth_repository import contact_repository, identity_repository
from app.services.auth_contact import (
    ACTION_LINK,
    ACTION_UNLINK,
    ContactError,
    _notify,
    _send_email_or_log,
    _send_sms_or_log,
    require_channel_proof,
)

logger = logging.getLogger(__name__)

SSO_PROVIDERS = ("google", "line")


class IdentityConflict(ContactError):
    """This provider is already attached, here or to another account (409)."""


class IdentityNotFound(ContactError):
    """There is no such login method on this account (404)."""


class LastLoginMethod(ContactError):
    """Removing this would leave the account with no way to sign in (409)."""


async def _notify_login_method_changed(
    db: AsyncSession, user_uuid: str, *, added: bool, provider: str,
    email_sender, sms_sender, dispatch=None,
) -> None:
    """Tell every contact on the account that a sign-in method came or went (ADR-218).

    Post-commit and through the `_or_log` senders, like every other notification here
    (ADR-162): the identity row is already written, so a provider outage must not turn a
    successful request into a 500.
    """
    for contact in await contact_repository.list_by_user(db, user_uuid):
        if contact.type == "email":
            subject, html, text = build_login_method_changed_email(added, provider)
            await _notify(dispatch, _send_email_or_log,
                          email_sender, contact.value, subject, html, text)
        else:
            await _notify(dispatch, _send_sms_or_log, sms_sender, contact.value,
                          build_login_method_changed_sms(added, provider))


async def link_identity(
    db: AsyncSession,
    redis,
    *,
    actor: User,
    provider: str,
    subject: str,
    step_up=None,
    email_sender,
    sms_sender,
    dispatch=None,
) -> None:
    """Attach a verified SSO identity to the current account, proof first (ADR-217).

    The provider token proves the *caller* controls that provider account. It says nothing
    about whether they control the account being linked to — which is exactly the gap: a
    stolen session plus the attacker's own Google account was a permanent way in.

    Conflict checks run before the gate: asking someone to prove themselves for an operation
    that was never possible is the same mistake ADR-159 avoided on the delete path.
    """
    user_uuid = str(actor.uuid)
    existing = await identity_repository.get_by_provider_subject(
        db, provider=provider, subject=subject
    )
    if existing is not None:
        if str(existing.user_uuid) == user_uuid:
            raise IdentityConflict(f"{provider} account already linked")
        raise IdentityConflict(f"This {provider} account is already linked to another account")
    if await identity_repository.get_user_identity(db, user_uuid, provider) is not None:
        raise IdentityConflict(f"{provider} account already linked")

    await require_channel_proof(
        db, redis, actor=actor, step_up=step_up, action=ACTION_LINK, target=provider,
        email_sender=email_sender, sms_sender=sms_sender,
    )

    try:
        await identity_repository.create(db, obj_in={
            "user_uuid": actor.uuid, "provider": provider, "provider_subject": subject,
        })
    except IntegrityError as err:  # concurrent link race
        await db.rollback()
        raise IdentityConflict("Already linked") from err

    await _notify_login_method_changed(
        db, user_uuid, added=True, provider=provider,
        email_sender=email_sender, sms_sender=sms_sender, dispatch=dispatch,
    )


async def unlink_identity(
    db: AsyncSession,
    redis,
    *,
    actor: User,
    provider: str,
    step_up=None,
    email_sender,
    sms_sender,
    dispatch=None,
) -> None:
    """Remove one SSO login method, refusing to strand the account (ADR-218).

    The mirror of ADR-087's contact guard, on the other half of "ways back in": an account
    must keep at least one usable login method. A password identity counts, and so does any
    remaining SSO provider — but a provider is only usable if the account still has a contact
    to be identified by, which the contact guard already maintains.

    Removal takes the same step-up as linking (ADR-159's reasoning): without it, a session
    holder could strip the owner's real provider and leave only their own.
    """
    user_uuid = str(actor.uuid)
    identity = await identity_repository.get_user_identity(db, user_uuid, provider)
    if identity is None:
        raise IdentityNotFound(f"This account has no {provider} login method")

    remaining = [
        i for i in await identity_repository.list_by_user(db, user_uuid)
        if str(i.uuid) != str(identity.uuid) and (i.provider != "password" or i.password_hash)
    ]
    if not remaining:
        raise LastLoginMethod("帳號至少需保留一個登入方式")

    await require_channel_proof(
        db, redis, actor=actor, step_up=step_up, action=ACTION_UNLINK, target=provider,
        email_sender=email_sender, sms_sender=sms_sender,
    )

    await identity_repository.remove(db, uuid=identity.uuid)
    await _notify_login_method_changed(
        db, user_uuid, added=False, provider=provider,
        email_sender=email_sender, sms_sender=sms_sender, dispatch=dispatch,
    )
