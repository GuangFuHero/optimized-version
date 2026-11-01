"""The 申請成為後台人員 GraphQL surface is wired to the role request service (Spec/019).

Wiring only: the rules themselves are observed at the service (tests/test_role_request.py).
"""

import uuid
from datetime import UTC, datetime

import pytest

from app.core.permissions import Perm
from app.models.auth import UserContact
from app.models.team import Team
from tests.test_graphql.conftest import _create_user_with_role, _ensure_platform_role, auth_header
from tests.test_graphql.conftest import test_db as graphql_db  # renamed so pytest does not collect it

SUBMIT = """
mutation($input: SubmitRoleRequestInput!) {
    submitRoleRequest(input: $input) {
        uuid requestedRole reason status applicantName applicantPhone applicantEmail newTeamName viaInvite
        team { uuid name type }
    }
}
"""

MINE = """
query { myRoleRequests { hasBackofficeIdentity canApply requests { requestedRole status } } }
"""

WITHDRAW = """
mutation($uuid: UUID!) { withdrawRoleRequest(uuid: $uuid) { uuid status closedAt } }
"""

APPLICATION = {"requestedRole": "data_auditor", "reason": "協助檢查重複通報", "name": "王小明"}


async def _citizen_token(redis, phone: str | None = None) -> str:
    """A token for a fresh account holding the platform `user` role, as registration leaves it.

    The GraphQL fixtures seed their own role names, not the production `user` that the
    eligibility rule keys on, so the role is added here once and reused across tests.
    """
    await _ensure_platform_role("user", [(Perm.ROLE_REQUEST_ADD, "all")])
    user_uuid, token = await _create_user_with_role(redis, "user")
    # Applying needs a verified phone since Spec 026 (ADR-355). Unique by value, so one per test run.
    async with graphql_db() as db:
        phone = f"+8869{uuid.uuid4().int % 10**8:08d}" if phone is None else phone
        db.add(
            UserContact(
                user_uuid=user_uuid, type="phone", value=phone, verified=True, verified_at=datetime.now(UTC)
            )
        )
    return token


async def _post(client, query: str, token: str | None, variables: dict | None = None) -> dict:
    headers = auth_header(token) if token else {}
    response = await client.post("/graphql", json={"query": query, "variables": variables}, headers=headers)
    return response.json()


@pytest.mark.asyncio
async def test_submitting_returns_the_pending_application(client, redis):
    """The drawer gets back what it sent, now pending, so it can show the card at once."""
    token = await _citizen_token(redis)

    body = await _post(client, SUBMIT, token, {"input": APPLICATION})

    assert "errors" not in body, body
    submitted = body["data"]["submitRoleRequest"]
    assert submitted["status"] == "pending"
    assert (submitted["requestedRole"], submitted["reason"], submitted["applicantName"]) == (
        "data_auditor",
        "協助檢查重複通報",
        "王小明",
    )
    assert (submitted["team"], submitted["newTeamName"], submitted["viaInvite"]) == (None, None, False)


@pytest.mark.asyncio
async def test_my_role_requests_reports_what_the_entry_needs(client, redis):
    """One query answers both which entry to show and what the drawer lists."""
    token = await _citizen_token(redis)
    await _post(client, SUBMIT, token, {"input": APPLICATION})

    body = await _post(client, MINE, token)

    assert body["data"]["myRoleRequests"] == {
        "hasBackofficeIdentity": False,
        "canApply": False,  # one pending already
        "requests": [{"requestedRole": "data_auditor", "status": "pending"}],
    }


@pytest.mark.asyncio
@pytest.mark.parametrize("query", [SUBMIT, MINE, WITHDRAW])
async def test_a_guest_is_asked_to_sign_in(client, query):
    """AC-RE-101: signed-out visitors see neither entry, and the API agrees."""
    variables = {SUBMIT: {"input": APPLICATION}, WITHDRAW: {"uuid": str(uuid.uuid4())}}.get(query)

    body = await _post(client, query, None, variables)

    assert body["errors"][0]["message"].startswith("401")


@pytest.mark.asyncio
async def test_a_refusal_reaches_the_caller_in_its_own_words(client, redis):
    """The front end maps these English messages to Chinese (Spec/019 conventions)."""
    token = await _citizen_token(redis)
    await _post(client, SUBMIT, token, {"input": APPLICATION})

    body = await _post(client, SUBMIT, token, {"input": APPLICATION})

    assert body["errors"][0]["message"] == "You already have a pending request"


@pytest.mark.asyncio
async def test_withdrawing_returns_the_withdrawn_application(client, redis):
    """The drawer learns the application is closed and can go back to the form."""
    token = await _citizen_token(redis)
    submitted = await _post(client, SUBMIT, token, {"input": APPLICATION})
    request_uuid = submitted["data"]["submitRoleRequest"]["uuid"]

    body = await _post(client, WITHDRAW, token, {"uuid": request_uuid})

    assert "errors" not in body, body
    withdrawn = body["data"]["withdrawRoleRequest"]
    assert (withdrawn["uuid"], withdrawn["status"]) == (request_uuid, "withdrawn")
    assert withdrawn["closedAt"] is not None


@pytest.mark.asyncio
async def test_a_refused_withdrawal_reaches_the_caller_in_its_own_words(client, redis):
    """A second tab withdrawing what the first already did is told why, not "Unexpected error."."""
    token = await _citizen_token(redis)
    submitted = await _post(client, SUBMIT, token, {"input": APPLICATION})
    request_uuid = submitted["data"]["submitRoleRequest"]["uuid"]
    await _post(client, WITHDRAW, token, {"uuid": request_uuid})

    body = await _post(client, WITHDRAW, token, {"uuid": request_uuid})

    assert body["errors"][0]["message"] == "Role request is no longer pending"


@pytest.mark.asyncio
async def test_a_team_application_names_the_team_and_masks_the_phone(client, redis):
    """Spec 026: the form sends the team; the card shows it, with the phone masked."""
    async with graphql_db() as db:
        team = Team(name="花蓮縣光復鄉公所", type="gov", status="active")
        db.add(team)
        await db.flush()
        team_uuid = str(team.uuid)
    token = await _citizen_token(redis, phone=f"+8869{uuid.uuid4().int % 10**8:08d}")
    application = {
        "requestedRole": "government",
        "reason": "公所承辦",
        "name": "王小明",
        "teamUuid": team_uuid,
    }

    body = await _post(client, SUBMIT, token, {"input": application})

    assert "errors" not in body, body
    submitted = body["data"]["submitRoleRequest"]
    assert submitted["team"] == {"uuid": team_uuid, "name": "花蓮縣光復鄉公所", "type": "GOV"}
    assert "*" in submitted["applicantPhone"]


@pytest.mark.asyncio
async def test_a_team_refusal_reaches_the_caller_in_its_own_words(client, redis):
    """A government / NGO application without a team is refused in words the form maps."""
    token = await _citizen_token(redis)
    application = {"requestedRole": "ngo", "reason": "協會", "name": "王小明"}

    body = await _post(client, SUBMIT, token, {"input": application})

    assert body["errors"][0]["message"] == "Pick a team or name a new one"


@pytest.mark.asyncio
async def test_contact_is_no_longer_accepted(client, redis):
    """ADR-355: the free-text contact gave way to a verified phone."""
    token = await _citizen_token(redis)

    body = await _post(client, SUBMIT, token, {"input": {**APPLICATION, "contact": "03-8701234"}})

    assert "contact" in body["errors"][0]["message"]
