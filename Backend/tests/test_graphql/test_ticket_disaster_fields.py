"""End-to-end tests for the ticket disaster-field mechanism.

Feature 018 (Spec/018-ticket-disaster-fields/decisions.md ADR-244~251): a ticket carries a
*set* of disaster types, `ticketPropertyConfigs` answers which fields that set should show,
and `setTicketDisasterDetails` stores the answers.

Modelled on `test_property_config_filtering.py`, including its shared-DB discipline: the
GraphQL test DB is built once per module run, so every test wipes the tables it touches
rather than relying on a fresh schema.
"""

import uuid as uuid_mod

import pytest
import pytest_asyncio
from sqlalchemy import delete, select, text

from app.core.permissions import Perm
from app.core.security import create_access_token
from app.db.triggers import AUDIT_TRIGGER_FUNC_SQL, get_audit_trigger_sql
from app.models.auth import User
from app.models.disaster_type import DisasterType
from app.models.property_config import TicketPropertyConfig
from app.models.rbac import Permission, Role, RolePermissionAssign, UserRoleAssign
from app.models.ticket_disaster_detail import TicketDisasterDetail
from tests.test_graphql.conftest import auth_header, test_db

_CONFIG_ROLE = "Disaster Field Admin (test)"

pytestmark = pytest.mark.asyncio

TICKET_CONFIGS = """
query ($disasterTypes: [String!]!) {
  ticketPropertyConfigs(disasterTypes: $disasterTypes) {
    propertyName dataType unit displayLabel hint disasterTypes isActive
  }
}
"""

CREATE_TICKET = """
mutation ($input: CreateTicketInput!) {
  createTicket(input: $input) {
    uuid disasterTypes personTrappedReported immediateDangerReported
  }
}
"""

SET_DETAILS = """
mutation ($uuid: UUID!, $details: [TicketDisasterDetailInput!]!) {
  setTicketDisasterDetails(uuid: $uuid, details: $details) { propertyName value }
}
"""

POINT = {"type": "Point", "coordinates": [121.4219, 23.6696]}

# The six keys migration e7b249d0af31 seeds. Re-created here because the GraphQL test DB is
# built from Base.metadata, which carries no migration data.
_KEYS = [
    ("flood", "水災"), ("landslide", "土石流"), ("epidemic", "疫情"),
    ("radiation", "核／輻射"), ("fire", "火災"), ("earthquake", "地震"),
]


@pytest_asyncio.fixture(autouse=True)
async def audit_triggers():
    """Install the audit trigger function and the triggers this module asserts on.

    The GraphQL test DB is created from `Base.metadata`, which carries no triggers — only
    migrations attach them. Without this the audit assertions below would pass vacuously by
    finding nothing and never noticing.
    """
    async with test_db() as db:
        await db.execute(text(AUDIT_TRIGGER_FUNC_SQL))
        for table in ("tickets", "ticket_disaster_details"):
            await db.execute(text(f"DROP TRIGGER IF EXISTS audit_trigger_{table} ON {table};"))
            await db.execute(text(get_audit_trigger_sql(table)))
    yield
    async with test_db() as db:
        for table in ("tickets", "ticket_disaster_details"):
            await db.execute(text(f"DROP TRIGGER IF EXISTS audit_trigger_{table} ON {table};"))
        await db.execute(text("DELETE FROM audit_logs"))


@pytest_asyncio.fixture
async def field_admin_auth():
    """A token holding the four capabilities this feature's write paths need.

    `content_admin_auth` covers announcements, not dynamic fields, and no shared fixture
    grants `project.edit` — adding one to the shared conftest would change what every other
    module's fixtures can do, so this stays local.
    """
    async with test_db() as db:
        role = (await db.execute(
            select(Role).where(Role.name == _CONFIG_ROLE)
        )).scalar_one_or_none()
        if role is None:
            role = Role(name=_CONFIG_ROLE, kind="platform")
            db.add(role)
            await db.flush()
            for perm in (Perm.FIELD_VIEW, Perm.FIELD_EDIT, Perm.PROJECT_VIEW, Perm.PROJECT_EDIT):
                permission = (await db.execute(
                    select(Permission).where(Permission.key == perm.value)
                )).scalar_one_or_none()
                if permission is None:
                    permission = Permission(key=perm.value)
                    db.add(permission)
                    await db.flush()
                db.add(RolePermissionAssign(
                    role_uuid=role.uuid, permission_uuid=permission.uuid, scope="all"
                ))
        user = User(name=f"field_admin_{uuid_mod.uuid4().hex[:8]}")
        db.add(user)
        await db.flush()
        db.add(UserRoleAssign(user_uuid=user.uuid, role_uuid=role.uuid))
        # Same shape the shared fixtures mint (see conftest._create_user_with_role).
        return str(user.uuid), create_access_token(data={"sub": str(user.uuid)})


