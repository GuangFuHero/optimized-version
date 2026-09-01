"""Linking and unlinking SSO login methods (feature 017, ADR-217~219).

The load-bearing tests are the two attack chains. Both were verified end to end against the
code before this feature: with only a stolen session, an attacker could attach their own
provider and sign in as the victim for ever, and on an account missing one contact type they
could attach their own channel and have the step-up code delivered to themselves.
"""

import json
from datetime import UTC, datetime

import pytest

from app.core.security import generate_salt, get_password_hash
from app.models.auth import UserContact
from app.services.auth_account import create_account
from tests.conftest import auth_headers_for

pytestmark = pytest.mark.asyncio

_PASSWORD = "secret"
LINK_LINE = "/api/v1/auth/link/line"
LINK_GOOGLE = "/api/v1/auth/link/google"


def _token(sub: str, **claims) -> str:
    """The fake verifiers read the id_token as JSON claims (tests/fakes.py)."""
    return json.dumps({"sub": sub, **claims})


async def _sso_only_user(db, redis, email="victim@x.com"):
    """An account with one email contact and only a Google identity."""
    user = await create_account(db, name="V", provider="google", provider_subject="victim-google",
                                contact_type="email", value=email)
    return str(user.uuid), await auth_headers_for(redis, user.uuid)


async def _password_user(db, redis, email="owner@x.com"):
    user = await create_account(
        db, contact_type="email", value=email, name="Owner",
        password_hash=get_password_hash(_PASSWORD, generate_salt()),
    )
    return str(user.uuid), await auth_headers_for(redis, user.uuid)


async def _login_methods(client, headers) -> list[str]:
    res = await client.get("/api/v1/users/me", headers=headers)
    return [m["provider"] for m in res.json().get("login_methods", [])]


# ──────────────────────────────────────────────
# Attack chain A: a stolen session must not attach a permanent way in (ADR-217)
# ──────────────────────────────────────────────


async def test_a_stolen_session_cannot_link_the_attackers_provider(
    client, db_session, redis, capture_email
):
    """The chain that worked before this feature: link, then sign in as the victim for ever.

    A linked provider outlives every other control — password changes, session revocation and
    contact swaps all leave it in place — so it is the worst thing a bare session could add.
    """
    user_uuid, headers = await _sso_only_user(db_session, redis)

    linked = await client.post(LINK_LINE, headers=headers,
                               json={"id_token": _token("attacker-line-sub")})

    assert linked.status_code == 422, linked.text
    assert "line" not in await _login_methods(client, headers)
    # the proof went to the victim's own contact, which the session holder need not control
    assert capture_email.messages[-1][0] == "victim@x.com"

    # and the provider token alone still does not sign the attacker in as the victim
    signed_in = await client.post("/api/v1/auth/sso/line",
                                  json={"id_token": _token("attacker-line-sub")})
    assert signed_in.status_code == 200  # it made a NEW account, not the victim's
    assert signed_in.json()["access_token"]
    me = await client.get("/api/v1/users/me",
                          headers={"Authorization": f"Bearer {signed_in.json()['access_token']}"})
    assert me.json()["uuid"] != user_uuid


async def test_linking_succeeds_with_the_code_and_notifies(client, db_session, redis, capture_email):
    """The owner's path: read the code off your own contact, link, get told."""
    _, headers = await _sso_only_user(db_session, redis)
    await client.post(LINK_LINE, headers=headers, json={"id_token": _token("owner-line-sub")})

    res = await client.post(LINK_LINE, headers=headers, json={
        "id_token": _token("owner-line-sub"),
        "step_up": {"old_channel_code": capture_email.last_code},
    })

    assert res.status_code == 200, res.text
    assert "line" in await _login_methods(client, headers)
    assert "登入方式已新增" in capture_email.messages[-1][1]


async def test_a_password_account_links_with_its_password(client, db_session, redis, capture_email):
    """An account that has a password proves it the way it proves every other change."""
    _, headers = await _password_user(db_session, redis)

    refused = await client.post(LINK_GOOGLE, headers=headers,
                                json={"id_token": _token("owner-google-sub")})
    assert refused.status_code == 422, refused.text
    assert "密碼" in refused.json()["detail"]

    res = await client.post(LINK_GOOGLE, headers=headers, json={
        "id_token": _token("owner-google-sub"), "step_up": {"password": _PASSWORD},
    })
    assert res.status_code == 200, res.text
    assert "google" in await _login_methods(client, headers)


