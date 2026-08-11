"""Integration tests for business event mutation hooks triggering notifications."""

import uuid
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import pytest

from app.models.auth import User
from app.models.geo import Station
from app.models.team import Team, TeamZoneAssign, WorkZone
from app.models.ticket_task import TaskAssignment, TicketTask
from app.services import admin as admin_service
from app.services import station as station_service
from app.services import ticket as ticket_service
from app.services import work_zone as work_zone_service


@pytest.fixture
def mock_actor():
    """Create a mock calling User."""
    u = User(name="Coordinator Actor")
    u.uuid = uuid.uuid4()
    u.team_uuid = uuid.uuid4()
    return u


@pytest.mark.asyncio
async def test_assign_zone_triggers_notification(mock_actor):
    """Verify assign_zone_to_team dispatches urgent zone_assigned notification to NGO admin."""
    mock_db = AsyncMock()
    zone_id = str(uuid.uuid4())
    team_id = str(uuid.uuid4())
    admin_id = str(uuid.uuid4())

    mock_zone = WorkZone(name="花蓮第一搜救區")
    mock_zone.uuid = uuid.UUID(zone_id)
    mock_team = Team(name="慈濟搜救隊", type="ngo", status="active")
    mock_team.uuid = uuid.UUID(team_id)

    mock_assignment = TeamZoneAssign(team_uuid=team_id, zone_uuid=zone_id, assigned_by=str(mock_actor.uuid))

    with patch("app.services.work_zone.require_scope", new_callable=AsyncMock), \
         patch("app.services.work_zone._require_gov_zone_authority", new_callable=AsyncMock), \
         patch("app.services.work_zone.work_zone_repository.get_by_uuid_active", new_callable=AsyncMock, return_value=mock_zone), \
         patch("app.services.work_zone.team_zone_assign_repository.get_assignment", new_callable=AsyncMock, return_value=None), \
         patch("app.services.work_zone.team_zone_assign_repository.create", new_callable=AsyncMock, return_value=mock_assignment), \
         patch("app.services.work_zone.NotificationRecipientResolver.resolve_team_admin", new_callable=AsyncMock, return_value=[admin_id]), \
         patch("app.services.work_zone.NotificationService.dispatch", new_callable=AsyncMock) as mock_dispatch:

        mock_db.scalar = AsyncMock(return_value=mock_team)

        await work_zone_service.assign_zone_to_team(
            mock_db,
            actor=mock_actor,
            zone_uuid=zone_id,
            team_uuid=team_id,
        )

        mock_dispatch.assert_called_once()
        call_kwargs = mock_dispatch.call_args.kwargs
        assert call_kwargs["event_type"] == "zone_assigned"
        assert call_kwargs["priority"] == "urgent"
        assert call_kwargs["ref_type"] == "work_zone"
        assert call_kwargs["ref_uuid"] == zone_id
        assert call_kwargs["explicit_recipients"] == [admin_id]


@pytest.mark.asyncio
async def test_task_assignment_triggers_notification(mock_actor):
    """Verify assign_task_actor dispatches high task_assignment_created notification to assignee."""
    mock_db = AsyncMock()
    task_id = str(uuid.uuid4())
    target_assignee_id = str(uuid.uuid4())

    mock_task = TicketTask(task_name="物資配送任務", created_by=str(mock_actor.uuid))
    mock_task.uuid = uuid.UUID(task_id)
    mock_task.ticket_uuid = str(uuid.uuid4())

    mock_assignment = TaskAssignment(task_uuid=task_id, actor_uuid=target_assignee_id, status="accepted")

    with patch("app.services.ticket.require_scope", new_callable=AsyncMock), \
         patch("app.services.ticket.ticket_task_repository.get_by_uuid_active", new_callable=AsyncMock, return_value=mock_task), \
         patch("app.services.ticket.user_repository.get_by_uuid_active", new_callable=AsyncMock, return_value=User(name="Assignee")), \
         patch("app.services.ticket.task_assignment_repository.get_by_task_and_actor", new_callable=AsyncMock, return_value=None), \
         patch("app.services.ticket.task_assignment_repository.create", new_callable=AsyncMock, return_value=mock_assignment), \
         patch("app.services.ticket._task_scope_target", new_callable=AsyncMock, return_value=SimpleNamespace(created_by=None, team_uuid=None, geometry=None)), \
         patch("app.services.ticket.NotificationService.dispatch", new_callable=AsyncMock) as mock_dispatch:

        await ticket_service.assign_task_actor(
            mock_db,
            actor=mock_actor,
            task_uuid=task_id,
            actor_uuid=target_assignee_id,
            role="志工配送員",
        )

        mock_dispatch.assert_called_once()
        call_kwargs = mock_dispatch.call_args.kwargs
        assert call_kwargs["event_type"] == "task_assignment_created"
        assert call_kwargs["priority"] == "high"
        assert call_kwargs["ref_type"] == "ticket_task"
        assert call_kwargs["ref_uuid"] == mock_task.uuid
        assert call_kwargs["explicit_recipients"] == [target_assignee_id]


@pytest.mark.asyncio
async def test_add_team_member_triggers_notification(mock_actor):
    """Verify add_team_member dispatches high team_member_added notification."""
    mock_db = AsyncMock()
    team_id = str(uuid.uuid4())
    user_id = str(uuid.uuid4())

    mock_team = Team(name="紅十字搜救第一隊", type="ngo", status="active")
    mock_team.uuid = uuid.UUID(team_id)
    mock_target = User(name="新志工小明")
    mock_target.uuid = uuid.UUID(user_id)
    mock_target.team_uuid = None

    with patch("app.services.admin.require_scope", new_callable=AsyncMock), \
         patch("app.services.admin.user_repository.get_by_uuid", new_callable=AsyncMock, return_value=mock_target), \
         patch("app.services.admin.NotificationService.dispatch", new_callable=AsyncMock) as mock_dispatch:

        mock_db.get = AsyncMock(return_value=mock_team)
        mock_db.commit = AsyncMock()
        mock_db.refresh = AsyncMock()

        await admin_service.add_team_member(
            mock_db,
            actor=mock_actor,
            team_uuid=team_id,
            user_uuid=user_id,
            team_role_name="ngo_member",
        )

        mock_dispatch.assert_called_once()
        call_kwargs = mock_dispatch.call_args.kwargs
        assert call_kwargs["event_type"] == "team_member_added"
        assert call_kwargs["priority"] == "high"
        assert call_kwargs["ref_type"] == "team"
        assert call_kwargs["explicit_recipients"] == [user_id]