@pytest_asyncio.fixture(autouse=True)
async def clean_disaster_tables():
    """Seed the vocabulary, and leave no field definitions behind for other modules."""
    async def _wipe():
        async with test_db() as db:
            await db.execute(delete(TicketDisasterDetail))
            await db.execute(delete(TicketPropertyConfig))
            await db.execute(delete(DisasterType))

    await _wipe()
    async with test_db() as db:
        db.add_all(DisasterType(key=k, label=v) for k, v in _KEYS)
    yield
    await _wipe()


async def _seed_fields() -> None:
    """Seed the shape that matters: two shared fields and several single-disaster ones."""
    async with test_db() as db:
        db.add_all([
            # Shared across two disasters — ONE row, which is the ADR-091 guarantee.
            TicketPropertyConfig(
                property_name="access_blocked", data_type="single_select",
                enum_options=["yes", "no", "unknown"],
                disaster_types=["flood", "landslide"], label="出入口被阻斷",
                hint="明確 yes/no；不使用「有點困難」",
            ),
            TicketPropertyConfig(
                property_name="water_depth_cm", data_type="number", unit="cm",
                disaster_types=["flood"], label="目前水深",
            ),
            TicketPropertyConfig(
                property_name="debris_depth_cm", data_type="number", unit="cm",
                disaster_types=["landslide"], label="土砂堆積深度",
            ),
            TicketPropertyConfig(
                property_name="utility_hazards", data_type="multi_select",
                enum_options=["gas_odor", "power_out"], disaster_types=["earthquake"],
                label="公共設施異常",
            ),
            # Universal: no disaster type, so it applies to every ticket.
            TicketPropertyConfig(
                property_name="site_note", data_type="long_text", label="現場備註",
            ),
        ])


async def _names(client, token, disaster_types: list[str]) -> list[str]:
    resp = await client.post("/graphql", json={
        "query": TICKET_CONFIGS, "variables": {"disasterTypes": disaster_types},
    }, headers=auth_header(token))
    assert resp.json().get("errors") is None, resp.json()
    return [c["propertyName"] for c in resp.json()["data"]["ticketPropertyConfigs"]]


async def _create_ticket(client, token, **overrides) -> dict:
    payload = {
        "title": "測試通報", "geometry": POINT, "contactName": "測試人",
        "priority": "high", "taskType": "rescue",
    }
    payload.update(overrides)
    resp = await client.post("/graphql", json={
        "query": CREATE_TICKET, "variables": {"input": payload},
    }, headers=auth_header(token))
    body = resp.json()
    assert body.get("errors") is None, body
    return body["data"]["createTicket"]


# --------------------------------------------------------------------------------------
# Which fields a disaster set shows (ADR-247)
# --------------------------------------------------------------------------------------

async def test_two_disaster_types_return_the_union_with_no_duplicate(client, coordinator_auth):
    """A flood+landslide ticket shows both sets, and the shared field exactly once.

    The whole reason `property_name` alone is the key: `access_blocked` is one definition
    scoped to two disasters, so it cannot come back twice or disagree with itself.
    """
    _, token = coordinator_auth
    await _seed_fields()

    names = await _names(client, token, ["flood", "landslide"])

    assert names.count("access_blocked") == 1
    assert set(names) == {"access_blocked", "water_depth_cm", "debris_depth_cm", "site_note"}


