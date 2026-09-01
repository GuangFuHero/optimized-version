"""Contact add / replace / delete use-cases (feature 012, ADR-085~089, 098).

Extracted out of `app/api/v1/endpoints/auth/contacts.py` because this is where the
branch-dense security logic lives — add vs replace, crossed with password vs SSO-only —
and each combination fails differently. That belongs somewhere unit-testable rather than
only reachable over HTTP (ADR-088).

The rest of `app/api/v1/endpoints/auth/` still calls repositories directly; aligning it
with the flat-service convention (ADR-013/047) is deliberately out of scope here.
"""

import logging
from datetime import UTC, datetime, timedelta

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import verify_password
from app.graphql.masking import mask_email, mask_phone
from app.messaging.email import (
    build_contact_changed_email,
    build_contact_removed_email,
    build_contact_verification_email,
    build_password_set_email,
    build_step_up_code_email,
)
from app.messaging.sms import (
    build_contact_changed_sms,
    build_contact_removed_sms,
    build_password_set_sms,
    build_step_up_code_sms,
    build_verification_sms,
)
from app.models.auth import User, UserContact
from app.repositories.auth_repository import contact_repository, identity_repository
from app.repositories.verification_repository import VerificationRepository

logger = logging.getLogger(__name__)


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
    """Send a 6-digit verification code to a NEW value, over the channel its type implies."""
    if type_ == "email":
        subject, html, text = build_contact_verification_email(code)
        await email_sender.send(to, subject, html, text)
    else:
        await sms_sender.send(to, build_verification_sms(code))


async def _deliver_step_up_code(
    type_: str, to: str, code: str, *, action: str, masked_target: str | None,
    email_sender, sms_sender,
) -> None:
    """Send a step-up code to the account's own channel, in a message that names the action.

    Its own builder rather than `_deliver_code`'s (ADR-164): this code authorizes losing the
    address it is sent to — or, for `set_password`, minting a credential on the account it
    belongs to — and the recipient may be the victim rather than the requester.
    Delivery stays inline and unguarded — if it fails, the caller must NOT be told to enter a
    code that was never sent, so the request should fail.
    """
    if type_ == "email":
        subject, html, text = build_step_up_code_email(action, type_, code, masked_target)
        await email_sender.send(to, subject, html, text)
    else:
        await sms_sender.send(to, build_step_up_code_sms(action, type_, code, masked_target))


async def _send_email_or_log(sender, to: str, subject: str, html: str, text: str) -> None:
    """Deliver a notification email, logging — never raising — on provider failure (ADR-162)."""
    try:
        await sender.send(to, subject, html, text)
    except Exception:  # noqa: BLE001 — a change already committed must not die here
        logger.exception("contact notification email failed: to=%s subject=%s", to, subject)


async def _send_sms_or_log(sender, to: str, body: str) -> None:
    """Deliver a notification SMS, logging — never raising — on provider failure (ADR-162)."""
    try:
        await sender.send(to, body)
    except Exception:  # noqa: BLE001 — a change already committed must not die here
        logger.exception("contact notification sms failed: to=%s", to)


async def _notify(dispatch, fn, *args) -> None:
    """Run a post-commit notification through `dispatch`, or inline when there is none.

    `dispatch` is `BackgroundTasks.add_task` in the HTTP path (ADR-162), which keeps provider
    latency out of the request and, paired with the `_or_log` senders, keeps a delivery
    failure from unwinding a change that has already committed. Service-level callers that
    pass nothing get the inline behaviour, which is what the unit tests want.
    """
    if dispatch is None:
        await fn(*args)
    else:
        dispatch(fn, *args)


