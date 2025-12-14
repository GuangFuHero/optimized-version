#!/usr/bin/env python3
"""
Mindmap Editor Server

A FastAPI server that:
- Serves the editor frontend
- Provides API to read/write markdown files
- WebSocket for live updates
- AI assistant for editing markdown (Phase 3)

Usage:
    cd editor && uv run python server.py
    # Then open http://localhost:3000

Environment:
    ANTHROPIC_API_KEY - Required for AI features
"""

import asyncio
import json
import logging
import os
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger("mindmap-editor")

# Constants
MAX_FILE_SIZE = 1024 * 1024  # 1MB max file size to prevent DoS
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse, FileResponse, StreamingResponse
from pydantic import BaseModel

# Claude Agent SDK imports (optional - graceful fallback if not configured)
try:
    from claude_agent_sdk import ClaudeSDKClient, ClaudeAgentOptions
    AGENT_SDK_AVAILABLE = bool(os.environ.get("ANTHROPIC_API_KEY"))
except ImportError:
    AGENT_SDK_AVAILABLE = False

# Paths
EDITOR_DIR = Path(__file__).parent
PROJECT_ROOT = EDITOR_DIR.parent
MINDMAP_DIR = PROJECT_ROOT / "mindmap"
STATIC_DIR = EDITOR_DIR / "static"
CONFIG_DIR = EDITOR_DIR / "config"

# Load configuration
def load_config() -> dict:
    """Load configuration from features.json"""
    config_path = CONFIG_DIR / "features.json"
    if config_path.exists():
        return json.loads(config_path.read_text())
    return {
        "agent": {"model": "claude-haiku-4-5-20251201", "maxTokens": 4096, "allowedTools": ["Read", "Edit", "Write", "Glob", "Grep"]}
    }

CONFIG = load_config()

# Module and dimension name mappings
MODULE_NAMES = {
    "01_map": "地圖站點",
    "02_volunteer_tasks": "志工任務",
    "03_delivery": "配送模組",
    "04_info_page": "資訊頁面",
    "05_moderator_admin": "審核後台",
    "06_system_admin": "系統管理"
}

DIMENSION_NAMES = {
    "ui_ux": "UI/UX",
    "frontend": "Frontend",
    "backend": "Backend",
    "ai_data": "AI & Data",
    "specs": "SPEC 連結"
}

app = FastAPI(title="Mindmap Editor")

# WebSocket connections for live updates
connected_clients: list[WebSocket] = []


# --- Models ---

class FileContent(BaseModel):
    path: str
    content: str


class NodeUpdate(BaseModel):
    """Update from mindmap UI"""
    file_path: str
    node_path: list[str]  # Path to node in tree (e.g., ["FR-MAP-01", "description"])
    old_value: str
    new_value: str


class AgentChatRequest(BaseModel):
    """Request for agent chat"""
    message: str  # User message
    session_id: Optional[str] = None  # Session ID for multi-turn conversations


# --- API Routes ---

@app.get("/")
async def index():
    """Serve the editor frontend"""
    return FileResponse(STATIC_DIR / "index.html")


@app.get("/api/files")
async def list_files():
    """List all content.md files in mindmap/ directory structure"""
    files = []
    for content_file in sorted(MINDMAP_DIR.rglob("content.md")):
        rel_path = content_file.relative_to(MINDMAP_DIR)
        files.append({
            "path": str(rel_path),
            "name": content_file.name,
            "module": str(rel_path.parts[0]) if len(rel_path.parts) > 0 else None
        })
    return {"files": files}


@app.get("/api/files/{file_path:path}")
async def read_file(file_path: str):
    """Read a markdown file"""
    # SECURITY: Validate path FIRST before any file operations
    full_path = (MINDMAP_DIR / file_path).resolve()
    if not str(full_path).startswith(str(MINDMAP_DIR.resolve())):
        logger.warning(f"Path traversal attempt blocked: {file_path}")
        raise HTTPException(status_code=403, detail="Access denied")
    if not full_path.exists():
        raise HTTPException(status_code=404, detail=f"File not found: {file_path}")
    if not full_path.is_file():
        raise HTTPException(status_code=400, detail=f"Not a file: {file_path}")

    content = full_path.read_text(encoding="utf-8")
    return {"path": file_path, "content": content}


