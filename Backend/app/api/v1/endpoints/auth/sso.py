"""SSO endpoints: Google/LINE first-login + account linking."""

from datetime import UTC, datetime

from fastapi import (
    APIRouter,
    BackgroundTasks,
    Depends,
    HTTPException,
    Request,
    Response,
    status,
)
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import security
from app.core.normalize import normalize_email
from app.core.redis import get_redis
from app.messaging.email import get_email_sender
from app.messaging.sms import get_sms_sender
from app.models.auth import User
from app.repositories.auth_repository import (
    contact_repository,
    identity_repository,
    user_repository,
)
from app.schemas.auth import (
    GoogleSsoRequest,
    IdTokenRequest,
    LinkGoogleRequest,
    TokenPair,
    UnlinkIdentityRequest,
)
from app.services import auth_identity
from app.services.auth_account import create_account
from app.services.auth_contact import ContactNotFound, StepUpFailed, StepUpRequired
from app.sso.google import (
    GoogleTokenVerificationError,
    GoogleTokenVerifier,
    get_google_verifier,
)
from app.sso.line import (
    LineTokenVerificationError,
    LineTokenVerifier,
    get_line_verifier,
)

from .deps import get_rate_limiter, issue_token_pair

router = APIRouter()

# One mapping for every link/unlink use-case error, mirroring the contacts endpoint (ADR-088).
_STATUS_BY_ERROR = {
    auth_identity.IdentityConflict: status.HTTP_409_CONFLICT,
    auth_identity.LastLoginMethod: status.HTTP_409_CONFLICT,
    auth_identity.IdentityNotFound: status.HTTP_404_NOT_FOUND,
    StepUpRequired: status.HTTP_422_UNPROCESSABLE_ENTITY,
    ContactNotFound: status.HTTP_422_UNPROCESSABLE_ENTITY,
    StepUpFailed: status.HTTP_401_UNAUTHORIZED,
}


def _as_http(err: Exception) -> HTTPException:
    """Translate a link/unlink use-case error into its HTTP equivalent."""
    return HTTPException(status_code=_STATUS_BY_ERROR[type(err)], detail=str(err))


@router.post("/sso/google", response_model=TokenPair,
             dependencies=[Depends(get_rate_limiter(10, 60))])
async def sso_google(
        body: GoogleSsoRequest,
        request: Request,
        db: AsyncSession = Depends(security.get_db),
        redis=Depends(get_redis),
        verifier: GoogleTokenVerifier = Depends(get_google_verifier),
):
    """Verify a Google id_token; log in an existing google identity or create the account on first login."""
    try:
        gid = await verifier.verify(body.id_token)
    except GoogleTokenVerificationError as err:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail="Invalid Google token") from err

    identity = await identity_repository.get_by_provider_subject(db, provider="google", subject=gid.sub)
    if identity is None:
        if not gid.email_verified:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Google email not verified")
        try:
            email = normalize_email(gid.email)
        except ValueError as err:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Google email not verified") from err
        if await contact_repository.is_value_taken(db, type_="email", value=email):
            raise HTTPException(
                status.HTTP_409_CONFLICT,
                detail="Email already in use; log in and link Google in settings",
            )
        name = gid.name or email.split("@")[0]
        try:
            user = await create_account(
                db, name=name, provider="google", provider_subject=gid.sub,
                contact_type="email", value=email,
            )
        except IntegrityError as err:  # concurrent first-login race
            await db.rollback()
            identity = await identity_repository.get_by_provider_subject(
                db, provider="google", subject=gid.sub)
            if identity is None:
                raise HTTPException(
                    status.HTTP_409_CONFLICT,
                    detail="Email already in use; log in and link Google in settings",
                ) from err
            user = await user_repository.get_by_uuid(db, identity.user_uuid)
    else:
        user = await user_repository.get_by_uuid(db, identity.user_uuid)

    await user_repository.update(db, db_obj=user, obj_in={"last_login_at": datetime.now(UTC)})
    return await issue_token_pair(redis, request, str(user.uuid))


@router.post("/link/google", status_code=status.HTTP_200_OK,
             dependencies=[Depends(get_rate_limiter(5, 60))])
async def link_google(
        body: LinkGoogleRequest,
        background_tasks: BackgroundTasks,
        current_user: User = Depends(security.get_current_user),
        db: AsyncSession = Depends(security.get_db),
        redis=Depends(get_redis),
        verifier: GoogleTokenVerifier = Depends(get_google_verifier),
        email_sender=Depends(get_email_sender),
        sms_sender=Depends(get_sms_sender),
):
    """Attach a verified Google identity to the current account, proof first (ADR-217).

    The id_token proves the caller holds that Google account. It is not proof that they hold
    *this* one, so the account is asked for the same channel proof a first password needs —
    otherwise a stolen session plus the attacker's own Google account is a permanent way in
    that no password change or session revocation can take back.
    """
    try:
        gid = await verifier.verify(body.id_token)
    except GoogleTokenVerificationError as err:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail="Invalid Google token") from err
    try:
        await auth_identity.link_identity(
            db, redis, actor=current_user, provider="google", subject=gid.sub,
            step_up=body.step_up, email_sender=email_sender, sms_sender=sms_sender,
            dispatch=background_tasks.add_task,
        )
    except tuple(_STATUS_BY_ERROR) as err:
        raise _as_http(err) from err
    return {"detail": "Google account linked"}


