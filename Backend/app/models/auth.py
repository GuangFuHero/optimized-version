"""SQLAlchemy models for users, login identities, and contacts.

RBAC models (Role/Permission/*) moved to app/models/rbac.py; team models to app/models/team.py
(ADR-026 drop-and-replace of the old Group/Policy engine).
"""

from datetime import datetime

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UUIDPKMixin


class User(Base, UUIDPKMixin, TimestampMixin):
    """ORM model for a registered person (no auth material here)."""

    __tablename__ = "users"
    name: Mapped[str] = mapped_column(String(100))  # display nickname; no longer the login id, not unique
    credibility_score: Mapped[float] = mapped_column(Float, default=50.0)
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    # Written only when a refresh token is rotated (ADR-093), so the value is at most one
    # access-token TTL (15 min) stale. Deliberately NOT written per request: `users` is in
    # AUDITED_TABLES, so a per-request UPDATE would add one audit_logs row per request.
    last_activity_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True, comment="最後活動時間（refresh token 輪替時寫入）"
    )
    # A user has at most one team (ADR-019). Sole source of truth for "which team" — a
    # team-kind Role grant (app/models/rbac.py:Role) always resolves against this column,
    # never a copy stored elsewhere.
    team_uuid: Mapped[str | None] = mapped_column(ForeignKey("teams.uuid"), nullable=True, index=True)

    # 關聯
    identities: Mapped[list["UserIdentity"]] = relationship(back_populates="user")
    contacts: Mapped[list["UserContact"]] = relationship(back_populates="user")


class UserIdentity(Base, UUIDPKMixin):
    """How a user logs in: one row per auth method (password / google / line)."""

    __tablename__ = "user_identities"
    __table_args__ = (
        UniqueConstraint("provider", "provider_subject", name="uq_identity_provider_subject"),
        UniqueConstraint("user_uuid", "provider", name="uq_identity_user_provider"),
    )
    user_uuid: Mapped[str] = mapped_column(ForeignKey("users.uuid"), index=True)
    provider: Mapped[str] = mapped_column(String(20))  # password | google | line
    provider_subject: Mapped[str | None] = mapped_column(String(255), nullable=True)
    # pbkdf2_sha256$iters$salt_frontend$salt_backend$hash ; only when provider == password
    password_hash: Mapped[str | None] = mapped_column(String(512), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    user = relationship("User", back_populates="identities")


class UserContact(Base, UUIDPKMixin):
    """A verified contact method; email/phone double as the global login identifier."""

    __tablename__ = "user_contacts"
    # uq_contact_user_type: at most one contact per (user, type). A plain (non-partial) unique is safe
    # because every persisted contact row is verified=True. If unverified rows ever land in the DB,
    # switch this to a partial unique on verified=True.
    __table_args__ = (
        UniqueConstraint("type", "value", name="uq_contact_type_value"),
        UniqueConstraint("user_uuid", "type", name="uq_contact_user_type"),
    )
    user_uuid: Mapped[str] = mapped_column(ForeignKey("users.uuid"), index=True)
    type: Mapped[str] = mapped_column(String(10))  # email | phone
    value: Mapped[str] = mapped_column(String(320))  # normalized (lowercase email / E.164 phone)
    verified: Mapped[bool] = mapped_column(Boolean, default=False)
    verified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    user = relationship("User", back_populates="contacts")
