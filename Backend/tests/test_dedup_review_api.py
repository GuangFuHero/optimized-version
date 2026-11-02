"""The AI 重複審核 REST surface is wired to the service (Spec 025 §2, ADR-338).

Wiring only: filtering, order and the two sides are observed at the service
(tests/test_dedup_review_read.py). Roles come straight from `scripts/seed_rbac.py`, so who may
read is what production grants. Uuids are captured as plain strings when rows are made:
`db_session` is expire_on_commit=True (see tests/test_admin_api.py).
"""

from decimal import Decimal

import pytest
from geoalchemy2.shape import from_shape
from shapely.geometry import Point
from sqlalchemy import select

from app.models.auth import User
from app.models.dedup import DedupAuditEvent, DuplicatePair
from app.models.rbac import Permission, Role, RolePermissionAssign, UserRoleAssign
from app.models.request import Tickets
from app.models.team import Team
from app.models.ticket_task import TicketTask
from scripts.seed_rbac import ROLES_DATA
from tests.conftest import auth_headers_for

pytestmark = pytest.mark.asyncio

URL = "/api/v1/admin/duplicate-pairs"
EVIDENCE = {"components": [{"name": "distance", "score": 0.97, "passed": True}], "version": "fast-v4"}


async def _seeded_role(db, name: str) -> Role:
    """`name` with the grants seed_rbac.py gives it; reused when it already exists."""
    spec = next(spec for spec in ROLES_DATA if spec["name"] == name)
    role = (await db.execute(select(Role).where(Role.name == name))).scalar_one_or_none()
    if role is not None:
        return role
    role = Role(name=name, kind=spec["kind"])
    db.add(role)
    await db.flush()
    for perm, scope in spec["permissions"].items():
        permission = (
            await db.execute(select(Permission).where(Permission.key == perm.value))
        ).scalar_one_or_none()
        if permission is None:
            permission = Permission(key=perm.value)
            db.add(permission)
            await db.flush()
        db.add(RolePermissionAssign(role_uuid=role.uuid, permission_uuid=permission.uuid, scope=scope))
    await db.flush()
    return role


async def _headers(db, redis, role_name: str) -> dict:
    """Bearer headers for a new account acting as the seeded `role_name` (team roles get a gov team)."""
    role = await _seeded_role(db, role_name)
    team = None
    if role.kind == "team":
        team = Team(name="光復鄉公所", type="gov")
        db.add(team)
        await db.flush()
    user = User(name=f"{role_name} 帳號")
    db.add(user)
    await db.flush()
    db.add(UserRoleAssign(user_uuid=user.uuid, role_uuid=role.uuid, team_uuid=team.uuid if team else None))
    ids = (str(user.uuid), str(role.uuid), str(team.uuid) if team else None)
    await db.commit()
    return await auth_headers_for(redis, ids[0], ids[1], ids[2])


async def _card(db, *, status="dup_ignored") -> dict:
    """Two tasks on two tickets and a card between them; returns their uuids as strings."""
    owner = User(name="通報者")
    db.add(owner)
    await db.flush()
    tasks = []
    for title in ("一樓淹水", "二樓淹水"):
        ticket = Tickets(
            geometry=from_shape(Point(121.43, 23.67), srid=4326),
            title=title,
            status="pending",
            priority="high",
            contact_name="李",
            created_by=owner.uuid,
        )
        db.add(ticket)
        await db.flush()
        task = TicketTask(
            ticket_uuid=ticket.uuid, task_type="rescue", task_name="需要抽水機", created_by=owner.uuid
        )
        db.add(task)
        await db.flush()
        tasks.append(task.uuid)
    low, high = sorted(tasks, key=str)
    pair = DuplicatePair(
        entity_kind="ticket_task",
        low_uuid=low,
        high_uuid=high,
        similarity=Decimal("0.9100"),
        evidence=EVIDENCE,
        method="fast_rule",
        engine_version="fast-v4",
        source_layer="fast",
        status=status,
    )
    db.add(pair)
    await db.flush()
    db.add(
        DedupAuditEvent(
            entity_kind="ticket_task",
            event_type="ignored_by_submitter",
            pair_uuid=pair.uuid,
            source_layer="fast",
            engine_version="fast-v4",
        )
    )
    ids = {"pair": str(pair.uuid), "low": str(low), "high": str(high)}
    await db.commit()
    return ids


