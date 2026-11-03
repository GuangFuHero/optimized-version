"""Ticket export by 組織分配, every kind of need in one file, and two header rows (#285).

組織分配 is the board's (`tickets`' `responsibleTeamUuid` / `unassignedOnly`): a ticket is a team's when
its point lies in that team's live 責任區, matched at export time and only on rows the caller sees in
detail (ADR-281). Every ticket and station file opens with a Chinese label row above the code row,
and the importer skips it, so an export still goes straight back in.
"""

import csv
import io
import os

os.environ["ENV"] = "testing"

import pytest
from geoalchemy2.shape import from_shape
from openpyxl import load_workbook
from shapely.geometry import Point, Polygon

from app.core.permissions import Perm
from app.core.tabular import read_table, write_csv, write_xlsx
from app.models.auth import User
from app.models.property_config import StationPropertyConfig, TaskPropertyConfig
from app.models.team import Team, TeamZone, TeamZoneAssign
from app.models.ticket_task import TicketTask
from app.services.bulk_columns import DYNAMIC_PREFIX, STATION_COLUMNS, TICKET_COLUMNS, is_code_of, label_of
from app.services.bulk_export import (
    BulkExportError,
    count_ticket_exports,
    export_stations,
    export_tickets,
    own_export_team,
    ticket_import_template,
)
from app.services.bulk_import import preview_tickets
from tests.test_bulk_endpoints import BASE, _user_with
from tests.test_bulk_export import IN_ZONE, OUT_OF_ZONE, _grant, _station, _ticket_with_task

pytestmark = pytest.mark.asyncio

# A second zone, apart from test_bulk_export's, for a second team.
OTHER_POINT = Point(122.50, 26.00)
OTHER_POLYGON = Polygon([(122.4, 25.9), (122.6, 25.9), (122.6, 26.1), (122.4, 26.1)])
ZONE_POLYGON = Polygon([(121.4, 24.9), (121.6, 24.9), (121.6, 25.1), (121.4, 25.1)])

EXPORTER = [(Perm.TICKET_EXPORT, "all"), (Perm.TICKET_VIEW_DETAIL, "all")]


async def _team(db, name: str, polygon: Polygon) -> Team:
    """An NGO team holding one 責任區 over `polygon`."""
    team = Team(name=name, type="ngo")
    assigner = User(name=f"{name}-assigner")
    zone = TeamZone(name=f"{name}-zone", geometry=from_shape(polygon, srid=4326))
    db.add_all([team, assigner, zone])
    await db.flush()
    db.add(TeamZoneAssign(team_uuid=team.uuid, zone_uuid=zone.uuid, assigned_by=str(assigner.uuid)))
    await db.flush()
    return team


async def _actor(db, name: str, grants, *, team=None) -> User:
    actor = User(name=name)
    db.add(actor)
    await db.flush()
    for perm, scope in grants:
        await _grant(db, actor, perm, scope, "exporter", team=team)
    return actor


def _csv_rows(content: bytes) -> list[list[str]]:
    return list(csv.reader(io.StringIO(content.decode("utf-8-sig"))))


def _parse(exported, columns=TICKET_COLUMNS):
    return read_table(exported.content, exported.filename, is_code=is_code_of(columns))


def _titles(table, *mine: str) -> set[str]:
    """The titles among `mine` in the file: the baseline may hold tickets of its own."""
    return {row["title"] for row in table.rows} & set(mine)


# --- two header rows ---


async def test_a_ticket_csv_opens_with_chinese_labels_above_the_codes(db):
    """Row 1 is for people, row 2 the codes the importer maps by; a field's label is its config's."""
    db.add(
        TaskPropertyConfig(
            task_type="rescue", property_name="x285_trapped", label="受困人數", data_type="number"
        )
    )
    actor = await _actor(db, "TwoRows", EXPORTER)
    await _ticket_with_task(db, title="兩列表頭", point=IN_ZONE, creator=actor)

    exported = await export_tickets(db, actor=actor, task_type="rescue")
    labels, codes, *data = _csv_rows(exported.content)

    assert exported.content.startswith("﻿".encode())
    assert codes[:3] == ["uuid", "title", "description"]
    assert labels[:3] == ["編號", "標題", "說明"]
    assert labels[codes.index("contact_phone")] == "聯絡電話"
    assert labels[codes.index("task_quantity")] == "需求數量"
    assert labels[codes.index(f"{DYNAMIC_PREFIX}x285_trapped")] == "受困人數"
    assert len(labels) == len(codes)
    assert "兩列表頭" in {row[codes.index("title")] for row in data}