@router.post("/sso/line", response_model=TokenPair,
             dependencies=[Depends(get_rate_limiter(10, 60))])
async def sso_line(
        body: IdTokenRequest,
        request: Request,
        db: AsyncSession = Depends(security.get_db),
        redis=Depends(get_redis),
        verifier: LineTokenVerifier = Depends(get_line_verifier),
):
    """Verify a LINE id_token; log in an existing line identity or create the account on first login."""
    try:
        lid = await verifier.verify(body.id_token)
    except LineTokenVerificationError as err:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail="Invalid LINE token") from err

    identity = await identity_repository.get_by_provider_subject(db, provider="line", subject=lid.sub)
    if identity is None:
        contact_type = contact_value = None
        if lid.email:
            try:
                email = normalize_email(lid.email)
            except ValueError:
                email = None
            # LINE email is optional: if it collides, just skip it (do NOT block the login)
            if email and not await contact_repository.is_value_taken(db, type_="email", value=email):
                contact_type, contact_value = "email", email
        name = lid.name or f"LINE-{lid.sub[:8]}"
        try:
            user = await create_account(
                db, name=name, provider="line", provider_subject=lid.sub,
                contact_type=contact_type, value=contact_value,
            )
        except IntegrityError as err:  # concurrent first-login race
            await db.rollback()
            identity = await identity_repository.get_by_provider_subject(
                db, provider="line", subject=lid.sub)
            if identity is None:
                raise HTTPException(status.HTTP_409_CONFLICT, detail="LINE account conflict") from err
            user = await user_repository.get_by_uuid(db, identity.user_uuid)
    else:
        user = await user_repository.get_by_uuid(db, identity.user_uuid)

    await user_repository.update(db, db_obj=user, obj_in={"last_login_at": datetime.now(UTC)})
    return await issue_token_pair(redis, request, str(user.uuid))


@router.post("/link/line", status_code=status.HTTP_200_OK,
             dependencies=[Depends(get_rate_limiter(5, 60))])
async def link_line(
        body: IdTokenRequest,
        background_tasks: BackgroundTasks,
        current_user: User = Depends(security.get_current_user),
        db: AsyncSession = Depends(security.get_db),
        redis=Depends(get_redis),
        verifier: LineTokenVerifier = Depends(get_line_verifier),
        email_sender=Depends(get_email_sender),
        sms_sender=Depends(get_sms_sender),
):
    """Attach a verified LINE identity to the current account. Same contract as `link_google`."""
    try:
        lid = await verifier.verify(body.id_token)
    except LineTokenVerificationError as err:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail="Invalid LINE token") from err
    try:
        await auth_identity.link_identity(
            db, redis, actor=current_user, provider="line", subject=lid.sub,
            step_up=body.step_up, email_sender=email_sender, sms_sender=sms_sender,
            dispatch=background_tasks.add_task,
        )
    except tuple(_STATUS_BY_ERROR) as err:
        raise _as_http(err) from err
    return {"detail": "LINE account linked"}


@router.delete("/link/{provider}", status_code=status.HTTP_204_NO_CONTENT,
               dependencies=[Depends(get_rate_limiter(5, 60))])
async def unlink_identity(
        provider: str,
        background_tasks: BackgroundTasks,
        body: UnlinkIdentityRequest | None = None,
        current_user: User = Depends(security.get_current_user),
        db: AsyncSession = Depends(security.get_db),
        redis=Depends(get_redis),
        email_sender=Depends(get_email_sender),
        sms_sender=Depends(get_sms_sender),
):
    """Remove one SSO login method from the current account (ADR-218).

    The half that was missing: `/users/me` has always listed the account's login methods, but
    nothing could take one off, so a provider attached by someone else was permanent.
    """
    if provider not in auth_identity.SSO_PROVIDERS:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Unknown provider")
    try:
        await auth_identity.unlink_identity(
            db, redis, actor=current_user, provider=provider,
            step_up=body.step_up if body else None,
            email_sender=email_sender, sms_sender=sms_sender,
            dispatch=background_tasks.add_task,
        )
    except tuple(_STATUS_BY_ERROR) as err:
        raise _as_http(err) from err
    return Response(status_code=status.HTTP_204_NO_CONTENT)