async def _require_step_up(
    db: AsyncSession,
    redis,
    *,
    actor: User,
    existing: UserContact,
    step_up,
    action: str,
    target: str = "",
    email_sender,
    sms_sender,
) -> None:
    """Prove the caller may `action` (`replace`/`remove`/`set_password`) `existing`, or raise.

    Which proof is demanded is decided here, from the account's own shape — never from what
    the client chose to send. An account with a password proves it knows the password; an
    SSO-only account proves it still holds the channel the code is sent to.

    This is the check that stops a stolen session from becoming permanent account takeover:
    swap the recovery channel, sign out, then "forgot password" into the account. Removal
    goes through the same gate (ADR-159) — otherwise deleting first walks straight past it.

    The code an SSO-only account receives is bound to this exact `action` and `target`
    (ADR-164), so approving one change never authorizes a different one.
    """
    identity = await identity_repository.get_password_identity(db, str(actor.uuid))
    if identity is not None and identity.password_hash:
        if not (step_up and step_up.password):
            raise StepUpRequired(f"{_ACTION_ZH.get(action, '這項操作')}需要輸入密碼")
        if not verify_password(step_up.password, identity.password_hash):
            raise StepUpFailed("密碼錯誤")
        return

    # SSO-only: no password to check, so fall back to holding the old channel.
    verification = VerificationRepository(redis)
    key = {"user_uuid": str(actor.uuid), "type_": existing.type, "value": existing.value,
           "action": action, "target": target}
    if not (step_up and step_up.old_channel_code):
        code, outcome = await verification.issue_old_channel_step_up(**key)
        if outcome == "pending":
            # Do not mint a second code: it would silently invalidate the one the owner is
            # holding, and every repeat delivers another message to them (ADR-165).
            raise StepUpRequired("驗證碼已寄至原聯絡方式，請使用先前收到的那一組")
        if outcome == "throttled":
            raise StepUpRequired("驗證碼寄送次數已達上限，請稍後再試")
        masked_target = _mask(existing.type, target) if action == "replace" else None
        try:
            await _deliver_step_up_code(
                existing.type, existing.value, code, action=action, masked_target=masked_target,
                email_sender=email_sender, sms_sender=sms_sender,
            )
        except Exception:
            # A code that was never delivered must not count as pending, or ADR-165's
            # do-not-reissue rule turns one provider blip into a 10-minute lockout on
            # changing or removing a contact (ADR-216). The request still fails.
            await verification.discard_old_channel_step_up(**key)
            raise
        raise StepUpRequired("已將驗證碼寄至原聯絡方式，請填入 step_up.old_channel_code")
    payload = await verification.consume_old_channel_step_up(
        **key, code=step_up.old_channel_code
    )
    if payload is None:
        raise StepUpFailed("原聯絡方式的驗證碼錯誤或已過期")


# Every action a step-up code can authorize. The value is part of the Redis key (ADR-164),
# so a code minted for one of these can never be spent on another.
ACTION_REPLACE = "replace"
ACTION_REMOVE = "remove"
ACTION_SET_PASSWORD = "set_password"
ACTION_LINK = "link_identity"
ACTION_UNLINK = "unlink_identity"

_ACTION_ZH = {
    ACTION_REPLACE: "更換聯絡方式",
    ACTION_REMOVE: "移除聯絡方式",
    ACTION_SET_PASSWORD: "設定密碼",
    ACTION_LINK: "新增登入方式",
    ACTION_UNLINK: "移除登入方式",
}

# A contact added moments ago is not evidence of anything: the caller holding the session may
# be the one who added it. Mirrors the industry pattern — Google holds a changed recovery
# address for up to 7 days before it takes effect (ADR-219).
PROOF_COOLDOWN = timedelta(days=7)


async def require_channel_proof(
    db: AsyncSession,
    redis,
    *,
    actor: User,
    step_up,
    action: str,
    target: str = "",
    email_sender,
    sms_sender,
) -> None:
    """Prove the caller holds the account, before it gains a new way in (ADR-215/217).

    The one gate every "add a permanent way into this account" path goes through: a first
    password, and linking an SSO provider. An account with a password proves it knows the
    password; otherwise a code goes to a contact the account already held.
    """
    existing = await _proof_contact(db, str(actor.uuid))
    await _require_step_up(
        db, redis, actor=actor, existing=existing, step_up=step_up, action=action,
        target=target, email_sender=email_sender, sms_sender=sms_sender,
    )