async def test_a_dynamic_field_without_a_label_is_headed_by_its_name(db):
    """A config row with no display name falls back to its property_name."""
    db.add(TaskPropertyConfig(task_type="rescue", property_name="x285_door", label=None, data_type="text"))
    actor = await _actor(db, "NoLabel", EXPORTER)

    labels, codes, *_ = _csv_rows((await export_tickets(db, actor=actor, task_type="rescue")).content)

    assert labels[codes.index(f"{DYNAMIC_PREFIX}x285_door")] == "x285_door"


async def test_a_ticket_xlsx_has_both_header_rows_and_types_the_data_rows_as_text(db):
    """The text format keys off the code row, so the data rows keep a leading zero."""
    actor = await _actor(db, "XlsxRows", [*EXPORTER, (Perm.TICKET_VIEW_PII, "all")])
    await _ticket_with_task(db, title="試算表", point=IN_ZONE, creator=actor)

    exported = await export_tickets(db, actor=actor, task_type="rescue", file_format="xlsx")
    sheet = load_workbook(io.BytesIO(exported.content)).active
    labels = [c.value for c in sheet[1]]
    codes = [c.value for c in sheet[2]]
    phone = codes.index("contact_phone") + 1

    assert labels[codes.index("contact_phone")] == "聯絡電話"
    assert codes[0] == "uuid"
    assert sheet.cell(row=1, column=phone).number_format != "@"  # a label is not a match key
    assert sheet.cell(row=3, column=phone).number_format == "@"
    assert sheet.cell(row=3, column=phone).value.startswith("09")
    assert "試算表" in _titles(_parse(exported), "試算表")


@pytest.mark.parametrize("file_format", ["csv", "xlsx"])
async def test_a_station_file_has_both_header_rows(db, file_format):
    """Stations get the label row too, nothing else changes."""
    db.add(
        StationPropertyConfig(
            station_type="shelter", property_name="x285_capacity", label="可容納人數", data_type="number"
        )
    )
    actor = await _actor(db, "StationRows", [(Perm.STATION_EXPORT, "all")])
    await _station(db, name="光復國小", point=IN_ZONE, creator=actor, quantity=120)

    exported = await export_stations(db, actor=actor, station_type="shelter", file_format=file_format)
    if file_format == "csv":
        labels, codes, *_ = _csv_rows(exported.content)
    else:
        sheet = load_workbook(io.BytesIO(exported.content)).active
        labels, codes = [c.value for c in sheet[1]], [c.value for c in sheet[2]]

    assert codes[:2] == ["uuid", "name"]
    assert labels[:2] == ["編號", "站點名稱"]
    assert labels[codes.index("op_hour")] == "開放時間"
    assert labels[codes.index(f"{DYNAMIC_PREFIX}x285_capacity")] == "可容納人數"
    table = _parse(exported, STATION_COLUMNS)
    assert table.headers == tuple(codes)
    assert "光復國小" in {row["name"] for row in table.rows}


@pytest.mark.parametrize("file_format", ["csv", "xlsx"])
async def test_the_import_template_is_the_two_header_rows_alone(db, file_format):
    """The template is the export with no rows: both header rows, and it reads back as codes."""
    actor = await _actor(db, "Templater", [(Perm.TICKET_IMPORT, "all")])

    exported = await ticket_import_template(db, actor=actor, task_type="medical", file_format=file_format)
    if file_format == "csv":
        rows = _csv_rows(exported.content)
    else:
        sheet = load_workbook(io.BytesIO(exported.content)).active
        rows = [list(row) for row in sheet.iter_rows(values_only=True)]

    assert len(rows) == 2
    assert rows[0][:2] == ["編號", "標題"]
    assert rows[1][:2] == ["uuid", "title"]
    table = _parse(exported)
    assert table.headers[:2] == ("uuid", "title")
    assert table.rows == ()


async def test_a_template_of_every_kind_is_refused(db):
    """An import file is one kind of need."""
    actor = await _actor(db, "AllTemplater", [(Perm.TICKET_IMPORT, "all")])

    with pytest.raises(BulkExportError, match="all"):
        await ticket_import_template(db, actor=actor, task_type="all")


# --- import reads past the label row ---


def _ticket_row(title: str, *, latitude: str = "25.0") -> dict:
    return {
        "title": title,
        "contact_name": "王小明",
        "contact_phone": "0912345678",
        "latitude": latitude,
        "longitude": "121.5",
        "task_type": "rescue",
        "task_name": "送水",
        "task_quantity": "3",
    }


_IMPORT_CODES = tuple(_ticket_row("x"))
_IMPORT_LABELS = tuple(
    label_of(next(c for c in TICKET_COLUMNS if c.header == code)) for code in _IMPORT_CODES
)