async def test_a_wrong_password_does_not_link(client, db_session, redis, capture_email):
    """A wrong proof is a 401, and nothing is attached."""
    _, headers = await _password_user(db_session, redis)

    res = await client.post(LINK_GOOGLE, headers=headers, json={
        "id_token": _token("owner-google-sub"), "step_up": {"password": "wrongpw"},
    })

    assert res.status_code == 401, res.text
    assert "google" not in await _login_methods(client, headers)


async def test_a_conflict_is_answered_before_any_proof_is_demanded(
    client, db_session, redis, capture_email
):
    """Asking for proof of something that was never possible is the ADR-159 mistake."""
    _, headers = await _sso_only_user(db_session, redis)

    res = await client.post(LINK_GOOGLE, headers=headers,
                            json={"id_token": _token("someone-elses-google")})

    assert res.status_code == 409, res.text
    assert capture_email.messages == []  # no code was sent


# ──────────────────────────────────────────────
# Attack chain B: a channel the caller just attached is not proof (ADR-219)
# ──────────────────────────────────────────────


async def test_a_freshly_added_contact_is_not_used_as_the_proof_channel(
    client, db_session, redis, capture_email, capture_sms
):
    """Defence in depth behind ADR-220: even a legitimately added channel is not proof yet.

    ADR-220 now blocks the front door — a session alone cannot attach the contact at all — so
    this attaches it the way the owner would, with the proof, and then checks the cooldown.
    Before ADR-219 the proof channel was "email first", so a brand-new email won the choice
    and the next step-up code went there.
    """
    user = await create_account(db_session, name="V2", provider="google",
                                provider_subject="victim2-google",
                                contact_type="phone", value="+886911111111")
    headers = await auth_headers_for(redis, user.uuid)
    # the account's real contact has to be settled, or nothing is
    await db_session.execute(
        UserContact.__table__.update()
        .where(UserContact.user_uuid == user.uuid)
        .values(created_at=datetime(2020, 1, 1, tzinfo=UTC))
    )
    await db_session.commit()

    await client.post("/api/v1/auth/contacts", headers=headers,
                      json={"type": "email", "value": "second@x.com"})
    added = await client.post("/api/v1/auth/contacts", headers=headers, json={
        "type": "email", "value": "second@x.com",
        "step_up": {"old_channel_code": capture_sms.last_code},
    })
    assert added.status_code == 202, added.text
    attached = await client.post("/api/v1/auth/contacts/verify", headers=headers, json={
        "type": "email", "value": "second@x.com", "code": capture_email.last_code,
    })
    assert attached.status_code == 200, attached.text

    before = len(capture_email.messages)
    res = await client.post("/api/v1/auth/set-password", headers=headers,
                            json={"password": "brandnew", "salt_frontend": "s"})

    assert res.status_code == 422, res.text
    assert len(capture_email.messages) == before, "the code went to the freshly added email"
    assert capture_sms.messages[-1][0] == "+886911111111"  # the settled channel got it


async def test_a_brand_new_account_can_still_prove_itself(client, db_session, redis, capture_email):
    """Every contact on a week-old account is inside the cooldown; it must still work.

    The fallback is the oldest contact, which is also the one an attacker did not add.
    """
    _, headers = await _sso_only_user(db_session, redis)

    res = await client.post("/api/v1/auth/set-password", headers=headers,
                            json={"password": "brandnew", "salt_frontend": "s"})

    assert res.status_code == 422, res.text
    assert capture_email.messages[-1][0] == "victim@x.com"


# ──────────────────────────────────────────────
# Unlink: the owner needs a way to take one off (ADR-218)
# ──────────────────────────────────────────────


async def _unlink(client, headers, provider, step_up=None):
    return await client.request(
        "DELETE", f"/api/v1/auth/link/{provider}", headers=headers,
        json={"step_up": step_up} if step_up else None,
    )


async def test_unlinking_needs_the_same_proof_and_notifies(client, db_session, redis, capture_email):
    """Without the gate, a session holder could strip the owner's provider and keep their own."""
    _, headers = await _password_user(db_session, redis)
    await client.post(LINK_GOOGLE, headers=headers, json={
        "id_token": _token("owner-google-sub"), "step_up": {"password": _PASSWORD},
    })

    refused = await _unlink(client, headers, "google")
    assert refused.status_code == 422, refused.text

    res = await _unlink(client, headers, "google", {"password": _PASSWORD})

    assert res.status_code == 204, res.text
    assert "google" not in await _login_methods(client, headers)
    assert "登入方式已移除" in capture_email.messages[-1][1]


