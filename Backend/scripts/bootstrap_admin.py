"""Bootstrap script: grant the super_admin platform role to a user by verified contact (T116).

Run once per environment after `scripts/seed_rbac.py`. Refuses to create a second
super_admin unless `--force` is passed (ADR-034) — an accidental re-run against the wrong
account should fail loudly, not silently multiply admins. This is a standalone script with
no HTTP request context, so the resulting `user_role_assign` row's audit_log entry has
actor=NULL (app.current_user_id is only ever set by AuditContextMiddleware for real
requests, see app/core/context.py) — expected for a bootstrap step, not a bug.
"""

import argparse
import asyncio

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker

from app.core.config import settings
from app.models.rbac import UserRoleAssign
from app.repositories.auth_repository import contact_repository, role_repository, user_repository

SUPER_ADMIN_ROLE_NAME = "super_admin"


async def _count_super_admins(db: AsyncSession, role_uuid: str) -> int:
    rows = (
        await db.execute(select(UserRoleAssign.user_uuid).where(UserRoleAssign.role_uuid == role_uuid))
    ).all()
    return len(rows)


async def bootstrap(contact_type: str, contact_value: str, *, force: bool) -> None:
    """Grant super_admin to the verified user owning `contact_value`.

    Builds its own engine per call (rather than a module-level singleton, unlike
    scripts/seed_rbac.py) so the async connection pool binds to whichever event loop is
    running *this* call — this script is meant to run once per process via `asyncio.run`,
    and a module-level engine would otherwise bind to whatever loop happened to be active
    at import time (a real problem for tests, which get a fresh loop per test).
    """
    engine = create_async_engine(settings.SQLALCHEMY_DATABASE_URL, echo=False)
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    try:
        async with async_session() as db:
            user = await contact_repository.get_user_by_contact(
                db, type_=contact_type, value=contact_value
            )
            if user is None:
                raise SystemExit(f"No verified user found for {contact_type}:{contact_value}")

            role = await role_repository.get_by_name(db, SUPER_ADMIN_ROLE_NAME)
            if role is None:
                raise SystemExit("super_admin role not found — run scripts/seed_rbac.py first")

            existing_count = await _count_super_admins(db, role.uuid)
            if existing_count > 0 and not force:
                raise SystemExit(
                    f"{existing_count} super_admin(s) already exist — pass --force to add another"
                )

            created = await user_repository.assign_role(db, str(user.uuid), str(role.uuid))
            if created:
                print(f"Granted super_admin to {user.name} ({user.uuid})")
            else:
                print(f"{user.name} ({user.uuid}) already holds super_admin")
    finally:
        await engine.dispose()


def main() -> None:
    """Parse CLI args and run the bootstrap."""
    parser = argparse.ArgumentParser(description="Bootstrap the first super_admin user")
    parser.add_argument("contact_type", choices=["email", "phone"])
    parser.add_argument("contact_value")
    parser.add_argument("--force", action="store_true", help="allow adding beyond the first super_admin")
    args = parser.parse_args()
    asyncio.run(bootstrap(args.contact_type, args.contact_value, force=args.force))


if __name__ == "__main__":
    main()
