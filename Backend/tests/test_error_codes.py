"""The `code` field on auth error responses is the contract clients branch on.

Nothing else in the suite touches it. `detail` is asserted in several places, so a reworded message
gets caught — but if the `ApiError` handler stopped firing, or a converted raise site regressed to a
plain `HTTPException`, every assertion would stay green while clients silently fell back to generic
copy. That is the exact failure `app/core/api_errors.py` warns about, so it needs its own tests.

Two layers here. The behavioural tests prove the handler emits `code` and that specific endpoints
carry the right one. The structural test covers all 45 converted raise sites at once — per-site
behavioural coverage is not practical, but a regression to `HTTPException` is detectable in the
source.
"""

import ast
import pathlib
import uuid

import pytest

from app.core.api_errors import ErrorCode

_AUTH_ENDPOINTS = pathlib.Path(__file__).resolve().parents[1] / "app/api/v1/endpoints/auth"


@pytest.mark.asyncio
async def test_register_conflict_carries_identifier_taken(client, capture_email):
    """A taken identifier answers 409 with the code the register form branches on."""
    email = f"code_{uuid.uuid4().hex[:6]}@t.local"
    payload = {"type": "email", "value": email, "password": "pw123456", "salt_frontend": "abc",
               "name": "Test User"}
    await client.post("/api/v1/auth/register", json=payload)
    await client.post("/api/v1/auth/verify",
                      json={"type": "email", "value": email, "code": capture_email.last_code})

    res = await client.post("/api/v1/auth/register", json=payload)

    assert res.status_code == 409
    assert res.json()["code"] == ErrorCode.IDENTIFIER_TAKEN


@pytest.mark.asyncio
async def test_bad_verification_code_carries_code_invalid(client):
    """The wrong-code case is the one the verification screen must tell apart from a server fault."""
    res = await client.post(
        "/api/v1/auth/verify",
        json={"type": "email", "value": "nobody@t.local", "code": "000000"},
    )

    assert res.status_code == 400
    assert res.json()["code"] == ErrorCode.CODE_INVALID


@pytest.mark.asyncio
async def test_bad_login_carries_credentials_invalid(client):
    """Login failure must be distinguishable from a rate-limit refusal by code, not by prose."""
    res = await client.post(
        "/api/v1/auth/login",
        data={"username": "any_user", "password": "wrong_password"},
    )

    assert res.status_code == 401
    assert res.json()["code"] == ErrorCode.CREDENTIALS_INVALID


@pytest.mark.asyncio
async def test_error_response_keeps_detail_alongside_code(client):
    """`code` is additive — existing consumers reading `detail` must not be disturbed."""
    res = await client.post(
        "/api/v1/auth/verify",
        json={"type": "email", "value": "nobody@t.local", "code": "000000"},
    )

    assert res.json()["detail"] == "Invalid or expired code"


def test_no_auth_endpoint_constructs_a_bare_http_exception():
    """Guards all 45 converted raise sites at once.

    A site regressing to `HTTPException` answers without a code, and no behavioural test would
    notice unless that exact endpoint happened to be covered.

    Checked two ways because each alone has a blind spot. Matching the *construction* rather than
    the `raise` catches `session.py`, which builds its 401 once and raises the same object twice —
    an earlier version walking only `ast.Raise` let that pattern regress silently. Matching the
    import catches the same class of miss one level up: an aliased `HTTPException as HE` would sail
    past a name comparison.
    """
    offenders = []

    for path in sorted(_AUTH_ENDPOINTS.glob("*.py")):
        for node in ast.walk(ast.parse(path.read_text())):
            if isinstance(node, ast.ImportFrom):
                offenders += [
                    f"{path.name}:{node.lineno} imports HTTPException"
                    for alias in node.names
                    if alias.name == "HTTPException"
                ]
            elif isinstance(node, ast.Call) and (
                getattr(node.func, "id", getattr(node.func, "attr", None)) == "HTTPException"
            ):
                offenders.append(f"{path.name}:{node.lineno} constructs HTTPException")

    assert offenders == [], f"HTTPException carries no code: {', '.join(offenders)}"


def test_every_error_code_value_is_unique():
    """Two members sharing a value would make one of them unmatchable on the client."""
    values = [member.value for member in ErrorCode]

    assert len(values) == len(set(values))
