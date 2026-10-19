"""The audit over GraphQL: who reads what, the verdict mutation, and the list's new filters.

`auditStatus` is public, so the site can leave out tickets with issues. The note, who gave the
verdict and when, the audit history and the changes since the audit take ticket.audit; the
service-level rules are in tests/test_ticket_audit.py.
"""

import pytest
from geoalchemy2.shape import from_shape
from shapely.geometry import Point

from app.models.request import Tickets
from app.models.ticket_task import TicketTask
from tests.test_graphql.conftest import auth_header, test_db

AUDIT_FIELDS = """
query($uuid: UUID!) {
    ticket(uuid: $uuid) {
        auditStatus auditNote auditedAt auditedBy
        auditHistory { kind status note }
        changesSinceAudit { entity field auditedValue currentValue }
    }
}
"""

AUDIT = """
mutation($uuid: UUID!, $status: AuditVerdict!, $note: String, $contentHash: String!) {
    auditTicket(uuid: $uuid, status: $status, note: $note, contentHash: $contentHash) {
        auditStatus auditNote
    }
}
"""

HASH = "query($uuid: UUID!) { ticket(uuid: $uuid) { auditContentHash } }"

CHANGES = """
query($uuid: UUID!) { ticket(uuid: $uuid) { changesSinceAudit { entity field auditedValue currentValue } } }
"""

LIST = """
query($needType: String, $openNeedsOnly: Boolean!, $auditStatus: AuditStatus) {
    tickets(needType: $needType, openNeedsOnly: $openNeedsOnly, auditStatus: $auditStatus, limit: 200) {
        items { uuid }
    }
}
"""


async def _ticket_with_needs(created_by: str, needs: list[tuple[str, str]], **fields) -> str:
    """A ticket with one need per (task_type, status); returns its uuid."""
    async with test_db() as db:
        ticket = Tickets(
            geometry=from_shape(Point(121.5, 25.0), srid=4326),
            created_by=created_by,
            title="需要清淤人力",
            contact_name="王小姐",
            status="pending",
            priority="high",
            task_type=needs[0][0] if needs else None,
            **fields,
        )
        db.add(ticket)
        await db.flush()
        for task_type, status in needs:
            db.add(
                TicketTask(
                    ticket_uuid=str(ticket.uuid),
                    task_type=task_type,
                    task_name="清淤",
                    quantity=3,
                    status=status,
                    source="user",
                    created_by=created_by,
                )
            )
        await db.flush()
        return str(ticket.uuid)


async def _post(client, query: str, variables: dict, token: str | None = None) -> dict:
    res = await client.post(
        "/graphql", json={"query": query, "variables": variables}, headers=auth_header(token) if token else {}
    )
    return res.json()


async def _audit(client, ticket_uuid: str, token: str, **variables) -> dict:
    """Give a verdict the way the admin page does: read the version, then send it back."""
    seen = await _post(client, HASH, {"uuid": ticket_uuid}, token)
    content_hash = seen["data"]["ticket"]["auditContentHash"] or "unreadable"
    return await _post(client, AUDIT, {"uuid": ticket_uuid, "contentHash": content_hash, **variables}, token)


async def _read(client, ticket_uuid: str, token: str | None = None) -> dict:
    body = await _post(client, AUDIT_FIELDS, {"uuid": ticket_uuid}, token)
    assert "errors" not in body, body
    return body["data"]["ticket"]


@pytest.mark.asyncio
async def test_the_status_is_public_and_the_rest_is_withheld_from_a_guest(client, coordinator_auth):
    """A guest reads the status only."""
    requester_uuid, _ = coordinator_auth
    ticket_uuid = await _ticket_with_needs(
        requester_uuid, [("hr", "pending")], audit_status="audit_issue", audit_note="地址不存在"
    )

    seen = await _read(client, ticket_uuid)

    assert seen == {
        "auditStatus": "audit_issue",
        "auditNote": None,
        "auditedAt": None,
        "auditedBy": None,
        "auditHistory": None,
        "changesSinceAudit": None,
    }


@pytest.mark.asyncio
async def test_a_signed_in_citizen_reads_the_status_only(client, coordinator_auth, login_user_auth):
    """Signing in unlocks no audit detail."""
    requester_uuid, _ = coordinator_auth
    ticket_uuid = await _ticket_with_needs(
        requester_uuid, [("hr", "pending")], audit_status="audit_issue", audit_note="地址不存在"
    )
    _, citizen_token = login_user_auth

    seen = await _read(client, ticket_uuid, citizen_token)

    assert (seen["auditStatus"], seen["auditNote"], seen["auditHistory"]) == ("audit_issue", None, None)


@pytest.mark.asyncio
async def test_an_auditor_gives_a_verdict_and_reads_it_back(client, coordinator_auth, auditor_auth):
    """ticket.audit `all` writes the verdict and reads its detail."""
    requester_uuid, _ = coordinator_auth
    ticket_uuid = await _ticket_with_needs(requester_uuid, [("hr", "pending")])
    auditor_uuid, auditor_token = auditor_auth

    given = await _audit(client, ticket_uuid, auditor_token, status="audit_issue", note="照片與地址不符")

    assert "errors" not in given, given
    assert given["data"]["auditTicket"] == {"auditStatus": "audit_issue", "auditNote": "照片與地址不符"}
    seen = await _read(client, ticket_uuid, auditor_token)
    assert (seen["auditedBy"], seen["changesSinceAudit"]) == (auditor_uuid, [])
    assert seen["auditedAt"] is not None