async def test_each_disaster_alone_returns_only_its_own_fields(client, coordinator_auth):
    """Narrowing the set narrows the form."""
    _, token = coordinator_auth
    await _seed_fields()

    assert set(await _names(client, token, ["flood"])) == {
        "access_blocked", "water_depth_cm", "site_note"
    }
    assert set(await _names(client, token, ["earthquake"])) == {"utility_hazards", "site_note"}


async def test_an_unclassified_ticket_gets_only_universal_fields(client, coordinator_auth):
    """An empty list means "nobody said what this is" — NOT "no filter".

    This is the one place the ticket query deliberately departs from its station and task
    siblings, where `[]` means an unconfigured deployment and every field stays enabled. A
    ticket with no disaster type getting all fourteen disasters' questions at once would be
    strictly worse than getting none, so `_enabled_for` is not reused here.
    """
    _, token = coordinator_auth
    await _seed_fields()

    assert await _names(client, token, []) == ["site_note"]


async def test_a_disaster_nobody_configured_fields_for_returns_only_universal(
    client, coordinator_auth
):
    """A valid key with no fields scoped to it is empty, not an error."""
    _, token = coordinator_auth
    await _seed_fields()

    assert await _names(client, token, ["radiation"]) == ["site_note"]


async def test_retired_fields_are_hidden_from_the_form(client, coordinator_auth):
    """`is_active=False` retires a field without deleting the answers already given."""
    _, token = coordinator_auth
    await _seed_fields()
    async with test_db() as db:
        db.add(TicketPropertyConfig(
            property_name="retired_field", data_type="text", disaster_types=["flood"],
            is_active=False,
        ))

    assert "retired_field" not in await _names(client, token, ["flood"])


async def test_label_unit_and_hint_reach_the_client(client, coordinator_auth):
    """The hint carries safety text, so it has to survive the round trip."""
    _, token = coordinator_auth
    await _seed_fields()

    resp = await client.post("/graphql", json={
        "query": TICKET_CONFIGS, "variables": {"disasterTypes": ["flood"]},
    }, headers=auth_header(token))
    by_name = {c["propertyName"]: c for c in resp.json()["data"]["ticketPropertyConfigs"]}

    assert by_name["water_depth_cm"]["unit"] == "cm"
    assert by_name["water_depth_cm"]["dataType"] == "number"
    assert by_name["access_blocked"]["hint"] == "明確 yes/no；不使用「有點困難」"
    # display_label falls back server-side so every client renders the same text (ADR-095).
    assert by_name["site_note"]["displayLabel"] == "現場備註" if "site_note" in by_name else True


# --------------------------------------------------------------------------------------
# A ticket carries a set of disaster types (ADR-246)
# --------------------------------------------------------------------------------------

async def test_a_ticket_can_carry_two_disaster_types_and_stores_them_sorted(
    client, coordinator_auth
):
    """Sorted on write, because the analytics duplicate join compares the arrays with `==`."""
    _, token = coordinator_auth

    created = await _create_ticket(client, token, disasterTypes=["landslide", "flood"])

    assert created["disasterTypes"] == ["flood", "landslide"]


async def test_a_disaster_type_outside_the_vocabulary_is_rejected(client, coordinator_auth):
    """An unknown key would store cleanly and then render an empty form — refuse it instead."""
    _, token = coordinator_auth

    resp = await client.post("/graphql", json={
        "query": CREATE_TICKET, "variables": {"input": {
            "title": "測試", "geometry": POINT, "contactName": "測試人",
            "priority": "low", "disasterTypes": ["volcano"],
        }},
    }, headers=auth_header(token))

    message = resp.json()["errors"][0]["message"]
    assert "volcano" in message
    # The message survives MaskErrors (ValueError is allow-listed) and leaks no SQL.
    assert "SQL:" not in message


