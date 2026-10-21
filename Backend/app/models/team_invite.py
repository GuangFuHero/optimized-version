"""SQLAlchemy model for team invite links (Spec/026, ADR-353)."""

from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, text
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, UUIDPKMixin

TOKEN_MAX_LENGTH = 32


class TeamInvite(Base, UUIDPKMixin):
    """One invite link. Anyone signed in may use it, any number of times, for 24 hours.

    The link carries `token`, never `uuid`, so a uuid seen in an audit row or a response cannot be
    turned into a link. Both times are database defaults: validity is `expires_at > now()` in the
    query, so no client clock or client-sent time decides it. There is no way to revoke or extend
    an invite (BE-038 step 1).
    """

    __tablename__ = "team_invites"

    token: Mapped[str] = mapped_column(String(TOKEN_MAX_LENGTH), unique=True)
    team_uuid: Mapped[str] = mapped_column(ForeignKey("teams.uuid"), index=True)
    created_by: Mapped[str] = mapped_column(ForeignKey("users.uuid"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=text("now()"))
    expires_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=text("now() + interval '24 hours'")
    )
