from sqlalchemy import String, Float, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.models.base import UUIDPKMixin, TimestampMixin, Base


class User(Base, UUIDPKMixin, TimestampMixin):
    __tablename__ = "users"
    name: Mapped[str] = mapped_column(String(100))
    password: Mapped[str] = mapped_column(String(255))
    credibility_score: Mapped[float] = mapped_column(Float, default=50.0)

    # 關聯
    groups: Mapped[list["UserGroupAssign"]] = relationship(back_populates="user")
    policies: Mapped[list["PolicyUserAssign"]] = relationship(back_populates="user")


class Group(Base, UUIDPKMixin):
    __tablename__ = "groups"
    name: Mapped[str] = mapped_column(String(100))


class Policy(Base, UUIDPKMixin):
    __tablename__ = "policies"
    name: Mapped[str] = mapped_column(String(100))
    read: Mapped[str] = mapped_column(String(50))
    create: Mapped[str] = mapped_column(String(50))
    edit: Mapped[str] = mapped_column(String(50))
    delete: Mapped[str] = mapped_column(String(50))


class UserGroupAssign(Base, UUIDPKMixin):
    __tablename__ = "user_group_assign"
    user_uuid: Mapped[str] = mapped_column(ForeignKey("users.uuid"))
    group_uuid: Mapped[str] = mapped_column(ForeignKey("groups.uuid"))
    user = relationship("User", back_populates="groups")


class PolicyUserAssign(Base, UUIDPKMixin):
    __tablename__ = "policy_user_assign"
    user_uuid: Mapped[str] = mapped_column(ForeignKey("users.uuid"))
    policy_uuid: Mapped[str] = mapped_column(ForeignKey("policies.uuid"))
    user = relationship("User", back_populates="policies")


class PolicyGroupAssign(Base, UUIDPKMixin):
    __tablename__ = "policy_group_assign"
    group_uuid: Mapped[str] = mapped_column(ForeignKey("groups.uuid"))
    policy_uuid: Mapped[str] = mapped_column(ForeignKey("policies.uuid"))