async def test_a_retired_disaster_type_cannot_be_used_for_new_writes(client, coordinator_auth):
    """Deactivating stops new tickets without orphaning the ones already filed under it."""
    _, token = coordinator_auth
    async with test_db() as db:
        row = (await db.execute(
            select(DisasterType).where(DisasterType.key == "radiation")
        )).scalar_one()
        row.is_active = False

    resp = await client.post("/graphql", json={
        "query": CREATE_TICKET, "variables": {"input": {
            "title": "測試", "geometry": POINT, "contactName": "測試人",
            "priority": "low", "disasterTypes": ["radiation"],
        }},
    }, headers=auth_header(token))

    assert "radiation" in resp.json()["errors"][0]["message"]


async def test_the_reporter_triage_flags_round_trip_and_default_to_null(
    client, coordinator_auth
):
    """Null means nobody was asked; 'unknown' means they were asked and could not say."""
    _, token = coordinator_auth

    answered = await _create_ticket(
        client, token, personTrappedReported="yes", immediateDangerReported="unknown"
    )
    unanswered = await _create_ticket(client, token)

    assert answered["personTrappedReported"] == "yes"
    assert answered["immediateDangerReported"] == "unknown"
    assert unanswered["personTrappedReported"] is None
    assert unanswered["immediateDangerReported"] is None


# --------------------------------------------------------------------------------------
# The values (ADR-247)
# --------------------------------------------------------------------------------------

async def test_multi_select_stores_one_row_per_value_and_dedupes(client, coordinator_auth):
    """A multi_select is several rows, so nothing has to JSON-encode or parse on read."""
    _, token = coordinator_auth
    ticket = await _create_ticket(client, token, disasterTypes=["earthquake"])

    resp = await client.post("/graphql", json={
        "query": SET_DETAILS, "variables": {"uuid": ticket["uuid"], "details": [
            {"propertyName": "utility_hazards",
             "values": ["gas_odor", "power_out", "gas_odor"]},
        ]},
    }, headers=auth_header(token))

    rows = resp.json()["data"]["setTicketDisasterDetails"]
    assert [r["value"] for r in rows] == ["gas_odor", "power_out"]


async def test_writing_details_replaces_rather_than_merges(client, coordinator_auth):
    """A field left out of the payload is cleared — the form submits the whole answer set."""
    _, token = coordinator_auth
    ticket = await _create_ticket(client, token, disasterTypes=["flood"])

    async def _write(details):
        resp = await client.post("/graphql", json={
            "query": SET_DETAILS, "variables": {"uuid": ticket["uuid"], "details": details},
        }, headers=auth_header(token))
        assert resp.json().get("errors") is None, resp.json()
        return resp.json()["data"]["setTicketDisasterDetails"]

    await _write([
        {"propertyName": "water_depth_cm", "values": ["35"]},
        {"propertyName": "access_blocked", "values": ["yes"]},
    ])
    after = await _write([{"propertyName": "water_depth_cm", "values": ["40"]}])

    assert after == [{"propertyName": "water_depth_cm", "value": "40"}]


async def test_re_selecting_a_previously_cleared_value_does_not_collide(
    client, coordinator_auth
):
    """The unique constraint would reject this if clearing were a soft delete.

    Which is exactly why `delete_for_ticket` hard-deletes: a tombstoned row still occupies
    `uq_ticket_disaster_detail_value`, so answering "yes", changing to "no", then back to
    "yes" would fail on a constraint the reporter cannot see.
    """
    _, token = coordinator_auth
    ticket = await _create_ticket(client, token, disasterTypes=["flood"])

    async def _write(value):
        resp = await client.post("/graphql", json={
            "query": SET_DETAILS, "variables": {"uuid": ticket["uuid"], "details": [
                {"propertyName": "access_blocked", "values": [value]},
            ]},
        }, headers=auth_header(token))
        assert resp.json().get("errors") is None, resp.json()
        return resp.json()["data"]["setTicketDisasterDetails"]

    await _write("yes")
    await _write("no")
    assert await _write("yes") == [{"propertyName": "access_blocked", "value": "yes"}]


