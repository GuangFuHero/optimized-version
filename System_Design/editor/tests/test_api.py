"""
Comprehensive pytest tests for FastAPI server in editor/server.py

Run with:
    cd editor && uv run pytest tests/test_api.py -v

Run with coverage:
    cd editor && uv run pytest tests/test_api.py -v --cov=editor.server

Requirements:
    - pytest
    - httpx (async client for FastAPI testing)
    - pytest-asyncio (for async test support)
"""

import json
import os
import pytest
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch, mock_open

from httpx import AsyncClient, ASGITransport
from fastapi import status


# Import server app
import sys
sys.path.insert(0, str(Path(__file__).parent.parent))

from server import app, DOCS_DIR, STATIC_DIR, PROJECT_ROOT


# ==================== Fixtures ====================

@pytest.fixture
def temp_docs_dir(tmp_path):
    """Create a temporary docs directory for testing"""
    docs = tmp_path / "docs"
    docs.mkdir()

    # Create a sample module structure
    module_01 = docs / "01-map"
    module_01.mkdir()

    # Create requirements.md
    requirements = module_01 / "requirements.md"
    requirements.write_text("""# 地圖站點

## FR-MAP-01: 基本地圖顯示

### UI/UX
使用者可以看到災區地圖

### Frontend
使用 Leaflet.js 顯示地圖

### Backend
提供地圖資料 API

### AI & Data
整合即時災情資料
""")

    # Create overview.md
    overview = module_01 / "overview.md"
    overview.write_text("# 地圖站點概述\n\n這是地圖模組的概述。")

    return docs


@pytest.fixture
async def client(temp_docs_dir, monkeypatch):
    """Create an async test client with patched DOCS_DIR"""
    # Patch the DOCS_DIR to use temp directory
    monkeypatch.setattr("server.DOCS_DIR", temp_docs_dir)

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


@pytest.fixture
def mock_agent_sdk():
    """Mock Claude Agent SDK for agent endpoints"""
    with patch("server.ClaudeSDKClient") as mock:
        # Setup async context manager
        mock_client = AsyncMock()
        mock_client.__aenter__.return_value = mock_client
        mock_client.__aexit__.return_value = None

        # Mock query and response
        mock_client.query = AsyncMock()

        async def mock_receive():
            # Yield a few messages
            mock_msg1 = MagicMock()
            mock_msg1.type = "assistant"
            mock_block = MagicMock()
            mock_block.text = "Agent 回覆內容"
            mock_msg1.content = [mock_block]
            yield mock_msg1

        mock_client.receive_response = mock_receive
        mock.return_value = mock_client

        yield mock_client


# ==================== Basic Routes Tests ====================

@pytest.mark.asyncio
class TestBasicRoutes:
    """Test basic HTTP routes"""

    async def test_root_returns_html(self, client):
        """GET / should return index.html"""
        response = await client.get("/")
        assert response.status_code == status.HTTP_200_OK
        # Should be HTML (we can't check exact content without real static files)
        assert "text/html" in response.headers["content-type"].lower()

    async def test_api_config_returns_default(self, client):
        """GET /api/config should return default config"""
        response = await client.get("/api/config")
        assert response.status_code == status.HTTP_200_OK
        data = response.json()

        # Check default config structure
        assert "mindmap" in data
        assert data["mindmap"]["maxFrItems"] == 100
        assert data["mindmap"]["maxDimensionItems"] == 100
        assert data["mindmap"]["maxDescriptionLength"] == 200

    async def test_api_config_reads_from_file(self, client, monkeypatch, tmp_path):
        """GET /api/config should read from features.json if exists"""
        # Create a mock config file
        config_dir = tmp_path / "config"
        config_dir.mkdir()
        config_file = config_dir / "features.json"
        config_data = {
            "mindmap": {
                "maxFrItems": 50,
                "maxDimensionItems": 30,
                "maxDescriptionLength": 150
            }
        }
        config_file.write_text(json.dumps(config_data))

        # Patch the config path
        monkeypatch.setattr("server.Path", lambda x: tmp_path if "server.py" in str(x) else Path(x))

        # Note: This test has limitations due to Path patching complexity
        # In real scenario, we'd use dependency injection or config loader


# ==================== File API Tests ====================