async def require_step_up_for_first_password(
    db: AsyncSession,
    redis,
    *,
    actor: User,
    step_up=None,
    email_sender,
    sms_sender,
) -> None:
    """Prove the caller holds one of the account's contacts before a first password is minted.

    `/auth/set-password` has no old password to check, so before ADR-215 a session was the
    only thing between a caller and a brand-new permanent credential. Revoking sessions
    afterwards (ADR-160) does not close that: the password outlives the session, and whoever
    minted it can simply sign in again. The proof therefore has to happen *before* the
    credential exists.

    The account is SSO-only by definition here — `set_password` 409s when a password identity
    already exists — so `_require_step_up` takes its SSO branch and delivers a code to the
    contact. The action is its own value, so a code issued for a contact change can never be
    spent here and vice versa (ADR-164).
    """
    await require_channel_proof(
        db, redis, actor=actor, step_up=step_up, action=ACTION_SET_PASSWORD,
        email_sender=email_sender, sms_sender=sms_sender,
    )


async def notify_password_set(
    db: AsyncSession, *, user_uuid: str, email_sender, sms_sender, dispatch=None,
    changed: bool = False,
) -> None:
    """Tell every contact on the account that its password was set or changed (ADR-215/218).

    A first password on an SSO-only account is a new permanent way in, so it must not appear
    silently — the step-up code proved consent at the time, but this is what the owner sees
    if that code was ever read out to someone. Routed through `_notify` and the `_or_log`
    senders like every other post-commit notification (ADR-162): the identity is already
    written, so a provider outage must not turn a successful request into a 500.
    """
    for contact in await contact_repository.list_by_user(db, user_uuid):
        masked = _mask(contact.type, contact.value)
        if contact.type == "email":
            subject, html, text = build_password_set_email(masked, changed=changed)
            await _notify(dispatch, _send_email_or_log,
                          email_sender, contact.value, subject, html, text)
        else:
            await _notify(dispatch, _send_sms_or_log,
                          sms_sender, contact.value, build_password_set_sms(masked, changed=changed))


def _settled(contacts: list[UserContact], now: datetime) -> list[UserContact]:
    """The contacts old enough to prove anything (ADR-219)."""
    return [c for c in contacts if c.created_at and now - c.created_at >= PROOF_COOLDOWN]


async def _proof_contact(db: AsyncSession, user_uuid: str) -> UserContact:
    """The contact a step-up code is sent to: settled first, email before phone.

    Deterministic rather than caller-chosen, for the same reason `_require_step_up` decides
    the proof type itself — letting the client name the channel would let a caller pick the
    one they control. `ADR-086` sets no gate on the *first* contact of a type, so a session
    holder can attach one they own; the cooldown is what stops that one from immediately
    becoming the thing the account proves itself with (ADR-219).

    When nothing has settled yet — a genuinely new account — the oldest contact is used. That
    keeps a legitimate first week working, and still prefers whatever the account had before
    the caller showed up.
    """
    contacts = await contact_repository.list_by_user(db, user_uuid)
    if not contacts:
        raise ContactNotFound("此帳號沒有可驗證的聯絡方式，請先新增聯絡方式")
    pool = _settled(contacts, datetime.now(UTC)) or [min(contacts, key=lambda c: c.created_at)]
    for type_ in ("email", "phone"):
        for contact in pool:
            if contact.type == type_:
                return contact
    return pool[0]


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
            action="replace", target=value,
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
    dispatch=None,
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
    # Tell the OLD channel, masked — the only way a victim finds out (ADR-085). The swap is
    # already committed at this point, so the send neither blocks the response nor takes the
    # request down with it if the provider is having a bad day (ADR-162).
    masked = _mask(type_, value)
    if old_type == "email":
        subject, html, text = build_contact_changed_email(masked)
        await _notify(dispatch, _send_email_or_log, email_sender, old_value, subject, html, text)
    else:
        await _notify(dispatch, _send_sms_or_log, sms_sender,
                      old_value, build_contact_changed_sms(masked))
    return True


