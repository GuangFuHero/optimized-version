"""Unit tests for the notification data retention policy service."""

from unittest.mock import AsyncMock, MagicMock

import pytest

from app.services.retention import cleanup_expired_notifications


@pytest.mark.asyncio
async def test_cleanup_expired_notifications_executes_successfully():
    """Verify cleanup_expired_notifications executes update query and commits transaction."""
    mock_db = AsyncMock()
    mock_result = MagicMock()
    mock_result.rowcount = 5
    mock_db.execute = AsyncMock(return_value=mock_result)
    mock_db.commit = AsyncMock()

    affected_rows = await cleanup_expired_notifications(mock_db)

    assert affected_rows == 5
    mock_db.execute.assert_called_once()
    mock_db.commit.assert_called_once()
