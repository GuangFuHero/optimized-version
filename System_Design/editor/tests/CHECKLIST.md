# Test Setup & Execution Checklist

## ✅ Setup (One Time)

- [ ] 1. Install test dependencies
  ```bash
  cd /Users/sprin/Desktop/CodeForge/sandbox/chatroom/mindmap_2_md
  uv sync
  ```

- [ ] 2. Verify installation
  ```bash
  cd editor
  uv run pytest --version
  uv run python -c "import httpx; import pytest_asyncio; print('All deps OK')"
  ```

## ✅ Run Tests

### Quick Smoke Test (2 minutes)

```bash
cd editor
uv run pytest tests/test_api.py::TestBasicRoutes -v
```

Expected output: 2 passed

### Full API Test Suite (1-2 minutes)

```bash
cd editor
uv run pytest tests/test_api.py -v
```

Expected output: 35 passed

### With Coverage Report

```bash
cd editor
uv run pytest tests/test_api.py -v --cov=server --cov-report=html
```

Then open: `editor/htmlcov/index.html`

## ✅ Test Categories

Run specific test categories:

### 1. File API Tests (8 tests)
```bash
uv run pytest tests/test_api.py::TestFileAPI -v
```

### 2. AI Assistance Tests (10 tests)
```bash
uv run pytest tests/test_api.py::TestAIAssist -v
```

### 3. Agent SDK Tests (6 tests)
```bash
uv run pytest tests/test_api.py::TestAgentSDK -v
```

### 4. Integration Tests (2 tests)
```bash
uv run pytest tests/test_api.py::TestIntegration -v
```

### 5. Security Tests (4 tests)
```bash
uv run pytest tests/test_api.py -k "path_traversal or security" -v
```

## ✅ Verify Coverage

### Check Endpoint Coverage

All these endpoints should be tested:

- [ ] `GET /`
- [ ] `GET /api/config`
- [ ] `GET /api/files`
- [ ] `GET /api/files/{path}`
- [ ] `PUT /api/files/{path}`
- [ ] `GET /api/tree`
- [ ] `GET /api/ai/status`
- [ ] `POST /api/ai/assist`
- [ ] `POST /api/ai/assist/stream`
- [ ] `GET /api/agent/status`
- [ ] `POST /api/agent/chat`

### Check Error Cases Covered

- [ ] 400 Bad Request (invalid parameters)
- [ ] 403 Forbidden (path traversal)
- [ ] 404 Not Found (missing files)
- [ ] 502 Bad Gateway (Anthropic API errors)
- [ ] 503 Service Unavailable (AI not configured)

## ✅ Common Issues & Solutions

### Issue: `ModuleNotFoundError: No module named 'server'`

**Solution:**
```bash
# Make sure you're in the editor directory
cd editor
uv run pytest tests/test_api.py -v
```

### Issue: `ImportError: cannot import name 'AsyncClient' from 'httpx'`

**Solution:**
```bash
# Install httpx
uv add --dev httpx
```

### Issue: `RuntimeWarning: coroutine was never awaited`

**Cause:** Missing `await` or wrong decorator

**Check:**
- All test methods should be `async def test_xxx`
- All test classes should have `@pytest.mark.asyncio`

### Issue: Mocks not working

**Check:**
```python
# Correct path in patch
@patch("server.anthropic.Anthropic")  # ✅ Correct

# NOT
@patch("anthropic.Anthropic")  # ❌ Wrong
```

## ✅ Pre-Commit Checks

Before committing code changes:

```bash
# 1. Run all tests
cd editor
uv run pytest tests/test_api.py -v

# 2. Check coverage (aim for >80%)
uv run pytest tests/test_api.py --cov=server --cov-report=term

# 3. Run UI tests (if UI changed)
uv run pytest tests/test_ui.py -v

# 4. Format code (if using black/ruff)
# uv run black server.py
# uv run ruff check server.py
```

## ✅ CI/CD Setup (Optional)

Add to `.github/workflows/test.yml`:

```yaml
name: Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Install uv
        run: curl -LsSf https://astral.sh/uv/install.sh | sh

      - name: Install dependencies
        run: uv sync

      - name: Run API tests
        run: |
          cd editor
          uv run pytest tests/test_api.py -v --cov=server --cov-report=xml

      - name: Upload coverage
        uses: codecov/codecov-action@v3
```

## ✅ Next Steps

After verifying all tests pass:

1. **Review Coverage Report**
   ```bash
   cd editor
   uv run pytest tests/test_api.py --cov=server --cov-report=html
   open htmlcov/index.html
   ```

2. **Add More Tests** (if needed)
   - WebSocket functionality
   - Concurrent operations
   - Performance tests

3. **Set Up CI** (optional)
   - GitHub Actions
   - Pre-commit hooks

## Quick Reference

### All Test Files

```
editor/tests/
├── test_api.py          # 35 API tests (YOU ARE HERE)
├── test_ui.py           # Playwright UI tests
├── README.md            # Detailed test documentation
├── TEST_SUMMARY.md      # Coverage summary
└── CHECKLIST.md         # This file
```

### Test Counts by File

- `test_api.py`: 35 tests
- `test_ui.py`: 18 tests (UI/e2e)
- **Total**: 53 tests

### Quick Commands

```bash
# Run everything
uv run pytest tests/ -v

# API only
uv run pytest tests/test_api.py -v

# UI only (requires server running)
uv run pytest tests/test_ui.py -v

# With coverage
uv run pytest tests/test_api.py --cov=server --cov-report=html
```

## Done! 🎉

Your comprehensive test suite is ready. All 35 API tests cover:
- ✅ All HTTP endpoints
- ✅ AI features (Messages API & Agent SDK)
- ✅ Error handling & security
- ✅ Integration workflows
- ✅ Edge cases