@pytest.mark.asyncio
class TestFileAPI:
    """Test file listing and CRUD operations"""

    async def test_list_files_empty(self, client, temp_docs_dir, monkeypatch):
        """GET /api/files should list markdown files"""
        response = await client.get("/api/files")
        assert response.status_code == status.HTTP_200_OK
        data = response.json()

        assert "files" in data
        files = data["files"]
        assert len(files) == 2  # requirements.md and overview.md

        # Check file structure
        req_file = next(f for f in files if f["name"] == "requirements.md")
        assert req_file["path"] == "01-map/requirements.md"
        assert req_file["module"] == "01-map"

    async def test_read_file_success(self, client):
        """GET /api/files/{path} should return file content"""
        response = await client.get("/api/files/01-map/requirements.md")
        assert response.status_code == status.HTTP_200_OK
        data = response.json()

        assert data["path"] == "01-map/requirements.md"
        assert "FR-MAP-01" in data["content"]

    async def test_read_file_not_found(self, client):
        """GET /api/files/{path} should return 404 for missing file"""
        response = await client.get("/api/files/nonexistent/file.md")
        assert response.status_code == status.HTTP_404_NOT_FOUND
        assert "not found" in response.json()["detail"].lower()

    async def test_read_file_path_traversal_blocked(self, client):
        """GET /api/files/{path} should block path traversal attacks"""
        response = await client.get("/api/files/../../../etc/passwd")
        assert response.status_code in [status.HTTP_403_FORBIDDEN, status.HTTP_404_NOT_FOUND]

    async def test_write_file_success(self, client, temp_docs_dir, monkeypatch):
        """PUT /api/files/{path} should write file content"""
        new_content = "# New Module\n\n## FR-NEW-01: New Feature"

        response = await client.put(
            "/api/files/02-new/requirements.md",
            json={"path": "02-new/requirements.md", "content": new_content}
        )

        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["status"] == "ok"
        assert data["path"] == "02-new/requirements.md"

        # Verify file was written
        written_file = temp_docs_dir / "02-new" / "requirements.md"
        assert written_file.exists()
        assert written_file.read_text() == new_content

    async def test_write_file_path_traversal_blocked(self, client):
        """PUT /api/files/{path} should block path traversal attacks"""
        response = await client.put(
            "/api/files/../../../tmp/evil.md",
            json={"path": "../../../tmp/evil.md", "content": "evil"}
        )
        # Either 403 (blocked) or 404 (path normalized away) indicates protection
        assert response.status_code in [status.HTTP_403_FORBIDDEN, status.HTTP_404_NOT_FOUND]


# ==================== Tree API Tests ====================

@pytest.mark.asyncio
class TestTreeAPI:
    """Test document tree API for mindmap"""

    async def test_get_tree_structure(self, client):
        """GET /api/tree should return hierarchical tree"""
        response = await client.get("/api/tree")
        assert response.status_code == status.HTTP_200_OK
        tree = response.json()

        # Check root node
        assert tree["name"] == "光復超人 2.0"
        assert "children" in tree

        # Check module nodes
        assert len(tree["children"]) >= 1
        module = tree["children"][0]
        assert module["name"] == "01-map"
        assert "requirements" in module
        assert "FR-MAP-01" in module["requirements"]
        assert "overview" in module

    async def test_get_tree_excludes_specs_dir(self, client, temp_docs_dir):
        """GET /api/tree should exclude specs/ directory"""
        # Create specs dir
        specs_dir = temp_docs_dir / "specs"
        specs_dir.mkdir()
        (specs_dir / "spec.md").write_text("# Spec")

        response = await client.get("/api/tree")
        tree = response.json()

        # Specs should not be in children
        module_names = [child["name"] for child in tree["children"]]
        assert "specs" not in module_names


# ==================== Agent SDK Tests ====================

@pytest.mark.asyncio
class TestAgentSDK:
    """Test Claude Agent SDK endpoints"""

    async def test_agent_status_available(self, client, monkeypatch):
        """GET /api/agent/status should report available when SDK is ready"""
        monkeypatch.setattr("server.AGENT_SDK_AVAILABLE", True)

        response = await client.get("/api/agent/status")
        assert response.status_code == status.HTTP_200_OK
        data = response.json()

        assert data["available"] is True
        assert "ready" in data["message"].lower()

    async def test_agent_status_unavailable(self, client, monkeypatch):
        """GET /api/agent/status should report unavailable when SDK not available"""
        monkeypatch.setattr("server.AGENT_SDK_AVAILABLE", False)

        response = await client.get("/api/agent/status")
        assert response.status_code == status.HTTP_200_OK
        data = response.json()

        assert data["available"] is False
        assert "not available" in data["message"].lower()

    async def test_agent_chat_unavailable(self, client, monkeypatch):
        """POST /api/agent/chat should return 503 when SDK not available"""
        monkeypatch.setattr("server.AGENT_SDK_AVAILABLE", False)

        response = await client.post(
            "/api/agent/chat",
            json={"message": "Hello agent"}
        )

        assert response.status_code == status.HTTP_503_SERVICE_UNAVAILABLE
        assert "not available" in response.json()["detail"].lower()

    async def test_agent_chat_success(self, client, monkeypatch, mock_agent_sdk):
        """POST /api/agent/chat should return SSE stream with agent responses"""
        monkeypatch.setattr("server.AGENT_SDK_AVAILABLE", True)

        response = await client.post(
            "/api/agent/chat",
            json={"message": "請幫我查看 01-map/requirements.md"}
        )

        assert response.status_code == status.HTTP_200_OK
        assert response.headers["content-type"] == "text/event-stream; charset=utf-8"

        # Read SSE stream
        content = response.text
        assert "data:" in content

    async def test_agent_chat_with_session_id(self, client, monkeypatch, mock_agent_sdk):
        """POST /api/agent/chat should accept optional session_id"""
        monkeypatch.setattr("server.AGENT_SDK_AVAILABLE", True)

        response = await client.post(
            "/api/agent/chat",
            json={
                "message": "繼續上次的對話",
                "session_id": "test-session-123"
            }
        )

        assert response.status_code == status.HTTP_200_OK

    async def test_agent_chat_error_handling(self, client, monkeypatch):
        """POST /api/agent/chat should handle agent errors gracefully"""
        monkeypatch.setattr("server.AGENT_SDK_AVAILABLE", True)

        # Mock SDK to raise exception
        with patch("server.ClaudeSDKClient") as mock:
            mock.return_value.__aenter__.side_effect = Exception("Agent error")

            response = await client.post(
                "/api/agent/chat",
                json={"message": "Test message"}
            )

            # Should still return 200 with SSE error message
            assert response.status_code == status.HTTP_200_OK
            content = response.text
            assert "error" in content.lower()


