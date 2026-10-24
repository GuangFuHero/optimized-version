"""SSO endpoints: linking and unlinking Google/LINE login methods. Signing in with them is `oauth.py`."""

from fastapi import (
    APIRouter,
    BackgroundTasks,
    Depends,
    Request,
    Response,
    status,
)
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import security
from app.core.api_errors import ApiError, ErrorCode
from app.core.redis import get_redis
from app.messaging.email import get_email_sender
from app.messaging.sms import get_sms_sender
from app.models.auth import User
from app.repositories.step_up_proof_repository import ProofHolder
from app.schemas.auth import (
    IdTokenRequest,
    LinkGoogleRequest,
    UnlinkIdentityRequest,
)
from app.services import auth_identity
from app.services.auth_contact import (
    SSO_PROVIDERS,
    ContactNotFound,
    ReauthRequired,
    StepUpFailed,
    StepUpRequired,
)
from app.sso import get_sso_verifiers
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

from .deps import (
    clear_cookies_if_cookie_authenticated,
    get_rate_limiter,
    get_step_up_holder,
    reauth_required,
)

router = APIRouter()

# One mapping for every link/unlink use-case error, mirroring the contacts endpoint (ADR-088).
# Each entry carries a machine-readable code as well as a status, which is PR #41's contract
# (ADR-237): the status alone cannot separate "prove yourself first" from "your input is wrong",
# and they need different UI.
# Builders rather than (status, code) pairs — see the same table in `contacts.py`.
_ERROR_MAP = {
    auth_identity.IdentityConflict: lambda d: ApiError(
        status.HTTP_409_CONFLICT, ErrorCode.SSO_ALREADY_LINKED, detail=d),
    auth_identity.LastLoginMethod: lambda d: ApiError(
        status.HTTP_409_CONFLICT, ErrorCode.LAST_LOGIN_METHOD, detail=d),
    auth_identity.IdentityNotFound: lambda d: ApiError(
        status.HTTP_404_NOT_FOUND, ErrorCode.SSO_NOT_LINKED, detail=d),
    StepUpRequired: lambda d: ApiError(
        status.HTTP_422_UNPROCESSABLE_ENTITY, ErrorCode.STEP_UP_REQUIRED, detail=d),
    ContactNotFound: lambda d: ApiError(
        status.HTTP_422_UNPROCESSABLE_ENTITY, ErrorCode.NO_PROOF_CHANNEL, detail=d),
    StepUpFailed: lambda d: ApiError(
        status.HTTP_401_UNAUTHORIZED, ErrorCode.STEP_UP_INVALID, detail=d),
}


def _as_http(err: Exception) -> ApiError:
    """Translate a link/unlink use-case error into its HTTP equivalent, carrying its code."""
    if isinstance(err, ReauthRequired):
        return reauth_required(err)
    return _ERROR_MAP[type(err)](str(err))


@router.post("/link/google", status_code=status.HTTP_200_OK,
             dependencies=[Depends(get_rate_limiter(5, 60))])
async def link_google(
        body: LinkGoogleRequest,
        background_tasks: BackgroundTasks,
        current_user: User = Depends(security.get_current_user),
        step_up_holder: ProofHolder | None = Depends(get_step_up_holder),
        db: AsyncSession = Depends(security.get_db),
        redis=Depends(get_redis),
        verifier: GoogleTokenVerifier = Depends(get_google_verifier),
        email_sender=Depends(get_email_sender),
        sms_sender=Depends(get_sms_sender),
        verifiers=Depends(get_sso_verifiers),
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
        raise ApiError(status.HTTP_401_UNAUTHORIZED, ErrorCode.SSO_TOKEN_INVALID,
                       detail="Invalid Google token") from err
    try:
        await auth_identity.link_identity(
            db, redis, actor=current_user, provider="google", subject=gid.sub,
            step_up=body.step_up, email_sender=email_sender, sms_sender=sms_sender,
            dispatch=background_tasks.add_task, verifiers=verifiers, proof_holder=step_up_holder,
        )
    except tuple(_ERROR_MAP) as err:
        raise _as_http(err) from err
    return {"detail": "Google account linked"}


@router.post("/link/line", status_code=status.HTTP_200_OK,
             dependencies=[Depends(get_rate_limiter(5, 60))])
async def link_line(
        body: IdTokenRequest,
        background_tasks: BackgroundTasks,
        current_user: User = Depends(security.get_current_user),
        step_up_holder: ProofHolder | None = Depends(get_step_up_holder),
        db: AsyncSession = Depends(security.get_db),
        redis=Depends(get_redis),
        verifier: LineTokenVerifier = Depends(get_line_verifier),
        email_sender=Depends(get_email_sender),
        sms_sender=Depends(get_sms_sender),
        verifiers=Depends(get_sso_verifiers),
):
    """Attach a verified LINE identity to the current account. Same contract as `link_google`."""
    try:
        lid = await verifier.verify(body.id_token)
    except LineTokenVerificationError as err:
        raise ApiError(status.HTTP_401_UNAUTHORIZED, ErrorCode.SSO_TOKEN_INVALID,
                       detail="Invalid LINE token") from err
    try:
        await auth_identity.link_identity(
            db, redis, actor=current_user, provider="line", subject=lid.sub,
            step_up=body.step_up, email_sender=email_sender, sms_sender=sms_sender,
            dispatch=background_tasks.add_task, verifiers=verifiers, proof_holder=step_up_holder,
        )
    except tuple(_ERROR_MAP) as err:
        raise _as_http(err) from err
    return {"detail": "LINE account linked"}


@router.delete("/link/{provider}", status_code=status.HTTP_204_NO_CONTENT,
               dependencies=[Depends(get_rate_limiter(5, 60))])
async def unlink_identity(
        provider: str,
        background_tasks: BackgroundTasks,
        request: Request,
        body: UnlinkIdentityRequest | None = None,
        current_user: User = Depends(security.get_current_user),
        step_up_holder: ProofHolder | None = Depends(get_step_up_holder),
        db: AsyncSession = Depends(security.get_db),
        redis=Depends(get_redis),
        email_sender=Depends(get_email_sender),
        sms_sender=Depends(get_sms_sender),
        verifiers=Depends(get_sso_verifiers),
):
    """Remove one SSO login method from the current account (ADR-218).

    The half that was missing: `/users/me` has always listed the account's login methods, but
    nothing could take one off, so a provider attached by someone else was permanent.
    """
    if provider not in SSO_PROVIDERS:
        raise ApiError(status.HTTP_404_NOT_FOUND, ErrorCode.SSO_PROVIDER_UNKNOWN,
                       detail="Unknown provider")
    try:
        await auth_identity.unlink_identity(
            db, redis, actor=current_user, provider=provider,
            step_up=body.step_up if body else None,
            email_sender=email_sender, sms_sender=sms_sender,
            dispatch=background_tasks.add_task, verifiers=verifiers, proof_holder=step_up_holder,
        )
    except tuple(_ERROR_MAP) as err:
        raise _as_http(err) from err
    # Unlinking revoked every session. The cookies go on the Response returned here: FastAPI does
    # not merge an injected `response` into one the endpoint builds itself.
    response = Response(status_code=status.HTTP_204_NO_CONTENT)
    clear_cookies_if_cookie_authenticated(request, response)
    return response
