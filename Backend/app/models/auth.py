"""SQLAlchemy models for users, groups, policies, and RBAC assignment tables."""

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

    # 關聯
    groups: Mapped[list["UserGroupAssign"]] = relationship(back_populates="user")
    policies: Mapped[list["PolicyUserAssign"]] = relationship(back_populates="user")
    identities: Mapped[list["UserIdentity"]] = relationship(back_populates="user")
    contacts: Mapped[list["UserContact"]] = relationship(back_populates="user")


class Group(Base, UUIDPKMixin):
    """ORM model for a user group (role)."""

    __tablename__ = "groups"
    name: Mapped[str] = mapped_column(String(100))


class Policy(Base, UUIDPKMixin):
    """ORM model for an RBAC policy defining resource-level permissions."""

    __tablename__ = "policies"
    name: Mapped[str] = mapped_column(String(100), unique=True, index=True)
    description: Mapped[str | None] = mapped_column(String(255))
    category: Mapped[str | None] = mapped_column(String(50))
    read: Mapped[str] = mapped_column(String(50), default="none")
    create: Mapped[str] = mapped_column(String(50), default="none")
    edit: Mapped[str] = mapped_column(String(50), default="none")
    delete: Mapped[str] = mapped_column(String(50), default="none")


class UserGroupAssign(Base, UUIDPKMixin):
    """Junction table assigning users to groups."""

    __tablename__ = "user_group_assign"
    __table_args__ = (
        UniqueConstraint("user_uuid", "group_uuid", name="uq_user_group"),
    )
    user_uuid: Mapped[str] = mapped_column(ForeignKey("users.uuid"))
    group_uuid: Mapped[str] = mapped_column(ForeignKey("groups.uuid"))
    user = relationship("User", back_populates="groups")


class PolicyUserAssign(Base, UUIDPKMixin):
    """Junction table assigning policies directly to users."""

    __tablename__ = "policy_user_assign"
    user_uuid: Mapped[str] = mapped_column(ForeignKey("users.uuid"))
    policy_uuid: Mapped[str] = mapped_column(ForeignKey("policies.uuid"))
    user = relationship("User", back_populates="policies")


class PolicyGroupAssign(Base, UUIDPKMixin):
    """Junction table assigning policies to groups."""

    __tablename__ = "policy_group_assign"
    group_uuid: Mapped[str] = mapped_column(ForeignKey("groups.uuid"))
    policy_uuid: Mapped[str] = mapped_column(ForeignKey("policies.uuid"))


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
    __table_args__ = (UniqueConstraint("type", "value", name="uq_contact_type_value"),)
    user_uuid: Mapped[str] = mapped_column(ForeignKey("users.uuid"), index=True)
    type: Mapped[str] = mapped_column(String(10))  # email | phone
    value: Mapped[str] = mapped_column(String(320))  # normalized (lowercase email / E.164 phone)
    verified: Mapped[bool] = mapped_column(Boolean, default=False)
    verified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    user = relationship("User", back_populates="contacts")
