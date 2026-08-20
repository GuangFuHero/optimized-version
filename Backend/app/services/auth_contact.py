"""Contact add / replace / delete use-cases (feature 012, ADR-085~089, 098).

Extracted out of `app/api/v1/endpoints/auth/contacts.py` because this is where the
branch-dense security logic lives — add vs replace, crossed with password vs SSO-only —
and each combination fails differently. That belongs somewhere unit-testable rather than
only reachable over HTTP (ADR-088).

The rest of `app/api/v1/endpoints/auth/` still calls repositories directly; aligning it
with the flat-service convention (ADR-013/047) is deliberately out of scope here.
"""

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import verify_password
from app.graphql.masking import mask_email, mask_phone
from app.messaging.email import build_contact_changed_email, build_contact_verification_email
from app.messaging.sms import build_contact_changed_sms, build_verification_sms
from app.models.auth import User, UserContact
from app.repositories.auth_repository import contact_repository, identity_repository
from app.repositories.verification_repository import VerificationRepository


class ContactError(ValueError):
    """Base for contact use-case failures; each subclass maps to one HTTP status.

    A `ValueError` subclass because that is how this codebase's use-case layer signals a
    domain failure (ADR-032, and 20 raises across station/ticket services). The subclasses
    exist so the endpoint can map each to its own status code instead of a blanket 400.
    """


class ContactConflict(ContactError):
    """The requested change collides with existing data (409)."""


class ContactNotFound(ContactError):
    """There is nothing of that type to act on (404)."""


class StepUpRequired(ContactError):
    """Replacing a contact needs extra proof that was not supplied (422)."""


class StepUpFailed(ContactError):
    """The supplied step-up proof was wrong (401)."""


class LastLoginChannel(ContactError):
    """Deleting this would leave the account with no way to sign in (409)."""


def _mask(type_: str, value: str) -> str:
    """Mask a contact value for the change notification (ADR-085)."""
    return mask_email(value) if type_ == "email" else mask_phone(value)


async def _deliver_code(type_: str, to: str, code: str, *, email_sender, sms_sender) -> None:
    """Send a 6-digit verification code over the channel the contact type implies."""
    if type_ == "email":
        subject, html, text = build_contact_verification_email(code)
        await email_sender.send(to, subject, html, text)
    else:
        await sms_sender.send(to, build_verification_sms(code))


async def _require_step_up(
    db: AsyncSession,
    redis,
    *,
    actor: User,
    existing: UserContact,
    step_up,
    email_sender,
    sms_sender,
) -> None:
    """Prove the caller may replace `existing`, or raise.

    Which proof is demanded is decided here, from the account's own shape — never from what
    the client chose to send. An account with a password proves it knows the password; an
    SSO-only account proves it still holds the channel being replaced.

    This is the check that stops a stolen session from becoming permanent account takeover:
    swap the recovery channel, sign out, then "forgot password" into the account.
    """
    identity = await identity_repository.get_password_identity(db, str(actor.uuid))
    if identity is not None and identity.password_hash:
        if not (step_up and step_up.password):
            raise StepUpRequired("更換聯絡方式需要輸入密碼")
        if not verify_password(step_up.password, identity.password_hash):
            raise StepUpFailed("密碼錯誤")
        return

    # SSO-only: no password to check, so fall back to holding the old channel.
    if not (step_up and step_up.old_channel_code):
        code = await VerificationRepository(redis).issue_old_channel_step_up(
            user_uuid=str(actor.uuid), type_=existing.type, value=existing.value
        )
        await _deliver_code(
            existing.type, existing.value, code, email_sender=email_sender, sms_sender=sms_sender
        )
        raise StepUpRequired("已將驗證碼寄至原聯絡方式，請填入 step_up.old_channel_code")
    payload = await VerificationRepository(redis).consume_old_channel_step_up(
        user_uuid=str(actor.uuid), type_=existing.type, value=existing.value,
        code=step_up.old_channel_code,
    )
    if payload is None:
        raise StepUpFailed("原聯絡方式的驗證碼錯誤或已過期")


async def start_contact_change(
    db: AsyncSession,
    redis,
    *,
    actor: User,
    type_: str,
    value: str,
    step_up=None,
    email_sender,
    sms_sender,
) -> None:
    """Begin adding — or replacing — a contact: send a code to the NEW value.

    Adding a first contact of a type is not a replacement and carries no extra gate; only
    replacing one does (ADR-086).
    """
    if await contact_repository.is_value_taken(db, type_=type_, value=value):
        raise ContactConflict(f"{type_.capitalize()} already in use")

    existing = await contact_repository.get_by_user_and_type(
        db, user_uuid=str(actor.uuid), type_=type_
    )
    if existing is not None:
        if existing.value == value:
            raise ContactConflict("新的聯絡方式與現有的相同")
        await _require_step_up(
            db, redis, actor=actor, existing=existing, step_up=step_up,
            email_sender=email_sender, sms_sender=sms_sender,
        )

    code = await VerificationRepository(redis).issue_contact_verification(
        user_uuid=str(actor.uuid), type_=type_, value=value
    )
    await _deliver_code(type_, value, code, email_sender=email_sender, sms_sender=sms_sender)


async def commit_contact_change(
    db: AsyncSession,
    redis,
    *,
    actor: User,
    type_: str,
    value: str,
    code: str,
    email_sender,
    sms_sender,
) -> bool:
    """Verify the code and attach the contact. Returns True when it replaced an existing one.

    Conflict checks run BEFORE consuming the code so a 409 never burns the user's pending
    code — they keep it and can retry once the conflict clears.
    """
    if await contact_repository.is_value_taken(db, type_=type_, value=value):
        raise ContactConflict("Already in use")

    existing = await contact_repository.get_by_user_and_type(
        db, user_uuid=str(actor.uuid), type_=type_
    )
    payload = await VerificationRepository(redis).consume_contact_verification(
        user_uuid=str(actor.uuid), type_=type_, value=value, code=code
    )
    if payload is None:
        raise ContactNotFound("Invalid or expired code")

    if existing is None:
        await contact_repository.create_verified(
            db, user_uuid=actor.uuid, type_=type_, value=value
        )
        return False

    old_type, old_value = existing.type, existing.value
    await contact_repository.replace_verified(db, existing=existing, value=value)
    # Tell the OLD channel, masked — the only way a victim finds out (ADR-085).
    masked = _mask(type_, value)
    if old_type == "email":
        subject, html, text = build_contact_changed_email(masked)
        await email_sender.send(old_value, subject, html, text)
    else:
        await sms_sender.send(old_value, build_contact_changed_sms(masked))
    return True


async def delete_contact(db: AsyncSession, *, actor: User, type_: str) -> None:
    """Remove one of the caller's contacts, refusing to strand the account (ADR-087).

    A contact IS the login identifier, so dropping the last one leaves an account with no
    password-reset destination and no way back in — unless an SSO identity still gets them
    there.
    """
    existing = await contact_repository.get_by_user_and_type(
        db, user_uuid=str(actor.uuid), type_=type_
    )
    if existing is None:
        raise ContactNotFound(f"This account has no {type_}")

    remaining = await contact_repository.count_by_user(db, str(actor.uuid)) - 1
    if remaining == 0 and not await identity_repository.has_sso_identity(db, str(actor.uuid)):
        raise LastLoginChannel("帳號至少需保留一個登入管道")

    await contact_repository.delete_contact(db, contact=existing)
