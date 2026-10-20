"""Repository for team invite links (Spec/026, ADR-353)."""

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.team import Team
from app.models.team_invite import TeamInvite


class TeamInviteRepository:
    """Every validity check is in SQL against the database clock, never a client-sent time."""

    async def create(self, db: AsyncSession, *, token: str, team_uuid, created_by) -> TeamInvite:
        """Insert an invite; the database sets both times. Flushes, does not commit."""
        invite = TeamInvite(token=token, team_uuid=team_uuid, created_by=created_by)
        db.add(invite)
        await db.flush()
        return invite

    async def list_valid(self, db: AsyncSession, *, team_uuid) -> list[TeamInvite]:
        """The team's invites not yet expired, newest first."""
        query = (
            select(TeamInvite)
            .where(TeamInvite.team_uuid == team_uuid, TeamInvite.expires_at > func.now())
            .order_by(TeamInvite.created_at.desc(), TeamInvite.uuid)
        )
        return list((await db.execute(query)).scalars().all())

    async def get_valid(self, db: AsyncSession, token: str) -> tuple[TeamInvite, Team] | None:
        """The invite and its team, or None if unknown, expired, or the team cannot be joined.

        One condition for all of them (ADR-353 point 3), so a caller cannot tell them apart.
        """
        row = (
            await db.execute(
                select(TeamInvite, Team)
                .join(Team, Team.uuid == TeamInvite.team_uuid)
                .where(
                    TeamInvite.token == token,
                    TeamInvite.expires_at > func.now(),
                    Team.status == "active",
                    Team.delete_at.is_(None),
                )
            )
        ).first()
        return None if row is None else (row[0], row[1])


team_invite_repository = TeamInviteRepository()