@app.put("/api/files/{file_path:path}")
async def write_file(file_path: str, data: FileContent):
    """Write/update a markdown file"""
    # SECURITY: Validate path FIRST before any file operations
    full_path = (MINDMAP_DIR / file_path).resolve()
    if not str(full_path).startswith(str(MINDMAP_DIR.resolve())):
        logger.warning(f"Path traversal attempt blocked: {file_path}")
        raise HTTPException(status_code=403, detail="Access denied")

    # Validate file size to prevent DoS
    if len(data.content.encode("utf-8")) > MAX_FILE_SIZE:
        logger.warning(f"File size limit exceeded: {file_path} ({len(data.content)} bytes)")
        raise HTTPException(status_code=413, detail=f"File too large. Max size: {MAX_FILE_SIZE} bytes")

    # Create parent directories if needed
    full_path.parent.mkdir(parents=True, exist_ok=True)

    # Write file
    full_path.write_text(data.content, encoding="utf-8")
    logger.info(f"File written: {file_path}")

    # Notify all connected clients
    await broadcast_update({
        "type": "file_updated",
        "path": file_path,
        "content": data.content
    })

    return {"status": "ok", "path": file_path}


@app.get("/api/config")
async def get_config():
    """Get application configuration"""
    config_path = Path(__file__).parent / "config" / "features.json"
    if config_path.exists():
        return json.loads(config_path.read_text())
    return {"mindmap": {"maxFrItems": 100, "maxDimensionItems": 100, "maxDescriptionLength": 200}}


@app.get("/api/tree")
async def get_tree():
    """Get the full document tree for mindmap rendering from new mindmap/ structure"""

    def read_content_file(path: Path) -> str:
        """Helper to read content.md file, return empty string if not exists"""
        if path.exists():
            return path.read_text(encoding="utf-8")
        return ""

    modules = []

    # Walk through module directories (01_map, 02_volunteer_tasks, etc.)
    for module_dir in sorted(MINDMAP_DIR.iterdir()):
        if not module_dir.is_dir() or module_dir.name.startswith("."):
            continue

        module_id = module_dir.name
        module_name = MODULE_NAMES.get(module_id, module_id)

        # Read module-level content.md (user stories)
        module_content = read_content_file(module_dir / "content.md")

        # Read requirements/content.md (FR list)
        requirements_dir = module_dir / "requirements"
        requirements_content = read_content_file(requirements_dir / "content.md")

        # Read each dimension
        dimensions = {}
        for dimension_key in ["ui_ux", "frontend", "backend", "ai_data"]:
            dimension_dir = requirements_dir / dimension_key
            dimension_content = read_content_file(dimension_dir / "content.md")

            dimension_data = {"content": dimension_content}

            # Check for specs (only under backend)
            if dimension_key == "backend":
                specs_content = read_content_file(dimension_dir / "specs" / "content.md")
                if specs_content:
                    dimension_data["specs"] = {"content": specs_content}

            dimensions[dimension_key] = dimension_data

        modules.append({
            "id": module_id,
            "name": module_name,
            "content": module_content,
            "requirements": {
                "content": requirements_content,
                "dimensions": dimensions
            }
        })

    return {
        "title": "光復超人 2.0",
        "modules": modules
    }


# --- Claude Agent SDK ---

AGENT_SYSTEM_PROMPT = """你是「光復超人 2.0」mindmap 規格編輯助手。

## 你的能力
- 讀取和理解 mindmap/ 目錄下的 content.md 檔案結構
- 搜尋特定的 FR (Functional Requirement) 或關鍵字
- 編輯 content.md 檔案來新增、修改或刪除需求
- 回答關於系統架構和需求的問題

## Mindmap 目錄結構
```
mindmap/
├── 01_map/
│   ├── content.md                    # 模組名稱與 User Stories
│   └── requirements/
│       ├── content.md                # FR 列表
│       ├── ui_ux/content.md
│       ├── frontend/content.md
│       ├── backend/
│       │   ├── content.md
│       │   └── specs/content.md      # SPEC 連結
│       └── ai_data/content.md
├── 02_volunteer_tasks/...
├── 03_delivery/...
├── 04_info_page/...
├── 05_moderator_admin/...
└── 06_system_admin/...
```

## 回覆風格
- 使用繁體中文
- 簡潔但完整
- 編輯檔案時說明你做了什麼改動
- 如果不確定，先讀取相關檔案再做決定
"""

# Store active agent sessions (in production, use Redis or database)
agent_sessions: dict[str, ClaudeSDKClient] = {}


@app.get("/api/agent/status")
async def agent_status():
    """Check if Claude Agent SDK is available"""
    return {
        "available": AGENT_SDK_AVAILABLE,
        "message": "Agent ready" if AGENT_SDK_AVAILABLE else "Claude Agent SDK not available"
    }