@pytest.mark.parametrize("role_name", ["super_admin", "data_auditor"])
async def test_the_seeded_reviewers_read_the_queue(client, db_session, redis, role_name):
    """ADR-337: both platform roles the seed grants ai_duplicate.view to."""
    card = await _card(db_session)
    headers = await _headers(db_session, redis, role_name)

    response = await client.get(URL, headers=headers)

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["total"] == 1
    (item,) = body["items"]
    assert (item["uuid"], item["entity_kind"], item["status"]) == (card["pair"], "ticket_task", "dup_ignored")
    assert item["similarity"] == pytest.approx(0.91)
    assert item["evidence"] == EVIDENCE  # opaque, exactly as the engine stored it
    assert (item["low"]["uuid"], item["high"]["uuid"]) == (card["low"], card["high"])
    assert item["low"]["title"] == "需要抽水機"
    assert {item["low"]["ticket_title"], item["high"]["ticket_title"]} == {"一樓淹水", "二樓淹水"}


@pytest.mark.parametrize("role_name", ["user", "admin", "member"])
async def test_everyone_else_is_refused(client, db_session, redis, role_name):
    """DEDUP-008: hidden from every identity but super_admin and data_auditor."""
    card = await _card(db_session)
    headers = await _headers(db_session, redis, role_name)

    listing = await client.get(URL, headers=headers)
    detail = await client.get(f"{URL}/{card['pair']}", headers=headers)

    assert (listing.status_code, detail.status_code) == (403, 403)


async def test_no_token_is_unauthorized(client, db_session):
    """No session, no queue."""
    assert (await client.get(URL)).status_code == 401


async def test_filters_and_page_reach_the_service(client, db_session, redis):
    """Repeated query parameters filter; skip and limit page."""
    await _card(db_session)
    confirmed = await _card(db_session, status="confirmed_duplicate")
    headers = await _headers(db_session, redis, "super_admin")

    response = await client.get(
        URL,
        params=[
            ("status", "confirmed_duplicate"),
            ("status", "not_duplicate"),
            ("entity_kind", "ticket_task"),
        ],
        headers=headers,
    )
    paged = await client.get(URL, params={"skip": 1, "limit": 1}, headers=headers)

    assert [item["uuid"] for item in response.json()["items"]] == [confirmed["pair"]]
    assert (paged.json()["total"], paged.json()["items"]) == (1, [])


@pytest.mark.parametrize(
    "params",
    [{"limit": 201}, {"limit": 0}, {"skip": -1}, {"status": "pending"}, {"sort": "status"}],
)
async def test_bad_query_parameters_are_unprocessable(client, db_session, redis, params):
    """Out-of-range pages and unknown values answer 422."""
    headers = await _headers(db_session, redis, "super_admin")
    assert (await client.get(URL, params=params, headers=headers)).status_code == 422


async def test_one_card_comes_with_its_events(client, db_session, redis):
    """The detail adds the card's events to the list item's fields."""
    card = await _card(db_session)
    headers = await _headers(db_session, redis, "data_auditor")

    response = await client.get(f"{URL}/{card['pair']}", headers=headers)

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["uuid"] == card["pair"]
    assert body["low"]["uuid"] == card["low"]
    assert [event["event_type"] for event in body["events"]] == ["ignored_by_submitter"]


async def test_an_unknown_card_is_not_found(client, db_session, redis):
    """404 rather than an empty body."""
    headers = await _headers(db_session, redis, "super_admin")
    response = await client.get(f"{URL}/00000000-0000-0000-0000-000000000000", headers=headers)
    assert response.status_code == 404


# --- decisions (Spec 025 §2.3) -----------------------------------------------------------


@pytest.mark.parametrize(
    ("action", "verdict"), [("confirm", "confirmed_duplicate"), ("reject", "not_duplicate")]
)
@pytest.mark.parametrize("role_name", ["super_admin", "data_auditor"])
async def test_the_seeded_reviewers_decide_a_card(client, db_session, redis, role_name, action, verdict):
    """ADR-337: both roles hold ai_duplicate.review; the response is the updated card."""
    card = await _card(db_session)
    headers = await _headers(db_session, redis, role_name)

    response = await client.post(f"{URL}/{card['pair']}/{action}", json={"note": "同一戶"}, headers=headers)

    assert response.status_code == 200, response.text
    body = response.json()
    assert (body["uuid"], body["status"]) == (card["pair"], verdict)
    assert body["reviewed_by"] is not None and body["reviewed_at"] is not None
    assert body["low"]["uuid"] == card["low"]


async def test_a_decision_needs_no_body(client, db_session, redis):
    """The note is optional, and so is the body."""
    card = await _card(db_session)
    headers = await _headers(db_session, redis, "super_admin")
    response = await client.post(f"{URL}/{card['pair']}/reject", headers=headers)
    assert response.status_code == 200, response.text


@pytest.mark.parametrize("role_name", ["user", "admin", "member"])
async def test_everyone_else_cannot_decide(client, db_session, redis, role_name):
    """No ai_duplicate.review, no verdict."""
    card = await _card(db_session)
    headers = await _headers(db_session, redis, role_name)
    response = await client.post(f"{URL}/{card['pair']}/confirm", json={}, headers=headers)
    assert response.status_code == 403


