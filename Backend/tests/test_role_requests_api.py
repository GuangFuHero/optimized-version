"""The role request review REST surface is wired to the role request service (Spec/019).

Wiring only: the rules themselves are observed at the service (tests/test_role_request.py).
Uuids are captured as plain strings when the rows are made: `db_session` is
expire_on_commit=True and each request under test commits (see tests/test_admin_api.py).
"""

import uuid

import pytest
from sqlalchemy import select

from app.core.permissions import Perm
from app.models.auth import User
from app.models.rbac import Permission, Role, RolePermissionAssign, UserRoleAssign
from app.models.role_request import RoleRequest
from tests.conftest import auth_headers_for
from tests.test_site_realm import FILE, HELP_REQUEST, SITE

URL = "/api/v1/admin/role-requests"
REASON = "我是光復鄉公所民政課，要協助檢查重複通報"


async def _account(db, name: str, role_name: str, grants: tuple[Perm, ...] = ()) -> tuple[str, str]:
    """An account holding the platform role `role_name`; returns (user uuid, role uuid)."""
    role = (await db.execute(select(Role).where(Role.name == role_name))).scalar_one_or_none()
    if role is None:
        role = Role(name=role_name, kind="platform")
        db.add(role)
        await db.flush()
    for perm in grants:
        permission = Permission(key=perm.value)
        db.add(permission)
        await db.flush()
        db.add(RolePermissionAssign(role_uuid=role.uuid, permission_uuid=permission.uuid, scope="all"))
    user = User(name=name)
    db.add(user)
    await db.flush()
    db.add(UserRoleAssign(user_uuid=user.uuid, role_uuid=role.uuid))
    ids = (str(user.uuid), str(role.uuid))
    await db.commit()
    return ids


async def _application(
    db, applicant_uuid: str, status: str = "pending", requested_role: str = "data_auditor"
) -> str:
    """An application on file, arranged directly: submitting is the GraphQL side's business."""
    request = RoleRequest(
        requested_role=requested_role,
        reason=REASON,
        contact="03-8701234",
        status=status,
        created_by=applicant_uuid,
    )
    db.add(request)
    await db.flush()
    request_uuid = str(request.uuid)
    await db.commit()
    return request_uuid


async def _reviewer_headers(db, redis) -> dict:
    user_uuid, role_uuid = await _account(db, "超級管理員", "super_admin", (Perm.ROLE_REQUEST_REVIEW,))
    return await auth_headers_for(redis, user_uuid, role_uuid)


@pytest.mark.asyncio
async def test_the_review_list_shows_what_a_reviewer_decides_on(client, db_session, redis):
    """The applicant's own words and name — which only a reviewer may read (Q11)."""
    applicant_uuid, _ = await _account(db_session, "王小明", "user")
    request_uuid = await _application(db_session, applicant_uuid)
    headers = await _reviewer_headers(db_session, redis)

    response = await client.get(URL, params={"status": "pending"}, headers=headers)

    assert response.status_code == 200, response.text
    [item] = response.json()
    assert (item["uuid"], item["status"], item["requested_role"]) == (request_uuid, "pending", "data_auditor")
    assert (item["reason"], item["contact"]) == (REASON, "03-8701234")
    assert (item["applicant_uuid"], item["applicant_name"]) == (applicant_uuid, "王小明")


@pytest.mark.asyncio
async def test_someone_without_review_cannot_list_applications(client, db_session, redis):
    """Reason and contact often name a unit and a phone number."""
    user_uuid, role_uuid = await _account(db_session, "申請人", "user")
    await _application(db_session, user_uuid)

    response = await client.get(URL, headers=await auth_headers_for(redis, user_uuid, role_uuid))

    assert response.status_code == 403