@app.post("/api/agent/chat")
async def agent_chat(request: AgentChatRequest):
    """Chat with Claude Agent (streaming SSE response)"""
    if not AGENT_SDK_AVAILABLE:
        raise HTTPException(
            status_code=503,
            detail="Agent not available. Install claude-agent-sdk and set ANTHROPIC_API_KEY."
        )

    async def generate():
        try:
            agent_config = CONFIG.get("agent", {})
            options = ClaudeAgentOptions(
                system_prompt=AGENT_SYSTEM_PROMPT,
                allowed_tools=agent_config.get("allowedTools", ["Read", "Edit", "Write", "Glob", "Grep"]),
                permission_mode="acceptEdits",
                cwd=str(PROJECT_ROOT),
                model=agent_config.get("model", "claude-haiku-4-5-20251201"),
            )

            async with ClaudeSDKClient(options=options) as client:
                await client.query(request.message)

                async for message in client.receive_response():
                    # Handle different message types from the SDK
                    if hasattr(message, 'type'):
                        if message.type == 'assistant':
                            # Extract text content
                            for block in getattr(message, 'content', []):
                                if hasattr(block, 'text'):
                                    yield f"data: {json.dumps({'type': 'text', 'content': block.text})}\n\n"
                                elif hasattr(block, 'type') and block.type == 'tool_use':
                                    yield f"data: {json.dumps({'type': 'tool_use', 'tool': block.name})}\n\n"
                        elif message.type == 'result':
                            yield f"data: {json.dumps({'type': 'result', 'content': str(getattr(message, 'result', ''))})}\n\n"
                    else:
                        # Fallback for unknown message format
                        yield f"data: {json.dumps({'type': 'message', 'content': str(message)})}\n\n"

            yield f"data: {json.dumps({'done': True})}\n\n"

        except Exception as e:
            yield f"data: {json.dumps({'error': str(e)})}\n\n"

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
        }
    )


# --- WebSocket ---

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    connected_clients.append(websocket)
    try:
        while True:
            data = await websocket.receive_text()
            message = json.loads(data)

            # Handle different message types
            if message.get("type") == "node_update":
                await handle_node_update(message, websocket)
            elif message.get("type") == "request_sync":
                # Send current tree state
                tree = await get_tree()
                await websocket.send_json({"type": "sync", "tree": tree})

    except WebSocketDisconnect:
        connected_clients.remove(websocket)


async def handle_node_update(message: dict, sender: WebSocket):
    """Handle a node update from the mindmap UI"""
    file_path = message.get("file_path")
    line_number = message.get("line_number")
    old_text = message.get("old_text")
    new_text = message.get("new_text")

    if not all([file_path, old_text is not None, new_text is not None]):
        await sender.send_json({"type": "error", "message": "Invalid update message"})
        return

    # SECURITY: Validate path FIRST before any file operations
    full_path = (MINDMAP_DIR / file_path).resolve()
    if not str(full_path).startswith(str(MINDMAP_DIR.resolve())):
        logger.warning(f"WebSocket path traversal attempt blocked: {file_path}")
        await sender.send_json({"type": "error", "message": "Access denied"})
        return
    if not full_path.exists():
        await sender.send_json({"type": "error", "message": f"File not found: {file_path}"})
        return

    # Read and update file
    content = full_path.read_text(encoding="utf-8")

    # Use line-based replacement if line_number is provided
    if line_number is not None:
        lines = content.split('\n')

        # Convert to 0-based index (frontend sends 1-based line numbers)
        line_idx = line_number - 1

        if 0 <= line_idx < len(lines):
            if old_text in lines[line_idx]:
                # Replace only on the target line
                lines[line_idx] = lines[line_idx].replace(old_text, new_text, 1)
                new_content = '\n'.join(lines)
                full_path.write_text(new_content, encoding="utf-8")

                # Broadcast to all clients
                await broadcast_update({
                    "type": "file_updated",
                    "path": file_path,
                    "content": new_content
                })

                await sender.send_json({"type": "update_success", "path": file_path})
            else:
                await sender.send_json({
                    "type": "error",
                    "message": f"Text not found at line {line_number}. The file may have been modified."
                })
        else:
            await sender.send_json({
                "type": "error",
                "message": f"Invalid line number: {line_number}. File has {len(lines)} lines."
            })
    else:
        # Fallback to first-match replacement if no line_number provided
        if old_text in content:
            new_content = content.replace(old_text, new_text, 1)
            full_path.write_text(new_content, encoding="utf-8")

            # Broadcast to all clients
            await broadcast_update({
                "type": "file_updated",
                "path": file_path,
                "content": new_content
            })

            await sender.send_json({"type": "update_success", "path": file_path})
        else:
            await sender.send_json({
                "type": "error",
                "message": f"Text not found in file. The file may have been modified."
            })


async def broadcast_update(message: dict):
    """Broadcast update to all connected WebSocket clients"""
    for client in connected_clients:
        try:
            await client.send_json(message)
        except Exception as e:
            logger.debug(f"Failed to send to client (likely disconnected): {e}")


# --- Static files (must be last) ---

app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")


# --- Run server ---

if __name__ == "__main__":
    import uvicorn
    print("=" * 50)
    print("Mindmap Editor Server")
    print("=" * 50)
    print()
    print(f"Mindmap directory: {MINDMAP_DIR}")
    print(f"Open http://localhost:3000 in your browser")
    print()
    uvicorn.run(app, host="127.0.0.1", port=3000)
