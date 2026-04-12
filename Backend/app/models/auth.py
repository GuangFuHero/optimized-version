"""SQLAlchemy models for users, groups, policies, and RBAC assignment tables."""

from sqlalchemy import Float, ForeignKey, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UUIDPKMixin


class User(Base, UUIDPKMixin, TimestampMixin):
    """ORM model for a registered user."""

    __tablename__ = "users"
    name: Mapped[str] = mapped_column(String(100))
    # 儲存格式: <algorithm>$<iterations>$<salt-frontend>$<salt-backend>$<hash>
    password: Mapped[str] = mapped_column(String(512))
    credibility_score: Mapped[float] = mapped_column(Float, default=50.0)

    # 關聯
    groups: Mapped[list["UserGroupAssign"]] = relationship(back_populates="user")
    policies: Mapped[list["PolicyUserAssign"]] = relationship(back_populates="user")


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