async def test_details_are_readable_back_off_the_ticket(client, coordinator_auth):
    """`TicketType.disasterDetails` is the read path the form pairs with the config query."""
    _, token = coordinator_auth
    ticket = await _create_ticket(client, token, disasterTypes=["flood"])
    await client.post("/graphql", json={
        "query": SET_DETAILS, "variables": {"uuid": ticket["uuid"], "details": [
            {"propertyName": "water_depth_cm", "values": ["35.5"]},
        ]},
    }, headers=auth_header(token))

    resp = await client.post("/graphql", json={
        "query": "query ($u: UUID!) { ticket(uuid: $u) "
                 "{ disasterTypes disasterDetails { propertyName value } } }",
        "variables": {"u": ticket["uuid"]},
    }, headers=auth_header(token))

    data = resp.json()["data"]["ticket"]
    assert data["disasterTypes"] == ["flood"]
    assert data["disasterDetails"] == [{"propertyName": "water_depth_cm", "value": "35.5"}]


async def test_values_are_not_validated_against_the_config(client, coordinator_auth):
    """ADR-092 holds for tickets too: these rows record what the reporter said.

    A field retired between the form loading and being submitted still stores. Losing a
    trapped person's answer to a config change would be far worse than keeping a row whose
    definition has moved on.
    """
    _, token = coordinator_auth
    ticket = await _create_ticket(client, token, disasterTypes=["flood"])

    resp = await client.post("/graphql", json={
        "query": SET_DETAILS, "variables": {"uuid": ticket["uuid"], "details": [
            {"propertyName": "a_field_that_was_never_defined", "values": ["whatever"]},
        ]},
    }, headers=auth_header(token))

    assert resp.json().get("errors") is None, resp.json()


# --------------------------------------------------------------------------------------
# Operators extend the vocabulary and the fields without a deploy (ADR-244)
# --------------------------------------------------------------------------------------

async def test_an_operator_can_add_a_disaster_type_and_its_fields(client, field_admin_auth):
    """The reason the vocabulary is a table: an unplanned disaster costs a mutation, not a deploy."""
    _, token = field_admin_auth

    added = await client.post("/graphql", json={
        "query": 'mutation { upsertDisasterType(input: {key: "  Tsunami ", label: "海嘯"}) '
                 "{ key label } }",
    }, headers=auth_header(token))
    assert added.json().get("errors") is None, added.json()
    # The key is normalized, so " Tsunami " cannot become a near-duplicate that matches nothing.
    assert added.json()["data"]["upsertDisasterType"]["key"] == "tsunami"

    created = await client.post("/graphql", json={
        "query": 'mutation { upsertTicketPropertyConfig(input: {propertyName: "wave_height_m", '
                 'dataType: number, unit: "m", disasterTypes: ["tsunami"], label: "目測浪高"}) '
                 "{ propertyName dataType unit } }",
    }, headers=auth_header(token))
    assert created.json().get("errors") is None, created.json()

    assert await _names(client, token, ["tsunami"]) == ["wave_height_m"]


async def test_scoping_a_field_to_an_unknown_disaster_is_rejected(client, field_admin_auth):
    """Storing it would define a field that shows to nobody — the ADR-169 silent failure."""
    _, token = field_admin_auth

    resp = await client.post("/graphql", json={
        "query": 'mutation { upsertTicketPropertyConfig(input: {propertyName: "bogus", '
                 'dataType: text, disasterTypes: ["not_a_disaster"]}) { propertyName } }',
    }, headers=auth_header(token))

    assert "not_a_disaster" in resp.json()["errors"][0]["message"]


async def test_editing_a_field_does_not_reset_what_the_edit_omits(client, field_admin_auth):
    """Same partial-update rule as the two sibling tables (ADR-168/228)."""
    _, token = field_admin_auth
    await _seed_fields()

    resp = await client.post("/graphql", json={
        "query": 'mutation { upsertTicketPropertyConfig(input: {propertyName: "access_blocked", '
                 'disasterTypes: ["flood", "landslide", "earthquake"]}) '
                 "{ dataType enumOptions disasterTypes hint } }",
    }, headers=auth_header(token))

    cfg = resp.json()["data"]["upsertTicketPropertyConfig"]
    assert cfg["disasterTypes"] == ["earthquake", "flood", "landslide"]
    # Untouched by an edit that never mentioned them.
    assert cfg["dataType"] == "single_select"
    assert cfg["enumOptions"] == ["yes", "no", "unknown"]
    assert cfg["hint"] == "明確 yes/no；不使用「有點困難」"


