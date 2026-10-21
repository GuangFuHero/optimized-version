"""SQLAlchemy model for role requests: applying to become back-office staff (Spec/019, Spec/026)."""

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
# Spec 026 (ADR-350, ADR-355). A new team's name fits `teams.name`; the name an applicant gives
# fits `users.real_name`, where approval copies it.
TEAM_NAME_MAX_LENGTH = 100
APPLICANT_NAME_MAX_LENGTH = 100
PHONE_MAX_LENGTH = 20
EMAIL_MAX_LENGTH = 320

# ADR-350 point 2: a government / NGO request names one team, existing or new; a data auditor
# names none. Rows from Spec 019 name none and carry no phone, which is how they are let through.
_TARGET_CHECK = (
    "NOT (team_uuid IS NOT NULL AND new_team_name IS NOT NULL)"
    " AND (requested_role <> 'data_auditor' OR (team_uuid IS NULL AND new_team_name IS NULL))"
    " AND (requested_role = 'data_auditor' OR applicant_phone IS NULL"
    " OR team_uuid IS NOT NULL OR new_team_name IS NOT NULL)"
)


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
        CheckConstraint(_TARGET_CHECK, name="ck_role_requests_target"),
        # An invite always belongs to the team the request is for.
        CheckConstraint("invite_uuid IS NULL OR team_uuid IS NOT NULL", name="ck_role_requests_invite"),
        # The team admin's queue: pending member requests for one team, oldest first.
        Index(
            "ix_role_requests_team_pending",
            "team_uuid",
            "created_at",
            postgresql_where=text("status = 'pending'"),
        ),
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

    # Spec 026. The existing team a member request asks for, or the name of a team to found
    # (ADR-350 point 2); the invite a member request came through (ADR-353).
    team_uuid: Mapped[str | None] = mapped_column(ForeignKey("teams.uuid"), index=True)
    new_team_name: Mapped[str | None] = mapped_column(String(TEAM_NAME_MAX_LENGTH))
    invite_uuid: Mapped[str | None] = mapped_column(ForeignKey("team_invites.uuid"))
    # Snapshots taken at submit, so the reviewer sees what was sent even if the account changes
    # (ADR-355). NULL only on rows from before Spec 026.
    applicant_name: Mapped[str | None] = mapped_column(String(APPLICANT_NAME_MAX_LENGTH))
    applicant_phone: Mapped[str | None] = mapped_column(String(PHONE_MAX_LENGTH))
    applicant_email: Mapped[str | None] = mapped_column(String(EMAIL_MAX_LENGTH))
