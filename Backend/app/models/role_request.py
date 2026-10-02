"""SQLAlchemy model for role requests: a citizen applying to become back-office staff (Spec/019)."""

from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Index, String, text
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin, UUIDPKMixin

# What an applicant may ask to become. `government` and `ngo` are not roles: they name the type
# of team the reviewer places the applicant in (ADR-049). `data_auditor` is the platform role.
# Super admin is deliberately absent — the design ruled it out of self-service on 2026-09-11.
REQUESTED_ROLES = ("government", "ngo", "data_auditor")
STATUSES = ("pending", "approved", "rejected", "withdrawn")

REASON_MAX_LENGTH = 500
CONTACT_MAX_LENGTH = 100
REVIEW_NOTE_MAX_LENGTH = 500


def _one_of(column: str, values: tuple[str, ...]) -> str:
    return f"{column} IN ({', '.join(repr(value) for value in values)})"


class RoleRequest(Base, UUIDPKMixin, TimestampMixin):
    """One application from one account. At most one is pending per account at a time.

    `reason` and `contact` are the applicant's own words and often name their unit and phone
    number, so only the applicant and holders of `role_request.review` ever read them.
    `granted_team_uuid` / `granted_role_uuid` record what approval actually handed out, since
    for `government` / `ngo` that depends on the team the reviewer picked, not on the request.
    """

    __tablename__ = "role_requests"
    __table_args__ = (
        CheckConstraint(_one_of("requested_role", REQUESTED_ROLES), name="ck_role_requests_role"),
        CheckConstraint(_one_of("status", STATUSES), name="ck_role_requests_status"),
        CheckConstraint(f"char_length(reason) <= {REASON_MAX_LENGTH}", name="ck_role_requests_reason"),
        CheckConstraint(f"char_length(contact) <= {CONTACT_MAX_LENGTH}", name="ck_role_requests_contact"),
        CheckConstraint(
            f"char_length(review_note) <= {REVIEW_NOTE_MAX_LENGTH}", name="ck_role_requests_review_note"
        ),
        # AC-RE-106 at the database: two tabs submitting at once still leave a single pending row.
        Index(
            "uq_role_requests_one_pending",
            "created_by",
            unique=True,
            postgresql_where=text("status = 'pending'"),
        ),
        Index("ix_role_requests_status_created_at", "status", "created_at"),
    )

    requested_role: Mapped[str] = mapped_column(String(20))
    reason: Mapped[str] = mapped_column(String)
    contact: Mapped[str | None] = mapped_column(String)
    status: Mapped[str] = mapped_column(String(20), default="pending", server_default="pending")
    review_note: Mapped[str | None] = mapped_column(String)
    reviewed_by: Mapped[str | None] = mapped_column(ForeignKey("users.uuid"))
    granted_team_uuid: Mapped[str | None] = mapped_column(ForeignKey("teams.uuid"))
    granted_role_uuid: Mapped[str | None] = mapped_column(ForeignKey("roles.uuid"))
    # When it left `pending` — approved, rejected or withdrawn alike.
    closed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_by: Mapped[str] = mapped_column(ForeignKey("users.uuid"), index=True)
