"""SSO endpoints: Google/LINE first-login + account linking."""

from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import security
from app.core.normalize import normalize_email
from app.core.redis import get_redis
from app.models.auth import User
from app.repositories.auth_repository import (
    contact_repository,
    identity_repository,
    user_repository,
)
from app.schemas.auth import GoogleSsoRequest, IdTokenRequest, LinkGoogleRequest, TokenPair
from app.services.auth_account import create_account
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
        current_user: User = Depends(security.get_current_user),
        db: AsyncSession = Depends(security.get_db),
        verifier: GoogleTokenVerifier = Depends(get_google_verifier),
):
    """Attach a verified Google identity to the current account (login method only; no contact change)."""
    try:
        gid = await verifier.verify(body.id_token)
    except GoogleTokenVerificationError as err:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail="Invalid Google token") from err

    # this Google sub already bound somewhere?
    existing = await identity_repository.get_by_provider_subject(db, provider="google", subject=gid.sub)
    if existing is not None:
        if str(existing.user_uuid) == str(current_user.uuid):
            raise HTTPException(status.HTTP_409_CONFLICT, detail="Google account already linked")
        raise HTTPException(status.HTTP_409_CONFLICT,
                            detail="This Google account is already linked to another account")
    # current user already has a (different) google identity?
    if await identity_repository.get_user_identity(db, str(current_user.uuid), "google") is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, detail="Google account already linked")
    try:
        await identity_repository.create(db, obj_in={
            "user_uuid": current_user.uuid, "provider": "google", "provider_subject": gid.sub,
        })
    except IntegrityError as err:  # concurrent link race
        await db.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, detail="Already linked") from err
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
        current_user: User = Depends(security.get_current_user),
        db: AsyncSession = Depends(security.get_db),
        verifier: LineTokenVerifier = Depends(get_line_verifier),
):
    """Attach a verified LINE identity to the current account (login method only; no contact change)."""
    try:
        lid = await verifier.verify(body.id_token)
    except LineTokenVerificationError as err:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail="Invalid LINE token") from err

    existing = await identity_repository.get_by_provider_subject(db, provider="line", subject=lid.sub)
    if existing is not None:
        if str(existing.user_uuid) == str(current_user.uuid):
            raise HTTPException(status.HTTP_409_CONFLICT, detail="LINE account already linked")
        raise HTTPException(status.HTTP_409_CONFLICT,
                            detail="This LINE account is already linked to another account")
    if await identity_repository.get_user_identity(db, str(current_user.uuid), "line") is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, detail="LINE account already linked")
    try:
        await identity_repository.create(db, obj_in={
            "user_uuid": current_user.uuid, "provider": "line", "provider_subject": lid.sub,
        })
    except IntegrityError as err:
        await db.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, detail="Already linked") from err
    return {"detail": "LINE account linked"}