@pytest.mark.asyncio
async def test_rejecting_returns_the_rejected_application(client, db_session, redis):
    """The back office gets the closed application back, reply included."""
    applicant_uuid, _ = await _account(db_session, "王小明", "user")
    request_uuid = await _application(db_session, applicant_uuid)
    headers = await _reviewer_headers(db_session, redis)

    response = await client.post(
        f"{URL}/{request_uuid}/reject", json={"note": "請附上單位證明"}, headers=headers
    )

    assert response.status_code == 200, response.text
    body = response.json()
    assert (body["uuid"], body["status"], body["review_note"]) == (request_uuid, "rejected", "請附上單位證明")
    assert body["closed_at"] is not None


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("case", "expected", "detail"),
    [
        ("an application that does not exist", 404, "Role request not found"),
        ("an application already decided", 409, "Role request is no longer pending"),
        ("a reply over 500 characters", 422, "Note must be at most 500 characters"),
        ("a status that is not one", 422, None),  # FastAPI's own validation, a list of errors
    ],
)
async def test_a_refusal_carries_the_status_that_says_why(client, db_session, redis, case, expected, detail):
    """Spec/019 errors: not found 404, wrong state 409, invalid input 422, in the service's words."""
    applicant_uuid, _ = await _account(db_session, "王小明", "user")
    status = "rejected" if case == "an application already decided" else "pending"
    request_uuid = await _application(db_session, applicant_uuid, status=status)
    headers = await _reviewer_headers(db_session, redis)

    if case == "a status that is not one":
        response = await client.get(URL, params={"status": "super_admin"}, headers=headers)
    else:
        target = str(uuid.uuid4()) if case == "an application that does not exist" else request_uuid
        note = "字" * 501 if case == "a reply over 500 characters" else None
        response = await client.post(f"{URL}/{target}/reject", json={"note": note}, headers=headers)

    assert response.status_code == expected, response.text
    if detail is not None:
        assert response.json()["detail"] == detail


async def _data_auditor_role(db) -> None:
    """The role an approved data auditor is granted, as the seed creates it."""
    db.add(Role(name="data_auditor", kind="platform"))
    await db.commit()


@pytest.mark.asyncio
async def test_approving_returns_the_approved_application(client, db_session, redis):
    """The back office gets the closed application back."""
    applicant_uuid, _ = await _account(db_session, "王小明", "user")
    request_uuid = await _application(db_session, applicant_uuid)
    await _data_auditor_role(db_session)
    headers = await _reviewer_headers(db_session, redis)

    response = await client.post(f"{URL}/{request_uuid}/approve", json={}, headers=headers)

    assert response.status_code == 200, response.text
    body = response.json()
    assert (body["uuid"], body["status"]) == (request_uuid, "approved")
    assert body["closed_at"] is not None


@pytest.mark.asyncio
@pytest.mark.parametrize("requested_role", ["government", "ngo"])
async def test_a_government_or_ngo_application_is_not_approved_yet(client, db_session, redis, requested_role):
    """Q2 placeholder: refused in the service's words, and the application stays pending."""
    applicant_uuid, _ = await _account(db_session, "王小明", "user")
    request_uuid = await _application(db_session, applicant_uuid, requested_role=requested_role)
    headers = await _reviewer_headers(db_session, redis)

    response = await client.post(f"{URL}/{request_uuid}/approve", json={}, headers=headers)

    assert response.status_code == 422, response.text
    assert response.json()["detail"] == "Approving government and NGO applications is not available yet"


@pytest.mark.asyncio
async def test_an_approved_applicant_carries_on_with_the_token_they_have(
    client, db_session, redis, fresh_app_engine
):
    """Q3: approval adds an identity rather than replacing one, so nobody is signed out.

    The applicant's token keeps working, their identities now include data_auditor for the
    back office's 前往後台, and the site still files a help request for them.
    """
    applicant_uuid, user_role_uuid = await _account(db_session, "王小明", "user", (Perm.TICKET_ADD,))
    applicant = await auth_headers_for(redis, applicant_uuid, user_role_uuid)
    request_uuid = await _application(db_session, applicant_uuid)
    await _data_auditor_role(db_session)
    reviewer = await _reviewer_headers(db_session, redis)

    approved = await client.post(f"{URL}/{request_uuid}/approve", json={}, headers=reviewer)
    me = await client.get("/api/v1/users/me", headers=applicant)
    filed = await client.post(
        "/graphql",
        json={"query": FILE, "variables": {"input": HELP_REQUEST}},
        headers={**applicant, **SITE},
    )

    assert approved.status_code == 200, approved.text
    assert me.status_code == 200, me.text
    assert {identity["role"] for identity in me.json()["identities"]} == {"user", "data_auditor"}
    assert "errors" not in filed.json(), filed.json()