@pytest.mark.asyncio
async def test_an_issue_without_a_note_is_refused(client, coordinator_auth, auditor_auth):
    """The service's refusal reaches the client by name."""
    requester_uuid, _ = coordinator_auth
    ticket_uuid = await _ticket_with_needs(requester_uuid, [("hr", "pending")])
    _, auditor_token = auditor_auth

    refused = await _audit(client, ticket_uuid, auditor_token, status="audit_issue")

    assert any("audit_note is required" in e["message"] for e in refused.get("errors", [])), refused


@pytest.mark.asyncio
async def test_the_mutation_takes_only_an_auditors_verdicts(client, coordinator_auth, auditor_auth):
    """need_audit is the scan's and no_audit follows from the content: neither is in the enum."""
    requester_uuid, _ = coordinator_auth
    ticket_uuid = await _ticket_with_needs(requester_uuid, [("hr", "pending")])
    _, auditor_token = auditor_auth

    refused = await _audit(client, ticket_uuid, auditor_token, status="need_audit")

    assert refused.get("errors"), refused


@pytest.mark.asyncio
async def test_a_citizen_cannot_audit(client, coordinator_auth, login_user_auth):
    """A plain account holds no ticket.audit."""
    requester_uuid, _ = coordinator_auth
    ticket_uuid = await _ticket_with_needs(requester_uuid, [("hr", "pending")])
    _, citizen_token = login_user_auth

    refused = await _audit(client, ticket_uuid, citizen_token, status="audited")

    assert any("Permission Denied." in e["message"] for e in refused.get("errors", [])), refused


async def _listed(client, **variables) -> set[str]:
    body = await _post(client, LIST, {"openNeedsOnly": False, **variables})
    assert "errors" not in body, body
    return {item["uuid"] for item in body["data"]["tickets"]["items"]}


@pytest.mark.asyncio
async def test_the_list_filters_on_any_need_of_a_type_or_only_open_ones(client, coordinator_auth):
    """A filled need still counts, unless only open needs are asked for."""
    requester_uuid, _ = coordinator_auth
    open_supply = await _ticket_with_needs(requester_uuid, [("hr", "pending"), ("supply", "pending")])
    filled_supply = await _ticket_with_needs(requester_uuid, [("rescue", "pending"), ("supply", "fulfilled")])
    no_supply = await _ticket_with_needs(requester_uuid, [("hr", "pending")])

    any_need = await _listed(client, needType="supply")
    open_only = await _listed(client, needType="supply", openNeedsOnly=True)

    assert {open_supply, filled_supply} <= any_need and no_supply not in any_need
    assert open_supply in open_only and filled_supply not in open_only


@pytest.mark.asyncio
async def test_the_list_filters_on_the_audit_status_for_anyone(client, coordinator_auth):
    """The status is public, so a guest can filter on it."""
    requester_uuid, _ = coordinator_auth
    issue = await _ticket_with_needs(
        requester_uuid, [("hr", "pending")], audit_status="audit_issue", audit_note="不符"
    )
    unchecked = await _ticket_with_needs(requester_uuid, [("hr", "pending")])

    flagged = await _listed(client, auditStatus="audit_issue")

    assert issue in flagged and unchecked not in flagged


@pytest.mark.asyncio
async def test_the_changes_hide_what_the_caller_could_not_read_on_the_ticket(
    client, coordinator_auth, auditor_auth
):
    """The test auditor holds ticket.audit but not ticket.view_detail: the fact, not the free text."""
    requester_uuid, coordinator_token = coordinator_auth
    ticket_uuid = await _ticket_with_needs(requester_uuid, [("hr", "pending")], description="三樓後門")
    _, auditor_token = auditor_auth
    assert "errors" not in await _audit(client, ticket_uuid, auditor_token, status="audited")
    async with test_db() as db:
        (await db.get(Tickets, ticket_uuid)).description = "中正路十二號三樓"

    hidden = (await _post(client, CHANGES, {"uuid": ticket_uuid}, auditor_token))["data"]["ticket"]
    shown = (await _post(client, CHANGES, {"uuid": ticket_uuid}, coordinator_token))["data"]["ticket"]

    description = {"entity": "ticket", "field": "description"}
    assert hidden["changesSinceAudit"] == [{**description, "auditedValue": None, "currentValue": None}]
    assert shown["changesSinceAudit"] == [
        {**description, "auditedValue": "三樓後門", "currentValue": "中正路十二號三樓"}
    ]


@pytest.mark.asyncio
async def test_a_verdict_on_a_version_read_before_an_edit_is_refused(client, coordinator_auth, auditor_auth):
    """The hash names the version the auditor read; an edit in between makes it stale."""
    requester_uuid, _ = coordinator_auth
    ticket_uuid = await _ticket_with_needs(requester_uuid, [("hr", "pending")])
    _, auditor_token = auditor_auth
    seen = (await _post(client, HASH, {"uuid": ticket_uuid}, auditor_token))["data"]["ticket"][
        "auditContentHash"
    ]
    async with test_db() as db:
        (await db.get(Tickets, ticket_uuid)).title = "改過的標題"

    refused = await _post(
        client, AUDIT, {"uuid": ticket_uuid, "status": "audited", "contentHash": seen}, auditor_token
    )

    assert any("changed since it was loaded" in e["message"] for e in refused.get("errors", [])), refused


@pytest.mark.asyncio
async def test_a_guest_cannot_read_the_content_hash(client, coordinator_auth):
    """Without ticket.audit there is nothing to give a verdict with."""
    requester_uuid, _ = coordinator_auth
    ticket_uuid = await _ticket_with_needs(requester_uuid, [("hr", "pending")])

    assert (await _post(client, HASH, {"uuid": ticket_uuid}))["data"]["ticket"]["auditContentHash"] is None