async def test_the_last_login_method_cannot_be_unlinked(client, db_session, redis, capture_email):
    """The mirror of ADR-087's contact guard, on the other half of "ways back in"."""
    _, headers = await _sso_only_user(db_session, redis)

    res = await _unlink(client, headers, "google")

    assert res.status_code == 409, res.text
    assert "登入方式" in res.json()["detail"]
    assert capture_email.messages == []  # refused before any proof was demanded


async def test_unlinking_something_the_account_does_not_have_is_404(client, db_session, redis):
    """Nothing to remove is a 404, not a silent success."""
    _, headers = await _sso_only_user(db_session, redis)

    res = await _unlink(client, headers, "line")

    assert res.status_code == 404, res.text


async def test_an_unknown_provider_is_404(client, db_session, redis):
    """The path segment is not a free-text lookup into the identities table."""
    _, headers = await _sso_only_user(db_session, redis)

    res = await _unlink(client, headers, "facebook")

    assert res.status_code == 404, res.text


# ──────────────────────────────────────────────
# change-password now tells the owner too (ADR-218)
# ──────────────────────────────────────────────


async def test_changing_a_password_notifies_the_account(client, db_session, redis, capture_email):
    """Least likely to be an attacker is not a reason for the owner to hear nothing."""
    _, headers = await _password_user(db_session, redis)

    res = await client.post("/api/v1/auth/change-password", headers=headers, json={
        "old_password": _PASSWORD, "new_password": "newsecret", "salt_frontend": "s",
    })

    assert res.status_code == 204, res.text
    assert "已變更" in capture_email.messages[-1][1]


# ──────────────────────────────────────────────
# Attack chain C: an attached contact is a recovery destination (ADR-220)
# ──────────────────────────────────────────────


async def test_a_session_cannot_attach_a_contact_and_reset_the_password_through_it(
    client, db_session, redis, capture_email, capture_sms
):
    """The chain the cooldown could not reach, because reset never consults the proof channel.

    A contact IS a recovery destination the moment it is verified. ADR-086 gated only
    replacement, so an account holding just a phone could have the attacker's email attached
    with a bare session; `forgot-password` on that address then delivered a reset code to
    them. Verified end to end before ADR-220.
    """
    user = await create_account(
        db_session, name="V3", contact_type="phone", value="+886922222222",
        password_hash=get_password_hash(_PASSWORD, generate_salt()),
    )
    headers = await auth_headers_for(redis, user.uuid)

    attach = await client.post("/api/v1/auth/contacts", headers=headers,
                               json={"type": "email", "value": "attacker@evil.com"})

    assert attach.status_code == 422, attach.text
    assert "密碼" in attach.json()["detail"]  # the account has one, so that is the proof
    assert capture_email.messages == []  # nothing was sent to the attacker's address

    # and the address never became a recovery destination
    await client.post("/api/v1/auth/forgot-password",
                      json={"type": "email", "value": "attacker@evil.com"})
    assert capture_email.messages == []


async def test_the_owner_can_still_add_a_second_contact_type(
    client, db_session, redis, capture_email, capture_sms
):
    """Gating the add must not make a legitimate second channel unreachable."""
    _, headers = await _password_user(db_session, redis)

    res = await client.post("/api/v1/auth/contacts", headers=headers, json={
        "type": "phone", "value": "0933333333", "step_up": {"password": _PASSWORD},
    })

    assert res.status_code == 202, res.text
    assert capture_sms.last_code  # the verification code went to the new number


async def test_an_sso_only_account_proves_the_add_on_its_existing_channel(
    client, db_session, redis, capture_email, capture_sms
):
    """No password to check, so the code goes to the contact the account already had."""
    _, headers = await _sso_only_user(db_session, redis)

    asked = await client.post("/api/v1/auth/contacts", headers=headers,
                              json={"type": "phone", "value": "0944444444"})

    assert asked.status_code == 422, asked.text
    assert capture_email.messages[-1][0] == "victim@x.com"
    assert capture_sms.messages == []  # nothing reached the number being added

    res = await client.post("/api/v1/auth/contacts", headers=headers, json={
        "type": "phone", "value": "0944444444",
        "step_up": {"old_channel_code": capture_email.last_code},
    })
    assert res.status_code == 202, res.text


async def test_an_account_with_nothing_to_prove_with_can_add_its_first_contact(
    client, db_session, redis, capture_email
):
    """Ungated only when there is genuinely nothing to prove against (ADR-220)."""
    user = await create_account(db_session, name="Bare", provider="line",
                                provider_subject="bare-line-sub")
    headers = await auth_headers_for(redis, user.uuid)

    res = await client.post("/api/v1/auth/contacts", headers=headers,
                            json={"type": "email", "value": "owner@x.com"})

    assert res.status_code == 202, res.text
    assert capture_email.last_code