async def _notify_contact_removed(
    removed: tuple[str, str], targets: list[tuple[str, str]], *,
    email_sender, sms_sender, dispatch=None,
) -> None:
    """Announce a removal to every channel that survives it (ADR-159).

    Takes plain `(type, value)` pairs rather than `UserContact` rows on purpose: the caller
    reads them off before the DELETE commits, and the session is `expire_on_commit=True`, so
    an ORM instance would lazy-reload on attribute access and raise MissingGreenlet here.

    Falls back to the removed channel itself when nothing survives — an SSO-only account
    dropping its last contact still deserves to be told, and that address is by definition
    still deliverable at this moment.
    """
    removed_type, removed_value = removed
    masked = _mask(removed_type, removed_value)
    for target_type, target_value in targets or [removed]:
        if target_type == "email":
            subject, html, text = build_contact_removed_email(removed_type, masked)
            await _notify(dispatch, _send_email_or_log,
                          email_sender, target_value, subject, html, text)
        else:
            await _notify(dispatch, _send_sms_or_log, sms_sender,
                          target_value, build_contact_removed_sms(removed_type, masked))


async def _survivors_of(
    db: AsyncSession, user_uuid: str, doomed: UserContact
) -> list[tuple[str, str]]:
    """The `(type, value)` pairs that would remain if `doomed` were removed.

    Plain tuples rather than ORM rows: the caller keeps them across the DELETE commit, and
    the session is `expire_on_commit=True`, so touching an attribute afterwards would trigger
    a lazy reload and raise MissingGreenlet.
    """
    return [
        (c.type, c.value)
        for c in await contact_repository.list_by_user(db, user_uuid)
        if c.uuid != doomed.uuid
    ]


async def delete_contact(
    db: AsyncSession,
    redis,
    *,
    actor: User,
    type_: str,
    step_up=None,
    email_sender,
    sms_sender,
    dispatch=None,
) -> None:
    """Remove one of the caller's contacts, refusing to strand the account (ADR-087).

    A contact IS the login identifier, so dropping the last one leaves an account with no
    password-reset destination and no way back in — unless an SSO identity still gets them
    there.

    Removal demands the same step-up as replacement (ADR-159). Without it, a stolen session
    could delete the recovery channel and then re-add an attacker-controlled one: the
    replacement gate only fires when a contact of that type already exists, so deleting
    first walked straight past it.

    The three checks run in this order deliberately:

    1. **nothing to delete → 404.** Cheapest, and asking for a password to remove something
       that is not there is nonsense.
    2. **last login channel → 409.** A pure refusal that mutates nothing and reveals nothing
       the caller cannot already read off `GET /users/me`. Demanding proof first would make
       the owner authenticate only to be told the operation was never possible.
    3. **step-up.** Everything past here can actually remove a way back into the account.

    The 409 check then runs a second time under a row lock (ADR-163). The first pass is the
    cheap one that decides whether to bother the user for proof at all; the second is the one
    that actually holds, because between reading the count and deleting a row a concurrent
    DELETE of the *other* type can do the same and both leave one behind. The lock is taken
    after step-up so no database lock is ever held across a mail or SMS send.
    """
    existing = await contact_repository.get_by_user_and_type(
        db, user_uuid=str(actor.uuid), type_=type_
    )
    if existing is None:
        raise ContactNotFound(f"This account has no {type_}")

    actor_uuid = str(actor.uuid)  # capture before any commit expires the instance
    if not await _survivors_of(db, actor_uuid, existing) and not await \
            identity_repository.has_sso_identity(db, actor_uuid):
        raise LastLoginChannel("帳號至少需保留一個登入管道")

    await _require_step_up(
        db, redis, actor=actor, existing=existing, step_up=step_up, action="remove",
        email_sender=email_sender, sms_sender=sms_sender,
    )

    await contact_repository.lock_owner(db, actor_uuid)
    survivors = await _survivors_of(db, actor_uuid, existing)
    if not survivors and not await identity_repository.has_sso_identity(db, actor_uuid):
        # Nothing was changed, but the lock is held until this transaction ends — release it
        # here rather than leaving it to the request teardown, which would keep every other
        # writer for this account waiting on a refusal.
        await db.rollback()
        raise LastLoginChannel("帳號至少需保留一個登入管道")

    removed = (existing.type, existing.value)  # read before the DELETE commits
    await contact_repository.delete_contact(db, contact=existing)
    await _notify_contact_removed(
        removed, survivors, email_sender=email_sender, sms_sender=sms_sender, dispatch=dispatch
    )
