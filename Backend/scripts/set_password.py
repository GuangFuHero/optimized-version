r"""Set an account's password from the command line, for an account nobody can reset by mail.

The mock seed's back-office test accounts, asuper01 (super_admin) and aaudit01 (data_auditor), carry
no password in the repo: the mock password is published in the seed header, and the back office is
on a public host. Their `@mock.test` addresses receive nothing, so forgot-password cannot reach
them either. Run this once on the VM; SEED_MOCK keeps both accounts and their password
(Backend/DEPLOY.md):

    docker compose -f docker-compose.staging.yml run --rm -e PYTHONPATH=/app backend \
        python scripts/set_password.py asuper01@mock.test

It asks for the password twice and never echoes it. The stored hash is the one the login page
checks against: the page derives PBKDF2 from the password and the account's frontend salt
(Frontend/libs/modules/src/auth/login/credentials.ts), and the backend hashes that hex again
(app/core/security.py). Like /auth/change-password it signs the account out everywhere. As a
standalone script it has no request context, so its audit_log rows carry actor=NULL, as
scripts/bootstrap_admin.py's do.
"""

import argparse
import asyncio
import getpass
import hashlib
import secrets

from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker

from app.core import security
from app.core.config import settings
from app.core.normalize import normalize_email
from app.core.redis import create_redis_client
from app.models.auth import UserIdentity
from app.repositories.auth_repository import contact_repository, identity_repository
from app.repositories.session_repository import SessionRepository

# Frontend/libs/modules/src/auth/login/credentials.ts and utils/new-password.ts.
FRONTEND_ITERATIONS = 100_000
NEW_PASSWORD_MIN_LENGTH = 8


def frontend_hash(password: str, salt_frontend: str) -> str:
    """What the login page sends for `password`: PBKDF2-SHA256 over the trimmed text, as hex."""
    return hashlib.pbkdf2_hmac(
        "sha256", password.strip().encode(), salt_frontend.encode(), FRONTEND_ITERATIONS
    ).hex()


async def set_password(db: AsyncSession, redis, *, email: str, password: str) -> None:
    """Give the account behind a verified `email` this password, and sign it out everywhere.

    Raises ValueError, writing nothing, when no verified contact holds the address or the
    password is shorter than the login page lets anyone set.
    """
    if len(password.strip()) < NEW_PASSWORD_MIN_LENGTH:
        raise ValueError(f"A password needs at least {NEW_PASSWORD_MIN_LENGTH} characters")
    user = await contact_repository.get_user_by_contact(db, type_="email", value=normalize_email(email))
    if user is None:
        raise ValueError(f"No account holds the verified address {email}")
    user_uuid = str(user.uuid)

    salt_frontend = secrets.token_hex(16)
    password_hash = security.get_password_hash(frontend_hash(password, salt_frontend), salt_frontend)
    identity = await identity_repository.get_password_identity(db, user_uuid)
    if identity is None:
        db.add(UserIdentity(user_uuid=user_uuid, provider="password", password_hash=password_hash))
        await db.commit()
    else:
        await identity_repository.update(db, db_obj=identity, obj_in={"password_hash": password_hash})
    await SessionRepository(redis).revoke_all_for_user(user_uuid)


async def _run(email: str, password: str) -> None:
    engine = create_async_engine(settings.SQLALCHEMY_DATABASE_URL, echo=False)
    redis = create_redis_client(settings.REDIS_URL)
    try:
        async with sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)() as db:
            await set_password(db, redis, email=email, password=password)
    finally:
        await redis.aclose()
        await engine.dispose()


def main() -> None:
    """Ask for the password twice, then set it."""
    parser = argparse.ArgumentParser(description="Set an account's password from the command line")
    parser.add_argument("email", help="the account's verified email address")
    args = parser.parse_args()
    password = getpass.getpass("New password: ")
    if getpass.getpass("Again: ") != password:
        raise SystemExit("The two entries differ; nothing was changed")
    try:
        asyncio.run(_run(args.email, password))
    except ValueError as err:
        raise SystemExit(f"{err}; nothing was changed") from err
    print(f"Password set for {args.email}; its sessions are signed out")


if __name__ == "__main__":
    main()
