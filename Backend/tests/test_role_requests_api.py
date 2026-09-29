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


async def _application(db, applicant_uuid: str, status: str = "pending") -> str:
    """An application on file, arranged directly: submitting is the GraphQL side's business."""
    request = RoleRequest(
        requested_role="data_auditor",
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