async def test_a_refusal_carries_the_status_that_says_why(client, db_session, redis):
    """409 for a decided card (ADR-343), 404 for a missing one, 422 for an oversized note."""
    decided = await _card(db_session, status="confirmed_duplicate")
    pending = await _card(db_session)
    headers = await _headers(db_session, redis, "super_admin")

    conflict = await client.post(f"{URL}/{decided['pair']}/reject", json={}, headers=headers)
    missing = await client.post(
        f"{URL}/00000000-0000-0000-0000-000000000000/confirm", json={}, headers=headers
    )
    oversized = await client.post(
        f"{URL}/{pending['pair']}/confirm", json={"note": "字" * 1001}, headers=headers
    )

    assert (conflict.status_code, missing.status_code, oversized.status_code) == (409, 404, 422)


# --- revoke (Spec 025 §2.4) --------------------------------------------------------------


async def _decided_by(client, db, redis, role_name: str) -> tuple[dict, dict]:
    """A card confirmed over REST by a new `role_name` account; returns (card, that account's headers)."""
    card = await _card(db)
    headers = await _headers(db, redis, role_name)
    response = await client.post(f"{URL}/{card['pair']}/confirm", json={}, headers=headers)
    assert response.status_code == 200, response.text
    return card, headers


async def test_a_data_auditor_undoes_their_own_verdict(client, db_session, redis):
    """ADR-342: one's own verdict needs only ai_duplicate.review; the card is pending again."""
    card, headers = await _decided_by(client, db_session, redis, "data_auditor")

    response = await client.post(f"{URL}/{card['pair']}/revoke", headers=headers)

    assert response.status_code == 200, response.text
    body = response.json()
    assert (body["status"], body["reviewed_by"], body["reviewed_at"]) == ("dup_ignored", None, None)
    detail = await client.get(f"{URL}/{card['pair']}", headers=headers)
    assert [e["event_type"] for e in detail.json()["events"]] == [
        "ignored_by_submitter",
        "confirmed",
        "verdict_revoked",
    ]


async def test_a_data_auditor_cannot_undo_a_super_admins_verdict(client, db_session, redis):
    """ai_duplicate.revoke stays with super_admin (ADR-342)."""
    card, _ = await _decided_by(client, db_session, redis, "super_admin")
    auditor = await _headers(db_session, redis, "data_auditor")

    response = await client.post(f"{URL}/{card['pair']}/revoke", headers=auditor)

    assert response.status_code == 403
    assert (await client.get(f"{URL}/{card['pair']}", headers=auditor)).json()[
        "status"
    ] == "confirmed_duplicate"


async def test_a_super_admin_undoes_a_data_auditors_verdict(client, db_session, redis):
    """super_admin holds ai_duplicate.revoke, so anyone's verdict can be undone."""
    card, _ = await _decided_by(client, db_session, redis, "data_auditor")
    admin = await _headers(db_session, redis, "super_admin")

    response = await client.post(f"{URL}/{card['pair']}/revoke", headers=admin)

    assert response.status_code == 200, response.text
    assert response.json()["status"] == "dup_ignored"


async def test_revoke_refusals_carry_their_status(client, db_session, redis):
    """409 for a pending card, 404 for a missing one, 403 for someone without review."""
    pending = await _card(db_session)
    admin = await _headers(db_session, redis, "super_admin")
    citizen = await _headers(db_session, redis, "user")

    conflict = await client.post(f"{URL}/{pending['pair']}/revoke", headers=admin)
    missing = await client.post(f"{URL}/00000000-0000-0000-0000-000000000000/revoke", headers=admin)
    refused = await client.post(f"{URL}/{pending['pair']}/revoke", headers=citizen)

    assert (conflict.status_code, missing.status_code, refused.status_code) == (409, 404, 403)


# --- names (ADR-441) ----------------------------------------------------------------------


async def test_the_card_and_its_events_name_who_decided(client, db_session, redis):
    """The reviewer's nickname beside `reviewed_by`, and each event's beside its `actor_uuid`."""
    card, headers = await _decided_by(client, db_session, redis, "data_auditor")

    listing = await client.get(URL, params={"status": "confirmed_duplicate"}, headers=headers)
    detail = await client.get(f"{URL}/{card['pair']}", headers=headers)

    assert listing.json()["items"][0]["reviewed_by_name"] == "data_auditor 帳號"
    body = detail.json()
    assert body["reviewed_by_name"] == "data_auditor 帳號"
    named = {e["event_type"]: e["actor_name"] for e in body["events"]}
    assert named["confirmed"] == "data_auditor 帳號"
