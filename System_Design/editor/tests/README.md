# Editor Tests

This directory contains comprehensive tests for the Mindmap Editor server.

## Test Files

### `test_api.py` - FastAPI Server Tests
Comprehensive pytest tests for all API endpoints in `editor/server.py`.

**Coverage:**
- ✅ Basic routes (`/`, `/api/config`, `/api/tree`)
- ✅ File API (list, read, write, path traversal protection)
- ✅ AI status endpoints (`/api/ai/status`, `/api/agent/status`)
- ✅ AI assistance endpoints (Messages API)
  - Non-streaming: `/api/ai/assist`
  - Streaming: `/api/ai/assist/stream`
- ✅ Agent SDK endpoints
  - Status: `/api/agent/status`
  - Chat: `/api/agent/chat` (streaming SSE)
- ✅ Integration tests (full workflows)
- ✅ Edge cases & security (Unicode, large files, path traversal)

**Test count:** 35 test cases

### `test_ui.py` - Playwright UI Tests
End-to-end UI tests using Playwright.

**Coverage:**
- Theme toggle functionality
- Fullscreen mode
- File operations
- Mindmap rendering
- Responsive behavior

## Setup

Install test dependencies:

```bash
uv sync
```

This installs:
- `pytest` - Test framework
- `pytest-asyncio` - Async test support
- `httpx` - Async HTTP client for FastAPI testing
- `pytest-cov` - Coverage reporting
- `pytest-playwright` - Browser automation for UI tests

## Running Tests

### Run All Tests

```bash
cd editor && uv run pytest tests/ -v
```

### Run API Tests Only

```bash
cd editor && uv run pytest tests/test_api.py -v
```

### Run UI Tests Only

```bash
cd editor && uv run pytest tests/test_ui.py -v
```

### Run with Coverage

```bash
cd editor && uv run pytest tests/test_api.py -v --cov=server --cov-report=html
```

Coverage report will be generated in `htmlcov/index.html`.

### Run Specific Test Class

```bash
# Run only AI assist tests
cd editor && uv run pytest tests/test_api.py::TestAIAssist -v

# Run only agent SDK tests
cd editor && uv run pytest tests/test_api.py::TestAgentSDK -v
```

### Run Specific Test

```bash
cd editor && uv run pytest tests/test_api.py::TestFileAPI::test_read_file_success -v
```

## Test Structure

### API Tests (`test_api.py`)

#### Fixtures
- `temp_docs_dir` - Creates temporary docs directory for isolated testing
- `client` - AsyncClient for FastAPI testing (with patched DOCS_DIR)
- `mock_anthropic` - Mocked Anthropic client for AI endpoints
- `mock_agent_sdk` - Mocked Claude Agent SDK for agent endpoints

#### Test Classes

```
TestBasicRoutes           - Root, config, static files
TestFileAPI              - File listing, read, write, security
TestTreeAPI              - Document tree for mindmap
TestAIStatus             - AI availability status
TestAIAssist             - AI assistance (Messages API)
TestAIAssistStream       - Streaming AI assistance
TestAgentSDK             - Agent chat and status
TestIntegration          - Full workflows
TestEdgeCases            - Unicode, large files, security
```

#### Mock Strategy

**Anthropic Messages API:**
- Mocks `anthropic.Anthropic` client
- Returns predefined response with usage statistics
- Tests both success and error cases

**Claude Agent SDK:**
- Mocks `ClaudeSDKClient` with async context manager
- Mocks streaming response generator
- Tests SSE format and error handling

#### Key Test Scenarios

**Security:**
- ✅ Path traversal attacks blocked (`.../../../etc/passwd`)
- ✅ Access control (files outside `mindmap/` forbidden)

**Error Handling:**
- ✅ 404 for missing files
- ✅ 503 when AI/Agent not available (API key not set)
- ✅ 400 for invalid parameters
- ✅ 502 for Anthropic API errors

**Graceful Degradation:**
- ✅ Server works without `ANTHROPIC_API_KEY`
- ✅ Status endpoints report availability correctly
- ✅ AI endpoints return proper error when unavailable

**Streaming:**
- ✅ SSE format validation
- ✅ Error messages in stream
- ✅ `done` event at end

## Environment Variables

Tests handle different environment configurations:

- `ANTHROPIC_API_KEY` - Mocked in tests, not required to run tests
- Tests verify graceful behavior when key is not set

## Notes

### Why Mock External APIs?

1. **Speed** - Tests run in milliseconds, not seconds
2. **Reliability** - No network failures or API rate limits
3. **Cost** - No actual API calls to Anthropic
4. **Isolation** - Tests don't depend on external services
5. **Determinism** - Consistent results every run

### Test Isolation

Each test:
- Uses `tmp_path` fixture for file operations (no pollution)
- Patches `DOCS_DIR` to use temporary directory
- Mocks external dependencies (Anthropic, Agent SDK)
- Runs independently (can run in any order)

### Async Testing

All API tests use `@pytest.mark.asyncio` because:
- FastAPI endpoints are async
- Uses `AsyncClient` from `httpx`
- Tests actual async behavior (not just sync wrappers)

## CI/CD Integration

These tests are designed for CI pipelines:

```yaml
# Example GitHub Actions
- name: Run tests
  run: |
    cd editor
    uv run pytest tests/ -v --cov=server --cov-report=xml

- name: Upload coverage
  uses: codecov/codecov-action@v3
```

## Troubleshooting

### Import Errors

If you see `ModuleNotFoundError: No module named 'server'`:

```bash
# Make sure you're in the editor directory
cd editor
uv run pytest tests/test_api.py -v
```

### Async Warnings

If you see `RuntimeWarning: coroutine was never awaited`:
- Make sure test methods have `async def`
- Make sure test class has `@pytest.mark.asyncio` decorator

### Mock Not Working

If mocks aren't being applied:
- Check the import path in `@patch("server.anthropic.Anthropic")`
- Make sure `monkeypatch.setattr` uses correct module path

## Future Improvements

- [ ] Add WebSocket tests (currently not covered)
- [ ] Add performance/load tests
- [ ] Add mutation testing (pytest-mutate)
- [ ] Add property-based testing (hypothesis)
- [ ] Integration tests with real temp server instance
