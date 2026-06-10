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
SessionLocal = async_sessionmaker(autocommit=False, autoflush=False, bind=engine, class_=AsyncSession)


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