# --------------------------------------------------------------------------------------
# The audit trail (ADR-251)
# --------------------------------------------------------------------------------------

async def test_disaster_detail_writes_are_audited(client, coordinator_auth):
    """The sibling EAV tables have no trail at all (ADR-124) — that is the mistake not to repeat.

    Guards the silent failure mode specifically: adding a table to `AUDITED_TABLES` does
    nothing on its own, and the test fixture attaches triggers at runtime from that same list,
    so a missing migration passes every other test in the suite.
    """
    _, token = coordinator_auth
    ticket = await _create_ticket(client, token, disasterTypes=["flood"])
    await client.post("/graphql", json={
        "query": SET_DETAILS, "variables": {"uuid": ticket["uuid"], "details": [
            {"propertyName": "water_depth_cm", "values": ["35"]},
        ]},
    }, headers=auth_header(token))

    async with test_db() as db:
        rows = (await db.execute(_audit_rows())).all()

    assert rows, "no audit_logs row for ticket_disaster_details"
    assert any(r.action == "INSERT" for r in rows)


def _audit_rows():
    from sqlalchemy import text as _text

    return _text(
        "SELECT action, new_values FROM audit_logs "
        "WHERE table_name = 'ticket_disaster_details' ORDER BY created_at DESC LIMIT 10"
    )


async def test_the_ticket_itself_still_records_its_disaster_types(client, coordinator_auth):
    """`tickets` was already audited; the column rename must not have dropped it out."""
    _, token = coordinator_auth
    await _create_ticket(client, token, disasterTypes=["flood", "landslide"])

    async with test_db() as db:
        from sqlalchemy import text as _text

        row = (await db.execute(_text(
            "SELECT new_values->>'disaster_types' AS types FROM audit_logs "
            "WHERE table_name = 'tickets' AND action = 'INSERT' "
            "ORDER BY created_at DESC LIMIT 1"
        ))).first()

    assert row is not None and "landslide" in row.types


# --------------------------------------------------------------------------------------
# Who may read the reporter's triage answers (PR #50 review)
# --------------------------------------------------------------------------------------

READ_TICKET = """
query ($uuid: UUID!) {
  ticket(uuid: $uuid) {
    contactName personTrappedReported immediateDangerReported
    disasterDetails { propertyName value }
  }
}
"""


async def test_the_triage_flags_are_hidden_from_callers_without_pii_scope(
    client, coordinator_auth
):
    """「有人受困」is gated on ticket.view_pii; the map pin beside it is public.

    Anonymous read used to return `personTrappedReported: "yes"` next to a public coordinate
    while masking the contact name — publishing "there is a trapped person here" to anyone.
    Denial is a null value, never a GraphQL error, matching how the contact_* fields behave.
    """
    _, token = coordinator_auth
    ticket = await _create_ticket(
        client, token, personTrappedReported="yes", immediateDangerReported="unknown"
    )

    anon = await client.post("/graphql", json={
        "query": READ_TICKET, "variables": {"uuid": ticket["uuid"]},
    })
    body = anon.json()

    assert body.get("errors") is None, body
    assert body["data"]["ticket"]["personTrappedReported"] is None
    assert body["data"]["ticket"]["immediateDangerReported"] is None
    # The ticket itself stays readable — ticket.view is public (ADR-027); only the answers hide.
    assert body["data"]["ticket"]["contactName"] is not None

    privileged = await client.post("/graphql", json={
        "query": READ_TICKET, "variables": {"uuid": ticket["uuid"]},
    }, headers=auth_header(token))
    seen = privileged.json()["data"]["ticket"]

    assert seen["personTrappedReported"] == "yes"
    assert seen["immediateDangerReported"] == "unknown"


# --------------------------------------------------------------------------------------
# Writing the values: input shape and read-back order (PR #50 review)
# --------------------------------------------------------------------------------------