@pytest.mark.parametrize("file_format", ["csv", "xlsx"])
async def test_an_error_names_the_spreadsheet_row_under_two_header_rows(db, file_format):
    """Labels on line 1, codes on line 2: the first data row is line 3, and a blank row still counts."""
    actor = await _actor(
        db, "Importer2", [(Perm.TICKET_IMPORT, "all"), (Perm.TICKET_ADD, "all"), (Perm.TICKET_EDIT, "all")]
    )
    rows = [_ticket_row("好的一列"), {}, _ticket_row("壞的一列", latitude="north")]
    write = write_csv if file_format == "csv" else write_xlsx
    raw = write(_IMPORT_CODES, rows, labels=_IMPORT_LABELS)

    result = await preview_tickets(db, actor=actor, raw=raw, filename=f"t.{file_format}", task_type="rescue")

    assert [(e.line, e.column) for e in result.errors] == [(5, "latitude")]
    assert result.to_create == 1


async def test_a_file_with_only_the_code_row_still_counts_from_line_2(db):
    """A file without the label row reads as it always has."""
    actor = await _actor(
        db, "Importer1", [(Perm.TICKET_IMPORT, "all"), (Perm.TICKET_ADD, "all"), (Perm.TICKET_EDIT, "all")]
    )
    raw = write_csv(_IMPORT_CODES, [_ticket_row("壞的一列", latitude="north")])

    result = await preview_tickets(db, actor=actor, raw=raw, filename="t.csv", task_type="rescue")

    assert [(e.line, e.column) for e in result.errors] == [(2, "latitude")]


# --- every kind of need ---


async def test_every_kind_in_one_file_has_the_fixed_columns_only(db):
    """task_type=all: every kind of need, no kind's own prop.* fields."""
    db.add(TaskPropertyConfig(task_type="rescue", property_name="x285_trapped", data_type="number"))
    actor = await _actor(db, "AllKinds", EXPORTER)
    ticket, _ = await _ticket_with_task(db, title="全部種類", point=IN_ZONE, creator=actor)
    db.add(
        TicketTask(
            ticket_uuid=ticket.uuid,
            task_type="supply",
            task_name="物資",
            source="user",
            created_by=str(actor.uuid),
        )
    )
    await db.flush()

    exported = await export_tickets(db, actor=actor, task_type="all")
    table = _parse(exported)

    assert exported.filename == "tickets-all.csv"
    assert table.headers == tuple(c.header for c in TICKET_COLUMNS)
    assert not any(h.startswith(DYNAMIC_PREFIX) for h in table.headers)
    mine = [row for row in table.rows if row["title"] == "全部種類"]
    assert sorted(row["task_type"] for row in mine) == ["rescue", "supply"]


# --- 組織分配 ---


async def _two_teams_and_tickets(db, actor):
    alpha = await _team(db, "甲隊", ZONE_POLYGON)
    bravo = await _team(db, "乙隊", OTHER_POLYGON)
    await _ticket_with_task(db, title="甲區", point=IN_ZONE, creator=actor)
    await _ticket_with_task(db, title="乙區", point=OTHER_POINT, creator=actor, phone="0922333444")
    await _ticket_with_task(db, title="無區", point=OUT_OF_ZONE, creator=actor, phone="0933444555")
    return alpha, bravo


MINE = ("甲區", "乙區", "無區")


async def test_a_team_s_export_holds_the_tickets_in_its_zones(db):
    """The board's 組織分配: a team's zones, or nobody's."""
    actor = await _actor(db, "ByTeam", EXPORTER)
    alpha, bravo = await _two_teams_and_tickets(db, actor)

    async def titles(**kw):
        return _titles(_parse(await export_tickets(db, actor=actor, task_type="rescue", **kw)), *MINE)

    assert await titles(responsible_team_uuid=alpha.uuid) == {"甲區"}
    assert await titles(responsible_team_uuid=bravo.uuid) == {"乙區"}
    assert await titles(unassigned_only=True) == {"無區"}
    assert await titles() == set(MINE)
    assert _titles(
        _parse(await export_tickets(db, actor=actor, task_type="all", unassigned_only=True)), *MINE
    ) == {"無區"}


async def test_a_team_and_unassigned_together_are_refused(db):
    """As `tickets` refuses them."""
    actor = await _actor(db, "Both", EXPORTER)
    alpha, _ = await _two_teams_and_tickets(db, actor)

    with pytest.raises(BulkExportError):
        await export_tickets(
            db, actor=actor, task_type="rescue", responsible_team_uuid=alpha.uuid, unassigned_only=True
        )
    with pytest.raises(BulkExportError):
        await count_ticket_exports(db, actor=actor, responsible_team_uuid=alpha.uuid, unassigned_only=True)


