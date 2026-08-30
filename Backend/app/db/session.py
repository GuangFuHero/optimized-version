"""Async SQLAlchemy engine, session factory, and declarative base."""

from sqlalchemy import event, text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.context import request_client_ip, request_user_uuid
from app.models.base import Base as Base  # noqa: F401 — re-export single source of truth

# 從設定檔獲取連線字串
SQLALCHEMY_DATABASE_URL = settings.SQLALCHEMY_DATABASE_URL

engine = create_async_engine(SQLALCHEMY_DATABASE_URL, echo=False)
# expire_on_commit=False is required here, not a preference. With SQLAlchemy's default
# (True), commit() marks every loaded object's attributes as stale, and the next read of one
# silently re-queries the database. Under asyncio there is no await point in that reload, so
# it raises MissingGreenlet instead of working.
#
# It breaks any code that touches an ORM object after committing. The case that surfaced it:
# a GraphQL mutation commits, then resolves the fields of the object it returns; a field
# resolver checks the caller's permissions, which reads the logged-in user's uuid — and that
# read fails, because commit() had just expired the user object too.
SessionLocal = async_sessionmaker(
    autocommit=False, autoflush=False, bind=engine, class_=AsyncSession, expire_on_commit=False
)


async def attribute_writes_to(db, user_uuid: str) -> None:
    """Name `user_uuid` as the actor for the writes that follow, on an open transaction.

    `set_audit_session_variables` below covers the ordinary case: the middleware resolves the
    caller from their access token before anything runs, and the variable is applied when the
    transaction begins. Two write paths are not covered by it, both in `auth/`:
    `POST /auth/login` and `POST /auth/refresh` carry no access token — the caller is proving
    who they are, not asserting it — so the ContextVar is empty for the whole request and the
    `users` UPDATE each of them performs lands in `audit_logs` with `user_uuid = NULL`
    (ADR-170). By the time either one writes, it has *just* established the identity.

    Setting the ContextVar alone is not enough there: the transaction is already open by then
    (both paths read from the database first), so `after_begin` has been and gone. Hence both
    — `set_config` for the transaction already running, and the ContextVar so that any later
    one in the same request is attributed too, including one opened after a rollback.
    """
    request_user_uuid.set(str(user_uuid))
    await db.execute(
        text("SELECT set_config('app.current_user_id', :user_uuid, true)"),
        {"user_uuid": str(user_uuid)},
    )


@event.listens_for(Session, "after_begin")
def set_audit_session_variables(session, transaction, connection):
    """Set transaction-scoped PostgreSQL variables for user attribution during writes."""
    user_uuid = request_user_uuid.get()
    client_ip = request_client_ip.get()


    if user_uuid:
        connection.execute(
            text("SELECT set_config('app.current_user_id', :user_uuid, true)"),
            {"user_uuid": str(user_uuid)},
        )
    if client_ip:
        connection.execute(
            text("SELECT set_config('app.client_ip', :client_ip, true)"),
            {"client_ip": client_ip},
        )

