"""Tests for the LINE verifier dependency selector and (relocated) fake double."""
import json

import httpx
import pytest

from app.core import line_verifier
from app.core.line_verifier import (
    LineIdentity,
    LineTokenVerificationError,
    LineVerifyApiVerifier,
    get_line_verifier,
)
from tests.fakes import FakeLineVerifier


@pytest.mark.asyncio
async def test_fake_line_verifier_parses_json():
    """The fake parses the id_token JSON into a LineIdentity."""
    v = FakeLineVerifier()
    lid = await v.verify(json.dumps({"sub": "U123", "name": "Mei", "email": "m@x.com"}))
    assert lid == LineIdentity(sub="U123", name="Mei", email="m@x.com")


@pytest.mark.asyncio
async def test_fake_line_verifier_no_email_is_none():
    """A claims payload without an email yields email=None."""
    lid = await FakeLineVerifier().verify(json.dumps({"sub": "U1", "name": "A"}))
    assert lid.email is None


@pytest.mark.asyncio
async def test_fake_line_verifier_requires_sub():
    """A claims payload missing sub raises LineTokenVerificationError."""
    with pytest.raises(LineTokenVerificationError):
        await FakeLineVerifier().verify(json.dumps({"name": "no sub"}))


def test_get_line_verifier_returns_real():
    """The dependency returns the real verify-endpoint verifier."""
    assert isinstance(get_line_verifier(), LineVerifyApiVerifier)


def _patch_client(monkeypatch, handler):
    """Patch line_verifier.httpx.AsyncClient to use a MockTransport with `handler`."""
    real_client = httpx.AsyncClient

    def factory(**kwargs):
        kwargs.pop("transport", None)
        return real_client(transport=httpx.MockTransport(handler), **kwargs)
    monkeypatch.setattr(line_verifier.httpx, "AsyncClient", factory)


@pytest.mark.asyncio
async def test_adapter_valid_claims(monkeypatch):
    """200 + valid claims -> LineIdentity with sub/name/email."""
    _patch_client(monkeypatch, lambda req: httpx.Response(
        200, json={"sub": "U1", "name": "Mei", "email": "m@x.com"}))
    lid = await LineVerifyApiVerifier("chan").verify("tok")
    assert lid.sub == "U1" and lid.name == "Mei" and lid.email == "m@x.com"


@pytest.mark.asyncio
async def test_adapter_no_email_is_none(monkeypatch):
    """200 without email -> LineIdentity.email is None."""
    _patch_client(monkeypatch, lambda req: httpx.Response(200, json={"sub": "U1", "name": "A"}))
    lid = await LineVerifyApiVerifier("chan").verify("tok")
    assert lid.email is None


@pytest.mark.asyncio
async def test_adapter_non_200_raises(monkeypatch):
    """Non-200 from LINE -> LineTokenVerificationError (so endpoint maps to 401, not 500)."""
    _patch_client(monkeypatch, lambda req: httpx.Response(400, json={"error": "invalid_request"}))
    with pytest.raises(LineTokenVerificationError):
        await LineVerifyApiVerifier("chan").verify("tok")


@pytest.mark.asyncio
async def test_adapter_non_json_raises(monkeypatch):
    """200 with a non-JSON body -> LineTokenVerificationError, not an unhandled 500."""
    _patch_client(monkeypatch, lambda req: httpx.Response(200, text="not json"))
    with pytest.raises(LineTokenVerificationError):
        await LineVerifyApiVerifier("chan").verify("tok")


@pytest.mark.asyncio
async def test_adapter_missing_sub_raises(monkeypatch):
    """200 + JSON without sub -> LineTokenVerificationError."""
    _patch_client(monkeypatch, lambda req: httpx.Response(200, json={"name": "no sub"}))
    with pytest.raises(LineTokenVerificationError):
        await LineVerifyApiVerifier("chan").verify("tok")


@pytest.mark.asyncio
async def test_adapter_httpx_error_raises(monkeypatch):
    """A transport/network error -> LineTokenVerificationError (401-not-500 contract)."""
    def boom(req):
        raise httpx.ConnectError("boom")
    _patch_client(monkeypatch, boom)
    with pytest.raises(LineTokenVerificationError):
        await LineVerifyApiVerifier("chan").verify("tok")