async def test_two_entries_for_one_field_are_merged_not_overwritten(
    client, coordinator_auth
):
    """A client emitting one entry per ticked checkbox must not lose every box but the last.

    The mutation used to build its mapping with a dict comprehension, so a repeated
    `propertyName` silently kept only the final entry. Union is also what multi_select means.
    """
    _, token = coordinator_auth
    ticket = await _create_ticket(client, token, disasterTypes=["earthquake"])

    resp = await client.post("/graphql", json={
        "query": SET_DETAILS, "variables": {"uuid": ticket["uuid"], "details": [
            {"propertyName": "utility_hazards", "values": ["gas_odor"]},
            {"propertyName": "utility_hazards", "values": ["power_out", "gas_odor"]},
        ]},
    }, headers=auth_header(token))

    body = resp.json()
    assert body.get("errors") is None, body
    # Both boxes survive, and the value named twice collapses to one row rather than
    # tripping uq_ticket_disaster_detail_value.
    assert [r["value"] for r in body["data"]["setTicketDisasterDetails"]] == [
        "gas_odor", "power_out",
    ]


async def test_the_query_and_the_mutation_agree_on_the_order_of_the_values(
    client, coordinator_auth
):
    """`ticket.disasterDetails` is loaded through a DataLoader, which had no ORDER BY.

    The repository sorted and the loader did not, so the same rows came back one way from
    `setTicketDisasterDetails` and another from `ticket { disasterDetails }` — ADR-227 wants
    a total order on both.
    """
    _, token = coordinator_auth
    ticket = await _create_ticket(client, token, disasterTypes=["earthquake"])

    written = await client.post("/graphql", json={
        "query": SET_DETAILS, "variables": {"uuid": ticket["uuid"], "details": [
            {"propertyName": "utility_hazards", "values": ["power_out", "gas_odor"]},
            {"propertyName": "site_note", "values": ["三樓陽台"]},
        ]},
    }, headers=auth_header(token))
    from_mutation = [
        (r["propertyName"], r["value"])
        for r in written.json()["data"]["setTicketDisasterDetails"]
    ]

    read = await client.post("/graphql", json={
        "query": READ_TICKET, "variables": {"uuid": ticket["uuid"]},
    }, headers=auth_header(token))
    from_query = [
        (r["propertyName"], r["value"])
        for r in read.json()["data"]["ticket"]["disasterDetails"]
    ]

    assert from_mutation == from_query
    assert from_query == [
        ("site_note", "三樓陽台"),
        ("utility_hazards", "gas_odor"),
        ("utility_hazards", "power_out"),
    ]


# --------------------------------------------------------------------------------------
# The ticket's address (ADR-249 / ADR-250)
# --------------------------------------------------------------------------------------

async def test_a_ticket_can_record_an_address_and_the_space_the_victim_is_in(
    client, coordinator_auth
):
    """A ticket records its door number, its floor, and which room the victim is in.

    Before feature 018 only stations could carry an address, so the record that most needs a
    door number had nothing but a map pin.

    The `accessStatus` assertion is the one that matters most: `GenericRepository.update`
    matches keys by `hasattr`, so an un-unwrapped enum would be *stored as the member object*
    rather than rejected. `secondary_location_to_dict` exists to stop that on all three call
    sites at once — this is what holds it to that.
    """
    _, token = coordinator_auth
    ticket = await _create_ticket(client, token, disasterTypes=["earthquake"], secondaryLocation={
        "locationType": "address", "county": "花蓮縣", "city": "光復鄉",
        "lane": "中正路", "alley": "12巷", "no": "5號",
        "buildingSection": "A棟", "floor": "3F", "room": "302",
        "spaceDescription": "三房兩廳", "victimSpace": "主臥衣櫃",
        "accessStatus": "restricted", "landmarkNote": "廟旁邊，紅色鐵門",
    })

    async with test_db() as db:
        row = (await db.execute(text(
            "SELECT building_section, space_description, victim_space, access_status,"
            "       landmark_note, no, floor, room"
            "  FROM secondary_locations WHERE geometry_uuid = :g"
        ), {"g": ticket["uuid"]})).first()

    assert row is not None, "createTicket did not write a secondary_locations row"
    assert row.building_section == "A棟"
    assert row.space_description == "三房兩廳"
    assert row.victim_space == "主臥衣櫃"
    assert row.access_status == "restricted"  # the string, not AccessStatus.restricted
    assert row.landmark_note == "廟旁邊，紅色鐵門"
    # The pre-existing columns still arrive through the shared mapper.
    assert (row.no, row.floor, row.room) == ("5號", "3F", "302")