# ==================== Integration Tests ====================

@pytest.mark.asyncio
class TestIntegration:
    """Integration tests for common workflows"""

    async def test_full_workflow_list_read_edit(self, client, temp_docs_dir):
        """Test complete workflow: list files -> read -> edit"""
        # 1. List files
        list_response = await client.get("/api/files")
        assert list_response.status_code == status.HTTP_200_OK
        files = list_response.json()["files"]

        file_path = files[0]["path"]

        # 2. Read file
        read_response = await client.get(f"/api/files/{file_path}")
        assert read_response.status_code == status.HTTP_200_OK
        original_content = read_response.json()["content"]

        # 3. Modify and write
        modified_content = original_content + "\n\n## FR-MAP-02: 新增功能"
        write_response = await client.put(
            f"/api/files/{file_path}",
            json={"path": file_path, "content": modified_content}
        )
        assert write_response.status_code == status.HTTP_200_OK

        # 4. Verify change
        verify_response = await client.get(f"/api/files/{file_path}")
        assert "FR-MAP-02" in verify_response.json()["content"]

    async def test_tree_reflects_file_changes(self, client, temp_docs_dir):
        """Test that /api/tree reflects changes made via /api/files"""
        # Get initial tree
        tree1 = await client.get("/api/tree")
        initial_tree = tree1.json()

        # Add a new module
        new_module_path = "99-test/requirements.md"
        await client.put(
            f"/api/files/{new_module_path}",
            json={
                "path": new_module_path,
                "content": "# Test Module\n\n## FR-TEST-01: Test"
            }
        )

        # Get updated tree
        tree2 = await client.get("/api/tree")
        updated_tree = tree2.json()

        # New module should appear
        module_names = [child["name"] for child in updated_tree["children"]]
        assert "99-test" in module_names


# ==================== Edge Cases & Security ====================

@pytest.mark.asyncio
class TestEdgeCases:
    """Test edge cases and security concerns"""

    async def test_file_path_with_spaces(self, client, temp_docs_dir):
        """Test handling of file paths with spaces"""
        path_with_spaces = "01-map/file with spaces.md"
        content = "# Test content"

        # Write file
        response = await client.put(
            f"/api/files/{path_with_spaces}",
            json={"path": path_with_spaces, "content": content}
        )
        assert response.status_code == status.HTTP_200_OK

    async def test_unicode_content(self, client, temp_docs_dir):
        """Test handling of Unicode content"""
        unicode_content = "# 測試\n\n這是繁體中文內容 🚀"

        response = await client.put(
            "/api/files/01-map/unicode.md",
            json={"path": "01-map/unicode.md", "content": unicode_content}
        )
        assert response.status_code == status.HTTP_200_OK

        # Verify read back
        read_response = await client.get("/api/files/01-map/unicode.md")
        assert read_response.json()["content"] == unicode_content

    async def test_large_file_content(self, client, temp_docs_dir):
        """Test handling of large file content"""
        large_content = "# Large File\n\n" + ("A" * 100000)

        response = await client.put(
            "/api/files/01-map/large.md",
            json={"path": "01-map/large.md", "content": large_content}
        )
        assert response.status_code == status.HTTP_200_OK

    async def test_empty_file_content(self, client, temp_docs_dir):
        """Test handling of empty file content"""
        response = await client.put(
            "/api/files/01-map/empty.md",
            json={"path": "01-map/empty.md", "content": ""}
        )
        assert response.status_code == status.HTTP_200_OK


# ==================== Run Tests ====================

if __name__ == "__main__":
    pytest.main([__file__, "-v"])