async def test_without_view_detail_the_team_filters_match_nothing(db):
    """The team is read from the exact point: on a row shown as a cell it would tell where it is."""
    actor = await _actor(db, "NoDetail", [(Perm.TICKET_EXPORT, "all")])
    alpha, _ = await _two_teams_and_tickets(db, actor)

    team_file = _parse(
        await export_tickets(db, actor=actor, task_type="rescue", responsible_team_uuid=alpha.uuid)
    )
    none_file = _parse(await export_tickets(db, actor=actor, task_type="rescue", unassigned_only=True))

    assert _titles(team_file, *MINE) == set()
    assert _titles(none_file, *MINE) == set()
    assert _titles(_parse(await export_tickets(db, actor=actor, task_type="rescue")), *MINE) == set(MINE)


async def test_counts_follow_the_team_as_the_export_does(db):
    """The popover's counts are the rows the chosen 組織分配's file would hold."""
    actor = await _actor(db, "Counter", EXPORTER)
    alpha, _ = await _two_teams_and_tickets(db, actor)
    before = await count_ticket_exports(db, actor=actor)

    by_team = await count_ticket_exports(db, actor=actor, responsible_team_uuid=alpha.uuid)
    unassigned = await count_ticket_exports(db, actor=actor, unassigned_only=True)

    assert by_team == {"rescue": 1}
    assert unassigned["rescue"] >= 1
    assert by_team["rescue"] + unassigned["rescue"] <= before["rescue"]
    exported = _parse(
        await export_tickets(db, actor=actor, task_type="rescue", responsible_team_uuid=alpha.uuid)
    )
    assert len(exported.rows) == by_team["rescue"]


# --- own_team ---


async def test_a_zone_scoped_team_identity_names_its_own_team(db):
    """An NGO admin's export reaches only its zones, so the page fixes the team to its own."""
    alpha = await _team(db, "慈濟", ZONE_POLYGON)
    actor = await _actor(db, "NgoAdmin", [(Perm.TICKET_EXPORT, "zone")], team=alpha)

    own = await own_export_team(db, actor=actor)

    assert own is not None
    assert (own.uuid, own.name) == (str(alpha.uuid), "慈濟")


async def test_an_all_scoped_caller_has_no_own_team(db):
    """Decided by the scope, not by having a team."""
    alpha = await _team(db, "全域隊", ZONE_POLYGON)
    actor = await _actor(db, "GovLike", [(Perm.TICKET_EXPORT, "all")], team=alpha)

    assert await own_export_team(db, actor=actor) is None


async def test_a_gov_team_s_zone_scope_widens_so_it_has_no_own_team(db):
    """A gov team's `zone` widens to `all` (BE-RBAC-3 B3)."""
    gov = Team(name="縣府", type="gov")
    db.add(gov)
    await db.flush()
    actor = await _actor(db, "GovAdmin", [(Perm.TICKET_EXPORT, "zone")], team=gov)

    assert await own_export_team(db, actor=actor) is None


# --- HTTP ---


async def test_the_endpoints_take_the_team_params(client, db_session, redis):
    """The params, their 400s, and the counts' own_team over HTTP."""
    headers = await _user_with(
        db_session, redis, "HttpTeam", Perm.TICKET_EXPORT, Perm.TICKET_VIEW_DETAIL, Perm.TICKET_IMPORT
    )
    team = await _team(db_session, "HTTP 隊", ZONE_POLYGON)
    team_uuid = team.uuid  # read before the commit expires it
    await db_session.commit()

    counts = await client.get(
        f"{BASE}/tickets/export/counts?responsible_team_uuid={team_uuid}", headers=headers
    )
    exported = await client.get(f"{BASE}/tickets/export?task_type=all&unassigned_only=true", headers=headers)
    both = await client.get(
        f"{BASE}/tickets/export?task_type=all&unassigned_only=true&responsible_team_uuid={team_uuid}",
        headers=headers,
    )
    both_counts = await client.get(
        f"{BASE}/tickets/export/counts?unassigned_only=true&responsible_team_uuid={team_uuid}",
        headers=headers,
    )
    template = await client.get(f"{BASE}/tickets/export?task_type=all&template=true", headers=headers)
    bad_uuid = await client.get(
        f"{BASE}/tickets/export?task_type=all&responsible_team_uuid=nope", headers=headers
    )

    assert counts.status_code == 200, counts.text
    assert counts.json() == {"counts": {}, "max_rows": 10_000, "own_team": None}
    assert exported.status_code == 200, exported.text
    assert 'filename="tickets-all.csv"' in exported.headers["content-disposition"]
    assert (both.status_code, both_counts.status_code, template.status_code) == (400, 400, 400)
    assert bad_uuid.status_code == 422