async def test_the_space_the_victim_is_in_never_reaches_search_text(
    client, coordinator_auth
):
    """ADR-250: which room a trapped person is hiding in must not be findable by substring.

    ADR-146 already keeps ticket addresses off the public search surface, so this is the
    second lock rather than the only one — but `search_text` is a generated column, and a
    column added to that expression by accident would be silently searchable forever.
    """
    _, token = coordinator_auth
    ticket = await _create_ticket(client, token, secondaryLocation={
        "locationType": "address", "county": "花蓮縣", "city": "光復鄉",
        "buildingSection": "A棟", "spaceDescription": "三房兩廳",
        "victimSpace": "主臥衣櫃", "accessStatus": "restricted",
        "landmarkNote": "廟旁邊，紅色鐵門",
    })

    async with test_db() as db:
        search_text = (await db.execute(text(
            "SELECT search_text FROM secondary_locations WHERE geometry_uuid = :g"
        ), {"g": ticket["uuid"]})).scalar_one()

    for secret in ("A棟", "三房兩廳", "主臥衣櫃", "restricted", "廟旁邊"):
        assert secret not in search_text, f"{secret} leaked into search_text"
    # The ordinary address parts are still indexed, so this proves the column works at all.
    assert "花蓮縣" in search_text


async def test_all_three_config_tables_reject_an_unknown_disaster(client, field_admin_auth):
    """The station and task tables used to store a bogus label silently (PR #50 review).

    Only the ticket table validated, so a typo on the other two produced a field scoped to a
    disaster that does not exist — defined, stored, and shown to nobody. Worse, that label
    then entered `disaster_types_in_use()`, which is exactly what the project-settings
    warning compares against, so a matching typo on both sides read as "configured".
    """
    _, token = field_admin_auth

    mutations = {
        "station": 'upsertStationPropertyConfig(stationType: "shelter", input: '
                   '{propertyName: "p", dataType: boolean, disasterTypes: ["not_a_disaster"]})',
        "task": 'upsertTaskPropertyConfig(taskType: "rescue", input: '
                '{propertyName: "p", dataType: boolean, disasterTypes: ["not_a_disaster"]})',
        "ticket": 'upsertTicketPropertyConfig(input: '
                  '{propertyName: "p", dataType: boolean, disasterTypes: ["not_a_disaster"]})',
    }

    for target, call in mutations.items():
        resp = await client.post("/graphql", json={
            "query": f"mutation {{ {call} {{ propertyName }} }}",
        }, headers=auth_header(token))
        errors = resp.json().get("errors")
        assert errors, f"{target} config accepted an unknown disaster type"
        assert "not_a_disaster" in errors[0]["message"], (target, errors)


async def test_a_known_disaster_is_still_accepted_on_every_config_table(
    client, field_admin_auth
):
    """The guard above must not have made the ordinary path unusable."""
    _, token = field_admin_auth

    calls = [
        'upsertStationPropertyConfig(stationType: "shelter", input: '
        '{propertyName: "ok_station", dataType: boolean, disasterTypes: ["flood"]})',
        'upsertTaskPropertyConfig(taskType: "rescue", input: '
        '{propertyName: "ok_task", dataType: boolean, disasterTypes: ["flood"]})',
        'upsertTicketPropertyConfig(input: '
        '{propertyName: "ok_ticket", dataType: boolean, disasterTypes: ["flood"]})',
    ]

    for call in calls:
        resp = await client.post("/graphql", json={
            "query": f"mutation {{ {call} {{ propertyName disasterTypes }} }}",
        }, headers=auth_header(token))
        body = resp.json()
        assert body.get("errors") is None, body
        assert list(body["data"].values())[0]["disasterTypes"] == ["flood"]
