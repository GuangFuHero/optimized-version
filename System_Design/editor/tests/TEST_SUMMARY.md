# API Test Coverage Summary

## Quick Stats

- **Total test cases:** 35
- **Test classes:** 9
- **Mock fixtures:** 3 (temp_docs_dir, mock_anthropic, mock_agent_sdk)
- **Endpoints covered:** 11

## Endpoint Coverage

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Endpoint                          Method    Test Count    Coverage
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
/                                 GET       1             ✅
/api/config                       GET       2             ✅
/api/files                        GET       2             ✅
/api/files/{path}                 GET       3             ✅
/api/files/{path}                 PUT       3             ✅
/api/tree                         GET       2             ✅
/api/ai/status                    GET       2             ✅
/api/ai/assist                    POST      8             ✅
/api/ai/assist/stream             POST      2             ✅
/api/agent/status                 GET       2             ✅
/api/agent/chat                   POST      4             ✅
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

## Test Breakdown by Feature

### 1. Basic Routes (2 tests)
- ✅ Root endpoint returns HTML
- ✅ Config endpoint returns default/from file

### 2. File API (8 tests)
- ✅ List markdown files
- ✅ Read file success
- ✅ Read file not found (404)
- ✅ Path traversal blocked (403)
- ✅ Write file success
- ✅ Write creates parent directories
- ✅ Write path traversal blocked
- ✅ Files with spaces/Unicode

### 3. Tree API (2 tests)
- ✅ Get hierarchical tree structure
- ✅ Exclude specs/ directory

### 4. AI Status (2 tests)
- ✅ Reports available when ANTHROPIC_API_KEY set
- ✅ Reports unavailable when key not set

### 5. AI Assist - Messages API (10 tests)
- ✅ Unavailable without API key (503)
- ✅ Invalid action rejected (400)
- ✅ Improve action success
- ✅ Expand action success
- ✅ Decompose action success
- ✅ Custom action requires custom_prompt (400)
- ✅ Custom action success
- ✅ API error handling (502)
- ✅ Streaming unavailable without key (503)
- ✅ Streaming success with SSE

### 6. Agent SDK (6 tests)
- ✅ Status available when SDK ready
- ✅ Status unavailable when SDK not ready
- ✅ Chat unavailable without SDK (503)
- ✅ Chat success with SSE stream
- ✅ Chat with session_id
- ✅ Chat error handling

### 7. Integration (2 tests)
- ✅ Full workflow: list → read → edit
- ✅ Tree reflects file changes

### 8. Edge Cases (4 tests)
- ✅ File paths with spaces
- ✅ Unicode content (繁體中文)
- ✅ Large file content (100KB)
- ✅ Empty file content

## Security Tests

✅ **Path Traversal Protection**
- Blocks `../../../etc/passwd` attempts
- Returns 403 Forbidden for paths outside mindmap/

✅ **Access Control**
- File operations restricted to DOCS_DIR
- Write operations checked at both PUT time and filesystem level

## Mock Strategy

### Anthropic Messages API Mock
```python
mock_message.model = "claude-haiku-4-5-20251201"
mock_message.usage.input_tokens = 100
mock_message.usage.output_tokens = 200
mock_message.content = [{"type": "text", "text": "回覆內容"}]
```

### Claude Agent SDK Mock
```python
async def mock_receive():
    mock_msg.type = "assistant"
    mock_msg.content = [{"text": "Agent 回覆內容"}]
    yield mock_msg
```

## Error Coverage

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Status Code       Scenario                              Test Count
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
200 OK            Successful operations                 20
400 Bad Request   Invalid parameters                    3
403 Forbidden     Path traversal attempts               2
404 Not Found     Missing files                         1
502 Bad Gateway   Anthropic API errors                  1
503 Unavailable   AI/Agent not configured              5
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

## Not Covered (Future Work)

- ❌ WebSocket endpoints (`/ws`)
  - Node update messages
  - Sync requests
  - Broadcast to clients
- ❌ Static file serving (tested by Playwright UI tests instead)
- ❌ Multi-client WebSocket scenarios
- ❌ Concurrent file write conflicts

## Running Tests

### Quick Run
```bash
cd editor && uv run pytest tests/test_api.py -v
```

### With Coverage
```bash
cd editor && uv run pytest tests/test_api.py -v --cov=server --cov-report=html
```

### Specific Test Class
```bash
cd editor && uv run pytest tests/test_api.py::TestAIAssist -v
```

## Dependencies Required

Install with: `uv sync`

- `pytest` - Test framework
- `pytest-asyncio` - Async test support
- `httpx` - AsyncClient for FastAPI
- `pytest-cov` - Coverage reporting (optional)

## Next Steps

1. **Run tests first time:**
   ```bash
   cd editor
   uv sync                                    # Install dependencies
   uv run pytest tests/test_api.py -v        # Run tests
   ```

2. **Check coverage:**
   ```bash
   uv run pytest tests/test_api.py --cov=server --cov-report=html
   open htmlcov/index.html
   ```

3. **Add WebSocket tests** (optional future improvement)

4. **Set up CI/CD** to run on every commit
